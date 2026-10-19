const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('expo-notifications', () => ({}))
jest.mock('expo-linking', () => ({}))
jest.mock('expo-application', () => ({}))
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }))
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
  NativeModules: {},
  Platform: { OS: 'android' },
  View: 'View',
}))
jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  return {
    Button: (props) => React.createElement('Button', props, props.children),
    UiText: (props) => React.createElement('UiText', props, props.children),
  }
})
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({ accent: '#624572' }),
}))
jest.mock('../../components/ui/icons', () => {
  const React = require('react')
  return {
    Bell: (props) => React.createElement('Bell', props),
    Clock3: (props) => React.createElement('Clock3', props),
  }
})

const NotificationPermissions = require('../../components/NotificationPermissions').default

test('onboarding permission icons receive a resolved Cadence accent color', async () => {
  let renderer
  await act(async () => {
    renderer = create(React.createElement(NotificationPermissions, { onboarding: true }))
  })

  expect(renderer.root.findByType('Bell').props.color).toBe('#624572')
  expect(renderer.root.findByType('Clock3').props.color).toBe('#624572')

  await act(async () => renderer.unmount())
})
