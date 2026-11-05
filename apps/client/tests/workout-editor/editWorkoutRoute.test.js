const mockReact = require('react')
const { act, create } = require('react-test-renderer')

const mockUpdateWorkout = jest.fn()
const mockWorkout = {
  id: 'server-workout',
  title: 'Strength day',
  notes: '',
  workoutTemplate: {
    exercises: [
      {
        exerciseId: 'squat',
        exerciseTitle: 'Squat',
        category: 'STRENGTH',
        reps: [8],
        weight: [60],
        primaryMuscles: [],
        secondaryMuscles: [],
      },
    ],
  },
}
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), setParams: jest.fn() }
const mockParams = { id: 'local-workout' }
const mockWorkoutQueries = new Map()
const mockWorkoutIds = []
const mockIdMap = new Map()
const mockEditorLifecycle = { mounts: 0, unmounts: 0 }
const mockResolveId = jest.fn((_table, id) => mockIdMap.get(id) ?? id)

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}))
jest.mock('../../features/workouts', () => ({
  useEditWorkoutStore: jest.requireActual('../../features/workouts/stores/editWorkoutStore')
    .useEditWorkoutStore,
  useWorkout: (id) => {
    mockWorkoutIds.push(id)
    return mockWorkoutQueries.get(id) ?? { workout: mockWorkout, loading: false, error: null }
  },
  useWorkoutMutations: () => ({ updateWorkout: mockUpdateWorkout }),
}))
jest.mock('../../features/workouts/hooks/useWorkoutIdRemap', () => ({
  useWorkoutIdRemap: jest.fn(),
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
jest.mock('../../components/ui/Controls', () => ({ Button: 'Button', UiText: 'UiText' }))
jest.mock('../../lib/sync', () => ({
  syncEngine: { resolveId: mockResolveId },
}))

const { useEditWorkoutStore } = require('../../features/workouts/stores/editWorkoutStore')
const EditWorkoutScreen = require('../../app/workouts/edit').default

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  useEditWorkoutStore.getState().reset()
  mockParams.id = 'server-workout'
  mockWorkoutQueries.clear()
  mockWorkoutIds.length = 0
  mockIdMap.clear()
  mockEditorLifecycle.mounts = 0
  mockEditorLifecycle.unmounts = 0
  jest.clearAllMocks()
  mockResolveId.mockImplementation((_table, id) => mockIdMap.get(id) ?? id)
})

test('edit save uses the loaded workout identity and retains changes after a failed save', async () => {
  mockResolveId.mockImplementation((_table, id) =>
    id === 'server-workout' ? 'canonical-workout' : id
  )
  mockUpdateWorkout.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(EditWorkoutScreen))
  })

  let draft = renderer.root.findByType('WorkoutDraftEditor')
  await act(async () => {
    await draft.props.onSave('Renamed workout', '')
  })

  draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(mockUpdateWorkout.mock.calls[0][0]).toBe('canonical-workout')
  expect(draft.props.error).toBe('Failed to update workout. Please try again.')
  expect(draft.props.saving).toBe(false)
  expect(useEditWorkoutStore.getState().selectedExercises).toHaveLength(1)

  await act(async () => {
    await draft.props.onSave('Renamed workout', '')
  })
  expect(mockUpdateWorkout).toHaveBeenCalledTimes(2)
  expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(workouts)')
  expect(useEditWorkoutStore.getState().selectedExercises).toEqual([])
  await act(async () => renderer.unmount())
})

test('edit waits for the first successful workout hydration before showing the editor', async () => {
  mockWorkoutQueries.set('server-workout', { workout: null, loading: true, error: null })

  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(EditWorkoutScreen))
  })
  expect(renderer.root.findByType('LoadingSpinner')).toBeTruthy()
  expect(renderer.root.findAllByType('WorkoutDraftEditor')).toHaveLength(0)

  mockWorkoutQueries.set('server-workout', {
    workout: mockWorkout,
    loading: false,
    error: 'offline',
  })
  await act(async () => renderer.update(mockReact.createElement(EditWorkoutScreen)))
  expect(renderer.root.findByType('ErrorDisplay')).toBeTruthy()
  expect(renderer.root.findAllByType('WorkoutDraftEditor')).toHaveLength(0)

  mockWorkoutQueries.set('server-workout', { workout: mockWorkout, loading: false, error: null })
  await act(async () => renderer.update(mockReact.createElement(EditWorkoutScreen)))
  expect(renderer.root.findByType('WorkoutDraftEditor').props.initialName).toBe('Strength day')
  await act(async () => renderer.unmount())
})

