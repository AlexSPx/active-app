const React = require('react')
const { act, create } = require('react-test-renderer')
const mockSQLiteDatabase = { current: null }

jest.mock('react-native', () => {
  const listeners = new Set()
  const appState = { currentState: 'active' }
  appState.addEventListener = jest.fn((_event, listener) => {
    listeners.add(listener)
    return { remove: () => listeners.delete(listener) }
  })
  appState.emit = (nextState) => {
    appState.currentState = nextState
    listeners.forEach((listener) => listener(nextState))
  }
  return {
    AppState: appState,
    useColorScheme: jest.fn(() => 'light'),
    Platform: { OS: 'android' },
  }
})
jest.mock('../../config/launchPolicy', () => ({
  ...jest.requireActual('../../config/launchPolicy'),
  isNativeOfflineLaunch: () => false,
}))
jest.mock('@tamagui/core', () => ({ useEvent: (callback) => callback }))
jest.mock(
  'expo-network',
  () => {
    const listeners = new Set()
    return {
      getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
      addNetworkStateListener: jest.fn((listener) => {
        listeners.add(listener)
        return { remove: () => listeners.delete(listener) }
      }),
      __emit: (state) => listeners.forEach((listener) => listener(state)),
      __clear: () => listeners.clear(),
    }
  },
  { virtual: true }
)
jest.mock('../../stores/networkStore', () => {
  const React = require('react')
  const state = { manualOffline: false, isReady: true, restoreError: null }
  const listeners = new Set()
  const useNetworkStore = (select) =>
    React.useSyncExternalStore(
      (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      () => select(state),
      () => select(state)
    )
  useNetworkStore.getState = () => state
  useNetworkStore.setState = (updates) => {
    Object.assign(state, updates)
    listeners.forEach((listener) => listener())
  }
  return {
    useNetworkStore,
    networkPolicy: {
      ready: async () => {},
      get generation() {
        return 0
      },
      isOffline: () => state.manualOffline,
      assertOnline: () => {},
      subscribe: () => () => {},
    },
  }
})
jest.mock('../../services/apiService', () => ({
  apiService: { probeAvailability: jest.fn(async () => {}) },
}))
jest.mock('../../features/settings', () => ({
  useSettingsStore: require('zustand').create((set) => ({
    theme: 'light',
    setTheme: (theme) => set({ theme }),
  })),
}))
jest.mock('../../features/settings/stores/settingsStore', () => ({
  useSettingsStore: require('../../features/settings').useSettingsStore,
  saveSettingsProfile: jest.fn(async () => {}),
}))
jest.mock('../../lib/legacyTrainingProfile', () => ({
  readLegacyTrainingProfile: jest.fn(async () => null),
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
        React.createElement(
          SQLiteContext.Provider,
          { value: mockSQLiteDatabase.current || databaseName },
          children
        ),
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
    isProfileLoading: false,
    fetchUser: jest.fn(),
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
  useAuthStore.subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  useAuthStore.setState = (updates) => {
    const previous = { ...state }
    Object.assign(state, updates)
    const next = { ...state }
    listeners.forEach((listener) => listener(next, previous))
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
jest.mock('../../lib/queryClient', () => ({
  queryClient: { setQueriesData: jest.fn(), invalidateQueries: jest.fn() },
}))
jest.mock('../../lib/sync', () => {
  const syncCompleteListeners = new Set()
  return {
    syncEngine: {
      onIdRemap: jest.fn(() => () => {}),
      on: jest.fn((event, listener) => {
        if (event !== 'sync:complete') return () => {}
        syncCompleteListeners.add(listener)
        return () => syncCompleteListeners.delete(listener)
      }),
      notifySyncComplete: () => syncCompleteListeners.forEach((listener) => listener()),
      init: async () => {},
      destroy: () => {},
      setConnectivityManaged: jest.fn(),
      setUploadsEnabled: jest.fn(),
      processQueue: jest.fn(async () => {}),
    },
  }
})
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
const {
  databaseNameForProfile,
  LOCAL_PROFILE_OWNER,
  profileOwnerForUser,
  setActiveProfileOwner,
} = require('../../lib/profileScope')
const { useAuthStore } = require('../../stores/authStore')
const { syncEngine } = require('../../lib/sync')
const { hydrateFromServer } = require('../../lib/sync/hydrate')
const { apiService } = require('../../services/apiService')
const { queryClient } = require('../../lib/queryClient')
const { AppState } = require('react-native')
const expoNetwork = require('expo-network')
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
  syncEngine.processQueue.mockClear()

  let view
  await act(async () => {
    view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
  })

  expect(syncEngine.setUploadsEnabled).toHaveBeenCalled()
  expect(syncEngine.setUploadsEnabled.mock.calls.every(([enabled]) => !enabled)).toBe(true)
  expect(syncEngine.processQueue).not.toHaveBeenCalled()

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

test('revalidates a cached session and hydrates after the retry drains queued work', async () => {
  const authState = useAuthStore.__state
  const ownerId = profileOwnerForUser('user_1')
  setActiveProfileOwner(ownerId)
  const queueOrder = []
  let hasQueuedMutation = true
  let queueReadCount = 0
  let markDelayedQueueReadStarted
  const delayedQueueReadStarted = new Promise((resolve) => {
    markDelayedQueueReadStarted = resolve
  })
  let resolveDelayedQueueRead
  const delayedQueueRead = new Promise((resolve) => {
    resolveDelayedQueueRead = resolve
  })
  const db = {
    getFirstAsync: jest.fn(async () => {
      queueOrder.push('pending-check')
      queueReadCount += 1
      if (queueReadCount === 3) {
        markDelayedQueueReadStarted()
        return delayedQueueRead
      }
      return hasQueuedMutation ? { id: 'offline-save' } : null
    }),
  }
  mockSQLiteDatabase.current = db
  mockSQLiteDatabase.current.getFirstAsync.mockClear()
  syncEngine.setUploadsEnabled.mockClear()
  syncEngine.processQueue.mockReset().mockImplementation(async () => queueOrder.push('drain'))
  hydrateFromServer.mockReset().mockResolvedValueOnce(false).mockResolvedValue(true)
  queryClient.invalidateQueries.mockClear()
  let backendAvailable = false
  useAuthStore.setState({
    isStartupReady: true,
    startupError: null,
    isAuthenticated: true,
    user: { id: 'user_1' },
    isProfileLoading: false,
    profileOwnerId: ownerId,
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'unknown',
    fetchUser: jest.fn(async () => {
      useAuthStore.setState({ isProfileLoading: true })
      try {
        if (!backendAvailable) throw new Error('API unavailable')
        useAuthStore.setState({ serverSession: 'valid' })
      } finally {
        useAuthStore.setState({ isProfileLoading: false })
      }
    }),
  })

  jest.useFakeTimers()
  let view
  try {
    await act(async () => {
      view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
      await Promise.resolve()
    })
    const fetchUser = authState.fetchUser

    await act(async () => jest.advanceTimersByTimeAsync(0))
    expect(fetchUser).toHaveBeenCalledTimes(1)
    expect(authState.serverSession).toBe('unknown')
    expect(authState).toMatchObject({ isAuthenticated: true, user: { id: 'user_1' } })
    expect(syncEngine.setUploadsEnabled).not.toHaveBeenCalledWith(true)

    await act(async () => jest.advanceTimersByTimeAsync(999))
    expect(fetchUser).toHaveBeenCalledTimes(1)
    await act(async () => jest.advanceTimersByTimeAsync(1))
    expect(fetchUser).toHaveBeenCalledTimes(2)

    backendAvailable = true
    await act(async () => jest.advanceTimersByTimeAsync(1_999))
    expect(fetchUser).toHaveBeenCalledTimes(2)
    await act(async () => jest.advanceTimersByTimeAsync(1))
    expect(fetchUser).toHaveBeenCalledTimes(3)
    expect(authState.serverSession).toBe('valid')
    expect(syncEngine.setUploadsEnabled).toHaveBeenCalledWith(true)
    expect(syncEngine.processQueue).toHaveBeenCalledTimes(1)
    expect(db.getFirstAsync).toHaveBeenCalledWith('SELECT id FROM sync_queue LIMIT 1')
    expect(queueOrder).toEqual(['drain', 'pending-check'])
    expect(hydrateFromServer).not.toHaveBeenCalled()

    hasQueuedMutation = false
    await act(async () => {
      syncEngine.notifySyncComplete()
      await delayedQueueReadStarted
    })
    expect(hydrateFromServer).toHaveBeenCalledTimes(1)
    await act(async () => {
      // Completion arrives while the previous queue read can still report the stale queued row.
      syncEngine.notifySyncComplete()
      resolveDelayedQueueRead({ id: 'offline-save' })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(hydrateFromServer).toHaveBeenCalledTimes(2)
    expect(hydrateFromServer).toHaveBeenNthCalledWith(1, db)
    expect(hydrateFromServer).toHaveBeenNthCalledWith(2, db)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['profile', ownerId],
    })
  } finally {
    if (view) await act(async () => view.unmount())
    mockSQLiteDatabase.current = null
    setActiveProfileOwner(LOCAL_PROFILE_OWNER)
    syncEngine.processQueue.mockReset().mockResolvedValue(undefined)
    hydrateFromServer.mockReset()
    Object.assign(authState, {
      isStartupReady: true,
      startupError: null,
      isAuthenticated: false,
      user: null,
      isProfileLoading: false,
      fetchUser: jest.fn(),
      profileOwnerId: 'local:device',
      legacyOwnerId: null,
      isProfileTransitioning: false,
      serverSession: 'unknown',
    })
    jest.useRealTimers()
  }
})

test('does not revalidate invalid, guest, switching, or background sessions', async () => {
  const authState = useAuthStore.__state
  const ownerId = profileOwnerForUser('user_1')
  setActiveProfileOwner(ownerId)
  const fetchUser = jest.fn(async () => {})
  useAuthStore.setState({
    isStartupReady: true,
    startupError: null,
    isAuthenticated: true,
    user: { id: 'user_1' },
    isProfileLoading: false,
    profileOwnerId: ownerId,
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'invalid',
    fetchUser,
  })
  jest.useFakeTimers()
  let view
  try {
    await act(async () => {
      view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
      await Promise.resolve()
    })
    await act(async () => jest.advanceTimersByTimeAsync(60_000))
    expect(fetchUser).not.toHaveBeenCalled()

    await act(async () => {
      useAuthStore.setState({ serverSession: 'unknown', isProfileTransitioning: true })
      jest.advanceTimersByTime(60_000)
    })
    expect(fetchUser).not.toHaveBeenCalled()

    await act(async () => {
      useAuthStore.setState({
        isProfileTransitioning: false,
        isAuthenticated: false,
        user: null,
      })
      jest.advanceTimersByTime(60_000)
    })
    expect(fetchUser).not.toHaveBeenCalled()

    AppState.emit('background')
    await act(async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: { id: 'user_1' },
        serverSession: 'unknown',
      })
      jest.advanceTimersByTime(60_000)
    })
    expect(fetchUser).not.toHaveBeenCalled()

    await act(async () => {
      AppState.emit('active')
      await jest.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchUser).toHaveBeenCalledTimes(1)
  } finally {
    if (view) await act(async () => view.unmount())
    AppState.emit('active')
    setActiveProfileOwner(LOCAL_PROFILE_OWNER)
    Object.assign(authState, {
      isStartupReady: true,
      startupError: null,
      isAuthenticated: false,
      user: null,
      isProfileLoading: false,
      fetchUser: jest.fn(),
      profileOwnerId: 'local:device',
      legacyOwnerId: null,
      isProfileTransitioning: false,
      serverSession: 'unknown',
    })
    jest.useRealTimers()
  }
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

test('closes upload gate on disconnect and waits for resumed probe and auth before draining', async () => {
  const authState = useAuthStore.__state
  const ownerId = profileOwnerForUser('user_1')
  const events = []
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }
  const deferred = () => {
    let resolve
    const promise = new Promise((done) => (resolve = done))
    return { promise, resolve }
  }

  setActiveProfileOwner(ownerId)
  const db = { getFirstAsync: jest.fn(async () => null) }
  mockSQLiteDatabase.current = db
  expoNetwork.__clear()
  expoNetwork.getNetworkStateAsync.mockResolvedValueOnce({
    isConnected: null,
    isInternetReachable: null,
  })
  apiService.probeAvailability.mockReset().mockImplementation(async () => {
    events.push('probe:startup')
  })
  syncEngine.processQueue.mockReset().mockImplementation(async () => {
    events.push('drain')
  })
  syncEngine.setUploadsEnabled.mockClear()
  hydrateFromServer.mockReset().mockResolvedValueOnce(false).mockResolvedValue(true)
  queryClient.invalidateQueries.mockClear()

  let authGate = null
  const fetchUser = jest.fn(async () => {
    events.push('auth-refresh')
    if (authGate) await authGate.promise
    useAuthStore.setState({ serverSession: 'valid' })
  })
  useAuthStore.setState({
    isStartupReady: true,
    startupError: null,
    isAuthenticated: true,
    user: { id: 'user_1' },
    isProfileLoading: false,
    profileOwnerId: ownerId,
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'unknown',
    fetchUser,
  })

  jest.useFakeTimers()
  let view
  try {
    await act(async () => {
      view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
      await flush()
    })
    expect(events).toEqual(['probe:startup', 'auth-refresh', 'drain'])
    expect(syncEngine.setUploadsEnabled).toHaveBeenCalledWith(true)
    expect(hydrateFromServer).toHaveBeenCalledTimes(1)
    expect(db.getFirstAsync).toHaveBeenCalledTimes(2)
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()

    events.length = 0
    fetchUser.mockClear()
    syncEngine.processQueue.mockClear()
    syncEngine.setUploadsEnabled.mockClear()
    const dbChecksAfterHydrationFailure = db.getFirstAsync.mock.calls.length
    const reconnectProbe = deferred()
    const resumeProbe = deferred()
    apiService.probeAvailability
      .mockReset()
      .mockImplementationOnce(() => {
        events.push('probe:reconnect')
        return reconnectProbe.promise
      })
      .mockImplementationOnce(() => {
        events.push('probe:resume')
        return resumeProbe.promise
      })
    authGate = deferred()

    await act(async () => {
      expoNetwork.__emit({ isConnected: false, isInternetReachable: false })
    })
    expect(syncEngine.setUploadsEnabled).toHaveBeenLastCalledWith(false)

    await act(async () => {
      expoNetwork.__emit({ isConnected: true, isInternetReachable: true })
      await flush()
    })
    expect(apiService.probeAvailability).toHaveBeenCalledTimes(1)
    expect(fetchUser).not.toHaveBeenCalled()
    expect(syncEngine.processQueue).not.toHaveBeenCalled()

    await act(async () => {
      AppState.emit('background')
      AppState.emit('active')
      await jest.advanceTimersByTimeAsync(10_000)
      await flush()
    })
    expect(syncEngine.setUploadsEnabled).toHaveBeenLastCalledWith(false)
    expect(db.getFirstAsync).toHaveBeenCalledTimes(dbChecksAfterHydrationFailure)
    expect(hydrateFromServer).toHaveBeenCalledTimes(1)

    await act(async () => {
      reconnectProbe.resolve()
      await flush()
    })
    expect(apiService.probeAvailability).toHaveBeenCalledTimes(2)
    expect(fetchUser).not.toHaveBeenCalled()
    expect(syncEngine.processQueue).not.toHaveBeenCalled()
    expect(db.getFirstAsync).toHaveBeenCalledTimes(dbChecksAfterHydrationFailure)

    await act(async () => {
      resumeProbe.resolve()
      await flush()
    })
    expect(fetchUser).toHaveBeenCalledTimes(1)
    expect(syncEngine.processQueue).not.toHaveBeenCalled()
    expect(db.getFirstAsync).toHaveBeenCalledTimes(dbChecksAfterHydrationFailure)

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000)
      await flush()
    })
    expect(hydrateFromServer).toHaveBeenCalledTimes(1)
    expect(db.getFirstAsync).toHaveBeenCalledTimes(dbChecksAfterHydrationFailure)

    await act(async () => {
      authGate.resolve()
      await flush()
    })
    expect(syncEngine.setUploadsEnabled).toHaveBeenCalledWith(true)
    expect(syncEngine.processQueue).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['probe:reconnect', 'probe:resume', 'auth-refresh', 'drain'])
    expect(hydrateFromServer).toHaveBeenCalledTimes(2)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['profile', ownerId] })
  } finally {
    if (view) await act(async () => view.unmount())
    mockSQLiteDatabase.current = null
    expoNetwork.__clear()
    AppState.emit('active')
    setActiveProfileOwner(LOCAL_PROFILE_OWNER)
    syncEngine.processQueue.mockReset().mockResolvedValue(undefined)
    syncEngine.setUploadsEnabled.mockClear()
    apiService.probeAvailability.mockReset().mockResolvedValue(undefined)
    hydrateFromServer.mockReset()
    Object.assign(authState, {
      isStartupReady: true,
      startupError: null,
      isAuthenticated: false,
      user: null,
      isProfileLoading: false,
      fetchUser: jest.fn(),
      profileOwnerId: 'local:device',
      legacyOwnerId: null,
      isProfileTransitioning: false,
      serverSession: 'unknown',
    })
    jest.useRealTimers()
  }
})

