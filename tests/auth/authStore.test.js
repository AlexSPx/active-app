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
    removeToken: jest.fn(),
    removeRefreshToken: jest.fn(),
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
const mockPauseAndDrain = jest.fn()
const mockInvalidatePendingRequests = jest.fn()
const mockResumePendingRequests = jest.fn()
const mockHydrateProfileStores = jest.fn()
const mockCredentials = { token: null, refreshToken: null }
const mockProfileHydration = { finish: null }
const AsyncStorage = require('@react-native-async-storage/async-storage')
const { resetAllStores } = require('../../utils/storeReset')
const { clearDatabase } = require('../../lib/db/connection')
const { LOCAL_PROFILE_OWNER, setActiveProfileOwner, getProfileScope } = require('../../lib/profileScope')
const { useAuthStore, initializeAuth } = require('../../stores/authStore')

describe('auth profile refresh', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await useAuthStore.persist.clearStorage()
    await useAuthStore.persist.rehydrate()
    useAuthStore.setState({
      isStartupReady: false,
      profileOwnerId: LOCAL_PROFILE_OWNER,
      isProfileTransitioning: false,
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
    mockPauseAndDrain.mockReset().mockResolvedValue(undefined)
    mockInvalidatePendingRequests.mockReset()
    mockResumePendingRequests.mockReset()
    mockHydrateProfileStores.mockReset().mockResolvedValue(undefined)
    setActiveProfileOwner(LOCAL_PROFILE_OWNER)
    mockCredentials.token = null
    mockCredentials.refreshToken = null
    mockProfileHydration.finish = null
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

    const startup = initializeAuth()
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
})
