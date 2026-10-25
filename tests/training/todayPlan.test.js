const {
  getTodayPlan,
  buildTodayPlanTimeline,
} = require('../../features/training/widgets/todayPlan')

const routine = {
  id: 'cycle 1',
  name: 'Strength cycle',
  startDate: '2026-03-28',
  routineType: 'SEQUENTIAL',
  pattern: [
    { dayType: 'WORKOUT', workoutId: 'upper' },
    { dayType: 'REST', workoutId: null },
    { dayType: 'WORKOUT', workoutId: 'lower' },
  ],
}
const workouts = [
  { id: 'upper', title: 'Upper body' },
  { id: 'lower', title: 'Lower body' },
]

it('shows the planned workout and rest day from a repeating routine', () => {
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 28))).toMatchObject({
    dateLabel: 'Sat, Mar 28',
    title: 'Upper body',
    detail: 'Strength cycle',
  })
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 29)).title).toBe('Rest day')
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 30)).title).toBe('Lower body')
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 31)).title).toBe('Upper body')
})

it('invites the user to choose a routine when none is active', () => {
  expect(getTodayPlan(null, workouts, new Date(2026, 2, 28))).toMatchObject({
    dateLabel: 'Sat, Mar 28',
    kind: 'empty',
    title: 'No routine',
    detail: 'Make room for your next goal',
    actionLabel: 'Choose routine',
    url: 'activenext://routines',
  })
})

it('does not invent scheduled workouts for flexible, future or empty routines', () => {
  const date = new Date(2026, 2, 28)
  expect(getTodayPlan({ ...routine, routineType: 'WEEKLY_COMPLETION' }, workouts, date).title).toBe(
    'Choose a workout'
  )
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 27)).title).toBe('Routine starts soon')
  expect(getTodayPlan({ ...routine, pattern: [] }, workouts, date).title).toBe('No workout planned')
  expect(getTodayPlan(routine, [], date).title).toBe('Workout unavailable')
})

it('schedules local midnights across daylight saving and expires stale plans', () => {
  const timeline = buildTodayPlanTimeline(routine, workouts, new Date(2026, 2, 28, 16, 30))
  expect(timeline).toHaveLength(31)
  expect(
    timeline.slice(0, 4).map(({ date, props }) => [date.getDate(), date.getHours(), props.title])
  ).toEqual([
    [28, 16, 'Upper body'],
    [29, 0, 'Rest day'],
    [30, 0, 'Lower body'],
    [31, 0, 'Upper body'],
  ])
  expect(timeline[30]).toMatchObject({
    date: new Date(2026, 3, 27),
    props: {
      dateLabel: "Today's plan",
      title: 'Refresh your plan',
      detail: 'Open Active to see your latest routine.',
    },
  })
})

it('distinguishes training and recovery, with the correct footer destination and palette', () => {
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 28))).toMatchObject({
    kind: 'training',
    actionLabel: 'View workout',
    url: 'activenext://workouts/upper',
    appearance: { light: { paper: '#e3d7ee', ink: '#2d2235' }, dark: { paper: '#493656' } },
  })
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 29))).toMatchObject({
    kind: 'rest',
    title: 'Rest day',
    detail: 'Take time to recover',
    actionLabel: 'View routine',
    url: 'activenext://routines/cycle%201',
    appearance: { light: { paper: '#eee6f3' }, dark: { paper: '#382b42' } },
  })
})
