const mockPush = jest.fn()
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  Easing: { out: () => (value) => value, cubic: (value) => value },
  ReduceMotion: { System: 'system' },
  useSharedValue: (value) => require('react').useRef({ value }).current,
  useAnimatedStyle: (callback) => callback(),
  useReducedMotion: jest.fn(() => false),
  withTiming: (value) => value,
}))
jest.mock('react-native-svg', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: ({ children, ...props }) => React.createElement('Svg', props, children),
    Line: (props) => React.createElement('SvgLine', props),
  }
})
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('react-native-gifted-charts', () => {
  const React = require('react')
  return { LineChart: (props) => React.createElement('LineChart', props), yAxisSides: { RIGHT: 1 } }
})
jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  return {
    Button: ({ children, ...props }) => React.createElement('Button', props, children),
    UiText: ({ children, ...props }) => React.createElement('Text', props, children),
  }
})
jest.mock('../../components/ui/ActionMenu', () => {
  const React = require('react')
  return { ActionMenu: (props) => React.createElement('ActionMenu', props) }
})
jest.mock('../../components/ui/icons', () => {
  const React = require('react')
  return { ChevronRight: (props) => React.createElement('ChevronRight', props) }
})
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({ accent: '#2D2235', divider: '#DCD0E4', muted: '#76627D' }),
}))
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
const onManage = jest.fn()
const onRemove = jest.fn()
const config = { exerciseId: 'bench', exerciseName: 'Bench press', metric: 'maxWeight' }
const text = (renderer) => renderer.root.findAllByType('Text').map((item) => item.children.join(''))
const renderers = []

function render(state, props = {}) {
  useExerciseProgression.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    refetch,
    ...state,
  })
  let renderer
  act(() => {
    renderer = create(
      React.createElement(ProgressionWidget, {
        config,
        onManage,
        onRemove,
        ...props,
      })
    )
  })
  renderers.push(renderer)
  return renderer
}

beforeEach(() => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
    width: 400,
    height: 889,
    scale: 1,
    fontScale: 1,
  })
})

afterEach(() => {
  act(() => renderers.splice(0).forEach((renderer) => renderer.unmount()))
  jest.clearAllMocks()
  jest.restoreAllMocks()
})

test('keeps loading, empty history and retryable errors distinct', () => {
  const loading = render({ isLoading: true })
  expect(text(loading)).toContain('Loading progression...')

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

test('fits the chart and value labels inside the card with readable date endpoints', () => {
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
  const plot = renderer.root.findAll((node) => typeof node.props.onLayout === 'function').at(-1)
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))

  const chart = renderer.root.findByType('LineChart')
  expect(chart.props.data.map((point) => point.value)).toEqual([35, 45])
  expect(chart.props.isAnimated).toBe(true)
  expect(chart.props.animationDuration).toBe(650)
  expect(chart.props.width).toBe(248)
  expect(
    chart.props.width + chart.props.yAxisLabelWidth + chart.props.dataPointsRadius
  ).toBeLessThanOrEqual(300)
  expect(chart.props.yAxisSide).toBe(1)
  expect(chart.props.hideYAxisText).not.toBe(true)
  expect(chart.props.formatYLabel('12500')).toBe('13K')
  expect(chart.props.showFractionalValues).toBe(false)
  expect(chart.props.formatYLabel('52.5')).toBe('53')
  expect(chart.props.height).toBe(48)
  expect(text(renderer)).toEqual(expect.arrayContaining(['45', 'Sep 7', 'Sep 28']))
  expect(text(renderer)).not.toContain('2 sessions')
  expect(text(renderer)).not.toContain('Last recorded Sep 28')
})

test.each(['preview', 'reduced motion'])('skips chart drawing animation for %s', (mode) => {
  const { useReducedMotion } = require('react-native-reanimated')
  useReducedMotion.mockReturnValue(mode === 'reduced motion')
  const renderer = render(
    { data: { personalRecords: {}, maxWeightProgression: [{ value: 70, date: '2026-11-12' }] } },
    { preview: mode === 'preview' }
  )
  const plot = renderer.root.findAll((node) => typeof node.props.onLayout === 'function').at(-1)
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))
  expect(renderer.root.findByType('LineChart').props.isAnimated).toBe(false)
  useReducedMotion.mockReturnValue(false)
})

test('keeps decimal axis labels when a recorded value is fractional', () => {
  const renderer = render({
    data: {
      personalRecords: { maxWeight: 52.5 },
      maxWeightProgression: [
        { value: 50, date: '2026-09-07' },
        { value: 52.5, date: '2026-09-28' },
      ],
    },
  })
  const plot = renderer.root.findAll((node) => typeof node.props.onLayout === 'function')[0]
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))
  const chart = renderer.root.findByType('LineChart').props
  expect(chart.showFractionalValues).toBe(true)
  expect(chart.roundToDigits).toBe(1)
  expect(chart.formatYLabel('52.5')).toBe('52.5')
  expect(text(renderer)).toContain('52.5')
})

