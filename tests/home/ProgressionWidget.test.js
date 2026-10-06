jest.mock('tamagui', () => {
  const React = require('react')
  const primitive =
    (name) =>
    ({ children, ...props }) =>
      React.createElement(name, props, children)
  return {
    Card: primitive('Card'),
    YStack: primitive('YStack'),
    XStack: primitive('XStack'),
    Text: primitive('Text'),
    Button: primitive('Button'),
    Spinner: primitive('Spinner'),
    useTheme: () => ({
      primary: { val: 'accent' },
      colorSubtle: { val: 'muted' },
      borderColor: { val: 'border' },
      backgroundTransparent: { val: 'transparent' },
      surface: { val: 'surface' },
    }),
    getTokenValue: (token) => ({ $field: 12, $day: 96, '$0.5': 2, $compact: 4, $touch: 44 })[token],
    getVariableValue: (value) => value,
    getConfig: () => ({ fonts: { body: { size: { caption: 12 } } } }),
  }
})
jest.mock('react-native-gifted-charts', () => {
  const React = require('react')
  return { LineChart: (props) => React.createElement('LineChart', props) }
})
jest.mock('../../features/exercises', () => ({ useExerciseProgression: jest.fn() }))
jest.mock('../../stores/widgetStore', () => ({
  getMetricLabel: (metric) => metric,
  getMetricUnit: () => 'kg',
}))
const React = require('react')
const { act, create } = require('react-test-renderer')
const { useExerciseProgression } = require('../../features/exercises')
const { ProgressionWidget } = require('../../components/ProgressionWidget')
const refetch = jest.fn()
const config = { exerciseId: 'bench', exerciseName: 'Bench press', metric: 'maxWeight' }
const renderers = []
const text = (renderer) => renderer.root.findAllByType('Text').map((item) => item.children.join(''))
function render(state) {
  useExerciseProgression.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    refetch,
    ...state,
  })
  let renderer
  act(() => {
    renderer = create(React.createElement(ProgressionWidget, { config }))
  })
  renderers.push(renderer)
  return renderer
}
afterEach(() => {
  act(() => renderers.splice(0).forEach((renderer) => renderer.unmount()))
  jest.clearAllMocks()
})

test('keeps loading, empty history and retryable errors distinct', () => {
  const loading = render({ isLoading: true })
  expect(loading.root.findAllByType('Spinner')).toHaveLength(1)
  const empty = render({ error: 'No exercise data available' })
  expect(text(empty)).toContain(
    'No recorded progress yet. Complete a workout with this exercise to see your trend.'
  )
  expect(empty.root.findAllByType('Button')).toHaveLength(0)
  const failed = render({ error: 'Offline' })
  expect(text(failed)).toContain('Offline')
  act(() => failed.root.findByType('Button').props.onPress())
  expect(refetch).toHaveBeenCalledTimes(1)
})

test('uses the selected metric and measured width with theme and font configuration', () => {
  const renderer = render({
    data: {
      personalRecords: { maxWeight: 45 },
      maxWeightProgression: [
        { value: 35, date: '2026-09-07' },
        { value: 45, date: '2026-09-28' },
      ],
      volumeProgression: [{ value: 1000, date: '2026-09-28' }],
      oneRmProgression: [],
      lastWorkout: { createdAt: '2026-09-28T12:00:00' },
    },
  })
  const plot = renderer.root.findAllByType('YStack').find((item) => item.props.onLayout)
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))
  const chart = renderer.root.findByType('LineChart')
  expect(chart.props.data.map((point) => point.value)).toEqual([35, 45])
  expect(chart.props.width).toBe(276)
  expect(chart.props.color).toBe('accent')
  expect(chart.props.xAxisLabelTextStyle).toEqual({ fontSize: 12, color: 'muted' })
  expect(text(renderer)).toEqual(
    expect.arrayContaining(['45', '2 sessions', 'Last recorded Sep 28'])
  )
})
