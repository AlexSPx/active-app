jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../lib/db/connection', () => ({ getDatabase: jest.fn() }))
jest.mock('../../lib/repositories/WorkoutRepository', () => ({ WorkoutRepository: jest.fn() }))
jest.mock('../../lib/sync', () => ({
  syncEngine: { resolveId: jest.fn((_table, id) => id) },
}))
jest.mock('../../utils/haptics', () => ({ haptics: { success: jest.fn() } }))
jest.mock('../../services/posthog', () => ({ posthog: { capture: jest.fn() } }))

const AsyncStorage = require('@react-native-async-storage/async-storage')
const { getDatabase } = require('../../lib/db/connection')
const { WorkoutRepository } = require('../../lib/repositories/WorkoutRepository')
const { syncEngine } = require('../../lib/sync')
const {
  useRunningWorkoutStore,
  remapRunningWorkoutId,
} = require('../../features/workout-session/stores/runningWorkoutStore')

describe('running workout ID remapping', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await useRunningWorkoutStore.persist.clearStorage()
    await useRunningWorkoutStore.persist.rehydrate()
    await useRunningWorkoutStore.persist.clearStorage()
    syncEngine.resolveId.mockImplementation((_table, id) => id)
    useRunningWorkoutStore.setState({
      runningWorkout: {
        id: 'local_workout_active',
        name: 'Workout',
        startTime: '2026-09-26T10:00:00.000Z',
        exercises: [],
        currentExerciseIndex: 0,
        completedExercises: 0,
      },
      isRecording: false,
      recordingError: null,
    })
  })

  it('records against the current server ID after the workout is remapped', async () => {
    const result = { workoutRecord: { id: 'record_1' }, streakUpdate: {} }
    const recordWorkout = jest.fn(async () => result)
    getDatabase.mockImplementation(async () => {
      remapRunningWorkoutId('local_workout_active', 'server_workout_active')
      return {}
    })
    WorkoutRepository.mockImplementation(() => ({ recordWorkout }))

    await useRunningWorkoutStore.getState().stopWorkout()

    expect(recordWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ workoutId: 'server_workout_active' }),
      'Workout'
    )
  })

  it('keeps the session and records a retryable error when saving fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('FOREIGN KEY constraint failed')
    getDatabase.mockResolvedValue({})
    WorkoutRepository.mockImplementation(() => ({
      recordWorkout: jest.fn().mockRejectedValue(error),
    }))

    try {
      await useRunningWorkoutStore.getState().stopWorkout()

      expect(useRunningWorkoutStore.getState().runningWorkout.id).toBe('local_workout_active')
      expect(useRunningWorkoutStore.getState().recordingError).toBe(error.message)
      expect(useRunningWorkoutStore.getState().isRecording).toBe(false)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('ignores repeated Finish calls while a save is in progress', async () => {
    let resolveRecord
    const result = { workoutRecord: { id: 'record_once' }, streakUpdate: {} }
    const recordWorkout = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveRecord = resolve
        })
    )
    getDatabase.mockResolvedValue({})
    WorkoutRepository.mockImplementation(() => ({ recordWorkout }))

    const firstFinish = useRunningWorkoutStore.getState().stopWorkout()
    const secondFinish = useRunningWorkoutStore.getState().stopWorkout()
    await Promise.resolve()
    await Promise.resolve()

    expect(recordWorkout).toHaveBeenCalledTimes(1)
    await expect(secondFinish).resolves.toBeUndefined()
    resolveRecord(result)
    await expect(firstFinish).resolves.toEqual(result)
    expect(useRunningWorkoutStore.getState().runningWorkout).toBeNull()
  })

  it('resolves a persisted session when sync replays its ID remap after hydration', async () => {
    await useRunningWorkoutStore.persist.clearStorage()
    const workout = {
      id: 'local_workout_active',
      name: 'Workout',
      startTime: '2026-09-26T10:00:00.000Z',
      exercises: [],
      currentExerciseIndex: 0,
      completedExercises: 0,
    }
    await AsyncStorage.setItem(
      'running-workout-storage',
      JSON.stringify({ state: { runningWorkout: workout, recordingError: null }, version: 0 })
    )
    syncEngine.resolveId.mockReturnValueOnce('server_workout_active')

    await useRunningWorkoutStore.persist.rehydrate()
    const restoredWorkout = useRunningWorkoutStore.getState().runningWorkout
    expect(restoredWorkout.id).toBe('local_workout_active')

    const resolvedId = syncEngine.resolveId('workouts', restoredWorkout.id)
    if (resolvedId !== restoredWorkout.id) {
      remapRunningWorkoutId(restoredWorkout.id, resolvedId)
    }

    expect(useRunningWorkoutStore.getState().runningWorkout.id).toBe('server_workout_active')
  })
})
