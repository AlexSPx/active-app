jest.mock('../../services/apiService', () => ({ apiService: {} }))
jest.mock('../../config/launchPolicy', () => ({
  ...jest.requireActual('../../config/launchPolicy'),
  isSyncEnabledForLaunch: () => true,
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const schemas = require('../../lib/schemas/api')
const { createApi, makeJob, runQueue } = require('../helpers/syncTestUtils')
const { operations } = require('../../../../contracts/v1/release-operations.json')
const { requests } = require('../../../../contracts/v1/request-contract.cjs')
const { responses } = require('../../../../contracts/v1/response-contract.cjs')
const byId = Object.fromEntries(operations.map((operation) => [operation.id, operation]))

describe('Rust release contract fixtures', () => {
  it('validates every Active request fixture and its path and query contract', () => {
    expect(new Set(operations.map((operation) => operation.id)).size).toBe(operations.length)
    const active = operations.filter((operation) => !operation.id.startsWith('auth.'))
    expect(Object.keys(requests).sort()).toEqual(active.map((operation) => operation.id).sort())
    for (const operation of active) {
      const schema = requests[operation.id]
      expect(schema.body.safeParse(operation.request).success).toBe(true)
      const url = new URL(operation.path, 'https://active.example')
      const query = Object.fromEntries(url.searchParams)
      for (const key of ['baseVersion', 'profileBaseVersion']) {
        if (key in query) query[key] = Number(query[key])
      }
      expect(schema.query.safeParse(query).success).toBe(true)
      const pathsWithId = [
        'progression.logs',
        'workout.update',
        'workout.delete',
        'routine.get',
        'routine.update',
        'routine.delete',
        'record.delete',
      ]
      expect(
        schema.path.safeParse(pathsWithId.includes(operation.id) ? { id: 'fixture-id' } : {})
          .success
      ).toBe(true)
    }
  })

  it('enforces request boundaries and supplies routine defaults', () => {
    const body = (id, value) => requests[id].body.safeParse(value)
    expect(body('profile.update', { baseVersion: 1, username: 'a' }).success).toBe(false)
    expect(body('profile.update', { baseVersion: 1, email: null }).success).toBe(false)
    expect(body('profile.update', { baseVersion: 1, timezone: 'invalid' }).success).toBe(false)
    expect(
      body('profile.update', { baseVersion: 1, measurements: { weightKg: -1, heightCm: null } })
        .success
    ).toBe(false)
    expect(body('profile.update', { baseVersion: 1, registrationCompleted: true }).success).toBe(
      true
    )
    const routine = {
      name: 'Plan',
      pattern: [{ dayIndex: 0, dayType: 'REST', workoutId: null }],
      startDate: '2026-11-01',
    }
    expect(body('routine.create', routine).data).toMatchObject({
      routineType: 'SEQUENTIAL',
      active: false,
      description: null,
    })
    expect(body('routine.create', { ...routine, active: true }).success).toBe(false)
    expect(
      body('routine.create', {
        ...routine,
        pattern: [{ dayIndex: 1, dayType: 'WORKOUT', workoutId: null }],
      }).success
    ).toBe(false)
    const detached = byId['record.create'].detachedImport
    expect(body('record.create', detached.request).success).toBe(true)
    expect(
      body('record.create', {
        ...detached.request,
        exerciseRecords: [
          {
            ...detached.request.exerciseRecords[0],
            identity: {
              sourceDatasetVersion: null,
              sourceKey: null,
              legacyNamespace: null,
              legacyId: null,
            },
          },
        ],
      }).success
    ).toBe(false)
    expect(
      body('record.create', { ...detached.request, completedAt: '2020-01-01T00:00:00Z' }).success
    ).toBe(false)
    expect(
      body('preferences.put', { ...byId['preferences.put'].request, schedule: ['25:00'] }).success
    ).toBe(false)
  })

  it('keeps the workout deletion examples consistent with each other', () => {
    const deletion = byId['workout.delete']
    const { before, after } = deletion.transformation
    expect(after.profileVersion).toBe(before.profileVersion)
    for (const [index, routine] of before.routines.entries()) {
      const changed = after.routines[index]
      expect(changed.version).toBe(routine.version + 1)
      expect(changed.pattern).toEqual(
        routine.pattern.map((day) =>
          day.workoutId === deletion.success.body.deletedWorkoutId
            ? { ...day, dayType: 'REST', workoutId: null }
            : day
        )
      )
      expect(
        requests['routine.create'].body.safeParse({
          name: 'Plan',
          startDate: '2026-11-01',
          pattern: changed.pattern,
        }).success
      ).toBe(true)
    }
    expect(deletion.success.body.routineVersions).toEqual(
      after.routines.map(({ id, version }) => ({ id, version }))
    )
  })

  it('runs compatible examples through the actual client parsers', () => {
    for (const operation of operations.filter((item) => item.parser)) {
      const parsed = schemas[operation.parser].safeParse(operation.success.body)
      const deliberatelyIncompatible = ['profile.get', 'profile.update', 'record.list'].includes(
        operation.id
      )
      expect(parsed.success).toBe(!deliberatelyIncompatible)
    }
  })

  it('checks catalog identity and record compatibility with the current client parsers', () => {
    const catalogItem = byId['catalog.get'].success.body.items[0]
    expect(schemas.exerciseSchema.parse(catalogItem)).toHaveProperty('sourceKey', 'barbell-squat')
    const record = byId['record.create'].success.body
    expect(schemas.workoutRecordResponseSchema.safeParse(record).success).toBe(false)
  })

  it('parses incomplete catalog and detached history examples with the release schemas', () => {
    const catalog = responses['catalog.get'].parse(byId['catalog.get'].incomplete.body)
    expect(catalog.mappingComplete).toBe(false)
    expect(catalog.unresolvedSourceKeys).toEqual(['unknown-key'])

    const detached = byId['record.create'].detachedImport
    const { workoutRecord } = responses['record.create'].parse(detached.success.body)
    expect(workoutRecord).toMatchObject({
      clientRecordId: detached.request.clientRecordId,
      workoutId: null,
      workoutTitle: detached.request.workoutTitle,
      exerciseRecords: [
        {
          exerciseId: null,
          exerciseName: detached.request.exerciseRecords[0].exerciseName,
          identity: detached.request.exerciseRecords[0].identity,
        },
      ],
    })
  })

  it.each(operations.filter((operation) => operation.queue))(
    'dispatches the actual existing queue arguments for $id',
    async ({ queue }) => {
      const method = jest.fn().mockRejectedValue(new Error('offline'))
      const api = createApi({ [queue.endpoint]: method })
      const { engine } = await runQueue({
        api,
        jobs: [makeJob({ id: 'fixture', endpoint: queue.endpoint, payload: queue.payload })],
      })
      const args = Array.isArray(queue.payload) ? queue.payload : [queue.payload]
      expect(method).toHaveBeenCalledWith(...args, 'fixture-key')
      engine.destroy()
    }
  )
})
