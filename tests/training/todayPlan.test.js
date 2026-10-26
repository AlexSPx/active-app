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
    appearance: {
      light: { paper: '#e8dff2', ink: '#39294e', panel: '#d7c5e8' },
      dark: { paper: '#33293f', panel: '#4e3a62' },
    },
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

it('shows the current cycle day, including rest days, and wraps on the next cycle', () => {
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 29)).progress).toEqual({
    label: 'Day 2 of 3',
    value: 2 / 3,
  })
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 30)).progress).toEqual({
    label: 'Day 3 of 3',
    value: 1,
  })
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 31)).progress).toEqual({
    label: 'Day 1 of 3',
    value: 1 / 3,
  })
  expect(getTodayPlan(null, workouts, new Date(2026, 2, 29)).progress).toBeNull()
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 27)).progress).toBeNull()
})

it('counts each required workout once this local week and resets next Monday', () => {
  const flexible = {
    ...routine,
    routineType: 'WEEKLY_COMPLETION',
    pattern: [...routine.pattern, routine.pattern[0]],
  }
  const records = [
    { workoutId: 'upper', createdAt: new Date(2026, 2, 23, 0, 0).toISOString() },
    { workoutId: 'upper', createdAt: new Date(2026, 2, 25, 12, 0).toISOString() },
    { workoutId: 'lower', createdAt: new Date(2026, 2, 22, 23, 59).toISOString() },
    { workoutId: 'lower', createdAt: new Date(2026, 2, 30, 0, 0).toISOString() },
    { workoutId: 'other', createdAt: new Date(2026, 2, 28, 12, 0).toISOString() },
    { workoutId: 'lower', createdAt: 'invalid date' },
  ]
  expect(getTodayPlan(flexible, workouts, new Date(2026, 2, 29), records).progress).toEqual({
    label: '1 of 2 workouts this week',
    value: 0.5,
  })
  const timeline = buildTodayPlanTimeline(
    flexible,
    workouts,
    new Date(2026, 2, 29, 12),
    records.slice(0, 3)
  )
  expect(timeline[0].props.progress.value).toBe(0.5)
  expect(timeline[1].props.progress).toEqual({ label: '0 of 2 workouts this week', value: 0 })
})

it('keeps unknown history and empty weekly plans distinct from zero completed workouts', () => {
  const flexible = { ...routine, routineType: 'WEEKLY_COMPLETION' }
  const date = new Date(2026, 2, 28)
  expect(getTodayPlan(flexible, workouts, date, null).progress).toEqual({
    label: 'Progress unavailable',
    value: null,
  })
  expect(getTodayPlan(flexible, workouts, date, []).progress).toEqual({
    label: '0 of 2 workouts this week',
    value: 0,
  })
  expect(getTodayPlan({ ...flexible, pattern: [] }, workouts, date, []).progress).toEqual({
    label: 'No workouts in this routine',
    value: null,
  })
})

it('provides a structured cycle counter for the split panel without inventing weekly cycle days', () => {
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 29)).cycle).toEqual({
    current: 2,
    total: 3,
  })
  expect(getTodayPlan(routine, workouts, new Date(2026, 2, 31)).cycle).toEqual({
    current: 1,
    total: 3,
  })
  expect(
    getTodayPlan(
      { ...routine, routineType: 'WEEKLY_COMPLETION' },
      workouts,
      new Date(2026, 2, 29),
      []
    ).cycle
  ).toBeNull()
  expect(getTodayPlan(null, workouts, new Date(2026, 2, 29)).cycle).toBeNull()
})
