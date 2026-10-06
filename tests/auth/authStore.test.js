jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../utils/storeReset', () => ({ resetAllStores: jest.fn() }))
jest.mock('../../lib/db/connection', () => ({ clearDatabase: jest.fn() }))
jest.mock('../../services/posthog', () => ({ posthog: { capture: jest.fn(), reset: jest.fn() } }))
jest.mock('lib/repositories', () => ({
  AuthRepository: jest.fn(() => ({
    getToken: jest.fn(async () => mockCredentials.token),
    getRefreshToken: jest.fn(async () => mockCredentials.refreshToken),
    setToken: jest.fn(),
    setRefreshToken: jest.fn(),
    removeToken: jest.fn(),
    removeRefreshToken: jest.fn(),
    loginWithWorkOS: (...args) => mockLoginWithWorkOS(...args),
  })),
  UserRepository: jest.fn(() => ({
    getCurrentUser: (...args) => mockGetCurrentUser(...args),
    updateCurrentUser: (...args) => mockUpdateCurrentUser(...args),
  })),
}))
jest.mock('../../features/settings', () => ({
  useSettingsStore: Object.assign(() => {}, {
    getState: () => ({ setTimeZone: jest.fn(), setBodyWeight: jest.fn(), setHeight: jest.fn() }),
    persist: {
      hasHydrated: () => mockSettingsHydration.hydrated,
      rehydrate: () => {
        if (mockSettingsHydration.hydrated) return Promise.resolve()
        return new Promise((resolve) => {
          mockSettingsHydration.finish = (error) => {
            mockSettingsHydration.hydrated = !error
            resolve()
          }
        })
      },
    },
  }),
}))
jest.mock('../../features/workout-session/stores/runningWorkoutStore', () => ({
  useRunningWorkoutStore: Object.assign(() => {}, {
    persist: {
      hasHydrated: () => mockRunningHydration.hydrated,
      rehydrate: () => {
        if (mockRunningHydration.hydrated) return Promise.resolve()
        return new Promise((resolve) => {
          mockRunningHydration.finish = (error) => {
            mockRunningHydration.hydrated = !error
            resolve()
          }
        })
      },
    },
  }),
}))

const mockGetCurrentUser = jest.fn()
const mockUpdateCurrentUser = jest.fn()
const mockLoginWithWorkOS = jest.fn()
const mockCredentials = { token: null, refreshToken: null }
const mockSettingsHydration = { hydrated: true, finish: null }
const mockRunningHydration = { hydrated: true, finish: null }
const AsyncStorage = require('@react-native-async-storage/async-storage')
const { resetAllStores } = require('../../utils/storeReset')
const { clearDatabase } = require('../../lib/db/connection')
const { useAuthStore, initializeAuth } = require('../../stores/authStore')

