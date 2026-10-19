jest.mock('@shopify/flash-list', () => {
  const React = require('react')
  return {
    FlashList: ({ data, renderItem, keyExtractor }) =>
      React.createElement(
        React.Fragment,
        null,
        data.map((item, index) =>
          React.createElement(
            React.Fragment,
            { key: keyExtractor(item, index) },
            renderItem({ item, index })
          )
        )
      ),
  }
})
jest.mock('../../components/ui', () => ({
  Button: 'Button',
  DurationTargetInput: 'DurationTargetInput',
  StrengthTargetInput: 'StrengthTargetInput',
  SwipeToDeleteRow: ({ children }) => children,
  UiText: 'Text',
  useCadenceColors: () => ({ onAccent: '#faf5fc' }),
}))
jest.mock('../../components/ui/icons', () => ({ Check: 'Check' }))

const React = require('react')
const { act, create } = require('react-test-renderer')
const {
  WorkoutSessionExercise,
} = require('../../features/workout-session/components/WorkoutSessionExercise')

const updateSet = jest.fn()
const toggleComplete = jest.fn()
const removeSet = jest.fn()
const startRestTimer = jest.fn()

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  jest.clearAllMocks()
})

function SessionExerciseWithAddSet({ category }) {
  const [sets, setSets] = React.useState([
    {
      id: 'set-1',
      reps: category === 'CARDIO' ? null : 8,
      weight: category === 'CARDIO' ? null : 50,
      durationSeconds: category === 'CARDIO' ? 600 : undefined,
      completed: false,
    },
  ])
  const addSet = React.useCallback(() => {
    setSets((current) => [
      ...current,
      {
        id: 'set-2',
        reps: null,
        weight: null,
        durationSeconds: category === 'CARDIO' ? 0 : undefined,
        completed: false,
      },
    ])
  }, [category])

  return React.createElement(WorkoutSessionExercise, {
    exercise: {
      id: 'exercise-1',
      sessionId: 'session-exercise-1',
      name: category === 'CARDIO' ? 'Run' : 'Squat',
      category,
      primaryMuscles: [],
      secondaryMuscles: [],
      sets,
    },
    index: 0,
    onUpdateSet: updateSet,
    onToggleSetComplete: toggleComplete,
    onAddSet: addSet,
    onRemoveSet: removeSet,
    onStartRestTimer: startRestTimer,
  })
}

test.each([
  ['STRENGTH', 'Set 1', 'Delete set', 'Add set to Squat'],
  ['CARDIO', 'Interval 1', 'Delete interval', 'Add interval to Run'],
])(
  '%s original row enables its delete action after adding a set',
  async (category, label, actionLabel, addLabel) => {
    let renderer
    await act(async () => {
      renderer = create(React.createElement(SessionExerciseWithAddSet, { category }))
    })

    const rowLabel = () =>
      renderer.root.findAllByType('Text').find((node) => node.props.accessibilityLabel === label)
    expect(rowLabel().props.accessibilityActions).toEqual([])

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: addLabel }).props.onPress()
    })

    expect(rowLabel().props.accessibilityActions).toEqual([{ name: 'delete', label: actionLabel }])
    await act(async () => renderer.unmount())
  }
)
