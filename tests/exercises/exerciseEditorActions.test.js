jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  return {
    Button: ({ children, ...props }) =>
      React.createElement(
        'Button',
        props,
        typeof children === 'string' ? React.createElement('Text', null, children) : children
      ),
    UiText: ({ children, ...props }) => React.createElement('Text', props, children),
  }
})
jest.mock('../../components/ui/CadenceOverlay', () => ({
  CadenceOverlay: ({ open, title, children }) => {
    const React = require('react')
    return open
      ? React.createElement(
          'Overlay',
          { title },
          React.createElement('Text', null, title),
          children
        )
      : null
  },
}))
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({ foreground: '#2d2235', muted: '#76627e', accent: '#624572' }),
}))
jest.mock('react-native', () => {
  const React = require('react')
  const primitive = (name) =>
    function Primitive({ children, ...props }) {
      return React.createElement(name, props, children)
    }
  return {
    Keyboard: { dismiss: jest.fn() },
    Pressable: primitive('Pressable'),
    View: primitive('View'),
  }
})
jest.mock('../../components/ui/icons', () => {
  const Icon = () => null
  return { ArrowDown: Icon, ArrowUp: Icon, MoreHorizontal: Icon, Trash2: Icon }
})
jest.mock('../../components/ui/SwipeToDeleteRow', () => ({
  SwipeToDeleteRow: ({ children }) => children,
}))
jest.mock('../../components/ui/WorkoutSetFields', () => ({
  DurationTargetInput: () => null,
  StrengthTargetInput: () => null,
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const ExerciseEditor = require('../../features/exercises/components/ExerciseEditor').default

const exercise = {
  id: 'bench',
  name: 'Barbell bench press',
  category: 'STRENGTH',
  primaryMuscles: ['chest'],
  sets: [{ weight: 60, reps: 8 }],
}

function renderEditor(overrides = {}) {
  const props = {
    exercise,
    index: 0,
    onUpdateSets: jest.fn(),
    onAddSet: jest.fn(),
    onRemoveSet: jest.fn(),
    onMove: jest.fn(),
    canMoveUp: false,
    canMoveDown: true,
    onRemove: jest.fn(),
    ...overrides,
  }
  let renderer
  act(() => {
    renderer = create(React.createElement(ExerciseEditor, props))
  })
  return { renderer, props }
}

function button(renderer, label) {
  return renderer.root
    .findAllByType('Button')
    .find((item) => item.props.accessibilityLabel === label)
}

test('exercise actions stay behind one menu and expose accessible move and remove controls', () => {
  const { renderer, props } = renderEditor()

  act(() => button(renderer, 'Actions for Barbell bench press').props.onPress())

  expect(renderer.root.findByType('Overlay').props.title).toBe('Barbell bench press actions')
  expect(button(renderer, 'Move Barbell bench press earlier').props.disabled).toBe(true)
  expect(button(renderer, 'Move Barbell bench press later')).toBeDefined()
  act(() => button(renderer, 'Move Barbell bench press later').props.onPress())
  expect(props.onMove).toHaveBeenCalledWith(1)
  expect(renderer.root.findAllByType('Overlay')).toHaveLength(0)

  act(() => button(renderer, 'Actions for Barbell bench press').props.onPress())
  act(() => button(renderer, 'Remove Barbell bench press from workout').props.onPress())
  expect(props.onRemove).toHaveBeenCalledTimes(1)
  act(() => renderer.unmount())
})