describe('auth profile refresh', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await useAuthStore.persist.clearStorage()
    await useAuthStore.persist.rehydrate()
    useAuthStore.setState({
      isStartupReady: false,
      isAuthenticated: false,
      serverSession: 'unknown',
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,
      isProfileLoading: false,
      profileError: null,
      error: null,
    })
    await useAuthStore.persist.clearStorage()
    mockGetCurrentUser.mockReset()
    mockUpdateCurrentUser.mockReset()
    mockLoginWithWorkOS.mockReset()
    mockCredentials.token = null
    mockCredentials.refreshToken = null
    mockSettingsHydration.hydrated = true
    mockSettingsHydration.finish = null
    mockRunningHydration.hydrated = true
    mockRunningHydration.finish = null
  })

  it('keeps cached local access when the server rejects a profile refresh', async () => {
    const cachedUser = { id: 'user_1', registrationCompleted: true }
    const error = Object.assign(new Error('Unauthorized'), { status: 401 })
    mockGetCurrentUser.mockRejectedValue(error)
    useAuthStore.setState({
      isStartupReady: true,
      isAuthenticated: true,
      user: cachedUser,
      serverSession: 'unknown',
    })

    await expect(useAuthStore.getState().fetchUser()).rejects.toBe(error)

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: cachedUser,
      serverSession: 'invalid',
      isProfileLoading: false,
    })
    expect(resetAllStores).not.toHaveBeenCalled()
    expect(clearDatabase).not.toHaveBeenCalled()
    expect(AsyncStorage.clear).not.toHaveBeenCalled()
  })

  it('keeps a successful credential exchange when the first profile fetch fails', async () => {
    useAuthStore.setState({ user: { id: 'previous_user', registrationCompleted: true } })
    mockLoginWithWorkOS.mockResolvedValue({ token: 'access', refreshToken: 'refresh' })
    mockGetCurrentUser.mockRejectedValue(Object.assign(new Error('Offline'), { status: 503 }))

    await expect(useAuthStore.getState().loginWithWorkOS('code')).resolves.toBeUndefined()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      token: 'access',
      refreshToken: 'refresh',
      user: null,
      profileError: 'Offline',
    })
  })

  it('waits for settings and session hydration, not the remote profile', async () => {
    mockCredentials.token = 'access'
    mockCredentials.refreshToken = 'refresh'
    mockSettingsHydration.hydrated = false
    mockRunningHydration.hydrated = false
    const cachedUser = { id: 'user_1', registrationCompleted: true }
    useAuthStore.setState({ isAuthenticated: true, user: cachedUser })
    let rejectProfile
    mockGetCurrentUser.mockReturnValue(
      new Promise((_, reject) => {
        rejectProfile = reject
      })
    )

    const startup = initializeAuth()
    expect(useAuthStore.getState().isStartupReady).toBe(false)

    mockSettingsHydration.finish()
    await Promise.resolve()
    expect(useAuthStore.getState().isStartupReady).toBe(false)

    mockRunningHydration.finish()
    await startup

    expect(useAuthStore.getState()).toMatchObject({
      isStartupReady: true,
      isAuthenticated: true,
      user: cachedUser,
      isProfileLoading: true,
    })
    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1)

    rejectProfile(Object.assign(new Error('Unauthorized'), { status: 401 }))
    await Promise.resolve()
    await Promise.resolve()
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      isStartupReady: true,
      user: cachedUser,
      profileError: 'Unauthorized',
      serverSession: 'invalid',
    })
  })

  it('settles a persisted-store read error into a retryable startup state', async () => {
    mockSettingsHydration.hydrated = false

    const startup = initializeAuth(true)
    expect(useAuthStore.getState().isStartupReady).toBe(false)
    mockSettingsHydration.finish(new Error('storage unavailable'))
    await startup

    expect(useAuthStore.getState()).toMatchObject({
      isStartupReady: true,
      startupError: 'We couldn’t restore your local data.',
    })
    expect(mockGetCurrentUser).not.toHaveBeenCalled()
  })

  it('does not restore credentials from a startup read that finishes after logout', async () => {
    let resolveToken
    mockCredentials.token = new Promise((resolve) => (resolveToken = resolve))
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'user_1', registrationCompleted: true },
    })

    const startup = initializeAuth(true)
    await Promise.resolve()
    await useAuthStore.getState().logout()
    resolveToken('access')
    await startup

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null })
    expect(mockGetCurrentUser).not.toHaveBeenCalled()
  })

  it('keeps explicit logout in the persisted auth state', async () => {
    useAuthStore.setState({
      isStartupReady: true,
      isAuthenticated: true,
      user: { id: 'user_1', registrationCompleted: true },
      token: 'access',
      refreshToken: 'refresh',
    })

    await useAuthStore.getState().logout()
    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
    })
    expect(mockGetCurrentUser).not.toHaveBeenCalled()
  })

  it('ignores profile and update responses that return after explicit logout', async () => {
    let resolveProfile
    let resolveUpdate
    mockGetCurrentUser.mockReturnValue(new Promise((resolve) => (resolveProfile = resolve)))
    mockUpdateCurrentUser.mockReturnValue(new Promise((resolve) => (resolveUpdate = resolve)))
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'user_1', registrationCompleted: true },
    })

    const profile = useAuthStore.getState().fetchUser()
    const update = useAuthStore.getState().updateUser({ name: 'New name' })
    await Promise.resolve()
    await useAuthStore.getState().logout()

    resolveProfile({ id: 'user_1', registrationCompleted: true })
    resolveUpdate({ id: 'user_1', name: 'New name', registrationCompleted: true })
    await Promise.all([profile, update])

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      isProfileLoading: false,
    })
  })
})
