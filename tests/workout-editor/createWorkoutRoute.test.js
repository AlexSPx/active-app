const mockReact = require('react')
const { act, create } = require('react-test-renderer')

const mockCreateWorkout = jest.fn()
let mockWorkout = null
const mockWorkouts = new Map()
const mockWorkoutQueries = new Map()
const mockWorkoutIds = []
const mockIdMap = new Map()
const mockRemapListeners = new Set()
const mockEditorLifecycle = { mounts: 0, unmounts: 0 }
const mockOnIdRemap = jest.fn((listener) => {
  mockRemapListeners.add(listener)
  return () => mockRemapListeners.delete(listener)
})
const mockResolveId = jest.fn((_table, id) => mockIdMap.get(id) ?? id)
const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  setParams: jest.fn((params) => Object.assign(mockParams, params)),
}
const mockParams = {}

jest.mock('expo-router', () => ({
  Stack: { Screen: 'Screen' },
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}))
jest.mock('../../features/workouts', () => ({
  useWorkoutStore: jest.requireActual('../../features/workouts/stores/createWorkoutStore')
    .useWorkoutStore,
  useWorkout: (id) => {
    mockWorkoutIds.push(id)
    return (
      mockWorkoutQueries.get(id) ?? {
        workout: mockWorkouts.get(id) ?? mockWorkout,
        loading: false,
        error: null,
      }
    )
  },
  useWorkoutMutations: () => ({ createWorkout: mockCreateWorkout }),
}))
jest.mock('../../lib/sync', () => ({
  syncEngine: { onIdRemap: mockOnIdRemap, resolveId: mockResolveId },
}))
jest.mock('../../features/workouts/components/WorkoutDraftEditor', () => ({
  WorkoutDraftEditor: (props) => {
    const [name, setName] = mockReact.useState(props.initialName)
    const [notes, setNotes] = mockReact.useState(props.initialNotes)
    mockReact.useEffect(() => {
      mockEditorLifecycle.mounts += 1
      return () => {
        mockEditorLifecycle.unmounts += 1
      }
    }, [])
    mockReact.useEffect(() => {
      setName(props.initialName)
      setNotes(props.initialNotes)
    }, [props.initialName, props.initialNotes])
    return mockReact.createElement('WorkoutDraftEditor', {
      ...props,
      draftName: name,
      draftNotes: notes,
      setDraftName: setName,
      setDraftNotes: setNotes,
    })
  },
}))
jest.mock('../../components/ui', () => ({
  Button: 'Button',
  ErrorDisplay: 'ErrorDisplay',
  LoadingSpinner: 'LoadingSpinner',
  UiText: 'UiText',
}))

const { useWorkoutStore } = require('../../features/workouts/stores/createWorkoutStore')
const NewWorkoutScreen = require('../../app/workouts/new').default

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  useWorkoutStore.getState().reset()
  mockWorkout = null
  mockWorkouts.clear()
  mockWorkoutQueries.clear()
  mockWorkoutIds.length = 0
  mockIdMap.clear()
  mockRemapListeners.clear()
  mockEditorLifecycle.mounts = 0
  mockEditorLifecycle.unmounts = 0
  delete mockParams.duplicateId
  delete mockParams.returnTo
  jest.clearAllMocks()
  mockResolveId.mockImplementation((_table, id) => mockIdMap.get(id) ?? id)
})

test('a failed create keeps the draft and a retry can save it', async () => {
  const exercise = {
    id: 'squat',
    name: 'Squat',
    category: 'STRENGTH',
    sets: [{ weight: 60, reps: 8 }],
  }
  mockCreateWorkout.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'new' })

  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(NewWorkoutScreen))
  })
  await act(async () => {
    useWorkoutStore.getState().setExercises([exercise])
  })

  let draft = renderer.root.findByType('WorkoutDraftEditor')
  await act(async () => {
    await draft.props.onSave('Leg day', '')
  })

  draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(draft.props.error).toBe('Failed to create workout: offline')
  expect(draft.props.saving).toBe(false)
  expect(useWorkoutStore.getState().selectedExercises).toEqual([exercise])

  await act(async () => {
    await draft.props.onSave('Leg day', '')
  })
  expect(mockCreateWorkout).toHaveBeenCalledTimes(2)
  expect(useWorkoutStore.getState().selectedExercises).toEqual([])
  expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(workouts)')
  await act(async () => renderer.unmount())
})

test('copying a workout starts a new draft with its ordered targets and a copy name', async () => {
  mockWorkout = {
    id: 'source',
    title: 'Strength day',
    notes: 'Keep it steady.',
    workoutTemplate: {
      exercises: [
        {
          exerciseId: 'squat',
          exerciseTitle: 'Squat',
          category: 'STRENGTH',
          reps: [8, 6],
          weight: [60, 70],
          primaryMuscles: ['quads'],
          secondaryMuscles: [],
        },
        {
          exerciseId: 'run',
          exerciseTitle: 'Run',
          category: 'CARDIO',
          durationSeconds: [600],
          primaryMuscles: [],
          secondaryMuscles: [],
        },
      ],
    },
  }
  mockParams.duplicateId = 'source'

  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(NewWorkoutScreen))
  })
  const draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(draft.props.initialName).toBe('Strength day copy')
  expect(draft.props.initialNotes).toBe('Keep it steady.')
  expect(draft.props.exercises.map((exercise) => exercise.id)).toEqual(['squat', 'run'])
  expect(draft.props.exercises[0].sets).toEqual([
    { reps: 8, weight: 60 },
    { reps: 6, weight: 70 },
  ])
  expect(draft.props.exercises[1].sets).toEqual([
    { reps: null, weight: null, durationSeconds: 600 },
  ])
  await act(async () => renderer.unmount())
})

