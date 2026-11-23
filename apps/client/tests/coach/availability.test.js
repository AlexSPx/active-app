jest.mock('expo-constants', () => ({ expoConfig: null }))
jest.mock('expo-router', () => {
  const React = require('react')
  return { Redirect: (props) => React.createElement('Redirect', props) }
})
jest.mock('../../features/coach/components/CoachScreen', () => {
  const React = require('react')
  return { CoachScreen: () => React.createElement('CoachScreen') }
})

const React = require('react')
const { act, create } = require('react-test-renderer')
const Constants = require('expo-constants')
const { isCoachAvailable } = require('../../features/coach/availability')
const CoachRoute = require('../../app/coach').default

afterEach(() => {
  Constants.expoConfig = null
  global.__DEV__ = true
})

function route() {
  let tree
  act(() => {
    tree = create(React.createElement(CoachRoute))
  })
  return tree
}

test('missing or unrecognized config disables the direct route without mounting coach', () => {
  for (const extra of [
    undefined,
    {},
    { coachAvailability: true },
    { coachAvailability: 'unknown' },
  ]) {
    Constants.expoConfig = extra ? { extra } : null
    expect(isCoachAvailable()).toBe(false)
    const tree = route()
    expect(tree.root.findByType('Redirect').props.href).toBe('/(tabs)')
    expect(tree.root.findAllByType('CoachScreen')).toHaveLength(0)
    act(() => tree.unmount())
  }
})

test('explicit development config opens the route only in a development runtime', () => {
  Constants.expoConfig = { extra: { coachAvailability: 'development' } }
  global.__DEV__ = true
  const enabled = route()
  expect(enabled.root.findAllByType('CoachScreen')).toHaveLength(1)
  act(() => enabled.unmount())
  global.__DEV__ = false
  const disabled = route()
  expect(disabled.root.findAllByType('CoachScreen')).toHaveLength(0)
  expect(disabled.root.findByType('Redirect').props.href).toBe('/(tabs)')
})

test('the promoted state is available in a production runtime', () => {
  Constants.expoConfig = { extra: { coachAvailability: 'promoted' } }
  global.__DEV__ = false
  expect(route().root.findAllByType('CoachScreen')).toHaveLength(1)
})
