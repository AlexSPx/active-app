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
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({ foreground: '#2d2235', muted: '#76627e', accent: '#624572' }),
}))
jest.mock('react-native', () => {
  const React = require('react')
  const primitive = (name) =>
    function Primitive({ children, ...props }) {
      return React.createElement(name, props, children)
    }
  return { View: primitive('View') }
})
jest.mock('../../components/ui/icons', () => {
  const Icon = () => null
  return {
    ArrowDown: Icon,
    ArrowUp: Icon,
    ChevronRight: Icon,
    Plus: Icon,
    Trash2: Icon,
  }
})
jest.mock('../../features/workouts', () => ({
  useWorkouts: () => ({ workouts: [], loading: false, error: null }),
}))
jest.mock('../../features/routines/components/RoutineEditorSheet', () => ({
  RoutineEditorSheet: () => null,
}))
jest.mock('../../lib/sync', () => ({ syncEngine: { resolveId: (_table, id) => id } }))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { RoutinePatternEditor } = require('../../features/routines/components/RoutinePatternEditor')

const pattern = [
  { dayIndex: 1, dayType: 'REST', workoutId: null },
  { dayIndex: 2, dayType: 'WORKOUT', workoutId: null },
]

function renderEditor(onChange = jest.fn()) {
  let view
  act(() => {
    view = create(React.createElement(RoutinePatternEditor, { pattern, onChange }))
  })
  return { view, onChange }
}

function button(view, label) {
  return view.root.findAllByType('Button').find((item) => item.props.accessibilityLabel === label)
}

test('the repeating cycle shows all day cards with accessible move actions', () => {
  const { view } = renderEditor()

  expect(
    view.root.findAllByType('Text').map((node) => [].concat(node.props.children).join(''))
  ).toContain('Day 1')
  expect(
    view.root.findAllByType('Text').map((node) => [].concat(node.props.children).join(''))
  ).toContain('Day 2')
  expect(button(view, 'Move day 1 earlier').props.disabled).toBe(true)
  expect(button(view, 'Move day 2 later').props.disabled).toBe(true)
  expect(button(view, 'Remove day 1')).toBeDefined()
  act(() => view.unmount())
})

test('move and remove actions update and reindex the cycle', () => {
  const { view, onChange } = renderEditor()

  act(() => button(view, 'Move day 2 earlier').props.onPress())
  expect(onChange).toHaveBeenLastCalledWith([
    { dayIndex: 1, dayType: 'WORKOUT', workoutId: null },
    { dayIndex: 2, dayType: 'REST', workoutId: null },
  ])
  act(() =>
    view.update(
      React.createElement(RoutinePatternEditor, {
        pattern: onChange.mock.calls.at(-1)[0],
        onChange,
      })
    )
  )

  act(() => button(view, 'Remove day 1').props.onPress())
  expect(onChange).toHaveBeenLastCalledWith([{ dayIndex: 1, dayType: 'REST', workoutId: null }])
  act(() => view.unmount())
})