test('exposes explicit actions on saved widgets but hides them in the picker preview', () => {
  const renderer = render({
    data: {
      personalRecords: {},
      maxWeightProgression: [],
      volumeProgression: [],
      oneRmProgression: [],
    },
  })
  expect(renderer.root.findByType('ActionMenu').props).toMatchObject({
    label: 'Actions for Bench press progression widget',
  })
  expect(
    renderer.root.findByType('ActionMenu').props.actions.map((action) => action.label)
  ).toEqual(['Manage widgets', 'Remove widget'])

  const preview = render(
    { data: null },
    { preview: true, onManage: undefined, onRemove: undefined }
  )
  expect(preview.root.findAllByType('ActionMenu')).toHaveLength(0)
})

test('opens progress from the compact header and hides its chevron in picker previews', () => {
  const onOpen = jest.fn()
  const renderer = render({}, { onOpen })
  expect(renderer.root.findAllByType('ChevronRight')).toHaveLength(1)
  const header = renderer.root.findAll(
    (node) => node.props.accessibilityLabel === 'Open Bench press maxWeight progress'
  )[0]
  const highlightedCards = () =>
    renderer.root.findAll(
      (node) =>
        typeof node.props.className === 'string' &&
        node.props.className.includes('rounded-card') &&
        node.props.className.includes('bg-raised')
    )
  act(() => header.props.onPressIn())
  expect(highlightedCards().length).toBeGreaterThan(0)
  act(() => header.props.onPressOut())
  expect(highlightedCards()).toHaveLength(0)
  act(() => header.props.onPress())
  expect(onOpen).toHaveBeenCalledTimes(1)
  const preview = render({}, { onOpen, preview: true })
  expect(preview.root.findAllByType('ChevronRight')).toHaveLength(0)
})

test.each([1, 2, 20])('keeps axes and all %i session points within the measured plot', (count) => {
  const renderer = render({
    data: {
      personalRecords: { maxWeight: 45 },
      maxWeightProgression: Array.from({ length: count }, (_, index) => ({
        value: 25 + index,
        date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      })),
    },
  })
  const plot = renderer.root.findAll((node) => typeof node.props.onLayout === 'function')[0]
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))
  const chart = renderer.root.findByType('LineChart').props
  expect(chart.xAxisLength + chart.yAxisLabelWidth).toBeLessThanOrEqual(300)
  expect(chart.rulesLength + chart.yAxisLabelWidth).toBeLessThanOrEqual(300)
  expect(chart.xAxisLength).toBe(chart.width)
  expect(chart.rulesLength).toBe(chart.width)
  const lastPoint = chart.initialSpacing + chart.spacing * (count - 1)
  expect(lastPoint + chart.dataPointsRadius).toBeLessThanOrEqual(chart.width)

  if (count === 1) expect(chart.initialSpacing).toBe(chart.width / 2)
  expect(chart.data).toHaveLength(count)
  expect(chart.disableScroll).toBe(true)
})

test.each([1, 2, 3])(
  'gives axis labels room and consistent alignment at %ix font scale',
  (fontScale) => {
    jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
      width: 400,
      height: 889,
      scale: 1,
      fontScale,
    })
    const renderer = render({
      data: {
        personalRecords: { maxWeight: 10 },
        maxWeightProgression: [{ value: 10, date: '2026-10-21' }],
      },
    })
    const plot = renderer.root.findAll((node) => typeof node.props.onLayout === 'function')[0]
    act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))
    const chart = renderer.root.findByType('LineChart').props
    expect(chart.yAxisLabelWidth).toBe(44 * fontScale)
    expect(chart.height).toBe(48 * fontScale)
    expect(chart.yAxisTextStyle).toMatchObject({
      width: '100%',
      textAlign: 'right',
      lineHeight: 14,
      includeFontPadding: false,
    })
    expect(chart.yAxisLabelContainerStyle).toMatchObject({
      justifyContent: 'flex-end',
      alignItems: 'center',
    })
    expect(chart.width + chart.yAxisLabelWidth + chart.dataPointsRadius).toBeLessThanOrEqual(300)
  }
)

test.each([[70], [65, 70, 75], [52.5, 55], [0], [1], [70, 70]])(
  'scales around logged values with padding for %j',
  (...values) => {
    const renderer = render({
      data: {
        personalRecords: {},
        maxWeightProgression: values.map((value) => ({ value, date: '2026-11-12' })),
      },
    })
    const plot = renderer.root.findAll((node) => typeof node.props.onLayout === 'function')[0]
    act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))
    const chart = renderer.root.findByType('LineChart').props
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    expect(chart.yAxisOffset).toBeGreaterThanOrEqual(0)
    expect(chart.yAxisOffset).toBeLessThanOrEqual(minimum)
    if (minimum >= 50) expect(chart.yAxisOffset).toBeGreaterThan(minimum * 0.8)
    expect(chart.yAxisOffset + chart.maxValue).toBeGreaterThan(maximum)
    expect(chart.stepValue).toBeGreaterThan(0)
    expect(chart.yAxisOffset % 5).toBe(0)
    expect(chart.stepValue % 5).toBe(0)
    expect(chart.data.map((point) => point.value)).toEqual(values)
  }
)

