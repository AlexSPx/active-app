const mockStorageData = new Map()
const mockReadFailures = new Map()
const mockWriteFailures = new Map()
const mockWriteBarriers = new Map()

jest.mock('@react-native-async-storage/async-storage', () => {
  const mockAsyncStorage = {
    getItem: jest.fn(async (key) => {
      const failures = mockReadFailures.get(key) || 0
      if (failures > 0) {
        mockReadFailures.set(key, failures - 1)
        throw new Error(`read failed: ${key}`)
      }
      return mockStorageData.get(key) ?? null
    }),
    setItem: jest.fn(async (key, value) => {
      const failures = mockWriteFailures.get(key) || 0
      if (failures > 0) {
        mockWriteFailures.set(key, failures - 1)
        throw new Error(`write failed: ${key}`)
      }
      const barrier = mockWriteBarriers.get(key)
      if (barrier) {
        barrier.started()
        await barrier.wait
      }
      mockStorageData.set(key, value)
      barrier?.completed()
    }),
    removeItem: jest.fn(async (key) => mockStorageData.delete(key)),
    multiGet: jest.fn(async (keys) =>
      Promise.all(keys.map(async (key) => [key, await mockAsyncStorage.getItem(key)]))
    ),
    clear: jest.fn(async () => mockStorageData.clear()),
  }

  return { __esModule: true, default: mockAsyncStorage }
})
jest.mock('../../services/posthog', () => ({ posthog: { capture: jest.fn() } }))

const LEGACY_OWNER_KEY = 'profile-storage-owner-v1'
const LEGACY_KEYS = ['settings-storage', 'running-workout-storage', 'widget-storage']
const ALICE = 'account:alice'
const BOB = 'account:bob'
const LOCAL = 'local:device'

function profileKey(key, ownerId) {
  return `${key}:${encodeURIComponent(ownerId)}`
}

function persisted(state) {
  return JSON.stringify({ state, version: 0 })
}

function boot() {
  jest.resetModules()
  const { hydrateProfileStores } = require('../../lib/profileStorage')
  return {
    hydrateProfileStores,
    settings: require('../../features/settings/stores/settingsStore').useSettingsStore,
    widgets: require('../../stores/widgetStore').useWidgetStore,
    running: require('../../features/workout-session/stores/runningWorkoutStore')
      .useRunningWorkoutStore,
  }
}

function resetStorage() {
  mockStorageData.clear()
  mockReadFailures.clear()
  mockWriteFailures.clear()
  mockWriteBarriers.clear()
}

function saveProfile(app, { owner, theme, weight, restSeconds }) {
  app.settings.getState().setTheme(theme)
  app.settings.getState().setBodyWeight(weight)
  app.settings.getState().setRestTimerDefaultSeconds(restSeconds)
  app.widgets.getState().addWidget(`${owner}-squat`, `${owner} squat`, 'volume')
  app.running.getState().startWorkout({ id: `${owner}-workout`, name: owner, exercises: [] })
}

function expectProfile(app, { owner, theme, weight, restSeconds }) {
  expect(app.settings.getState()).toMatchObject({
    theme,
    bodyWeight: weight,
    restTimerDefaultSeconds: restSeconds,
  })
  expect(app.widgets.getState().widgets.map(({ exerciseId }) => exerciseId)).toEqual([
    `${owner}-squat`,
  ])
  expect(app.running.getState().runningWorkout).toMatchObject({
    id: `${owner}-workout`,
    name: owner,
  })
}

function expectEmptyProfile(app) {
  expect(app.settings.getState()).toMatchObject({
    theme: 'system',
    bodyWeight: null,
    restTimerEnabled: true,
    restTimerDefaultSeconds: 90,
  })
  expect(app.widgets.getState().widgets).toEqual([])
  expect(app.running.getState().runningWorkout).toBeNull()
}

beforeEach(resetStorage)

