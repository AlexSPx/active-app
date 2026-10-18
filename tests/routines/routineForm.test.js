jest.mock('react-native', () => {
  const React = require('react')
  const primitive = (name) =>
    function Primitive({ children, ...props }) {
      return React.createElement(name, props, children)
    }
  return {
    Alert: { alert: jest.fn() },
    KeyboardAvoidingView: primitive('KeyboardAvoidingView'),
    Keyboard: { dismiss: jest.fn() },
    Platform: { OS: 'android' },
    ScrollView: primitive('ScrollView'),
    Switch: primitive('Switch'),
    View: primitive('View'),
  }
})
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useNavigation: () => global.__routineNavigation,
}))
jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (...args) => global.__routinePreventRemove.push(args),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker')
jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  return {
    Button: ({ children, ...props }) =>
      React.createElement(
        'Button',
        props,
        typeof children === 'string' ? React.createElement('Text', null, children) : children
      ),
    SegmentedSelection: (props) => React.createElement('SegmentedSelection', props),
    TextField: (props) => React.createElement('Input', props),
    UiText: ({ children, ...props }) => React.createElement('Text', props, children),
  }
})
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({
    accent: '#624572',
    onAccent: '#faf5fc',
    divider: '#dcd0e4',
    background: '#faf7fc',
    foreground: '#2d2235',
  }),
}))
jest.mock('../../components/ui/CadenceOverlay', () => ({
  CadenceOverlay: ({ children, ...props }) =>
    require('react').createElement('CadenceOverlay', props, props.open ? children : null),
}))
jest.mock('../../components/ui/icons', () => {
  const Icon = () => null
  return { Check: Icon, Plus: Icon }
})
jest.mock('../../navigation/BackHeaderButton', () => ({ BackHeaderButton: () => null }))
jest.mock('../../features/workouts', () => ({
  useWorkouts: () => ({ workouts: [{ id: 'upper' }], loading: false }),
}))
jest.mock('../../features/routines/components/RoutinePatternEditor', () => ({
  RoutinePatternEditor: (props) => {
    const React = require('react')
    const { useState } = React
    const { Button } = require('../../components/ui/Controls')
    const { router } = require('expo-router')
    const [open, setOpen] = useState(false)
    return React.createElement(
      'PatternEditor',
      props,
      React.createElement(Button, { onPress: () => setOpen(true) }, 'Open picker'),
      open
        ? React.createElement(
            'Picker',
            null,
            React.createElement(
              Button,
              {
                onPress: () => {
                  setOpen(false)
                  router.push('/workouts/new?returnTo=routine')
                },
              },
              'Create workout'
            )
          )
        : null
    )
  },
}))
jest.mock('../../lib/sync', () => ({ syncEngine: { resolveId: (_table, id) => id } }))

global.__routinePreventRemove = []
global.__routineNavigation = { setOptions: jest.fn(), dispatch: jest.fn() }

const React = require('react')
const { act, create } = require('react-test-renderer')
const { Alert } = require('react-native')
const { router } = require('expo-router')
const { RoutineForm } = require('../../features/routines/components/RoutineForm')

const initialValues = {
  name: 'Strength',
  description: '',
  routineType: 'SEQUENTIAL',
  pattern: [{ dayIndex: 1, dayType: 'WORKOUT', workoutId: 'upper' }],
  active: false,
  startDate: new Date('2026-10-01T00:00:00.000Z'),
}

function renderForm(overrides = {}) {
  const props = {
    initialValues,
    loading: false,
    error: null,
    onClearError: jest.fn(),
    onSave: jest.fn().mockResolvedValue(false),
    ...overrides,
  }
  let renderer
  act(() => {
    renderer = create(React.createElement(RoutineForm, props))
  })
  return { renderer, props }
}

function button(renderer, label) {
  return renderer.root
    .findAllByType('Button')
    .find((item) => item.findAllByType('Text').some((text) => text.children.join('') === label))
}

beforeEach(() => {
  jest.clearAllMocks()
  global.__routinePreventRemove.length = 0
  global.__routineNavigation = { setOptions: jest.fn(), dispatch: jest.fn() }
})

