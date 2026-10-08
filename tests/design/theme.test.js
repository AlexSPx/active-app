const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('react-native', () => ({
  useColorScheme: jest.fn(() => 'light'),
  Platform: { OS: 'android' },
}))
jest.mock('@tamagui/core', () => ({ useEvent: (callback) => callback }))
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
    PortalProvider: require('@tamagui/portal').PortalProvider,
  }
})
jest.mock('expo-sqlite', () => {
  const React = require('react')
  const SQLiteContext = React.createContext(null)
  return {
    // Expo SQLite's installed provider compares DB props and ignores changed children.
    SQLiteProvider: React.memo(
      ({ children, databaseName }) =>
        React.createElement(SQLiteContext.Provider, { value: databaseName }, children),
      (before, after) =>
        before.databaseName === after.databaseName && before.onInit === after.onInit
    ),
    useSQLiteContext: () => {
      const database = React.useContext(SQLiteContext)
      if (!database) throw new Error('SQLite context is unavailable')
      return database
    },
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
  useUiStore: jest.requireActual('../../stores/uiStore').useUiStore,
}))
jest.mock('../../stores/authStore', () => {
  const React = require('react')
  const state = {
    isStartupReady: true,
    isAuthenticated: false,
    user: null,
    profileOwnerId: 'local:device',
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'unknown',
    startupError: null,
    markProfileDatabaseReady: jest.fn(),
  }
  const listeners = new Set()
  const useAuthStore = (select) =>
    React.useSyncExternalStore(
      (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      () => select(state),
      () => select(state)
    )
  useAuthStore.getState = () => state
  useAuthStore.setState = (updates) => {
    Object.assign(state, updates)
    listeners.forEach((listener) => listener())
  }
  useAuthStore.__state = state
  return { useAuthStore }
})
jest.mock('../../components/FinishedWorkoutCongrats', () => {
  const React = require('react')
  const { useSQLiteContext } = require('expo-sqlite')
  const { PortalItem } = require('@tamagui/portal')

  function FinishedWorkoutSQLiteProbe({ data, visible }) {
    const database = useSQLiteContext()
    return React.createElement('FinishedWorkoutCongrats', {
      database,
      visible,
      workoutTitle: data.workoutTitle,
    })
  }

  return {
    __esModule: true,
    default: (props) =>
      React.createElement(
        PortalItem,
        { name: 'finished-workout-congrats-test', hostName: 'root' },
        React.createElement(FinishedWorkoutSQLiteProbe, props)
      ),
  }
})
jest.mock('../../services/notificationService', () => ({
  initNotifications: async () => {},
  registerPushNotifications: async () => {},
}))
jest.mock('../../services/posthog', () => ({ posthog: {} }))
jest.mock('../../lib/queryClient', () => ({ queryClient: { setQueriesData: jest.fn() } }))
jest.mock('../../lib/sync', () => ({
  syncEngine: {
    onIdRemap: jest.fn(() => () => {}),
    init: async () => {},
    destroy: () => {},
    setUploadsEnabled: jest.fn(),
  },
}))
jest.mock('../../lib/sync/queuePayloadRemap', () =>
  jest.requireActual('../../lib/sync/queuePayloadRemap')
)
jest.mock('../../lib/sync/hydrate', () => ({ hydrateFromServer: jest.fn() }))
jest.mock('../../lib/db/connection', () => ({ setSharedDatabase: jest.fn() }))
jest.mock('../../features/workout-session/stores/runningWorkoutStore', () => ({
  remapRunningWorkoutId: jest.fn(),
}))

const { Provider } = require('../../app/Provider')
const { useSettingsStore } = require('../../features/settings')
const { useUiStore } = require('../../stores/uiStore')
const { databaseNameForProfile } = require('../../lib/profileScope')
const { useAuthStore } = require('../../stores/authStore')
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

test('routine ID remaps update list and active caches without changing running workouts', async () => {
  const { syncEngine } = require('../../lib/sync')
  const { queryClient } = require('../../lib/queryClient')
  const { queryKeys } = require('../../lib/queryKeys')
  const {
    remapRunningWorkoutId,
  } = require('../../features/workout-session/stores/runningWorkoutStore')
  let view
  await act(async () => {
    view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
  })
  queryClient.setQueriesData.mockClear()
  const listener = syncEngine.onIdRemap.mock.calls.at(-1)[0]
  listener('routines', 'local-routine', 'server-routine')
  expect(queryClient.setQueriesData).toHaveBeenCalledTimes(1)
  const [filter, rewrite] = queryClient.setQueriesData.mock.calls[0]
  expect(filter).toEqual({ queryKey: queryKeys.forOwner('local:device').routines.all })
  expect(rewrite([{ id: 'local-routine', pattern: [] }])).toEqual([
    { id: 'server-routine', pattern: [] },
  ])
  expect(rewrite({ id: 'local-routine' })).toEqual({ id: 'server-routine' })
  expect(remapRunningWorkoutId).not.toHaveBeenCalled()
  await act(async () => view.unmount())
})

test('keeps sync uploads disabled while an authenticated session has no loaded profile', async () => {
  const { syncEngine } = require('../../lib/sync')
  const state = useAuthStore.__state
  Object.assign(state, {
    isStartupReady: true,
    startupError: null,
    isAuthenticated: true,
    user: null,
    profileOwnerId: 'local:device',
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'unknown',
  })
  syncEngine.setUploadsEnabled.mockClear()

  let view
  await act(async () => {
    view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
  })

  expect(syncEngine.setUploadsEnabled).toHaveBeenCalled()
  expect(syncEngine.setUploadsEnabled.mock.calls.every(([enabled]) => !enabled)).toBe(true)

  await act(async () => view.unmount())
  Object.assign(state, {
    isStartupReady: true,
    startupError: null,
    isAuthenticated: false,
    user: null,
    profileOwnerId: 'local:device',
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'unknown',
  })
})

test('renders and dismisses the congrats portal under the current SQLite context', async () => {
  const authState = useAuthStore.__state
  Object.assign(authState, {
    isStartupReady: true,
    startupError: null,
    isAuthenticated: false,
    user: null,
    profileOwnerId: 'local:device',
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'unknown',
  })
  useUiStore.getState().reset()

  let view
  await act(async () => {
    view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
  })
  expect(view.root.findAllByType('FinishedWorkoutCongrats')).toHaveLength(0)

  await act(async () => {
    useUiStore
      .getState()
      .showFinishedCongrats(
        { workoutTitle: 'Offline workout' },
        { status: 'WEEKLY_PROGRESS', currentStreak: 0 }
      )
  })
  expect(view.root.findByType('FinishedWorkoutCongrats').props).toMatchObject({
    database: databaseNameForProfile('local:device'),
    visible: true,
    workoutTitle: 'Offline workout',
  })

  await act(async () => useUiStore.getState().hideFinishedCongrats())
  expect(view.root.findAllByType('FinishedWorkoutCongrats')).toHaveLength(0)
  await act(async () => view.unmount())
})

test('logout hides the old congrats before switching to the local owner database', async () => {
  const authState = useAuthStore.__state
  Object.assign(authState, {
    isStartupReady: true,
    startupError: null,
    isAuthenticated: false,
    user: null,
    profileOwnerId: 'user:previous',
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'unknown',
  })
  useUiStore.getState().reset()

  let view
  await act(async () => {
    view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
  })
  await act(async () => {
    useUiStore
      .getState()
      .showFinishedCongrats(
        { workoutTitle: 'Previous owner workout' },
        { status: 'WEEKLY_PROGRESS', currentStreak: 0 }
      )
  })
  expect(view.root.findByType('FinishedWorkoutCongrats').props.database).toBe(
    databaseNameForProfile('user:previous')
  )

  await act(async () => {
    useAuthStore.setState({ isProfileTransitioning: true })
  })
  expect(view.root.findAllByType('FinishedWorkoutCongrats')).toHaveLength(0)

  await act(async () => {
    // Logout switches to the local database before resetAllStores clears transient UI.
    useAuthStore.setState({ profileOwnerId: 'local:device' })
  })
  expect(view.root.findAllByType('FinishedWorkoutCongrats')).toHaveLength(0)
  await act(async () => useUiStore.getState().reset())
  await act(async () => {
    useAuthStore.setState({ isProfileTransitioning: false })
  })
  expect(view.root.findAllByType('FinishedWorkoutCongrats')).toHaveLength(0)

  await act(async () => {
    useUiStore
      .getState()
      .showFinishedCongrats(
        { workoutTitle: 'Current owner workout' },
        { status: 'WEEKLY_PROGRESS', currentStreak: 0 }
      )
  })
  expect(view.root.findByType('FinishedWorkoutCongrats').props.database).toBe(
    databaseNameForProfile('local:device')
  )
  await act(async () => view.unmount())
  authState.profileOwnerId = 'local:device'
  authState.isProfileTransitioning = false
  useUiStore.getState().reset()
})

test('keeps fallback children mounted before owner SQLite initialization', async () => {
  const authState = useAuthStore.__state
  authState.isStartupReady = false
  authState.startupError = null
  useUiStore.getState().reset()

  let view
  await act(async () => {
    view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
  })
  expect(view.root.findByType('Probe')).toBeTruthy()
  expect(view.root.findAllByType('FinishedWorkoutCongrats')).toHaveLength(0)
  await act(async () => view.unmount())
  authState.isStartupReady = true
})