test('a duplicate waits for its first loaded source before showing the editor', async () => {
  mockParams.duplicateId = 'source'
  mockWorkoutQueries.set('source', { workout: null, loading: true, error: null })

  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(NewWorkoutScreen))
  })
  expect(renderer.root.findByType('LoadingSpinner')).toBeTruthy()
  expect(renderer.root.findAllByType('WorkoutDraftEditor')).toHaveLength(0)

  mockWorkoutQueries.set('source', {
    workout: {
      id: 'source',
      title: 'Stale source',
      notes: '',
      workoutTemplate: { exercises: [] },
    },
    loading: false,
    error: 'offline',
  })
  await act(async () => renderer.update(mockReact.createElement(NewWorkoutScreen)))
  expect(renderer.root.findByType('ErrorDisplay')).toBeTruthy()
  expect(renderer.root.findAllByType('WorkoutDraftEditor')).toHaveLength(0)

  mockWorkoutQueries.set('source', {
    workout: {
      id: 'source',
      title: 'Strength day',
      notes: '',
      workoutTemplate: { exercises: [] },
    },
    loading: false,
    error: null,
  })
  await act(async () => renderer.update(mockReact.createElement(NewWorkoutScreen)))
  expect(renderer.root.findByType('WorkoutDraftEditor').props.initialName).toBe('Strength day copy')
  await act(async () => renderer.unmount())
})

test('a source ID remap keeps an edited duplicate draft and reloads by duplicateId', async () => {
  const sourceWorkout = (id, title, notes, reps, weight) => ({
    id,
    title,
    notes,
    workoutTemplate: {
      exercises: [
        {
          exerciseId: 'squat',
          exerciseTitle: 'Squat',
          category: 'STRENGTH',
          reps: [reps],
          weight: [weight],
          primaryMuscles: ['quads'],
          secondaryMuscles: [],
        },
      ],
    },
  })
  mockParams.duplicateId = 'local-source'
  mockWorkouts.set(
    'local-source',
    sourceWorkout('local-source', 'Local source', 'Source notes', 8, 60)
  )
  mockWorkouts.set(
    'server-source',
    sourceWorkout('server-source', 'Server source', 'New notes', 12, 90)
  )

  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(NewWorkoutScreen))
  })
  let draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(draft.props.initialName).toBe('Local source copy')
  expect(draft.props.initialNotes).toBe('Source notes')

  await act(async () => {
    draft.props.setDraftName('My duplicate')
    draft.props.setDraftNotes('My notes')
    useWorkoutStore.getState().addSetToExercise('squat')
  })
  draft = renderer.root.findByType('WorkoutDraftEditor')
  const modifiedExercises = useWorkoutStore.getState().selectedExercises
  expect(modifiedExercises[0].sets).toHaveLength(2)

  mockIdMap.set('local-source', 'server-source')
  mockWorkoutQueries.set('server-source', { workout: null, loading: true, error: null })
  await act(async () => {
    for (const listener of mockRemapListeners) {
      listener('workouts', 'local-source', 'server-source')
    }
    renderer.update(mockReact.createElement(NewWorkoutScreen))
  })

  draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(mockRouter.setParams).toHaveBeenCalledWith({ duplicateId: 'server-source' })
  expect(mockRouter.setParams).not.toHaveBeenCalledWith({ id: 'server-source' })
  expect(mockWorkoutIds.at(-1)).toBe('server-source')
  expect(draft.props.initialName).toBe('Local source copy')
  expect(draft.props.initialNotes).toBe('Source notes')
  expect(draft.props.draftName).toBe('My duplicate')
  expect(draft.props.draftNotes).toBe('My notes')
  expect(useWorkoutStore.getState().selectedExercises).toEqual(modifiedExercises)

  expect(mockEditorLifecycle.mounts).toBe(1)
  expect(mockEditorLifecycle.unmounts).toBe(0)
  expect(draft.props.saving).toBe(false)

  mockWorkoutQueries.set('server-source', { workout: null, loading: false, error: 'offline' })
  await act(async () => renderer.update(mockReact.createElement(NewWorkoutScreen)))
  draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(draft.props.error).toContain('Unable to refresh the source workout: offline')
  expect(draft.props.draftName).toBe('My duplicate')
  expect(draft.props.draftNotes).toBe('My notes')
  expect(useWorkoutStore.getState().selectedExercises).toEqual(modifiedExercises)
  expect(mockEditorLifecycle.mounts).toBe(1)
  expect(mockEditorLifecycle.unmounts).toBe(0)

  mockWorkoutQueries.set('server-source', {
    workout: mockWorkouts.get('server-source'),
    loading: false,
    error: null,
  })
  await act(async () => renderer.update(mockReact.createElement(NewWorkoutScreen)))
  draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(draft.props.error).toBe(null)
  expect(draft.props.initialName).toBe('Local source copy')
  expect(draft.props.initialNotes).toBe('Source notes')
  expect(draft.props.draftName).toBe('My duplicate')
  expect(draft.props.draftNotes).toBe('My notes')
  expect(useWorkoutStore.getState().selectedExercises).toEqual(modifiedExercises)
  expect(mockEditorLifecycle.mounts).toBe(1)
  expect(mockEditorLifecycle.unmounts).toBe(0)
  await act(async () => renderer.unmount())
  expect(mockEditorLifecycle.unmounts).toBe(1)
})
