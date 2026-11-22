const { mkdtempSync, rmSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { SqliteDb } = require('../helpers/sqliteDb')
let mockPath
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => new (require('../helpers/sqliteDb').SqliteDb)(mockPath)),
}))
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'generated-key') }))
jest.mock('expo-web-browser', () => ({
  dismissAuthSession: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}))
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-auth-session', () => ({}))
jest.mock('../../features/selfHosted/storage', () => ({
  loadConnection: jest.fn(),
  loadPlan: jest.fn(),
  savePlan: jest.fn(),
}))
jest.mock('../../../../packages/api-client/src', () => ({
  createClient: jest.fn(),
  ApiError: class ApiError extends Error {},
}))
const { Platform } = require('react-native')
const storage = require('../../features/selfHosted/storage')
const { createClient } = require('../../../../packages/api-client/src')
const { setActiveProfileOwner, profileOwnerForConnection } = require('../../lib/profileScope')
const { prepareFirstWorkout, readFirstWorkout } = require('../../features/selfHosted/firstWorkout')
const { resumeFirstWorkout } = require('../../features/selfHosted/account')
const { SOURCE_DATASET_VERSION } = require('../../lib/data/catalogIdentity')
const scope = {
  kind: 'native',
  instanceId: 'instance',
  accountId: 'account',
  expiresAt: Date.now() + 3600000,
  baseUrl: 'https://example.test',
  accessToken: 'token',
}
const snapshot = {
  user: { id: 'local:device' },
  workoutId: 'local',
  sourceRow: '{}',
  profile: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    timezone: 'UTC',
    measurements: null,
    registrationCompleted: true,
  },
  preferences: { enabled: false, schedule: [], timezone: 'UTC' },
  workout: {
    title: 'Squat',
    notes: null,
    template: {
      exercises: [
        {
          exerciseId: 'local:exercise:squat',
          reps: [5],
          weight: [50],
          durationSeconds: [],
          notes: null,
        },
      ],
    },
  },
}
const catalog = {
  catalogVersion: 1,
  sourceDatasetVersion: SOURCE_DATASET_VERSION,
  mappingComplete: true,
  unresolvedSourceKeys: [],
  unresolvedLegacyIds: [],
  sourceMappings: [
    { datasetVersion: SOURCE_DATASET_VERSION, sourceKey: 'squat', exerciseId: 'remote-exercise' },
  ],
  items: [{ id: 'remote-exercise', sourceKey: 'squat', retired: false }],
}
let dir
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'resume-workout-'))
  mockPath = join(dir, 'source.sqlite')
  const db = new SqliteDb(mockPath)
  await prepareFirstWorkout(db, scope, snapshot, 'import', 'stable-key')
  await db.runAsync('UPDATE first_workout_import SET profile_complete = 1')
  await db.closeAsync()
  Platform.OS = 'ios'
  setActiveProfileOwner(profileOwnerForConnection(scope))
  storage.loadConnection.mockResolvedValue(scope)
  storage.loadPlan.mockResolvedValue(null)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

test('replays the identical request after a committed response is lost', async () => {
  let committed
  let attempts = 0
  createClient.mockImplementation(() => async (operation, args) => {
    if (operation === 'discovery') return { instanceId: scope.instanceId }
    if (operation === 'catalog.get') return catalog
    if (operation === 'workout.create') {
      attempts++
      if (!committed) {
        committed = args
        throw new Error('response lost after commit')
      }
      expect(args).toEqual(committed)
      return { id: 'remote-workout', version: 1 }
    }
    throw new Error(operation)
  })
  await expect(resumeFirstWorkout()).rejects.toThrow('response lost')
  expect(await resumeFirstWorkout()).toEqual({ id: 'remote-workout', version: 1 })
  expect(await resumeFirstWorkout()).toEqual({ id: 'remote-workout', version: 1 })
  expect(attempts).toBe(2)
  expect(committed.idempotencyKey).toBe('stable-key')
  expect(committed.body.template.exercises[0].exerciseId).toBe('remote-exercise')
  const db = new SqliteDb(mockPath)
  expect(await readFirstWorkout(db, scope)).toMatchObject({
    remote_id: 'remote-workout',
    remote_version: 1,
  })
  await db.closeAsync()
})

test('reuses the completed profile plan if its local checkpoint fails', async () => {
  const SQLite = require('expo-sqlite')
  const db = new SqliteDb(mockPath)
  await db.runAsync('UPDATE first_workout_import SET profile_complete = 0')
  await db.closeAsync()
  let failCheckpoint = true
  SQLite.openDatabaseAsync.mockImplementation(async () => {
    const handle = new SqliteDb(mockPath)
    const run = handle.runAsync.bind(handle)
    handle.runAsync = async (...args) => {
      if (
        failCheckpoint &&
        args[0].startsWith('UPDATE first_workout_import SET profile_complete')
      ) {
        failCheckpoint = false
        throw new Error('checkpoint failed')
      }
      return run(...args)
    }
    return handle
  })
  let plan = null
  storage.loadPlan.mockImplementation(async (_scope, kind) => (kind === 'initialize' ? plan : null))
  storage.savePlan.mockImplementation(async (_scope, saved) => {
    plan = saved
  })
  let updates = 0
  createClient.mockImplementation(() => async (operation) => {
    if (operation === 'discovery') return { instanceId: scope.instanceId }
    if (operation === 'profile.get')
      return {
        id: scope.accountId,
        profileVersion: 1,
        registrationCompleted: false,
        firstName: 'User',
        lastName: 'User',
        timezone: null,
        measurements: null,
      }
    if (operation === 'preferences.get') return {}
    if (operation === 'profile.update') {
      updates++
      return { id: scope.accountId }
    }
    if (operation === 'catalog.get') return catalog
    if (operation === 'workout.create') return { id: 'remote', version: 1 }
    throw new Error(operation)
  })
  await expect(resumeFirstWorkout()).rejects.toThrow('checkpoint failed')
  expect(plan.plan.stage).toBe('complete')
  await expect(resumeFirstWorkout()).resolves.toEqual({ id: 'remote', version: 1 })
  expect(updates).toBe(1)
})
