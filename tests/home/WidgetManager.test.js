jest.mock('../../components/ui/CadenceOverlay', () => ({
  CadenceOverlay: ({ children, ...props }) =>
    require('react').createElement('CadenceOverlay', props, props.open ? children : null),
}))
jest.mock('lucide-react-native', () => {
  const React = require('react')
  const Icon = () => null
  return {
    ArrowDown: Icon,
    ArrowUp: Icon,
    Check: Icon,
    Plus: Icon,
    Search: Icon,
    X: Icon,
  }
})
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({
    background: '#faf7fc',
    foreground: '#2d2235',
    muted: '#76627e',
    divider: '#dcd0e4',
    accent: '#624572',
    onAccent: '#faf5fc',
  }),
}))
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
const { ScrollView } = require('react-native')
const { Button, TextField, UiText } = require('../../components/ui/Controls')
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
  renderer.root.findAllByType(UiText).map((text) => text.props.children)
const button = (renderer, label) =>
  renderer.root.findAllByType(Button).find((item) => {
    if (item.props.accessibilityLabel === label) return true
    return React.Children.toArray(item.props.children).some(
      (child) =>
        React.isValidElement(child) && child.type === UiText && child.props.children === label
    )
  })
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

test('selects a search result, previews its metric, adds it and clears the draft', () => {
  const renderer = render()
  expect(button(renderer, 'Add widget').props.disabled).toBe(true)
  expect(visibleText(renderer).filter((text) => text === 'Bench press')).toHaveLength(1)
  act(() => renderer.root.findByType(TextField).props.onChangeText('row'))
  useExerciseSearch.mockReturnValue({
    exercises: [{ id: 'row', name: 'Barbell row' }],
    loading: false,
    error: null,
    clearSearch,
    searchExercises,
  })
  act(() => renderer.update(React.createElement(WidgetManager, props)))
  expect(renderer.root.findByType(TextField).props.value).toBe('row')
  act(() => button(renderer, 'Barbell row').props.onPress())
  act(() => button(renderer, 'Volume').props.onPress())
  expect(renderer.root.findByType('ProgressionWidget').props.config).toEqual({
    exerciseId: 'row',
    exerciseName: 'Barbell row',
    metric: 'volume',
  })
  act(() => button(renderer, 'Add widget').props.onPress())
  expect(useWidgetStore.getState().widgets).toHaveLength(1)
  expect(useWidgetStore.getState().widgets[0].exerciseId).toBe('row')
  expect(useWidgetStore.getState().widgets[0].metric).toBe('volume')
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(button(renderer, 'Add widget').props.disabled).toBe(true)
  expect(renderer.root.findAllByType('ProgressionWidget')).toHaveLength(0)
  expect(renderer.root.findByType(TextField).props.value).toBe('')
})

test('blocks duplicate exercise metrics while allowing another metric for the same exercise', () => {
  useWidgetStore.getState().addWidget('bench', 'Bench press', 'maxWeight')
  const renderer = render()

  act(() => button(renderer, 'Bench press').props.onPress())
  expect(button(renderer, 'Widget already added').props.disabled).toBe(true)

  act(() => button(renderer, 'Volume').props.onPress())
  expect(button(renderer, 'Add widget').props.disabled).toBe(false)
  act(() => button(renderer, 'Add widget').props.onPress())

  expect(useWidgetStore.getState().widgets.map((widget) => widget.metric)).toEqual([
    'maxWeight',
    'volume',
  ])
})

test.each(['close button', 'overlay dismissal'])(
  'cancelling through the %s clears exercise, metric and search before reopen',
  (cancelPath) => {
    const renderer = render()
    act(() => renderer.root.findByType(TextField).props.onChangeText('row'))
    useExerciseSearch.mockReturnValue({
      exercises: [{ id: 'row', name: 'Barbell row' }],
      loading: false,
      error: null,
      clearSearch,
      searchExercises,
    })
    act(() => renderer.update(React.createElement(WidgetManager, props)))
    act(() => button(renderer, 'Barbell row').props.onPress())
    act(() => button(renderer, 'Volume').props.onPress())

    expect(renderer.root.findByType(TextField).props.value).toBe('row')
    expect(renderer.root.findByType('ProgressionWidget').props.config).toMatchObject({
      exerciseId: 'row',
      metric: 'volume',
    })

    clearSearch.mockClear()
    act(() => {
      if (cancelPath === 'close button') {
        renderer.root
          .findAllByType(Button)
          .find((item) => item.props.accessibilityLabel === 'Close widget manager')
          .props.onPress()
      } else {
        renderer.root.findByType('CadenceOverlay').props.onOpenChange(false)
      }
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(clearSearch).toHaveBeenCalledTimes(1)
    expect(renderer.root.findByType(TextField).props.value).toBe('')
    expect(renderer.root.findAllByType('ProgressionWidget')).toHaveLength(0)
    expect(button(renderer, 'Max weight').props.accessibilityState.selected).toBe(true)
    expect(button(renderer, 'Volume').props.accessibilityState.selected).toBe(false)

    act(() => renderer.update(React.createElement(WidgetManager, { ...props, isVisible: false })))
    act(() => renderer.update(React.createElement(WidgetManager, props)))
    expect(renderer.root.findByType(TextField).props.value).toBe('')
    expect(renderer.root.findAllByType('ProgressionWidget')).toHaveLength(0)
    expect(button(renderer, 'Max weight').props.accessibilityState.selected).toBe(true)
  }
)

test('reopening add mode starts a fresh draft after a successful add', () => {
  const renderer = render()
  act(() => button(renderer, 'Bench press').props.onPress())
  act(() => button(renderer, 'Volume').props.onPress())
  act(() => button(renderer, 'Add widget').props.onPress())
  act(() => renderer.update(React.createElement(WidgetManager, { ...props, isVisible: false })))
  act(() => renderer.update(React.createElement(WidgetManager, props)))
  expect(renderer.root.findAllByType('ProgressionWidget')).toHaveLength(0)
  expect(button(renderer, 'Add widget').props.disabled).toBe(true)
})

test('preserves selection through search and offers saved exercises after an offline search', () => {
  const renderer = render()
  act(() => button(renderer, 'Bench press').props.onPress())
  act(() => renderer.root.findByType(TextField).props.onChangeText('row'))
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
  act(() => renderer.root.findByType(TextField).props.onChangeText(''))
  expect(button(renderer, 'Bench press')).toBeDefined()
})

test('moves and removes persisted widgets while keeping contiguous order and history untouched', async () => {
  const store = useWidgetStore.getState()
  const bench = store.addWidget('bench', 'Bench press', 'maxWeight')
  const squat = store.addWidget('squat', 'Squat', 'oneRm')
  const renderer = render('manage')
  const byLabel = (label) =>
    renderer.root.findAllByType(Button).find((item) => item.props.accessibilityLabel === label)
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

test('picker scroll keeps the keyboard reachable without swallowing choices', () => {
  const renderer = render()
  expect(renderer.root.findByType('CadenceOverlay').props.snapPoints).toEqual([90])
  const scrollViews = renderer.root.findAllByType(ScrollView)
  expect(scrollViews).toHaveLength(2)
  expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled')
  expect(scrollViews[0].props.keyboardDismissMode).toBe('on-drag')
  expect(scrollViews[1].props.keyboardShouldPersistTaps).toBe('handled')
})