test('starts API recovery when initial app state is unknown and no event reports foreground', async () => {
  const authState = useAuthStore.__state
  const ownerId = profileOwnerForUser('user_1')
  const events = []
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }

  setActiveProfileOwner(ownerId)
  mockSQLiteDatabase.current = { getFirstAsync: jest.fn(async () => null) }
  expoNetwork.__clear()
  apiService.probeAvailability.mockReset().mockImplementation(async () => {
    events.push('probe')
  })
  syncEngine.processQueue.mockReset().mockImplementation(async () => {
    events.push('drain')
  })
  hydrateFromServer.mockReset().mockImplementation(async () => {
    events.push('hydrate')
    return true
  })
  queryClient.invalidateQueries.mockClear()

  const fetchUser = jest.fn(async () => {
    events.push('auth-refresh')
    useAuthStore.setState({ serverSession: 'valid' })
  })
  useAuthStore.setState({
    isStartupReady: true,
    startupError: null,
    isAuthenticated: true,
    user: { id: 'user_1' },
    isProfileLoading: false,
    profileOwnerId: ownerId,
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'unknown',
    fetchUser,
  })

  AppState.currentState = null
  let view
  try {
    await act(async () => {
      view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
      // The native state becomes active, but no AppState event is emitted.
      AppState.currentState = 'active'
      await flush()
    })

    expect(events).toEqual(['probe', 'auth-refresh', 'drain', 'hydrate'])
    expect(fetchUser).toHaveBeenCalledTimes(1)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['profile', ownerId] })
  } finally {
    if (view) await act(async () => view.unmount())
    AppState.currentState = 'active'
    mockSQLiteDatabase.current = null
    expoNetwork.__clear()
    setActiveProfileOwner(LOCAL_PROFILE_OWNER)
    syncEngine.processQueue.mockReset().mockResolvedValue(undefined)
    apiService.probeAvailability.mockReset().mockResolvedValue(undefined)
    hydrateFromServer.mockReset()
    Object.assign(authState, {
      isStartupReady: true,
      startupError: null,
      isAuthenticated: false,
      user: null,
      isProfileLoading: false,
      fetchUser: jest.fn(),
      profileOwnerId: 'local:device',
      legacyOwnerId: null,
      isProfileTransitioning: false,
      serverSession: 'unknown',
    })
  }
})

