jest.mock('../../components/ui/CadenceOverlay', () => ({
  CadenceOverlay: ({ children, ...props }) =>
    require('react').createElement('CadenceOverlay', props, props.open ? children : null),
}))
const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('tamagui', () => ({
  YStack: (props) => require('react').createElement('YStack', props, props.children),
  XStack: (props) => require('react').createElement('XStack', props, props.children),
  Button: (props) => require('react').createElement('Button', props, props.children),
  Text: (props) => require('react').createElement('Text', props, props.children),
  ScrollView: (props) => require('react').createElement('ScrollView', props, props.children),
  getTokenValue: () => 20,
}))
jest.mock('../../components/ui/icons', () => ({
  MoreHorizontal: () => null,
  ChevronRight: () => null,
  ArrowUp: () => null,
  ArrowDown: () => null,
  Trash2: () => null,
  Plus: () => null,
}))
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Keyboard: { dismiss: jest.fn() },
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}))
jest.mock('../../features/workouts', () => ({
  useWorkouts: () => ({ workouts: [], loading: false, error: null }),
}))
jest.mock('../../features/routines/components/RoutineEditorSheet', () => ({
  RoutineEditorSheet: () => null,
}))
jest.mock('../../lib/sync', () => ({ syncEngine: { resolveId: (_table, id) => id } }))

const { Platform } = require('react-native')
const { RoutinePatternEditor } = require('../../features/routines/components/RoutinePatternEditor')

const pattern = [{ dayIndex: 1, dayType: 'REST', workoutId: null }]

function renderEditor() {
  let view
  act(() => {
    view = create(React.createElement(RoutinePatternEditor, { pattern, onChange: () => {} }))
  })
  return view
}

function openMenu(view) {
  act(() => {
    view.root
      .findAllByType('Button')
      .find((button) => button.props.accessibilityLabel === 'More actions for day 1')
      .props.onPress()
  })
}

test('day actions close without changing the routine', () => {
  const view = renderEditor()
  openMenu(view)
  const overlay = view.root.findByType('CadenceOverlay')
  expect(overlay.props.open).toBe(true)
  expect(
    view.root.findAllByType('Text').map((node) => [].concat(node.props.children).join(''))
  ).toContain('Day 1 actions')
  act(() => overlay.props.onOpenChange(false))
  expect(view.root.findByType('CadenceOverlay').props.open).toBe(false)
  act(() => view.unmount())
})
