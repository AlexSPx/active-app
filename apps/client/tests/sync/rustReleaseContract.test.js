jest.mock('../../services/apiService', () => ({ apiService: {} }))
jest.mock('../../config/launchPolicy', () => ({
  ...jest.requireActual('../../config/launchPolicy'),
  isSyncEnabledForLaunch: () => true,
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const schemas = require('../../lib/schemas/api')
const { z } = require('zod')
const { createApi, makeJob, runQueue } = require('../helpers/syncTestUtils')
const { operations } = require('../../../../contracts/active-api/v1/release-operations.json')
const { requests } = require('../../../../contracts/active-api/v1/request-contract.cjs')
const byId = Object.fromEntries(operations.map((operation) => [operation.id, operation]))

describe('Rust release contract fixtures', () => {
  it('maps each release operation to distinct success and error examples', () => {
    expect(new Set(operations.map((operation) => operation.id)).size).toBe(31)
    for (const operation of operations) {
      expect(operation.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/)
      expect(operation.path).toBeTruthy()
      expect(operation.success.status).toBeGreaterThanOrEqual(200)
      expect(operation.success.status).toBeLessThan(400)
      expect(operation.error.status).toBeGreaterThanOrEqual(400)
      expect(operation.error.body.code || operation.error.body.error).toBeTruthy()
    }
  })

  it('validates every Active request fixture and its path and query contract', () => {
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

  it('enforces request boundaries, defaults and detached history preservation', () => {
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
    expect(detached.success.body.workoutRecord.clientRecordId).toBe(detached.request.clientRecordId)
    expect(detached.success.body.workoutRecord.workoutTitle).toBe(detached.request.workoutTitle)
    expect(detached.success.body.workoutRecord.exerciseRecords[0].identity).toEqual(
      detached.request.exerciseRecords[0].identity
    )
    expect(detached.success.body.workoutRecord.exerciseRecords[0].exerciseName).toBe(
      detached.request.exerciseRecords[0].exerciseName
    )
    expect(detached.success.body.workoutRecord).toMatchObject({
      workoutId: null,
      workoutTitle: 'Old leg day',
      exerciseRecords: [
        {
          exerciseId: null,
          exerciseName: 'My old squat',
          identity: { sourceKey: 'missing-squat' },
          achievedOneRmValue: null,
        },
      ],
    })
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
    for (const id of ['workout.create', 'routine.create'])
      expect(byId[id].success.body.version).toBe(1)
    expect(byId['record.create'].success.body.workoutRecord.version).toBe(1)
    expect(byId['snapshot.put'].success.body.version).toBe(1)
    expect(byId['preferences.put'].success.body.version).toBe(1)
  })

  it('freezes deletion transformations, singleton bootstrap and authentication examples', () => {
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
    for (const resource of ['snapshot', 'preferences']) {
      expect(byId[`${resource}.get`].absent).toMatchObject({
        status: 404,
        body: { code: 'NOT_FOUND', currentVersion: null },
      })
      expect(byId[`${resource}.put`].request.baseVersion).toBe(0)
    }
    const {
      authenticationExamples,
    } = require('../../../../contracts/active-api/v1/release-operations.json')
    expect(authenticationExamples.map(({ status }) => status)).toEqual([200, 401, 401, 401, 404])
    expect(authenticationExamples[0].identity).toEqual([
      'https://identity.example.test',
      'subject-1',
    ])
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

  it('checks intentionally new identity, chronology, version and ownership shapes', () => {
    const catalog = byId['catalog.get'].success.body
    expect(catalog.mappingComplete).toBe(true)
    expect(catalog.items[0]).toMatchObject({ sourceKey: 'barbell-squat', retired: false })
    expect(schemas.exerciseSchema.parse(catalog.items[0])).not.toHaveProperty('sourceKey')
    const record = byId['record.create']
    expect(record.request).toMatchObject({
      completedAt: expect.any(String),
      completionTimezone: 'Europe/Sofia',
    })
    expect(record.success.body).toMatchObject({ historyRevision: 4, workoutRecord: { version: 1 } })
    expect(schemas.workoutRecordResponseSchema.safeParse(record.success.body).success).toBe(false)
    expect(byId['record.list'].success.body[0].workoutId).toBeNull()
    expect(byId['record.delete'].path).toContain('baseVersion=1')
    expect(byId['snapshot.put'].request).toMatchObject({
      baseVersion: 0,
      historyRevision: 4,
      rulesVersion: '1',
    })
    expect(byId['preferences.put'].request).toEqual({
      baseVersion: 0,
      enabled: true,
      schedule: ['09:00'],
      timezone: 'Europe/Sofia',
    })
  })

  it('validates the intended new wire shapes independently of legacy parsers', () => {
    const version = z.number().int().nonnegative()
    const catalogItem = z
      .object({
        id: z.string(),
        sourceKey: z.string().min(1),
        retired: z.boolean(),
        name: z.string(),
        level: schemas.exerciseLevelSchema.nullable(),
        category: schemas.exerciseCategorySchema.nullable(),
        force: schemas.exerciseForceSchema.nullable(),
        mechanic: schemas.exerciseMechanicSchema.nullable(),
        equipment: schemas.exerciseEquipmentSchema.nullable(),
        primaryMuscles: z.array(z.string()),
        secondaryMuscles: z.array(z.string()),
        instructions: z.array(z.string()),
      })
      .strict()
    const catalog = z
      .object({
        catalogVersion: version,
        sourceDatasetVersion: z.string(),
        mappingComplete: z.boolean(),
        unresolvedSourceKeys: z.array(z.string()),
        unresolvedLegacyIds: z.array(z.string()),
        items: z.array(catalogItem),
      })
      .strict()
    expect(catalog.parse(byId['catalog.get'].success.body).items[0].sourceKey).toBe('barbell-squat')
    expect(catalog.parse(byId['catalog.get'].incomplete.body).unresolvedSourceKeys).toEqual([
      'unknown-key',
    ])
    const record = z
      .object({
        id: z.string(),
        clientRecordId: z.string(),
        workoutId: z.string().nullable(),
        workoutTitle: z.string(),
        notes: z.string().nullable(),
        createdAt: z.iso.datetime(),
        startTime: z.iso.datetime(),
        completedAt: z.iso.datetime(),
        completionTimezone: z.string(),
        version,
        exerciseRecords: z.array(
          z
            .object({
              exerciseId: z.string().nullable(),
              identity: z
                .object({
                  sourceDatasetVersion: z.string().nullable(),
                  sourceKey: z.string().nullable(),
                  legacyNamespace: z.string().nullable(),
                  legacyId: z.string().nullable(),
                })
                .strict(),
              exerciseName: z.string(),
              reps: z.array(z.number()),
              weight: z.array(z.number()),
              durationSeconds: z.array(z.number()),
              notes: z.string().nullable(),
              achievedOneRmValue: z.number().nullable(),
              achievedOneRmSetIndex: z.number().int().nullable(),
              achievedTotalVolumeValue: z.number().nullable(),
            })
            .strict()
        ),
      })
      .strict()
    expect(record.parse(byId['record.list'].success.body[0]).workoutId).toBeNull()
    expect(
      record.parse(byId['record.create'].detachedImport.success.body.workoutRecord)
        .exerciseRecords[0].exerciseId
    ).toBeNull()
    expect(record.parse(byId['record.create'].success.body.workoutRecord).completedAt).toBe(
      '2026-11-01T12:00:00Z'
    )
    expect(
      z
        .object({ deletedRecordId: z.string(), historyRevision: version })
        .strict()
        .parse(byId['record.delete'].success.body).historyRevision
    ).toBe(5)
    expect(
      z
        .object({
          deletedWorkoutId: z.string(),
          routineVersions: z.array(z.object({ id: z.string(), version }).strict()),
        })
        .strict()
        .parse(byId['workout.delete'].success.body).routineVersions[0].version
    ).toBe(3)
    expect(
      z
        .object({ deletedRoutineId: z.string(), profileVersion: version })
        .strict()
        .parse(byId['routine.delete'].success.body).profileVersion
    ).toBe(3)
    for (const operation of operations.filter((item) => item.conflict)) {
      expect(operation.conflict).toMatchObject({
        status: 409,
        body: { code: 'STALE_VERSION', currentVersion: expect.any(Number) },
      })
    }
    expect(byId['snapshot.put'].historyConflict.body.code).toBe('STALE_HISTORY')
    expect(byId['record.delete'].futureQueue.payload).toEqual({ id: 'record-1', baseVersion: 1 })
    expect(byId['record.delete'].queue.payload).toEqual(['record-1'])
    expect(byId['record.create'].queue.payload).not.toHaveProperty('completedAt')
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
