let mockNativeOfflineLaunch = false
let mockSegments = ['welcome']
let mockAuthValue = { isAuthenticated: false, user: null, isLoading: false }

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => mockAuthValue }))
jest.mock('../../components/RootLayoutNav', () => ({ RootLayoutNav: () => null }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments,
  useRootNavigationState: () => ({ key: 'root' }),
}))
jest.mock('tamagui', () => {
  const React = require('react')
  return {
    Button: ({ children, onPress }) =>
      React.createElement('button', { onClick: onPress }, children),
    Text: ({ children }) => React.createElement('mock-text', null, children),
    YStack: ({ children }) => React.createElement('mock-stack', null, children),
    Spinner: () => React.createElement('mock-spinner'),
  }
})
jest.mock('../../stores/authStore', () => ({
  useAuthStore: (selector) => selector(mockAuthState),
  initializeAuth: (...args) => mockInitializeAuth(...args),
}))
jest.mock('../../config/launchPolicy', () => ({
  ...jest.requireActual('../../config/launchPolicy'),
  isNativeOfflineLaunch: () => mockNativeOfflineLaunch,
}))

const mockReplace = jest.fn()
const mockInitializeAuth = jest.fn()
const mockLogout = jest.fn()
let mockAuthState
const React = require('react')
const { act, create } = require('react-test-renderer')
const { AuthGuard } = require('../../components/AuthGuard')

describe('AuthGuard recovery actions', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockInitializeAuth.mockReset()
    mockLogout.mockReset()
    mockNativeOfflineLaunch = false
    mockSegments = ['welcome']
    mockAuthValue = { isAuthenticated: false, user: null, isLoading: false }
    mockAuthState = {
      isStartupReady: true,
      startupError: null,
      logoutRetryRequired: true,
      error: 'Could not sign out. Please try again.',
      isProfileTransitioning: true,
      isProfileLoading: false,
      profileOwnerId: 'local:device',
      logout: mockLogout,
      fetchUser: jest.fn(),
    }
  })

  it('routes a logout recovery action to logout even if startupError is also set', async () => {
    mockAuthState.startupError = 'We couldn’t restore your local data.'
    let root
    await act(async () => {
      root = create(React.createElement(AuthGuard))
    })

    const text = root.root.findAllByType('mock-text').map((node) => node.children.join(' '))
    expect(text).toContain('Sign-out needs to be retried')
    const button = root.root.findByType('button')
    expect(button.children).toContain('Retry sign out')

    await act(async () => {
      button.props.onClick()
    })

    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(mockInitializeAuth).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it('keeps startup restore retry routed to initializeAuth', async () => {
    mockAuthState.logoutRetryRequired = false
    mockAuthState.startupError = 'We couldn’t restore your local data.'
    let root
    await act(async () => {
      root = create(React.createElement(AuthGuard))
    })

    const button = root.root.findByType('button')
    expect(button.children).toContain('Retry')
    await act(async () => {
      button.props.onClick()
    })

    expect(mockInitializeAuth).toHaveBeenCalledWith(true)
    expect(mockLogout).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it('routes a fresh native local profile to onboarding', async () => {
    mockNativeOfflineLaunch = true
    mockSegments = ['(tabs)']
    mockAuthState.isStartupReady = true
    mockAuthState.logoutRetryRequired = false
    mockAuthState.isProfileTransitioning = false

    let root
    await act(async () => {
      root = create(React.createElement(AuthGuard))
    })

    expect(mockReplace).toHaveBeenCalledWith('/welcome/register')
    await act(async () => root.unmount())
  })

  it('routes a cached completed native account directly to training without credentials', async () => {
    mockNativeOfflineLaunch = true
    mockSegments = ['welcome', 'home']
    mockAuthValue = {
      isAuthenticated: true,
      user: { id: 'cached-owner', registrationCompleted: true },
      isLoading: false,
    }
    mockAuthState.isStartupReady = true
    mockAuthState.logoutRetryRequired = false
    mockAuthState.isProfileTransitioning = false
    mockAuthState.profileOwnerId = 'account:cached-owner'

    let root
    await act(async () => {
      root = create(React.createElement(AuthGuard))
    })

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
    await act(async () => root.unmount())
  })

  it('routes a completed native local profile directly to training', async () => {
    mockNativeOfflineLaunch = true
    mockSegments = ['welcome', 'home']
    mockAuthValue = {
      isAuthenticated: true,
      user: { id: 'local:device', registrationCompleted: true },
      isLoading: false,
    }
    mockAuthState.isStartupReady = true
    mockAuthState.logoutRetryRequired = false
    mockAuthState.isProfileTransitioning = false
    mockAuthState.profileOwnerId = 'local:device'

    let root
    await act(async () => {
      root = create(React.createElement(AuthGuard))
    })

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
    await act(async () => root.unmount())
  })
})
