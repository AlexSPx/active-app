const mockStorageData = new Map()
let mockFailAuthRead = false

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (name) => {
    if (mockFailAuthRead && name === 'auth-storage') throw new Error('storage unavailable')
    return mockStorageData.get(name) ?? null
  }),
  setItem: jest.fn(async (name, value) => mockStorageData.set(name, value)),
  removeItem: jest.fn(async (name) => mockStorageData.delete(name)),
  clear: jest.fn(async () => mockStorageData.clear()),
}))
jest.mock('../../features/settings', () => ({
  useSettingsStore: Object.assign(() => {}, {
    getState: () => ({ setTimeZone: jest.fn(), setBodyWeight: jest.fn(), setHeight: jest.fn() }),
    persist: { hasHydrated: () => true, rehydrate: async () => {} },
  }),
}))
jest.mock('../../features/workout-session/stores/runningWorkoutStore', () => ({
  useRunningWorkoutStore: Object.assign(() => {}, {
    persist: { hasHydrated: () => true, rehydrate: async () => {} },
  }),
}))
jest.mock('../../utils/storeReset', () => ({ resetAllStores: jest.fn() }))
jest.mock('../../lib/db/connection', () => ({ clearDatabase: jest.fn() }))
jest.mock('../../services/posthog', () => ({ posthog: { capture: jest.fn(), reset: jest.fn() } }))
jest.mock('lib/repositories', () => ({
  AuthRepository: jest.fn(() => ({
    getToken: async () => null,
    getRefreshToken: async () => null,
    setToken: async () => {},
    setRefreshToken: async () => {},
    removeToken: async () => {},
    removeRefreshToken: async () => {},
  })),
  UserRepository: jest.fn(() => ({ getCurrentUser: async () => null })),
}))

describe('auth storage hydration failure', () => {
  it('does not replace persisted identity with in-memory defaults when auth storage fails to read', async () => {
    const cachedRow = JSON.stringify({
      state: {
        isAuthenticated: true,
        user: { id: 'cached-user', registrationCompleted: true },
        token: 'cached-token',
        refreshToken: 'cached-refresh-token',
      },
      version: 0,
    })
    mockStorageData.set('auth-storage', cachedRow)
    mockFailAuthRead = true
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const { initializeAuth, useAuthStore } = require('../../stores/authStore')
    await initializeAuth()

    expect(useAuthStore.getState()).toMatchObject({
      isStartupReady: true,
      startupError: 'We couldn’t restore your local data.',
    })
    expect(mockStorageData.get('auth-storage')).toBe(cachedRow)

    consoleError.mockRestore()
  })
})
