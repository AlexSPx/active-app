const mockReact = require('react')
const { act, create } = require('react-test-renderer')

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() }
const mockParams = { ctx: 'create', workoutName: 'Leg day' }
const mockExercises = []
const mockQueryClient = { invalidateQueries: jest.fn() }

jest.mock('expo-router', () => ({
  Stack: { Screen: 'Screen' },
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}))
jest.mock('../../components/ui/Controls', () => ({
  Button: 'Button',
  SegmentedSelection: 'SegmentedSelection',
  TextField: 'TextField',
  UiText: 'UiText',
}))
jest.mock('../../components/ui/icons', () => ({ Search: 'Search' }))
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({ muted: '#76627e' }),
}))
jest.mock('../../features/workouts', () => ({
  useWorkoutStore: jest.requireActual('../../features/workouts/stores/createWorkoutStore')
    .useWorkoutStore,
  useEditWorkoutStore: jest.requireActual('../../features/workouts/stores/editWorkoutStore')
    .useEditWorkoutStore,
}))
jest.mock('../../features/exercises', () => ({
  useExerciseSearch: () => ({
    exercises: mockExercises,
    loading: false,
    error: null,
    hasSearched: true,
    searchExercises: jest.fn(),
    clearSearch: jest.fn(),
  }),
  ExerciseList: 'ExerciseList',
}))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => mockQueryClient }))
jest.mock('../../lib/hooks/useProfileQueryKeys', () => ({
  useProfileQueryKeys: () => ({ exercises: { search: (query) => ['search', query] } }),
}))
jest.mock('../../navigation/BackHeaderButton', () => ({ BackHeaderButton: 'BackHeaderButton' }))

const { useWorkoutStore } = require('../../features/workouts/stores/createWorkoutStore')
const { useEditWorkoutStore } = require('../../features/workouts/stores/editWorkoutStore')
const SearchExerciseScreen = require('../../app/exercises/search').default

const squat = {
  id: 'squat',
  name: 'Squat',
  category: 'STRENGTH',
  sets: [{ weight: 60, reps: 8 }],
}
const run = {
  id: 'run',
  name: 'Run',
  category: 'CARDIO',
  sets: [{ weight: null, reps: null, durationSeconds: 0 }],
}

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  useWorkoutStore.getState().reset()
  useEditWorkoutStore.getState().reset()
  mockParams.ctx = 'create'
  mockParams.workoutName = 'Leg day'
  mockExercises.splice(0, mockExercises.length, run)
  jest.clearAllMocks()
})

test('picker keeps new selections pending until Done and preserves the workout draft on Cancel', async () => {
  useWorkoutStore.getState().setExercises([squat])
  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(SearchExerciseScreen))
  })

  const list = renderer.root.findByType('ExerciseList')
  await act(async () => list.props.onExerciseSelect(run))
  expect(useWorkoutStore.getState().selectedExercises).toEqual([squat])
  expect(renderer.root.findByType('ExerciseList').props.selectedExerciseIds.has('run')).toBe(true)

  const options = renderer.root.findByType('Screen').props.options
  const cancel = options.headerRight()
  await act(async () => cancel.props.onPress())
  expect(mockRouter.back).toHaveBeenCalledTimes(1)
  expect(useWorkoutStore.getState().selectedExercises).toEqual([squat])
  await act(async () => renderer.unmount())
})

test('Done applies selected exercises in picker order to the edit draft', async () => {
  mockParams.ctx = 'edit'
  useEditWorkoutStore.getState().setExercises([squat])
  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(SearchExerciseScreen))
  })
  await act(async () => renderer.root.findByType('ExerciseList').props.onExerciseSelect(run))

  const done = renderer.root
    .findAllByType('Button')
    .find((button) => button.props.accessibilityLabel === 'Done, 2 selected')
  await act(async () => done.props.onPress())
  expect(useEditWorkoutStore.getState().selectedExercises.map((exercise) => exercise.id)).toEqual([
    'squat',
    'run',
  ])
  expect(mockRouter.back).toHaveBeenCalledTimes(1)
  await act(async () => renderer.unmount())
})
