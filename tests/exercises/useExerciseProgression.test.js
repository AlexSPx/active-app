jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))
jest.mock('../../lib/hooks/useRepository', () => ({
  useExerciseRepository: jest.fn(),
  useWorkoutRepository: jest.fn(),
}))
jest.mock('../../lib/hooks/useProfileQueryKeys', () => ({ useProfileQueryKeys: jest.fn() }))
jest.mock('../../services/apiService', () => ({ apiService: { getExerciseLogs: jest.fn() } }))
jest.mock('../../lib/sync', () => ({
  syncEngine: {
    enqueue: jest.fn(async () => undefined),
    scheduleQueueProcessing: jest.fn(),
    withIdRemapLock: jest.fn((operation) => operation()),
    resolveId: jest.fn((_table, id) => id),
  },
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { QueryClient, QueryClientProvider, onlineManager } = require('@tanstack/react-query')
const { Platform } = require('react-native')
const { useExerciseRepository, useWorkoutRepository } = require('../../lib/hooks/useRepository')
const { useProfileQueryKeys } = require('../../lib/hooks/useProfileQueryKeys')
const { useExerciseProgression } = require('../../features/exercises/hooks/useExerciseProgression')
const { ExerciseRepository } = require('../../lib/repositories/ExerciseRepository')
const { WorkoutRepository } = require('../../lib/repositories/WorkoutRepository')
const { workoutRecordsArraySchema } = require('../../lib/schemas/api')
const { apiService } = require('../../services/apiService')
const { queryKeys } = require('../../lib/queryKeys')
const { FakeDb } = require('../helpers/syncTestUtils')
const exerciseId = 'local:exercise:Barbell_Bench_Press_-_Medium_Grip'
const exerciseName = 'Barbell Bench Press - Medium Grip'
const renderers = []
const clients = []
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

function renderProgression(id = exerciseId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  let state
  function Probe() {
    state = useExerciseProgression(id, exerciseName)
    return null
  }
  let renderer
  act(() => {
    renderer = create(
      React.createElement(QueryClientProvider, { client }, React.createElement(Probe))
    )
  })
  renderers.push(renderer)
  return { client, renderer, Probe, state: () => state }
}

beforeEach(() => {
  jest.clearAllMocks()
  Platform.OS = 'android'
  useExerciseRepository.mockReturnValue(new ExerciseRepository())
  useProfileQueryKeys.mockReturnValue(queryKeys.forOwner('local'))
})
afterEach(() => {
  act(() => renderers.splice(0).forEach((renderer) => renderer.unmount()))
  clients.splice(0).forEach((client) => client.clear())
  onlineManager.setOnline(true)
})

it.each([
  ['android', exerciseId],
  ['ios', exerciseId],
  ['android', '8bb49c10-479d-4cdc-bbe6-5ac3ce75661b'],
])('charts completed local and legacy history while offline on %s for %s', async (platform, id) => {
  const exerciseId = id
  Platform.OS = platform
  onlineManager.setOnline(false)
  const repo = new WorkoutRepository(new FakeDb())
  useWorkoutRepository.mockReturnValue(repo)
  const workout = await repo.create(
    { title: 'Upper', template: { exercises: [{ exerciseId, reps: [5, 8], weight: [45, 40] }] } },
    [
      {
        id: exerciseId,
        name: exerciseName,
        category: 'STRENGTH',
        primaryMuscles: [],
        secondaryMuscles: [],
      },
    ]
  )
  await repo.hydrateRecords([
    {
      id: 'legacy',
      workoutId: workout.id,
      workoutTitle: 'Upper',
      createdAt: '2026-09-01T12:00:00Z',
      exerciseRecords: [
        {
          exerciseName: id.startsWith('local:') ? ` ${exerciseName.toLowerCase()} ` : id,
          reps: [8, 10],
          weight: [40, 35],
        },
        { exerciseId: 'different-exercise', exerciseName, reps: [10], weight: [150] },
      ],
    },
    {
      id: 'deleted',
      workoutId: workout.id,
      workoutTitle: 'Upper',
      createdAt: '2026-09-02T12:00:00Z',
      exerciseRecords: [{ exerciseName, reps: [10], weight: [200] }],
    },
  ])
  await repo.deleteRecord('deleted')
  const view = renderProgression(id)
  await act(settle)
  expect(view.state().data.maxWeightProgression.map((point) => point.value)).toEqual([40])
  const saved = await repo.recordWorkout(
    {
      workoutId: workout.id,
      startTime: '2026-10-15T12:00:00Z',
      exerciseRecords: [{ exerciseId, reps: [5, 8], weight: [45, 40] }],
    },
    'Upper'
  )
  const persisted = workoutRecordsArraySchema.parse(await repo.getAllRecords())
  expect(
    persisted.find((record) => record.id === saved.workoutRecord.id).exerciseRecords[0]
  ).toMatchObject({ exerciseId, weight: [45, 40], reps: [5, 8] })

  await act(async () => {
    await view.client.invalidateQueries({ queryKey: queryKeys.forOwner('local').records.all })
    await settle()
  })
  expect(view.state().error).toBeNull()
  const data = view.state().data
  expect(data.exerciseName).toBe(exerciseName)
  expect(data.maxWeightProgression.map((point) => point.value)).toEqual([40, 45])
  expect(data.volumeProgression.map((point) => point.value)).toEqual([670, 545])
  expect(data.oneRmProgression.map((point) => point.value)).toEqual([50.7, 52.5])
  expect(data.personalRecords).toEqual({ oneRm: 52.5, volume: 670, maxWeight: 45 })
  expect(data.lastWorkout.exerciseId).toBe(exerciseId)
  expect(data.maxWeightProgression[0].date).toBe('2026-09-01')

  await act(async () => {
    await repo.deleteRecord(saved.workoutRecord.id)
    await view.client.invalidateQueries({ queryKey: queryKeys.forOwner('local').records.all })
    await settle()
  })
  expect(view.state().data.maxWeightProgression.map((point) => point.value)).toEqual([40])

  useWorkoutRepository.mockReturnValue(new WorkoutRepository(new FakeDb()))
  useProfileQueryKeys.mockReturnValue(queryKeys.forOwner('other-profile'))
  await act(async () => {
    view.renderer.update(
      React.createElement(
        QueryClientProvider,
        { client: view.client },
        React.createElement(view.Probe)
      )
    )
    await settle()
  })
  await act(settle)
  expect(view.state().data).toBeNull()
  expect(view.state().error).toBe('No exercise data available')
  expect(apiService.getExerciseLogs).not.toHaveBeenCalled()
})

it('keeps web progression on the existing API and query key', async () => {
  Platform.OS = 'web'
  const remoteLogs = [
    {
      exerciseRecordId: 'remote',
      exerciseId: 'remote-id',
      exerciseName,
      createdAt: '2026-10-01T12:00:00Z',
      reps: [5],
      weight: [60],
    },
  ]
  apiService.getExerciseLogs.mockResolvedValue(remoteLogs)
  const localRepo = { getAllRecords: jest.fn() }
  useWorkoutRepository.mockReturnValue(localRepo)
  const view = renderProgression('remote-id')
  await act(settle)
  expect(apiService.getExerciseLogs).toHaveBeenCalledWith('remote-id')
  expect(view.state().data.personalRecords.maxWeight).toBe(60)
  expect(view.client.getQueryData(queryKeys.forOwner('local').exercises.logs('remote-id'))).toEqual(
    view.state().data
  )
  expect(localRepo.getAllRecords).not.toHaveBeenCalled()
})
