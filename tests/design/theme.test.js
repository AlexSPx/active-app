const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('react-native', () => ({ useColorScheme: jest.fn(() => 'light') }))
jest.mock('../../features/settings', () => ({
  useSettingsStore: require('zustand').create((set) => ({
    theme: 'light',
    setTheme: (theme) => set({ theme }),
  })),
}))
jest.mock('tamagui', () => {
  const React = require('react')
  const ThemeContext = React.createContext('light')
  return {
    ThemeContext,
    TamaguiProvider: ({ defaultTheme, children }) =>
      React.createElement(ThemeContext.Provider, { value: defaultTheme }, children),
    Theme: ({ children }) => children,
    PortalProvider: ({ children }) => children,
  }
})
jest.mock('expo-sqlite', () => {
  const React = require('react')
  const database = {}
  return {
    // Expo SQLite's installed provider compares DB props and ignores changed children.
    SQLiteProvider: React.memo(
      ({ children }) => children,
      (before, after) =>
        before.databaseName === after.databaseName && before.onInit === after.onInit
    ),
    useSQLiteContext: () => database,
  }
})
jest.mock('@react-navigation/native', () => {
  const React = require('react')
  const NavigationContext = React.createContext({ dark: false })
  return {
    NavigationContext,
    DarkTheme: { dark: true },
    DefaultTheme: { dark: false },
    ThemeProvider: ({ value, children }) =>
      React.createElement(NavigationContext.Provider, { value }, children),
  }
})
jest.mock('@tamagui/toast', () => ({
  ToastProvider: ({ children }) => children,
  ToastViewport: () => null,
}))
jest.mock('@tanstack/react-query', () => ({ QueryClientProvider: ({ children }) => children }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
}))
jest.mock('posthog-react-native', () => ({ PostHogProvider: ({ children }) => children }))
jest.mock('../../lib/db/migrations', () => ({ migrateDbIfNeeded: jest.fn() }))
jest.mock('../../app/CurrentToast', () => ({ CurrentToast: () => null }))
jest.mock('../../tamagui.config', () => ({ config: {} }))
jest.mock('../../stores/uiStore', () => ({
  useUiStore: (select) =>
    select({ finishedCongrats: { visible: false }, hideFinishedCongrats: () => {} }),
}))
jest.mock('../../stores/authStore', () => ({
  useAuthStore: (select) => select({ isAuthenticated: false, user: null }),
}))
jest.mock('../../components/FinishedWorkoutCongrats', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('../../services/notificationService', () => ({
  initNotifications: async () => {},
  registerPushNotifications: async () => {},
}))
jest.mock('../../services/posthog', () => ({ posthog: {} }))
jest.mock('../../lib/queryClient', () => ({ queryClient: {} }))
jest.mock('../../lib/sync', () => ({
  syncEngine: { onIdRemap: () => () => {}, init: async () => {}, destroy: () => {} },
}))
jest.mock('../../lib/sync/queuePayloadRemap', () => ({ replaceQueuedIdReferences: jest.fn() }))
jest.mock('../../lib/sync/hydrate', () => ({ hydrateFromServer: jest.fn() }))
jest.mock('../../lib/db/connection', () => ({ setSharedDatabase: jest.fn() }))
jest.mock('../../features/workout-session/stores/runningWorkoutStore', () => ({
  remapRunningWorkoutId: jest.fn(),
}))

const { Provider } = require('../../app/Provider')
const { useSettingsStore } = require('../../features/settings')
const { ThemeContext } = require('tamagui')
const { NavigationContext } = require('@react-navigation/native')
const { useColorScheme } = require('react-native')
function ThemeProbe() {
  return React.createElement('Probe', {
    appearance: React.useContext(ThemeContext),
    navigationDark: React.useContext(NavigationContext).dark,
  })
}

test('live appearance changes update both themes through the memoized database provider', async () => {
  let view
  await act(async () => {
    view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
  })
  const probe = () => view.root.findByType('Probe').props
  expect(probe()).toMatchObject({ appearance: 'light', navigationDark: false })
  await act(async () => useSettingsStore.getState().setTheme('dark'))
  expect(probe()).toMatchObject({ appearance: 'dark', navigationDark: true })
  await act(async () => useSettingsStore.getState().setTheme('system'))
  expect(probe()).toMatchObject({ appearance: 'light', navigationDark: false })
  useColorScheme.mockReturnValue('dark')
  await act(async () => useSettingsStore.getState().setTheme('light'))
  expect(probe()).toMatchObject({ appearance: 'light', navigationDark: false })
  await act(async () => useSettingsStore.getState().setTheme('system'))
  expect(probe()).toMatchObject({ appearance: 'dark', navigationDark: true })
  await act(async () => view.unmount())
})