test('does not start hydration when backgrounding closes the gate during the queue check', async () => {
  const authState = useAuthStore.__state
  const ownerId = profileOwnerForUser('user_1')
  let finishQueueCheck
  let markQueueCheckStarted
  const queueCheckStarted = new Promise((resolve) => {
    markQueueCheckStarted = resolve
  })
  const queueCheck = new Promise((resolve) => {
    finishQueueCheck = resolve
  })
  const db = {
    getFirstAsync: jest.fn(() => {
      markQueueCheckStarted()
      return queueCheck
    }),
  }
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }

  setActiveProfileOwner(ownerId)
  mockSQLiteDatabase.current = db
  AppState.currentState = 'active'
  expoNetwork.__clear()
  apiService.probeAvailability.mockReset().mockResolvedValue(undefined)
  syncEngine.processQueue.mockReset().mockResolvedValue(undefined)
  hydrateFromServer.mockReset().mockResolvedValue(true)
  queryClient.invalidateQueries.mockClear()

  const fetchUser = jest.fn(async () => {
    useAuthStore.setState({ serverSession: 'valid' })
  })
  useAuthStore.setState({
    isStartupReady: true,
    startupError: null,
    isAuthenticated: true,
    user: { id: 'user_1' },
    isProfileLoading: false,
    profileOwnerId: ownerId,
    legacyOwnerId: null,
    isProfileTransitioning: false,
    serverSession: 'unknown',
    fetchUser,
  })

  let view
  try {
    await act(async () => {
      view = create(React.createElement(Provider, {}, React.createElement(ThemeProbe)))
      await flush()
    })
    await queueCheckStarted
    expect(syncEngine.processQueue).toHaveBeenCalledTimes(1)
    expect(hydrateFromServer).not.toHaveBeenCalled()

    await act(async () => {
      AppState.emit('background')
      finishQueueCheck(null)
      await flush()
    })

    expect(hydrateFromServer).not.toHaveBeenCalled()
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
  } finally {
    if (view) await act(async () => view.unmount())
    AppState.currentState = 'active'
    mockSQLiteDatabase.current = null
    expoNetwork.__clear()
    setActiveProfileOwner(LOCAL_PROFILE_OWNER)
    syncEngine.processQueue.mockReset().mockResolvedValue(undefined)
    syncEngine.setUploadsEnabled.mockClear()
    apiService.probeAvailability.mockReset().mockResolvedValue(undefined)
    hydrateFromServer.mockReset()
    Object.assign(authState, {
      isStartupReady: true,
      startupError: null,
      isAuthenticated: false,
      user: null,
      isProfileLoading: false,
      fetchUser: jest.fn(),
      profileOwnerId: 'local:device',
      legacyOwnerId: null,
      isProfileTransitioning: false,
      serverSession: 'unknown',
    })
  }
})