test('switching to a profile without stored values clears the previous profile and switching back restores it', async () => {
  const app = boot()
  await app.hydrateProfileStores(ALICE, ALICE)
  saveProfile(app, { owner: ALICE, theme: 'dark', weight: 81, restSeconds: 150 })

  await app.hydrateProfileStores(BOB, ALICE)
  expectEmptyProfile(app)

  await app.hydrateProfileStores(ALICE, ALICE)
  expectProfile(app, { owner: ALICE, theme: 'dark', weight: 81, restSeconds: 150 })

  const restarted = boot()
  await restarted.hydrateProfileStores(ALICE, ALICE)
  expectProfile(restarted, { owner: ALICE, theme: 'dark', weight: 81, restSeconds: 150 })
})

test('profiles keep separate settings, widgets, and running sessions across switches and restart', async () => {
  const app = boot()
  await app.hydrateProfileStores(ALICE, ALICE)
  saveProfile(app, { owner: ALICE, theme: 'dark', weight: 81, restSeconds: 150 })

  await app.hydrateProfileStores(BOB, ALICE)
  expectEmptyProfile(app)
  saveProfile(app, { owner: BOB, theme: 'light', weight: 66, restSeconds: 45 })

  await app.hydrateProfileStores(ALICE, ALICE)
  expectProfile(app, { owner: ALICE, theme: 'dark', weight: 81, restSeconds: 150 })
  await app.hydrateProfileStores(BOB, ALICE)
  expectProfile(app, { owner: BOB, theme: 'light', weight: 66, restSeconds: 45 })

  await app.hydrateProfileStores(ALICE, ALICE)
  await app.hydrateProfileStores(LOCAL, ALICE)
  expectEmptyProfile(app)
  await app.hydrateProfileStores(ALICE, ALICE)
  expectProfile(app, { owner: ALICE, theme: 'dark', weight: 81, restSeconds: 150 })

  const restarted = boot()
  await restarted.hydrateProfileStores(BOB, ALICE)
  expectProfile(restarted, { owner: BOB, theme: 'light', weight: 66, restSeconds: 45 })
  await restarted.hydrateProfileStores(ALICE, ALICE)
  expectProfile(restarted, { owner: ALICE, theme: 'dark', weight: 81, restSeconds: 150 })
})

