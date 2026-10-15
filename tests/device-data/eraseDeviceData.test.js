const mockStorage = new Map()
const mockCredentials = new Map()
const mockFiles = new Set()
const mockSchedules = new Set()
const mockEvents = []
let mockFailure = null

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))
jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = {
    getItem: jest.fn(async (key) => {
      mockEvents.push(`read:${key}`)
      return mockStorage.get(key) ?? null
    }),
    setItem: jest.fn(async (key, value) => mockStorage.set(key, value)),
    removeItem: jest.fn(async (key) => mockStorage.delete(key)),
    getAllKeys: jest.fn(async () => [...mockStorage.keys()]),
    multiGet: jest.fn(async (keys) =>
      Promise.all(keys.map(async (key) => [key, await storage.getItem(key)]))
    ),
    multiRemove: jest.fn(async (keys) => {
      if (mockFailure === 'storage') {
        mockStorage.delete(keys[0])
        throw new Error('storage removal failed')
      }
      for (const key of keys) mockStorage.delete(key)
    }),
  }
  return { __esModule: true, default: storage }
})
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: jest.fn(() => ({})) }), {
  virtual: true,
})
jest.mock(
  'expo-secure-store',
  () => ({
    getItemAsync: jest.fn(async (key) => mockCredentials.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => mockCredentials.set(key, value)),
    deleteItemAsync: jest.fn(async (key) => {
      if (mockFailure === 'credentials') throw new Error('credentials removal failed')
      mockCredentials.delete(key)
    }),
  }),
  { virtual: true }
)
jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: '/SQLite',
  deleteDatabaseAsync: jest.fn(async (name, directory) => {
    expect(directory).toBe('/SQLite')
    mockEvents.push(`delete:${name}`)
    if (mockFailure === 'database') throw new Error('database removal failed')
    mockFiles.delete(decodeURIComponent(name))
  }),
}))
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async (uri) => ({ exists: uri.startsWith('file://') })),
  readDirectoryAsync: jest.fn(async (uri) => {
    expect(uri).toBe('file:///SQLite')
    return [...mockFiles]
  }),
  deleteAsync: jest.fn(async (uri) => {
    if (uri === 'file:///cache/') mockEvents.push('cache cleared')
    else {
      expect(uri.startsWith('file:///SQLite/')).toBe(true)
      mockFiles.delete(decodeURIComponent(uri.replace('file:///SQLite/', '')))
    }
  }),
}))
jest.mock('expo-notifications', () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {
    if (mockFailure === 'notifications') throw new Error('notifications removal failed')
    mockSchedules.clear()
  }),
}))
jest.mock('../../lib/sync', () => ({
  syncEngine: { pauseAndDrain: jest.fn(async () => {}) },
}))
jest.mock('../../lib/repositories', () => ({
  AuthRepository: jest.requireActual('../../lib/repositories/AuthRepository').AuthRepository,
  UserRepository: jest.fn(() => ({})),
}))
jest.mock('../../features/settings', () => ({
  useSettingsStore: jest.requireActual('../../features/settings/stores/settingsStore')
    .useSettingsStore,
}))
jest.mock('../../utils/haptics', () => ({ haptics: {} }))
jest.mock('../../utils/storeReset', () => ({ resetAllStores: jest.fn(async () => {}) }))

const PENDING = 'device-data-erase-pending-v1'
const OWNERS = ['local:device', 'account:alice', 'account:bob', 'account:legacy%3Auser']
const DATABASES = ['active.db', ...OWNERS.map((owner) => `profile-${owner}.db`)]
const OWNED_KEYS = [
  'settings-storage',
  'running-workout-storage',
  'widget-storage',
  'auth-storage',
  'profile-storage-owner-v1',
  'legacy_active_db_owner',
  'legacy_active_db_import_owner',
  'legacy_training_profile',
  'user_token',
  'user_refresh_token',
  'user_data',
  'manual-offline-v1',
  ...OWNERS.flatMap((owner) =>
    [
      'settings-storage',
      'running-workout-storage',
      'widget-storage',
      'training-profile-storage',
    ].map((key) => `${key}:${encodeURIComponent(owner)}`)
  ),
]

function persisted(state) {
  return JSON.stringify({ state, version: 0 })
}

function seedDevice() {
  for (const key of OWNED_KEYS) mockStorage.set(key, persisted({ privateValue: key }))
  mockStorage.set(
    'auth-storage',
    persisted({ user: { id: 'alice', registrationCompleted: true }, isAuthenticated: true })
  )
  mockStorage.set('manual-offline-v1', 'true')
  mockStorage.set('profile-storage-owner-v1', 'account:alice')
  mockStorage.set('settings-storage:account%3Aalice', persisted({ bodyWeight: 89, theme: 'dark' }))
  mockStorage.set(
    'running-workout-storage:account%3Aalice',
    persisted({ runningWorkout: { id: 'private-workout' } })
  )
  mockStorage.set(
    'widget-storage:account%3Aalice',
    persisted({ widgets: [{ id: 'private-widget' }] })
  )
  mockStorage.set('unrelated-preference', 'keep')
  for (const name of DATABASES) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) mockFiles.add(`${name}${suffix}`)
  }
  mockFiles.add('unrelated.db')
  mockCredentials.set('user_token', 'private-access')
  mockCredentials.set('user_refresh_token', 'private-refresh')
  mockSchedules.add('rest-timer')
}

