jest.mock('react-native-gifted-charts', () => {
  const React = require('react')
  return { LineChart: (props) => React.createElement('LineChart', props) }
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

afterEach(() => {
  act(() => renderers.splice(0).forEach((renderer) => renderer.unmount()))
  jest.clearAllMocks()
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

test('renders a full-width 100px chart with readable date endpoints and the selected metric', () => {
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
  const plot = renderer.root.findAll((node) => typeof node.props.onLayout === 'function')[0]
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 300 } } }))

  const chart = renderer.root.findByType('LineChart')
  expect(chart.props.data.map((point) => point.value)).toEqual([35, 45])
  expect(chart.props.width).toBe(300)
  expect(chart.props.height).toBe(100)
  expect(text(renderer)).toEqual(
    expect.arrayContaining(['45', 'Sep 7', 'Sep 28', '2 sessions', 'Last recorded Sep 28'])
  )
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
