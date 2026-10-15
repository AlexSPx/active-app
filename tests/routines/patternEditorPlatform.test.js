const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('tamagui', () => ({
  YStack: (props) => require('react').createElement('YStack', props, props.children),
  XStack: (props) => require('react').createElement('XStack', props, props.children),
  Button: (props) => require('react').createElement('Button', props, props.children),
  Text: (props) => require('react').createElement('Text', props, props.children),
  ScrollView: (props) => require('react').createElement('ScrollView', props, props.children),
  getTokenValue: () => 20,
  Dialog: Object.assign(
    (props) => require('react').createElement('Dialog', props, props.children),
    {
      Portal: (props) => require('react').createElement('Portal', props, props.children),
      Overlay: (props) => require('react').createElement('Overlay', props, props.children),
      Content: (props) => require('react').createElement('Content', props, props.children),
    }
  ),
  Sheet: Object.assign((props) => require('react').createElement('Sheet', props, props.children), {
    Overlay: (props) => require('react').createElement('SheetOverlay', props, props.children),
    Handle: (props) => require('react').createElement('SheetHandle', props, props.children),
    Frame: (props) => require('react').createElement('SheetFrame', props, props.children),
  }),
}))
jest.mock('@tamagui/lucide-icons', () => ({
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

test('day actions use a Dialog on web', () => {
  Platform.OS = 'web'
  const view = renderEditor()
  openMenu(view)
  expect(view.root.findAllByType('Dialog')).toHaveLength(1)
  expect(view.root.findAllByType('Sheet')).toHaveLength(0)
  const texts = view.root
    .findAllByType('Text')
    .map((node) => [].concat(node.props.children).join(''))
  expect(texts).toContain('Day 1 actions')
  act(() => view.unmount())
})

test('day actions use a Sheet on native', () => {
  Platform.OS = 'ios'
  const view = renderEditor()
  openMenu(view)
  expect(view.root.findAllByType('Sheet')).toHaveLength(1)
  expect(view.root.findAllByType('Dialog')).toHaveLength(0)
  act(() => view.unmount())
})