test('failed save keeps entered routine data and allows a retry', async () => {
  const onSave = jest.fn().mockResolvedValue(false)
  const onClearError = jest.fn()
  const { renderer, props } = renderForm({ onSave, onClearError })
  const name = renderer.root.findAllByType('Input')[0]

  act(() => name.props.onChangeText('Strength and mobility'))
  expect(onClearError).toHaveBeenCalled()
  expect(renderer.root.findAllByType('Input')[0].props.value).toBe('Strength and mobility')

  await act(async () => button(renderer, 'Save routine').props.onPress())
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave.mock.calls[0][0].name).toBe('Strength and mobility')
  expect(renderer.root.findAllByType('Input')[0].props.value).toBe('Strength and mobility')

  props.error = 'Save failed. Please try again.'
  act(() => renderer.update(React.createElement(RoutineForm, props)))
  expect(
    renderer.root.findAllByType('Text').some((node) => node.children.join('') === props.error)
  ).toBe(true)
  await act(async () => button(renderer, 'Save routine').props.onPress())

  expect(onClearError).toHaveBeenCalledTimes(3)
  expect(onSave).toHaveBeenCalledTimes(2)
  expect(onSave.mock.calls[1][0].name).toBe('Strength and mobility')
  expect(router.back).not.toHaveBeenCalled()
  act(() => renderer.unmount())
})

test('routine notes and start date stay visible while the routine is inactive', () => {
  const { renderer } = renderForm()

  expect(renderer.root.findAllByType('Input')).toHaveLength(2)
  expect(renderer.root.findAllByType('Text').map((node) => node.children.join(''))).toContain(
    'Notes'
  )
  expect(
    renderer.root
      .findAllByType('Button')
      .some((item) => item.props.accessibilityLabel?.startsWith('Start date,'))
  ).toBe(true)
  act(() => renderer.unmount())
})

test('explicit discard asks and dispatches only after confirmation', () => {
  const { renderer } = renderForm()

  act(() => renderer.root.findAllByType('Input')[0].props.onChangeText('Unsaved routine'))

  const [prevent, listener] = global.__routinePreventRemove.at(-1)
  expect(prevent).toBe(true)
  const action = { type: 'GO_BACK' }
  act(() => listener({ data: { action } }))
  expect(Alert.alert).toHaveBeenCalledWith(
    'Discard this routine?',
    expect.any(String),
    expect.any(Array)
  )
  const buttons = Alert.alert.mock.calls[0][2]
  buttons.find((item) => item.text === 'Discard routine').onPress()
  expect(global.__routineNavigation.dispatch).toHaveBeenCalledWith(action)
  act(() => renderer.unmount())
})

test('fixing the pattern clears a stale save error as the pattern becomes valid', () => {
  const onClearError = jest.fn()
  const { renderer } = renderForm({
    error: 'Old save error',
    onClearError,
    initialValues: {
      ...initialValues,
      pattern: [{ dayIndex: 1, dayType: 'WORKOUT', workoutId: null }],
    },
  })
  const editor = renderer.root.findByType('PatternEditor')

  act(() => editor.props.onChange([{ dayIndex: 1, dayType: 'WORKOUT', workoutId: 'upper' }]))

  expect(onClearError).toHaveBeenCalledTimes(1)
  expect(button(renderer, 'Save routine').props.disabled).toBe(false)
  act(() => renderer.unmount())
})

test('create-workout detour leaves the routine form draft mounted and intact', () => {
  const { renderer } = renderForm()
  act(() => renderer.root.findAllByType('Input')[0].props.onChangeText('Draft to keep'))
  act(() => button(renderer, 'Open picker').props.onPress())
  act(() => button(renderer, 'Create workout').props.onPress())

  expect(router.push).toHaveBeenCalledWith('/workouts/new?returnTo=routine')
  expect(renderer.root.findAllByType('Input')[0].props.value).toBe('Draft to keep')
  act(() => renderer.unmount())
})
