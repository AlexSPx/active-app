jest.mock('tamagui', () => {
  const React = require('react')
  const primitive =
    (name) =>
    ({ children, ...props }) =>
      React.createElement(name, props, children)
  const Sheet = primitive('Sheet')
  for (const name of ['Overlay', 'Handle', 'Frame', 'ScrollView'])
    Sheet[name] = primitive(`Sheet.${name}`)
  return {
    Sheet,
    Button: primitive('Button'),
    Input: primitive('Input'),
    ScrollView: primitive('ScrollView'),
    Text: primitive('Text'),
    XStack: primitive('XStack'),
    YStack: primitive('YStack'),
  }
})
jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => null
  return { Search: Icon, X: Icon, Plus: Icon, Check: Icon, ArrowUp: Icon, ArrowDown: Icon }
})
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../features/exercises', () => ({ useExerciseSearch: jest.fn() }))
jest.mock('../../features/workouts', () => ({ useWorkouts: jest.fn() }))
jest.mock('../../components/ProgressionWidget', () => {
  const React = require('react')
  return { ProgressionWidget: (props) => React.createElement('ProgressionWidget', props) }
})
const React = require('react')
const { act, create } = require('react-test-renderer')
const { useExerciseSearch } = require('../../features/exercises')
const { useWorkouts } = require('../../features/workouts')
const { useWidgetStore } = require('../../stores/widgetStore')
const { WidgetManager } = require('../../components/WidgetManager')
const clearSearch = jest.fn()
const searchExercises = jest.fn()
const onClose = jest.fn()
const onModeChange = jest.fn()
const props = { isVisible: true, mode: 'add', onClose, onModeChange }
const exercise = { exerciseId: 'bench', exerciseTitle: 'Bench press', category: 'STRENGTH' }
const visibleText = (renderer) =>
  renderer.root.findAllByType('Text').map((text) => text.children.join(''))
const button = (renderer, label) =>
  renderer.root
    .findAllByType('Button')
    .find((item) => item.findAllByType('Text').some((text) => text.children.join('') === label))
const renderers = []
afterEach(() => {
  act(() => renderers.splice(0).forEach((renderer) => renderer.unmount()))
})
function render(mode = 'add') {
  let renderer
  act(() => {
    renderer = create(React.createElement(WidgetManager, { ...props, mode }))
  })
  renderers.push(renderer)
  return renderer
}
beforeEach(async () => {
  jest.clearAllMocks()
  await useWidgetStore.persist.clearStorage()
  useWidgetStore.getState().reset()
  useExerciseSearch.mockReturnValue({
    exercises: [],
    loading: false,
    error: null,
    clearSearch,
    searchExercises,
  })
  useWorkouts.mockReturnValue({
    workouts: [{ workoutTemplate: { exercises: [exercise, exercise] } }],
  })
})

test('selects a saved exercise, previews its metric, adds it once and resets the next draft', () => {
  const renderer = render()
  expect(button(renderer, 'Add widget').props.disabled).toBe(true)
  expect(visibleText(renderer).filter((text) => text === 'Bench press')).toHaveLength(1)
  act(() => button(renderer, 'Bench press').props.onPress())
  act(() => button(renderer, 'Volume').props.onPress())
  expect(renderer.root.findByType('ProgressionWidget').props.config).toEqual({
    exerciseId: 'bench',
    exerciseName: 'Bench press',
    metric: 'volume',
  })
  act(() => button(renderer, 'Add widget').props.onPress())
  expect(useWidgetStore.getState().widgets).toHaveLength(1)
  expect(useWidgetStore.getState().widgets[0].metric).toBe('volume')
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(button(renderer, 'Widget already added').props.disabled).toBe(true)
  act(() => renderer.update(React.createElement(WidgetManager, { ...props, isVisible: false })))
  act(() => renderer.update(React.createElement(WidgetManager, props)))
  expect(renderer.root.findAllByType('ProgressionWidget')).toHaveLength(0)
  expect(button(renderer, 'Add widget').props.disabled).toBe(true)
})

test('preserves selection through search and offers saved exercises after an offline search', () => {
  const renderer = render()
  act(() => button(renderer, 'Bench press').props.onPress())
  act(() => renderer.root.findByType('Input').props.onChangeText('row'))
  expect(searchExercises).toHaveBeenCalledWith('row')
  useExerciseSearch.mockReturnValue({
    exercises: [],
    loading: false,
    error: 'Offline',
    clearSearch,
    searchExercises,
  })
  act(() => renderer.update(React.createElement(WidgetManager, props)))
  expect(visibleText(renderer)).toContain('Offline')
  expect(renderer.root.findByType('ProgressionWidget').props.config.exerciseId).toBe('bench')
  act(() => renderer.root.findByType('Input').props.onChangeText(''))
  expect(button(renderer, 'Bench press')).toBeDefined()
})

test('moves and removes persisted widgets while keeping contiguous order and history untouched', async () => {
  const store = useWidgetStore.getState()
  const bench = store.addWidget('bench', 'Bench press', 'maxWeight')
  const squat = store.addWidget('squat', 'Squat', 'oneRm')
  const renderer = render('manage')
  const byLabel = (label) =>
    renderer.root.findAllByType('Button').find((item) => item.props.accessibilityLabel === label)
  expect(byLabel('Move Bench press Max weight up').props.disabled).toBe(true)
  act(() => byLabel('Move Bench press Max weight down').props.onPress())
  expect(useWidgetStore.getState().widgets.map((widget) => widget.id)).toEqual([squat, bench])
  act(() => byLabel('Remove Squat Est. 1RM widget').props.onPress())
  expect(useWidgetStore.getState().widgets.map((widget) => [widget.id, widget.position])).toEqual([
    [bench, 0],
  ])
  act(() => button(renderer, 'Done').props.onPress())
  expect(onClose).toHaveBeenCalledTimes(1)
  act(() => renderer.unmount())
  await useWidgetStore.persist.rehydrate()
  expect(useWidgetStore.getState().widgets.map((widget) => widget.id)).toEqual([bench])
})

test('removal respects persisted positions even if array order differs', () => {
  const store = useWidgetStore.getState()
  const first = store.addWidget('bench', 'Bench press')
  const second = store.addWidget('squat', 'Squat')
  const third = store.addWidget('row', 'Row')
  useWidgetStore.setState({
    widgets: useWidgetStore
      .getState()
      .widgets.map((widget, index) => ({ ...widget, position: 2 - index })),
  })
  store.removeWidget(second)
  expect(useWidgetStore.getState().widgets.map((widget) => [widget.id, widget.position])).toEqual([
    [third, 0],
    [first, 1],
  ])
})
