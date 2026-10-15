jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))

const { Platform } = require('react-native')
const { launchFacade } = require('../../features/launch/launchFacade')

const exercise = {
  exerciseName: 'Bench press',
  reps: [10],
  weight: [40],
  achievedOneRmValue: 60,
  achievedOneRmSetIndex: 0,
  achievedTotalVolumeValue: 400,
}
const record = { exerciseRecords: [exercise] }
const user = {
  notificationFrequency: 2,
  notificationPreferences: { schedule: [] },
  streak: { weeklyCompletedWorkoutIds: ['workout-1'] },
}
const widgets = [
  { id: 'later', position: 2 },
  { id: 'first', position: 1 },
]

afterEach(() => {
  Platform.OS = 'android'
})

it.each(['android', 'ios'])(
  'omits unavailable training features on %s without changing cached data',
  (platform) => {
    Platform.OS = platform
    const training = launchFacade.training

    expect(training.getWidgets(widgets)).toBeNull()
    expect(training.getReminderFrequency(user)).toBeNull()
    expect(training.getWeeklyCompletion(user)).toBeNull()
    expect(training.getExerciseAchievements(exercise)).toEqual([])
    expect(training.getWorkoutAchievements(record)).toEqual([])
    expect(exercise.achievedOneRmValue).toBe(60)
    expect(user.streak.weeklyCompletedWorkoutIds).toEqual(['workout-1'])
  }
)

it('retains connected training features and explicit reminder Off on web', () => {
  Platform.OS = 'web'
  const training = launchFacade.training

  expect(training.getWidgets(widgets).map((widget) => widget.id)).toEqual(['first', 'later'])
  expect(widgets.map((widget) => widget.id)).toEqual(['later', 'first'])
  expect(training.getReminderFrequency(user)).toBe(0)
  expect(training.getReminderFrequency(null)).toBe(1)
  expect(training.getWeeklyCompletion(user)).toEqual(['workout-1'])
  expect(training.getWeeklyCompletion(null)).toEqual([])
  const achievements = [
    { type: '1RM', value: 60, exercise: 'Bench press', setIndex: 0 },
    { type: 'VOLUME', value: 400, exercise: 'Bench press' },
  ]
  expect(training.getExerciseAchievements(exercise)).toEqual(achievements)
  expect(training.getWorkoutAchievements(record)).toEqual(achievements)
  expect(training.getExerciseAchievements({ exerciseName: 'Run' })).toEqual([])
})