test('legacy values are claimed by the cached owner and legacy keys remain available', async () => {
  const legacySettings = persisted({ theme: 'dark', bodyWeight: 73, restTimerDefaultSeconds: 120 })
  const legacyRunning = persisted({
    runningWorkout: {
      id: 'legacy-workout',
      name: 'Legacy workout',
      startTime: '2026-09-01T10:00:00.000Z',
      exercises: [],
      currentExerciseIndex: 0,
      completedExercises: 0,
    },
    recordingError: null,
  })
  const legacyWidgets = persisted({
    widgets: [
      {
        id: 'legacy-widget',
        exerciseId: 'legacy-squat',
        exerciseName: 'Legacy squat',
        metric: 'volume',
        position: 0,
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ],
  })
  const legacyValues = [legacySettings, legacyRunning, legacyWidgets]
  LEGACY_KEYS.forEach((key, index) => mockStorageData.set(key, legacyValues[index]))

  const app = boot()
  await app.hydrateProfileStores(ALICE, ALICE)
  expect(app.settings.getState()).toMatchObject({ theme: 'dark', bodyWeight: 73 })
  expect(app.widgets.getState().widgets).toMatchObject([{ exerciseId: 'legacy-squat' }])
  expect(app.running.getState().runningWorkout).toMatchObject({ id: 'legacy-workout' })
  expect(mockStorageData.get(LEGACY_OWNER_KEY)).toBe(ALICE)
  expect(LEGACY_KEYS.map((key) => mockStorageData.get(key))).toEqual(legacyValues)

  await app.hydrateProfileStores(BOB, ALICE)
  expectEmptyProfile(app)
  expect(LEGACY_KEYS.map((key) => mockStorageData.get(key))).toEqual(legacyValues)
})

test('legacy values with no cached owner are marked unknown and cannot be claimed later', async () => {
  const legacyValues = [
    persisted({ theme: 'dark', bodyWeight: 73 }),
    persisted({
      runningWorkout: {
        id: 'unknown-owner-workout',
        name: 'Unknown owner',
        startTime: '2026-09-01T10:00:00.000Z',
        exercises: [],
        currentExerciseIndex: 0,
        completedExercises: 0,
      },
      recordingError: null,
    }),
    persisted({ widgets: [{ id: 'unknown-owner-widget' }] }),
  ]
  LEGACY_KEYS.forEach((key, index) => mockStorageData.set(key, legacyValues[index]))

  const app = boot()
  await app.hydrateProfileStores(LOCAL, null)
  expectEmptyProfile(app)
  expect(mockStorageData.get(LEGACY_OWNER_KEY)).toBe('unknown')

  await app.hydrateProfileStores(BOB, BOB)
  expectEmptyProfile(app)
  expect(mockStorageData.get(LEGACY_OWNER_KEY)).toBe('unknown')
  expect(LEGACY_KEYS.map((key) => mockStorageData.get(key))).toEqual(legacyValues)
})

test('a failed legacy copy can retry without deleting source values or losing the destination', async () => {
  const legacySettings = persisted({ theme: 'dark', bodyWeight: 73 })
  const legacyRunning = persisted({
    runningWorkout: {
      id: 'legacy-workout',
      name: 'Legacy workout',
      startTime: '2026-09-01T10:00:00.000Z',
      exercises: [],
      currentExerciseIndex: 0,
      completedExercises: 0,
    },
    recordingError: null,
  })
  const legacyWidgets = persisted({
    widgets: [{ id: 'legacy-widget', exerciseId: 'legacy-squat' }],
  })
  const legacyValues = [legacySettings, legacyRunning, legacyWidgets]
  LEGACY_KEYS.forEach((key, index) => mockStorageData.set(key, legacyValues[index]))
  mockWriteFailures.set(profileKey(LEGACY_KEYS[0], ALICE), 1)

  const app = boot()
  await expect(app.hydrateProfileStores(ALICE, ALICE)).rejects.toThrow('write failed')
  expect(mockStorageData.get(LEGACY_KEYS[0])).toBe(legacySettings)

  await app.hydrateProfileStores(ALICE, ALICE)
  expect(app.settings.getState()).toMatchObject({ theme: 'dark', bodyWeight: 73 })
  expect(app.running.getState().runningWorkout).toMatchObject({ id: 'legacy-workout' })
  expect(app.widgets.getState().widgets).toMatchObject([{ id: 'legacy-widget' }])
  expect(mockStorageData.get(profileKey(LEGACY_KEYS[0], ALICE))).toBe(legacySettings)
  expect(LEGACY_KEYS.map((key) => mockStorageData.get(key))).toEqual(legacyValues)
})

test('a failed profile-store rehydration can retry with its persisted values intact', async () => {
  const settingsKey = profileKey(LEGACY_KEYS[0], ALICE)
  const runningKey = profileKey(LEGACY_KEYS[1], ALICE)
  const widgetKey = profileKey(LEGACY_KEYS[2], ALICE)
  const savedValues = [
    persisted({ theme: 'dark', bodyWeight: 73, restTimerDefaultSeconds: 135 }),
    persisted({
      runningWorkout: {
        id: 'saved-workout',
        name: 'Saved workout',
        startTime: '2026-09-01T10:00:00.000Z',
        exercises: [],
        currentExerciseIndex: 0,
        completedExercises: 0,
      },
      recordingError: null,
    }),
    persisted({ widgets: [{ id: 'saved-widget', exerciseId: 'saved-squat' }] }),
  ]
  ;[settingsKey, runningKey, widgetKey].forEach((key, index) =>
    mockStorageData.set(key, savedValues[index])
  )
  mockReadFailures.set(runningKey, 1)

  const app = boot()
  await expect(app.hydrateProfileStores(ALICE, ALICE)).rejects.toThrow(
    `Could not restore stored data for ${ALICE}`
  )
  expect(mockStorageData.get(runningKey)).toBe(savedValues[1])

  await app.hydrateProfileStores(ALICE, ALICE)
  expect(app.settings.getState()).toMatchObject({ theme: 'dark', bodyWeight: 73 })
  expect(app.running.getState().runningWorkout).toMatchObject({ id: 'saved-workout' })
  expect(app.widgets.getState().widgets).toMatchObject([{ id: 'saved-widget' }])
  expect([settingsKey, runningKey, widgetKey].map((key) => mockStorageData.get(key))).toEqual(
    savedValues
  )
})

test('a delayed A store write stays under A after switching to B', async () => {
  const app = boot()
  await app.hydrateProfileStores(ALICE, ALICE)

  let notifyStarted
  let releaseWrite
  let notifyCompleted
  const writeStarted = new Promise((resolve) => (notifyStarted = resolve))
  const writeGate = new Promise((resolve) => (releaseWrite = resolve))
  const writeCompleted = new Promise((resolve) => (notifyCompleted = resolve))
  const aliceSettingsKey = profileKey(LEGACY_KEYS[0], ALICE)
  const bobSettingsKey = profileKey(LEGACY_KEYS[0], BOB)
  mockWriteBarriers.set(aliceSettingsKey, {
    started: notifyStarted,
    wait: writeGate,
    completed: notifyCompleted,
  })

  app.settings.getState().setTheme('dark')
  await writeStarted

  await app.hydrateProfileStores(BOB, ALICE)
  expectEmptyProfile(app)

  releaseWrite()
  await writeCompleted
  expect(JSON.parse(mockStorageData.get(aliceSettingsKey)).state).toMatchObject({ theme: 'dark' })
  expect(app.settings.getState().theme).toBe('system')
  const bobSettings = mockStorageData.get(bobSettingsKey)
  expect(bobSettings == null ? undefined : JSON.parse(bobSettings).state.theme).not.toBe('dark')
})

test('resetAllStores clears transient user and editor state but preserves profile session storage', async () => {
  const app = boot()
  await app.hydrateProfileStores(ALICE, ALICE)
  saveProfile(app, { owner: ALICE, theme: 'dark', weight: 81, restSeconds: 150 })

  const { useUserStore } = require('../../features/settings/stores/userStore')
  const { useWorkoutStore } = require('../../features/workouts/stores/createWorkoutStore')
  const { useEditWorkoutStore } = require('../../features/workouts/stores/editWorkoutStore')
  useUserStore.setState({ user: { id: 'alice' }, ownerId: ALICE, error: 'stale' })
  useWorkoutStore.getState().setExercises([{ id: 'draft-workout' }])
  useEditWorkoutStore.getState().setExercises([{ id: 'draft-edit' }])

  const profileKeys = LEGACY_KEYS.map((key) => profileKey(key, ALICE))
  const storedBeforeReset = profileKeys.map((key) => mockStorageData.get(key))

  jest.doMock('../../features/settings', () => ({
    useUserStore: require('../../features/settings/stores/userStore').useUserStore,
  }))
  jest.doMock('../../features/workouts', () => ({
    useWorkoutStore: require('../../features/workouts/stores/createWorkoutStore').useWorkoutStore,
    useEditWorkoutStore: require('../../features/workouts/stores/editWorkoutStore')
      .useEditWorkoutStore,
  }))
  const { resetAllStores } = require('../../utils/storeReset')
  await resetAllStores()

  expect(useUserStore.getState()).toMatchObject({ user: null, ownerId: null, error: null })
  expect(useWorkoutStore.getState().selectedExercises).toEqual([])
  expect(useEditWorkoutStore.getState().selectedExercises).toEqual([])
  expect(app.running.getState().runningWorkout).toMatchObject({ id: `${ALICE}-workout` })
  expect(profileKeys.map((key) => mockStorageData.get(key))).toEqual(storedBeforeReset)
})
