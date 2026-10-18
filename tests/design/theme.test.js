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
jest.mock('../../tamagui.config', () => ({ config: {} }))
jest.mock('../../components/feedback/FeedbackProvider', () => ({
  FeedbackProvider: ({ children }) => children,
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
}))
jest.mock('tamagui', () => {
  const React = require('react')
  const ThemeContext = React.createContext('light')
  return {
    ThemeContext,
    TamaguiProvider: ({ defaultTheme, children }) =>
      React.createElement(ThemeContext.Provider, { value: defaultTheme }, children),
    Theme: ({ children }) => children,
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

const { AppThemeProvider } = require('../../providers/AppThemeProvider')
const { useSettingsStore } = require('../../features/settings')
const { ThemeContext } = require('tamagui')
const { NavigationContext } = require('@react-navigation/native')
const { useColorScheme } = require('react-native')
const { Uniwind } = require('uniwind')

function ThemeProbe() {
  return React.createElement('Probe', {
    appearance: React.useContext(ThemeContext),
    navigationDark: React.useContext(NavigationContext).dark,
  })
}

test('appearance changes update Tamagui, navigation, and Uniwind themes', async () => {
  useSettingsStore.getState().setTheme('light')
  useColorScheme.mockReturnValue('light')
  Uniwind.setTheme.mockClear()
  let view
  await act(async () => {
    view = create(React.createElement(AppThemeProvider, {}, React.createElement(ThemeProbe)))
  })
  const probe = () => view.root.findByType('Probe').props
  expect(probe()).toMatchObject({ appearance: 'light', navigationDark: false })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('light')

  await act(async () => useSettingsStore.getState().setTheme('dark'))
  expect(probe()).toMatchObject({ appearance: 'dark', navigationDark: true })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('dark')

  await act(async () => useSettingsStore.getState().setTheme('system'))
  expect(probe()).toMatchObject({ appearance: 'light', navigationDark: false })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('system')

  useColorScheme.mockReturnValue('dark')
  await act(async () => useSettingsStore.getState().setTheme('light'))
  expect(probe()).toMatchObject({ appearance: 'light', navigationDark: false })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('light')
  await act(async () => useSettingsStore.getState().setTheme('system'))
  expect(probe()).toMatchObject({ appearance: 'dark', navigationDark: true })
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('system')

  await act(async () => view.unmount())
})
