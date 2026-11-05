const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('react-native', () => ({ useColorScheme: jest.fn(() => 'light') }))
jest.mock('uniwind', () => ({ Uniwind: { setTheme: jest.fn() } }))
jest.mock('../../features/settings', () => ({
  useSettingsStore: require('zustand').create((set) => ({
    theme: 'light',
    setTheme: (theme) => set({ theme }),
  })),
}))
jest.mock('../../components/feedback/FeedbackProvider', () => ({
  FeedbackProvider: ({ children }) => children,
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
}))
jest.mock('expo-router/react-navigation', () => {
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

const { AppThemeProvider } = require('../../providers/AppThemeProvider')
const { useSettingsStore } = require('../../features/settings')
const { NavigationContext } = require('expo-router/react-navigation')
const { useColorScheme } = require('react-native')
const { Uniwind } = require('uniwind')

function ThemeProbe() {
  return React.createElement('Probe', {
    navigationDark: React.useContext(NavigationContext).dark,
  })
}

test('saved and system appearance update navigation and Uniwind themes', async () => {
  const priorDocument = global.document
  const themeColorMeta = { setAttribute: jest.fn() }
  global.document = {
    documentElement: { style: {} },
    body: { style: {} },
    querySelector: jest.fn(() => themeColorMeta),
  }
  useSettingsStore.getState().setTheme('light')
  useColorScheme.mockReturnValue('light')
  Uniwind.setTheme.mockClear()
  let view
  await act(async () => {
    view = create(React.createElement(AppThemeProvider, {}, React.createElement(ThemeProbe)))
  })
  const probe = () => view.root.findByType('Probe').props
  expect(probe()).toMatchObject({ navigationDark: false })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('light')
  expect(global.document.body.style).toMatchObject({
    backgroundColor: '#FAF7FC',
    color: '#2D2235',
  })
  expect(themeColorMeta.setAttribute).toHaveBeenLastCalledWith('content', '#FAF7FC')

  await act(async () => useSettingsStore.getState().setTheme('dark'))
  expect(probe()).toMatchObject({ navigationDark: true })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('dark')
  expect(global.document.body.style).toMatchObject({
    backgroundColor: '#2D2235',
    color: '#FAF5FC',
  })

  await act(async () => useSettingsStore.getState().setTheme('system'))
  expect(probe()).toMatchObject({ navigationDark: false })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('system')
  expect(global.document.body.style.backgroundColor).toBe('#FAF7FC')

  useColorScheme.mockReturnValue('dark')
  await act(async () => useSettingsStore.getState().setTheme('light'))
  expect(probe()).toMatchObject({ navigationDark: false })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('light')
  await act(async () => useSettingsStore.getState().setTheme('system'))
  expect(probe()).toMatchObject({ navigationDark: true })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('system')
  expect(global.document.body.style.backgroundColor).toBe('#2D2235')

  await act(async () => view.unmount())
  global.document = priorDocument
})