test('filters calendar months inclusively and clamps month ends', () => {
  const { filterProgression } = require('../../components/ProgressionWidget')
  const points = ['2026-02-27', '2026-02-28', '2026-03-31', '2026-04-01'].map((date) => ({ date }))
  expect(
    filterProgression(points, '1M', new Date('2026-03-31T12:00:00Z')).map((p) => p.date)
  ).toEqual(['2026-02-28', '2026-03-31'])
  expect(filterProgression(points, 'All')).toEqual(points)
})

test('detail positions points by elapsed dates and shows the selected period best', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-12T12:00:00Z'))
  const renderer = render(
    {
      data: {
        personalRecords: { maxWeight: 90 },
        maxWeightProgression: [
          { date: '2026-09-12', value: 50 },
          { date: '2026-10-12', value: 70 },
          { date: '2026-11-12', value: 60 },
        ],
      },
    },
    { detail: true }
  )
  const group = renderer.root.findByProps({ accessibilityLabel: 'Progress period' })
  act(() => group.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))
  const plot = renderer.root.findAll((node) => typeof node.props.onLayout === 'function').at(-1)
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))
  expect(text(renderer)).toEqual(expect.arrayContaining(['Best in selected period', '70']))
  const chart = renderer.root.findByType('LineChart')
  expect(chart.props.height).toBe(160)
  expect(chart.props.data[0].spacing / chart.props.data[1].spacing).toBeCloseTo(30 / 31)
  const highlights = () =>
    renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'progress-range-highlight'
    )
  expect(highlights()).toHaveLength(1)
  const radios = () =>
    renderer.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'radio' &&
        typeof node.props.onPress === 'function' &&
        typeof node.props.className === 'string'
    )
  expect(radios().filter((node) => node.props.accessibilityState.checked)).toHaveLength(1)
  act(() => radios()[0].props.onPress())
  expect(renderer.root.findByType('LineChart')).toBe(chart)
  expect(highlights()).toHaveLength(1)
  expect(renderer.root.findByType('LineChart').props.data.map((point) => point.value)).toEqual([
    70, 60,
  ])
  expect(radios()[0].props.accessibilityState.checked).toBe(true)
  expect(radios()[0].props.className).toContain('h-8')
  jest.useRealTimers()
})

test('positions a single point in each calendar domain and opens its actual record', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-12T12:00:00Z'))
  const renderer = render(
    {
      data: {
        personalRecords: {},
        maxWeightProgression: [
          {
            date: '2026-11-01',
            value: 70,
            workoutRecord: { id: 'real-id', name: 'Squat practice' },
          },
          { date: '2026-09-01', value: 80, workoutRecord: { id: 'older', name: 'Old workout' } },
        ].reverse(),
      },
    },
    { detail: true }
  )
  const plot = renderer.root.findAll((node) => typeof node.props.onLayout === 'function').at(-1)
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))
  const radios = () =>
    renderer.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'radio' &&
        typeof node.props.onPress === 'function' &&
        typeof node.props.className === 'string'
    )
  act(() => radios()[0].props.onPress())
  const oneMonth = renderer.root.findByType('LineChart').props.initialSpacing
  const grid = renderer.root.findByType('LineChart').props
  const lines = renderer.root.findAllByType('SvgLine')
  expect(lines).toHaveLength(3)
  expect(lines.map((line) => line.props.x1)).toEqual([
    8,
    8 + (16 / 31) * (grid.width - 16),
    grid.width - 8,
  ])
  expect(lines.every((line) => line.props.y1 === 0 && line.props.y2 === 160)).toBe(true)
  expect(text(renderer)).toContain('Oct 28')
  expect(text(renderer)).toEqual(expect.arrayContaining(['Oct 12', 'Nov 12', 'Squat practice']))
  expect(text(renderer)).not.toContain('Old workout')
  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Squat practice, Nov 1, 2026, 70 kg' })
      .props.onPress()
  )
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(history)/record/[id]',
    params: { id: 'real-id' },
  })
  act(() => radios()[2].props.onPress())
  expect(renderer.root.findByType('LineChart').props.initialSpacing).not.toBe(oneMonth)
  expect(text(renderer)).toContain('May 12')
  expect(renderer.root.findAllByType('SvgLine')).toHaveLength(3)
  jest.useRealTimers()
})
