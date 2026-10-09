jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../utils/storeReset', () => ({ resetAllStores: jest.fn() }))
jest.mock('../../lib/db/connection', () => ({ clearDatabase: jest.fn() }))
jest.mock('../../lib/sync', () => ({
  syncEngine: { pauseAndDrain: (...args) => mockPauseAndDrain(...args) },
}))
jest.mock('../../lib/profileStorage', () => ({
  hydrateProfileStores: (...args) => mockHydrateProfileStores(...args),
}))
jest.mock('../../services/posthog', () => ({ posthog: { capture: jest.fn(), reset: jest.fn() } }))
jest.mock('lib/repositories', () => ({
  AuthRepository: jest.fn(() => ({
    getToken: jest.fn(async () => mockCredentials.token),
    getRefreshToken: jest.fn(async () => mockCredentials.refreshToken),
    setToken: jest.fn(),
    setRefreshToken: jest.fn(),
    migrateLegacyCredentials: (...args) => mockMigrateLegacyCredentials(...args),
    removeToken: (...args) => mockRemoveToken(...args),
    removeRefreshToken: (...args) => mockRemoveRefreshToken(...args),
    invalidatePendingRequests: (...args) => mockInvalidatePendingRequests(...args),
    resumePendingRequests: (...args) => mockResumePendingRequests(...args),
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
  }),
}))

const mockGetCurrentUser = jest.fn()
const mockUpdateCurrentUser = jest.fn()
const mockLoginWithWorkOS = jest.fn()
const mockMigrateLegacyCredentials = jest.fn()
const mockRemoveToken = jest.fn()
const mockRemoveRefreshToken = jest.fn()
const mockPauseAndDrain = jest.fn()
const mockInvalidatePendingRequests = jest.fn()
const mockResumePendingRequests = jest.fn()
const mockHydrateProfileStores = jest.fn()
const mockCredentials = { token: null, refreshToken: null }
const mockProfileHydration = { finish: null }
const AsyncStorage = require('@react-native-async-storage/async-storage')
const { config } = require('../../config/api')
const { resetAllStores } = require('../../utils/storeReset')
const { useUiStore } = require('../../stores/uiStore')
const { clearDatabase } = require('../../lib/db/connection')
const {
  LOCAL_PROFILE_OWNER,
  setActiveProfileOwner,
  getProfileScope,
} = require('../../lib/profileScope')
const { useAuthStore, initializeAuth } = require('../../stores/authStore')

describe('auth profile refresh', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    resetAllStores.mockReset()
    await useAuthStore.persist.clearStorage()
    await useAuthStore.persist.rehydrate()
    useAuthStore.setState({
      isStartupReady: false,
      startupError: null,
      profileOwnerId: LOCAL_PROFILE_OWNER,
      isProfileTransitioning: false,
      logoutRetryRequired: false,
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
    mockMigrateLegacyCredentials
      .mockReset()
      .mockImplementation(async ({ token, refreshToken }) => ({
        token: (await mockCredentials.token) ?? token,
        refreshToken: (await mockCredentials.refreshToken) ?? refreshToken,
      }))
    mockRemoveToken.mockReset().mockResolvedValue(undefined)
    mockRemoveRefreshToken.mockReset().mockResolvedValue(undefined)
    mockPauseAndDrain.mockReset().mockResolvedValue(undefined)
    mockInvalidatePendingRequests.mockReset()
    mockResumePendingRequests.mockReset()
    mockHydrateProfileStores.mockReset().mockResolvedValue(undefined)
    setActiveProfileOwner(LOCAL_PROFILE_OWNER)
    mockCredentials.token = null
    mockCredentials.refreshToken = null
    mockProfileHydration.finish = null
  })

  it('keeps cached credentials and local writes when SecureStore is unavailable', async () => {
    const cachedUser = { id: 'user_1', registrationCompleted: true }
    const cachedRow = JSON.stringify({
      state: {
        isAuthenticated: true,
        user: cachedUser,
        token: 'legacy-access',
        refreshToken: 'legacy-refresh',
      },
      version: 0,
    })
    await AsyncStorage.multiSet([
      ['auth-storage', cachedRow],
      [config.STORAGE_KEYS.TOKEN, 'legacy-access'],
      [config.STORAGE_KEYS.REFRESH_TOKEN, 'legacy-refresh'],
    ])
    await useAuthStore.persist.rehydrate()
    mockMigrateLegacyCredentials.mockRejectedValueOnce(
      Object.assign(new Error('SecureStore unavailable'), { code: 'SECURE_STORE_UNAVAILABLE' })
    )

    await initializeAuth(true)

    expect(mockMigrateLegacyCredentials).toHaveBeenCalledWith({
      token: 'legacy-access',
      refreshToken: 'legacy-refresh',
    })
    expect(mockHydrateProfileStores).toHaveBeenCalledWith('account:user_1', 'account:user_1')
    expect(useAuthStore.getState()).toMatchObject({
      isStartupReady: true,
      startupError: null,
      isAuthenticated: true,
      user: cachedUser,
      token: 'legacy-access',
      refreshToken: 'legacy-refresh',
    })
    expect(mockGetCurrentUser).not.toHaveBeenCalled()
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)).toBe('legacy-access')
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.REFRESH_TOKEN)).toBe('legacy-refresh')
    expect(JSON.parse(await AsyncStorage.getItem('auth-storage')).state).toMatchObject({
      token: 'legacy-access',
      refreshToken: 'legacy-refresh',
    })

    const updatedUser = { ...cachedUser, name: 'Local update' }
    useAuthStore.setState({ user: updatedUser })
    const persisted = JSON.parse(await AsyncStorage.getItem('auth-storage'))
    expect(persisted.state).toEqual({
      token: 'legacy-access',
      refreshToken: 'legacy-refresh',
      user: updatedUser,
      isAuthenticated: true,
    })
  })

  it('keeps the source auth row when the post-migration scrub write fails', async () => {
    const cachedUser = { id: 'user_scrub_failure', registrationCompleted: true }
    const cachedRow = JSON.stringify({
      state: {
        isAuthenticated: true,
        user: cachedUser,
        token: 'legacy-access',
        refreshToken: 'legacy-refresh',
      },
      version: 0,
    })
    await AsyncStorage.setItem('auth-storage', cachedRow)
    await useAuthStore.persist.rehydrate()
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('auth storage write failed'))
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await initializeAuth(true)
    } finally {
      consoleError.mockRestore()
    }

    expect(useAuthStore.getState()).toMatchObject({
      isStartupReady: true,
      startupError: 'We couldn’t restore your local data.',
      isAuthenticated: true,
    })
    expect(await AsyncStorage.getItem('auth-storage')).toBe(cachedRow)
    expect(mockGetCurrentUser).not.toHaveBeenCalled()
  })

  it('does not let a migration scrub recreate auth storage after logout', async () => {
    const cachedUser = { id: 'user_scrub_logout', registrationCompleted: true }
    const cachedRow = JSON.stringify({
      state: {
        isAuthenticated: true,
        user: cachedUser,
        token: 'legacy-access',
        refreshToken: 'legacy-refresh',
      },
      version: 0,
    })
    await AsyncStorage.setItem('auth-storage', cachedRow)
    await useAuthStore.persist.rehydrate()
    AsyncStorage.setItem.mockClear()
    let finishScrubWrite
    let markScrubWriteStarted
    const scrubWriteStarted = new Promise((resolve) => (markScrubWriteStarted = resolve))
    AsyncStorage.setItem.mockImplementationOnce((key, value) => {
      markScrubWriteStarted()
      return new Promise((resolve, reject) => {
        finishScrubWrite = () => {
          AsyncStorage.multiSet([[key, value]]).then(resolve, reject)
        }
      })
    })

    const startup = initializeAuth(true)
    await scrubWriteStarted
    const logout = useAuthStore.getState().logout()
    expect(mockRemoveToken).not.toHaveBeenCalled()

    finishScrubWrite()
    await Promise.all([startup, logout])

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
    })
    expect(await AsyncStorage.getItem('auth-storage')).toBeNull()
  })

  it('migrates hydrated credentials before enabling writes and scrubs them after success', async () => {
    const cachedUser = { id: 'user_2', registrationCompleted: true }
    const cachedRow = JSON.stringify({
      state: {
        isAuthenticated: true,
        user: cachedUser,
        token: 'legacy-access',
        refreshToken: 'legacy-refresh',
      },
      version: 0,
    })
    await AsyncStorage.setItem('auth-storage', cachedRow)
    await useAuthStore.persist.rehydrate()
    AsyncStorage.setItem.mockClear()
    let finishMigration
    let markMigrationStarted
    const migrationStarted = new Promise((resolve) => (markMigrationStarted = resolve))
    mockMigrateLegacyCredentials.mockImplementationOnce(() => {
      markMigrationStarted()
      return new Promise((resolve) => (finishMigration = resolve))
    })

    const startup = initializeAuth(true)
    await migrationStarted

    expect(mockMigrateLegacyCredentials).toHaveBeenCalledWith({
      token: 'legacy-access',
      refreshToken: 'legacy-refresh',
    })
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
    expect(await AsyncStorage.getItem('auth-storage')).toBe(cachedRow)

    finishMigration({ token: 'secure-access', refreshToken: 'secure-refresh' })
    await startup

    expect(useAuthStore.getState()).toMatchObject({
      token: 'secure-access',
      refreshToken: 'secure-refresh',
      isAuthenticated: true,
    })
    const persisted = JSON.parse(await AsyncStorage.getItem('auth-storage'))
    expect(persisted.state).toEqual({ isAuthenticated: true, user: cachedUser })
    expect(mockMigrateLegacyCredentials.mock.invocationCallOrder[0]).toBeLessThan(
      AsyncStorage.setItem.mock.invocationCallOrder[0]
    )
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
    setActiveProfileOwner('account:previous_user')
    useAuthStore.setState({
      profileOwnerId: 'account:previous_user',
      user: { id: 'previous_user', registrationCompleted: true },
    })
    mockLoginWithWorkOS.mockResolvedValue({ token: 'access', refreshToken: 'refresh' })
    mockGetCurrentUser.mockRejectedValue(Object.assign(new Error('Offline'), { status: 503 }))

    await expect(useAuthStore.getState().loginWithWorkOS('code')).resolves.toBeUndefined()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      token: 'access',
      refreshToken: 'refresh',
      user: null,
      profileError: 'Offline',
      profileOwnerId: LOCAL_PROFILE_OWNER,
      isProfileTransitioning: false,
    })
    expect(getProfileScope().ownerId).toBe(LOCAL_PROFILE_OWNER)
  })

  it('waits for sync to drain before starting the login exchange', async () => {
    let releaseDrain
    let markDrainStarted
    const drainStarted = new Promise((resolve) => (markDrainStarted = resolve))
    mockPauseAndDrain.mockImplementation(() => {
      markDrainStarted()
      return new Promise((resolve) => (releaseDrain = resolve))
    })
    mockLoginWithWorkOS.mockResolvedValue({ token: 'access', refreshToken: 'refresh' })
    mockGetCurrentUser.mockRejectedValue(new Error('Offline'))

    const login = useAuthStore.getState().loginWithWorkOS('code')
    await drainStarted

    expect(mockLoginWithWorkOS).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isProfileTransitioning).toBe(true)

    releaseDrain()
    await login
    expect(mockLoginWithWorkOS).toHaveBeenCalledWith('code')
  })

  it('keeps the transition gate set when an old profile request rejects during login', async () => {
    setActiveProfileOwner('account:user_a')
    useAuthStore.setState({
      isAuthenticated: true,
      profileOwnerId: 'account:user_a',
      user: { id: 'user_a', registrationCompleted: true },
    })
    let rejectOldProfile
    mockGetCurrentUser
      .mockReturnValueOnce(new Promise((_, reject) => (rejectOldProfile = reject)))
      .mockRejectedValueOnce(new Error('New profile offline'))

    const oldProfile = useAuthStore.getState().fetchUser()
    let releaseDrain
    let markDrainStarted
    const drainStarted = new Promise((resolve) => (markDrainStarted = resolve))
    mockPauseAndDrain.mockImplementation(() => {
      markDrainStarted()
      return new Promise((resolve) => (releaseDrain = resolve))
    })
    mockLoginWithWorkOS.mockResolvedValue({ token: 'new-access', refreshToken: 'new-refresh' })

    const login = useAuthStore.getState().loginWithWorkOS('new-code')
    await drainStarted
    rejectOldProfile(Object.assign(new Error('Old profile failed'), { status: 503 }))
    await expect(oldProfile).rejects.toThrow('Old profile failed')

    expect(useAuthStore.getState().isProfileTransitioning).toBe(true)
    expect(mockLoginWithWorkOS).not.toHaveBeenCalled()

    releaseDrain()
    await login
  })

  it('ignores old profile and update failures after a profile-only switch', async () => {
    setActiveProfileOwner('account:user_a')
    useAuthStore.setState({
      isAuthenticated: true,
      profileOwnerId: 'account:user_a',
      user: { id: 'user_a', registrationCompleted: true },
    })
    let rejectOldProfile
    let rejectOldUpdate
    mockGetCurrentUser
      .mockReturnValueOnce(new Promise((_, reject) => (rejectOldProfile = reject)))
      .mockResolvedValueOnce({ id: 'user_b', registrationCompleted: true })
    mockUpdateCurrentUser.mockReturnValueOnce(
      new Promise((_, reject) => (rejectOldUpdate = reject))
    )

    const oldProfile = useAuthStore.getState().fetchUser()
    const oldUpdate = useAuthStore.getState().updateUser({ name: 'Old account' })
    await useAuthStore.getState().fetchUser()
    expect(getProfileScope().ownerId).toBe('account:user_b')

    rejectOldProfile(new Error('Old profile failed'))
    rejectOldUpdate(new Error('Old update failed'))
    await Promise.all([oldProfile, oldUpdate])

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      profileOwnerId: 'account:user_b',
      user: { id: 'user_b' },
      profileError: null,
      error: null,
      isProfileTransitioning: true,
    })
  })

  it('invalidates pending API requests as soon as logout begins', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'user_a', registrationCompleted: true },
    })

    await useAuthStore.getState().logout()

    expect(mockInvalidatePendingRequests).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null })
  })

  it('clears finished congrats before an in-flight profile becomes ready during logout', async () => {
    const user = { id: 'user_logout_transition', registrationCompleted: true }
    const previousOwner = `account:${user.id}`
    setActiveProfileOwner(previousOwner)
    useAuthStore.setState({
      isStartupReady: true,
      profileOwnerId: previousOwner,
      isProfileTransitioning: false,
      isAuthenticated: true,
      user,
      token: 'access',
      refreshToken: 'refresh',
    })
    useUiStore.getState().reset()
    useUiStore
      .getState()
      .showFinishedCongrats(
        { workoutTitle: 'Previous owner workout' },
        { status: 'WEEKLY_PROGRESS', currentStreak: 0 }
      )

    let releaseDrain
    let markDrainStarted
    const drainStarted = new Promise((resolve) => (markDrainStarted = resolve))
    mockPauseAndDrain.mockImplementationOnce(() => {
      markDrainStarted()
      return new Promise((resolve) => (releaseDrain = resolve))
    })

    const logout = useAuthStore.getState().logout()
    expect(useUiStore.getState().finishedCongrats).toEqual({ visible: false, payload: undefined })
    await drainStarted

    expect(mockRemoveToken).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      profileOwnerId: previousOwner,
      isProfileTransitioning: true,
    })

    // A profile-ready callback can clear the transition gate while logout is waiting.
    useAuthStore.getState().markProfileDatabaseReady(previousOwner)
    expect(useAuthStore.getState().isProfileTransitioning).toBe(false)
    expect(useUiStore.getState().finishedCongrats).toEqual({ visible: false, payload: undefined })

    releaseDrain()
    await logout

    expect(useAuthStore.getState()).toMatchObject({
      profileOwnerId: LOCAL_PROFILE_OWNER,
      isProfileTransitioning: false,
      isAuthenticated: false,
    })
    expect(useUiStore.getState().finishedCongrats).toEqual({ visible: false, payload: undefined })
  })

  it('waits for profile-store hydration before refreshing the remote profile', async () => {
    mockCredentials.token = 'access'
    mockCredentials.refreshToken = 'refresh'
    let markHydrationStarted
    const hydrationStarted = new Promise((resolve) => {
      markHydrationStarted = resolve
    })
    mockHydrateProfileStores.mockImplementation(
      () =>
        new Promise((resolve) => {
          mockProfileHydration.finish = resolve
          markHydrationStarted()
        })
    )
    const cachedUser = { id: 'user_1', registrationCompleted: true }
    useAuthStore.setState({ isAuthenticated: true, user: cachedUser })
    let rejectProfile
    mockGetCurrentUser.mockReturnValue(
      new Promise((_, reject) => {
        rejectProfile = reject
      })
    )

    const startup = initializeAuth(true)
    expect(useAuthStore.getState().isStartupReady).toBe(false)
    await hydrationStarted

    mockProfileHydration.finish()
    await Promise.resolve()
    expect(useAuthStore.getState().isStartupReady).toBe(false)

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
    mockHydrateProfileStores.mockRejectedValueOnce(new Error('storage unavailable'))

    const startup = initializeAuth(true)
    expect(useAuthStore.getState().isStartupReady).toBe(false)
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

  it('clears legacy credential copies and auth storage on logout without SecureStore', async () => {
    const cachedUser = { id: 'user_3', registrationCompleted: true }
    await AsyncStorage.multiSet([
      [
        'auth-storage',
        JSON.stringify({
          state: {
            isAuthenticated: true,
            user: cachedUser,
            token: 'legacy-access',
            refreshToken: 'legacy-refresh',
          },
          version: 0,
        }),
      ],
      [config.STORAGE_KEYS.TOKEN, 'legacy-access'],
      [config.STORAGE_KEYS.REFRESH_TOKEN, 'legacy-refresh'],
    ])
    await useAuthStore.persist.rehydrate()
    mockMigrateLegacyCredentials.mockRejectedValueOnce(
      Object.assign(new Error('SecureStore unavailable'), { code: 'SECURE_STORE_UNAVAILABLE' })
    )
    await initializeAuth(true)
    mockRemoveToken.mockRejectedValueOnce(
      Object.assign(new Error('SecureStore unavailable'), { code: 'SECURE_STORE_UNAVAILABLE' })
    )
    mockRemoveRefreshToken.mockRejectedValueOnce(
      Object.assign(new Error('SecureStore unavailable'), { code: 'SECURE_STORE_UNAVAILABLE' })
    )

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
    })
    expect(await AsyncStorage.getItem('auth-storage')).toBeNull()
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)).toBeNull()
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.REFRESH_TOKEN)).toBeNull()
  })

  it('restores the prior auth session when logout fails before credential removal', async () => {
    const cachedUser = { id: 'user_4', registrationCompleted: true }
    const cachedRow = JSON.stringify({
      state: { user: cachedUser, isAuthenticated: true },
      version: 0,
    })
    useAuthStore.setState({
      isAuthenticated: true,
      user: cachedUser,
      token: 'secure-access',
      refreshToken: 'secure-refresh',
    })
    await AsyncStorage.setItem('auth-storage', cachedRow)
    mockPauseAndDrain.mockRejectedValueOnce(new Error('sync drain failed'))

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: cachedUser,
      token: 'secure-access',
      refreshToken: 'secure-refresh',
      isProfileTransitioning: false,
      error: 'Could not sign out. Please try again.',
    })
    expect(JSON.parse(await AsyncStorage.getItem('auth-storage'))).toEqual(JSON.parse(cachedRow))
    expect(mockResumePendingRequests).toHaveBeenCalled()
    expect(mockRemoveToken).not.toHaveBeenCalled()
  })

  it('keeps the logout retry screen available when retry fails before credential cleanup', async () => {
    useAuthStore.setState({
      profileOwnerId: LOCAL_PROFILE_OWNER,
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      isProfileTransitioning: true,
      logoutRetryRequired: true,
      startupError: 'We couldn’t restore your local data.',
    })
    mockPauseAndDrain.mockRejectedValueOnce(new Error('sync drain failed'))
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await useAuthStore.getState().logout()
    } finally {
      consoleError.mockRestore()
    }

    expect(useAuthStore.getState()).toMatchObject({
      profileOwnerId: LOCAL_PROFILE_OWNER,
      isAuthenticated: false,
      isProfileTransitioning: true,
      logoutRetryRequired: true,
      startupError: 'We couldn’t restore your local data.',
      error: 'Could not sign out. Please try again.',
    })
    expect(mockRemoveToken).not.toHaveBeenCalled()
  })

  it('keeps logout signed out and gated when first credential removal partially fails', async () => {
    const cachedUser = { id: 'user_credential_partial', registrationCompleted: true }
    const cachedRow = JSON.stringify({
      state: {
        user: cachedUser,
        isAuthenticated: true,
        token: 'secure-access',
        refreshToken: 'secure-refresh',
      },
      version: 0,
    })
    useAuthStore.setState({
      isAuthenticated: true,
      user: cachedUser,
      token: 'secure-access',
      refreshToken: 'secure-refresh',
    })
    await AsyncStorage.setItem('auth-storage', cachedRow)
    mockRemoveToken.mockRejectedValueOnce(
      new Error('secure deletion completed before legacy cleanup failed')
    )
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await useAuthStore.getState().logout()
    } finally {
      consoleError.mockRestore()
    }

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      isProfileTransitioning: true,
      logoutRetryRequired: true,
      error: 'Could not sign out. Please try again.',
    })
    expect(JSON.parse(await AsyncStorage.getItem('auth-storage'))).toEqual(JSON.parse(cachedRow))
    expect(mockRemoveRefreshToken).not.toHaveBeenCalled()
  })

  it('does not roll auth back after one credential has already been removed', async () => {
    const cachedUser = { id: 'user_5', registrationCompleted: true }
    const cachedRow = JSON.stringify({
      state: {
        user: cachedUser,
        isAuthenticated: true,
        token: 'secure-access',
        refreshToken: 'secure-refresh',
      },
      version: 0,
    })
    useAuthStore.setState({
      isAuthenticated: true,
      user: cachedUser,
      token: 'secure-access',
      refreshToken: 'secure-refresh',
    })
    await AsyncStorage.setItem('auth-storage', cachedRow)
    mockRemoveRefreshToken.mockRejectedValueOnce(new Error('Refresh key deletion failed'))

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      isProfileTransitioning: true,
      logoutRetryRequired: true,
      error: 'Could not sign out. Please try again.',
    })
    expect(await AsyncStorage.getItem('auth-storage')).toBe(cachedRow)
    expect(mockRemoveToken).toHaveBeenCalledTimes(1)
  })

  it('keeps the local profile transition gated when logout hydration fails', async () => {
    const cachedUser = { id: 'user_6', registrationCompleted: true }
    const cachedRow = JSON.stringify({
      state: {
        user: cachedUser,
        isAuthenticated: true,
        token: 'secure-access',
        refreshToken: 'secure-refresh',
      },
      version: 0,
    })
    setActiveProfileOwner('account:user_6')
    useAuthStore.setState({
      profileOwnerId: 'account:user_6',
      isAuthenticated: true,
      user: cachedUser,
      token: 'secure-access',
      refreshToken: 'secure-refresh',
    })
    await AsyncStorage.setItem('auth-storage', cachedRow)
    mockHydrateProfileStores.mockRejectedValueOnce(new Error('local profile hydration failed'))
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await useAuthStore.getState().logout()
    } finally {
      consoleError.mockRestore()
    }

    expect(getProfileScope().ownerId).toBe(LOCAL_PROFILE_OWNER)
    expect(useAuthStore.getState()).toMatchObject({
      profileOwnerId: LOCAL_PROFILE_OWNER,
      isAuthenticated: false,
      user: null,
      isProfileTransitioning: true,
      error: 'Could not sign out. Please try again.',
      startupError: 'We couldn’t restore your local data.',
    })
    expect(await AsyncStorage.getItem('auth-storage')).toBe(cachedRow)

    expect(useAuthStore.getState().logoutRetryRequired).toBe(true)
    await useAuthStore.getState().logout()

    expect(useAuthStore.getState()).toMatchObject({
      profileOwnerId: LOCAL_PROFILE_OWNER,
      startupError: null,
      logoutRetryRequired: false,
      isProfileTransitioning: false,
      isAuthenticated: false,
      user: null,
    })
    expect(await AsyncStorage.getItem('auth-storage')).toBeNull()
    expect(getProfileScope().ownerId).toBe(LOCAL_PROFILE_OWNER)
  })

  it('surfaces auth-row deletion failure after clearing the in-memory session', async () => {
    const cachedUser = { id: 'user_7', registrationCompleted: true }
    const cachedRow = JSON.stringify({
      state: {
        user: cachedUser,
        isAuthenticated: true,
        token: 'secure-access',
        refreshToken: 'secure-refresh',
      },
      version: 0,
    })
    useAuthStore.setState({
      profileOwnerId: LOCAL_PROFILE_OWNER,
      isAuthenticated: true,
      user: cachedUser,
      token: 'secure-access',
      refreshToken: 'secure-refresh',
      isProfileTransitioning: false,
    })
    await AsyncStorage.setItem('auth-storage', cachedRow)
    AsyncStorage.removeItem.mockRejectedValueOnce(new Error('auth row deletion failed'))
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await useAuthStore.getState().logout()
    } finally {
      consoleError.mockRestore()
    }

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      logoutRetryRequired: true,
      error: 'Could not sign out. Please try again.',
    })
    expect(await AsyncStorage.getItem('auth-storage')).toBe(cachedRow)
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth-storage')

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      isProfileTransitioning: false,
      logoutRetryRequired: false,
      error: null,
    })
    expect(await AsyncStorage.getItem('auth-storage')).toBeNull()
  })
})
