jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null, isLoading: false }),
}))
jest.mock('../../components/RootLayoutNav', () => ({ RootLayoutNav: () => null }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => ['welcome'],
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
    mockAuthState = {
      isStartupReady: true,
      startupError: null,
      logoutRetryRequired: true,
      error: 'Could not sign out. Please try again.',
      isProfileTransitioning: true,
      isProfileLoading: false,
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
})