function boot() {
  jest.resetModules()
  return {
    ...require('../../stores/authStore'),
    settings: require('../../features/settings/stores/settingsStore').useSettingsStore,
    running: require('../../features/workout-session/stores/runningWorkoutStore')
      .useRunningWorkoutStore,
    widgets: require('../../stores/widgetStore').useWidgetStore,
    connection: require('../../lib/db/connection'),
    queryClient: require('../../lib/queryClient').queryClient,
    network: require('../../stores/networkStore').useNetworkStore,
  }
}

function expectCleanDevice(app) {
  expect([...mockFiles]).toEqual(['unrelated.db'])
  expect(mockCredentials.size).toBe(0)
  expect(mockSchedules.size).toBe(0)
  expect(mockStorage.get(PENDING)).toBeUndefined()
  for (const key of OWNED_KEYS.filter((key) => key !== 'auth-storage')) {
    expect(mockStorage.has(key)).toBe(false)
  }
  expect(mockStorage.get('unrelated-preference')).toBe('keep')
  expect(JSON.parse(mockStorage.get('auth-storage')).state).toEqual({
    user: null,
    isAuthenticated: false,
  })
  expect(app.useAuthStore.getState()).toMatchObject({
    isStartupReady: true,
    isDeviceDataErasing: false,
    deviceDataEraseError: null,
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    profileOwnerId: 'local:device',
  })
  expect(app.settings.getState().bodyWeight).toBeNull()
  expect(app.running.getState().runningWorkout).toBeNull()
  expect(app.widgets.getState().widgets).toEqual([])
  expect(app.network.getState().manualOffline).toBe(false)
  expect(app.queryClient.getQueryData(['private-data'])).toBeUndefined()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStorage.clear()
  mockCredentials.clear()
  mockFiles.clear()
  mockSchedules.clear()
  mockEvents.length = 0
  mockFailure = null
  seedDevice()
})

test('eraseDeviceData closes the active database before clearing every owner and reopens an empty local profile', async () => {
  const app = boot()
  await app.initializeAuth()
  mockCredentials.set('user_token', 'private-access')
  mockCredentials.set('user_refresh_token', 'private-refresh')
  expect(app.settings.getState().bodyWeight).toBe(89)
  expect(app.running.getState().runningWorkout.id).toBe('private-workout')
  app.queryClient.setQueryData(['private-data'], { secret: 'workout' })
  const database = { closeAsync: jest.fn(async () => {}) }
  app.connection.setSharedDatabase(database)
  const token = app.connection.markSharedDatabaseProviderMounted()
  let signalDetachStarted
  const detachStarted = new Promise((resolve) => {
    signalDetachStarted = resolve
  })
  const waitForDetach = app.connection.waitForSharedDatabaseDetach
  jest.spyOn(app.connection, 'waitForSharedDatabaseDetach').mockImplementation(() => {
    signalDetachStarted()
    return waitForDetach()
  })
  const erasing = app.useAuthStore.getState().eraseDeviceData()
  await detachStarted
  expect(mockStorage.has(PENDING)).toBe(true)
  expect(mockEvents.filter((event) => event.startsWith('delete:'))).toEqual([])
  await database.closeAsync()
  app.connection.markSharedDatabaseDetached(database, token)
  await erasing
  expect(require('expo-sqlite').deleteDatabaseAsync.mock.calls.map(([name]) => name)).toEqual(
    DATABASES.map(encodeURIComponent)
  )
  expect(mockEvents).toContain('cache cleared')
  expectCleanDevice(app)

  const restarted = boot()
  await restarted.initializeAuth()
  expectCleanDevice(restarted)
})

test.each(['notifications', 'credentials', 'database', 'storage'])(
  'a %s failure keeps the erase journal through restart and blocks old profile hydration until retry succeeds',
  async (failure) => {
    const app = boot()
    await app.initializeAuth()
    mockCredentials.set('user_token', 'private-access')
    mockCredentials.set('user_refresh_token', 'private-refresh')
    mockFailure = failure
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(app.useAuthStore.getState().eraseDeviceData()).rejects.toThrow('removal failed')
      expect(mockStorage.has(PENDING)).toBe(true)
      expect(app.useAuthStore.getState()).toMatchObject({
        isDeviceDataErasing: true,
        isProfileTransitioning: true,
        user: null,
      })
      mockEvents.length = 0
      const restarted = boot()
      await restarted.initializeAuth()
      expect(mockStorage.has(PENDING)).toBe(true)
      expect(restarted.useAuthStore.getState().deviceDataEraseError).toContain('removal failed')
      expect(
        mockEvents.filter((event) =>
          /^read:(settings-storage|running-workout-storage|widget-storage):/.test(event)
        )
      ).toEqual([])
      expect(restarted.settings.getState().bodyWeight).toBeNull()
      expect(restarted.running.getState().runningWorkout).toBeNull()
      expect(restarted.widgets.getState().widgets).toEqual([])
      mockFailure = null
      await restarted.useAuthStore.getState().eraseDeviceData()
      expectCleanDevice(restarted)
    } finally {
      errors.mockRestore()
    }
  }
)

test('restart removes orphan database sidecars left by an interrupted native deletion', async () => {
  mockStorage.set(PENDING, 'interrupted')
  for (const name of DATABASES) mockFiles.delete(name)
  const app = boot()
  await app.initializeAuth()
  expectCleanDevice(app)
})