test('an edit draft stays mounted through remapped detail loading, error, and retry', async () => {
  const localWorkout = {
    ...mockWorkout,
    id: 'local-workout',
    title: 'Local workout',
    notes: 'Local notes',
  }
  const serverWorkout = {
    ...mockWorkout,
    id: 'server-workout',
    title: 'Server workout',
    notes: 'Server notes',
  }
  mockParams.id = 'local-workout'
  mockWorkoutQueries.set('local-workout', {
    workout: localWorkout,
    loading: false,
    error: null,
  })

  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(EditWorkoutScreen))
  })
  let draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(draft.props.initialName).toBe('Local workout')
  expect(draft.props.initialNotes).toBe('Local notes')

  await act(async () => {
    draft.props.setDraftName('My edited workout')
    draft.props.setDraftNotes('My edited notes')
    useEditWorkoutStore.getState().addSetToExercise('squat')
  })
  draft = renderer.root.findByType('WorkoutDraftEditor')
  const modifiedExercises = useEditWorkoutStore.getState().selectedExercises
  expect(modifiedExercises[0].sets).toHaveLength(2)

  mockIdMap.set('local-workout', 'server-workout')
  mockParams.id = 'server-workout'
  mockWorkoutQueries.set('server-workout', { workout: null, loading: true, error: null })
  await act(async () => renderer.update(mockReact.createElement(EditWorkoutScreen)))
  draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(draft.props.draftName).toBe('My edited workout')
  expect(draft.props.draftNotes).toBe('My edited notes')
  expect(draft.props.saving).toBe(false)
  expect(useEditWorkoutStore.getState().selectedExercises).toEqual(modifiedExercises)
  expect(mockEditorLifecycle.mounts).toBe(1)
  expect(mockEditorLifecycle.unmounts).toBe(0)

  mockWorkoutQueries.set('server-workout', { workout: null, loading: false, error: 'offline' })
  await act(async () => renderer.update(mockReact.createElement(EditWorkoutScreen)))
  draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(draft.props.error).toContain('Unable to refresh the workout: offline')
  expect(draft.props.draftName).toBe('My edited workout')
  expect(draft.props.draftNotes).toBe('My edited notes')
  expect(useEditWorkoutStore.getState().selectedExercises).toEqual(modifiedExercises)
  expect(mockEditorLifecycle.mounts).toBe(1)
  expect(mockEditorLifecycle.unmounts).toBe(0)

  mockWorkoutQueries.set('server-workout', {
    workout: serverWorkout,
    loading: false,
    error: null,
  })
  await act(async () => renderer.update(mockReact.createElement(EditWorkoutScreen)))
  draft = renderer.root.findByType('WorkoutDraftEditor')
  expect(draft.props.error).toBe(null)
  expect(draft.props.initialName).toBe('Local workout')
  expect(draft.props.initialNotes).toBe('Local notes')
  expect(draft.props.draftName).toBe('My edited workout')
  expect(draft.props.draftNotes).toBe('My edited notes')
  expect(useEditWorkoutStore.getState().selectedExercises).toEqual(modifiedExercises)
  expect(mockEditorLifecycle.mounts).toBe(1)
  expect(mockEditorLifecycle.unmounts).toBe(0)
  await act(async () => renderer.unmount())
  expect(mockEditorLifecycle.unmounts).toBe(1)
})

test('edit save uses the hydrated canonical ID while remapped detail is unavailable', async () => {
  mockIdMap.set('local-workout', 'server-workout')
  mockParams.id = 'local-workout'
  mockWorkoutQueries.set('local-workout', {
    workout: { ...mockWorkout, id: 'local-workout' },
    loading: false,
    error: null,
  })
  mockUpdateWorkout.mockResolvedValue(false)

  let renderer
  await act(async () => {
    renderer = create(mockReact.createElement(EditWorkoutScreen))
  })
  mockParams.id = 'server-workout'
  mockWorkoutQueries.set('server-workout', { workout: null, loading: true, error: null })
  await act(async () => renderer.update(mockReact.createElement(EditWorkoutScreen)))
  const draft = renderer.root.findByType('WorkoutDraftEditor')
  await act(async () => draft.props.onSave('Renamed workout', ''))

  expect(mockUpdateWorkout).toHaveBeenCalledWith(
    'server-workout',
    expect.objectContaining({ title: 'Renamed workout' }),
    useEditWorkoutStore.getState().selectedExercises
  )
  const updatedDraft = renderer.root.findByType('WorkoutDraftEditor')
  expect(updatedDraft.props.error).toBe('Failed to update workout. Please try again.')
  expect(updatedDraft.props.saving).toBe(false)
  await act(async () => renderer.unmount())
})
