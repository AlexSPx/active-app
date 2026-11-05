jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  const primitive = (name) =>
    function Primitive({ children, ...props }) {
      return React.createElement(name, props, children)
    }
  return {
    Button: ({ children, ...props }) =>
      React.createElement(
        'Button',
        props,
        typeof children === 'string' ? React.createElement('Text', null, children) : children
      ),
    TextField: primitive('Input'),
    UiText: primitive('Text'),
  }
})
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({ accent: '#624572', onAccent: '#faf5fc', muted: '#76627e' }),
}))
jest.mock('react-native', () => {
  const React = require('react')
  const primitive = (name) =>
    function Primitive({ children, ...props }) {
      return React.createElement(name, props, children)
    }
  return {
    KeyboardAvoidingView: primitive('KeyboardAvoidingView'),
    Platform: { OS: 'android' },
    Keyboard: { dismiss: jest.fn() },
    Modal: primitive('Modal'),
    ScrollView: primitive('ScrollView'),
    View: primitive('View'),
  }
})
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24 }),
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../../components/ui/icons', () => {
  const Icon = () => null
  return { Check: Icon, ChevronLeft: Icon, Plus: Icon, Search: Icon }
})
jest.mock('../../lib/sync', () => ({
  syncEngine: { resolveId: jest.fn((_table, id) => id) },
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { Keyboard } = require('react-native')
const { router } = require('expo-router')
const { syncEngine } = require('../../lib/sync')
const { RoutineEditorSheet } = require('../../features/routines/components/RoutineEditorSheet')

const workouts = [
  {
    id: 'upper',
    title: 'Upper body',
    workoutTemplate: {
      exercises: [{ exerciseTitle: 'Bench press', category: 'STRENGTH', reps: [8, 8, 8] }],
    },
  },
  {
    id: 'lower',
    title: 'Lower body',
    workoutTemplate: {
      exercises: [{ exerciseTitle: 'Squat', category: 'STRENGTH', reps: [8, 8, 8] }],
    },
  },
]

const renderers = []
const baseProps = {
  open: true,
  onOpenChange: jest.fn(),
  workouts,
  selected: [],
  single: false,
  context: 'Day 1',
  onApply: jest.fn(),
}

function renderPicker(overrides = {}) {
  const props = { ...baseProps, ...overrides }
  let renderer
  act(() => {
    renderer = create(React.createElement(RoutineEditorSheet, props))
  })
  renderers.push(renderer)
  return {
    renderer,
    setOpen(open) {
      props.open = open
      act(() => renderer.update(React.createElement(RoutineEditorSheet, props)))
    },
  }
}

function button(renderer, label) {
  return renderer.root.findAllByType('Button').find((item) => {
    if (item.props.children === label) return true
    return item.findAllByType('Text').some((text) => text.children.join('') === label)
  })
}

function workoutRow(renderer, title) {
  return renderer.root
    .findAllByType('Button')
    .find((item) => item.props.accessibilityLabel === title)
}

function visibleText(renderer) {
  return renderer.root.findAllByType('Text').map((text) => text.children.join(''))
}

beforeEach(() => {
  jest.clearAllMocks()
  syncEngine.resolveId.mockImplementation((_table, id) => id)
})

afterEach(() => {
  act(() => renderers.splice(0).forEach((renderer) => renderer.unmount()))
})

test('empty full-screen picker offers a create-workout action', () => {
  const { renderer } = renderPicker({ workouts: [] })

  expect(renderer.root.findByType('Modal').props.presentationStyle).toBe('fullScreen')
  expect(visibleText(renderer)).toContain('No saved workouts yet')
  expect(visibleText(renderer)).toContain('Create a workout to add a session to this routine.')
  expect(button(renderer, 'Create workout')).toBeDefined()
  expect(button(renderer, 'Done')).toBeUndefined()
})

test('creating a workout closes the picker before routing to the workout editor', () => {
  const { renderer, setOpen } = renderPicker({ workouts: [] })

  act(() => button(renderer, 'Create workout').props.onPress())

  expect(Keyboard.dismiss).toHaveBeenCalledTimes(1)
  expect(baseProps.onOpenChange).toHaveBeenCalledWith(false)
  expect(router.push).toHaveBeenCalledWith('/workouts/new?returnTo=routine')
  setOpen(false)
  expect(renderer.root.findByType('Modal').props.visible).toBe(false)
})

test('cancel and reopen clears search and pending selection while retaining applied choices', () => {
  const onApply = jest.fn()
  const onOpenChange = jest.fn()
  const { renderer, setOpen } = renderPicker({ selected: ['upper'], onApply, onOpenChange })

  act(() => renderer.root.findByType('Input').props.onChangeText('Lower'))
  expect(visibleText(renderer)).toContain('Lower body')
  expect(visibleText(renderer)).not.toContain('Upper body')
  act(() => workoutRow(renderer, 'Lower body').props.onPress())
  act(() => button(renderer, 'Cancel').props.onPress())
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(onApply).not.toHaveBeenCalled()

  setOpen(false)
  setOpen(true)

  expect(renderer.root.findByType('Input').props.value).toBe('')
  expect(visibleText(renderer)).toContain('Upper body')
  expect(visibleText(renderer)).toContain('Lower body')
  expect(workoutRow(renderer, 'Upper body').props.accessibilityState.checked).toBe(true)
  expect(workoutRow(renderer, 'Lower body').props.accessibilityState.checked).toBe(false)

  act(() => button(renderer, 'Done · 1 selected').props.onPress())
  expect(onApply).toHaveBeenCalledTimes(1)
  expect(onApply).toHaveBeenCalledWith(['upper'])
})

test('no-match state lets users clear their search', () => {
  const { renderer } = renderPicker()

  act(() => renderer.root.findByType('Input').props.onChangeText('deload'))

  expect(visibleText(renderer)).toContain('No matching workouts.')
  expect(button(renderer, 'Clear search')).toBeDefined()
  act(() => button(renderer, 'Clear search').props.onPress())
  expect(renderer.root.findByType('Input').props.value).toBe('')
  expect(visibleText(renderer)).toContain('Upper body')
})

test('Done applies resolved selected workout ids exactly once', () => {
  const onApply = jest.fn()
  const onOpenChange = jest.fn()
  syncEngine.resolveId.mockImplementation((_table, id) => (id === 'local-upper' ? 'upper' : id))
  const { renderer } = renderPicker({ selected: ['local-upper'], onApply, onOpenChange })

  act(() => workoutRow(renderer, 'Lower body').props.onPress())
  act(() => button(renderer, 'Done · 2 selected').props.onPress())

  expect(onApply).toHaveBeenCalledTimes(1)
  expect(onApply).toHaveBeenCalledWith(['upper', 'lower'])
  expect(syncEngine.resolveId).toHaveBeenCalledWith('workouts', 'local-upper')
  expect(onOpenChange).toHaveBeenCalledTimes(1)
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('single-workout picker disables Done until a workout is selected', () => {
  const { renderer } = renderPicker({ single: true })

  expect(button(renderer, 'Done').props.disabled).toBe(true)
  act(() => workoutRow(renderer, 'Upper body').props.onPress())
  expect(button(renderer, 'Done').props.disabled).toBe(false)
})
