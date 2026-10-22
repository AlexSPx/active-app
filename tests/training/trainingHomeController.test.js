jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('../../features/routines', () => ({
  useActiveRoutine: () => ({ activeRoutine: global.__homeRoutine, loading: false }),
  useRoutines: () => ({ routines: [], loading: false }),
}))
jest.mock('../../features/workouts', () => ({
  useWorkouts: () => ({ workouts: [{ id: 'strength', title: 'Strength' }], loading: false }),
  useWorkoutRecords: () => ({ workoutRecords: [], loading: false, error: null }),
  useWorkoutManagement: () => ({ isWorkoutRunning: () => false }),
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const {
  useTrainingHomeController,
} = require('../../features/training/hooks/useTrainingHomeController')

let home
let renderer
function Harness() {
  home = useTrainingHomeController()
  return null
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 22, 12))
  global.__homeRoutine = {
    name: 'Alternating cycle',
    routineType: 'SEQUENTIAL',
    startDate: '2026-10-19',
    pattern: [
      { dayType: 'WORKOUT', workoutId: 'strength' },
      { dayType: 'REST', workoutId: null },
    ],
  }
})

afterEach(() => {
  act(() => renderer.unmount())
  jest.useRealTimers()
  delete global.__homeRoutine
})

it('projects the repeating cycle into next week and selects its training and rest sessions', () => {
  act(() => {
    renderer = create(React.createElement(Harness))
  })
  const days = home.state.weekPlan.days
  expect(days).toHaveLength(14)
  expect(days[0].date).toEqual(new Date(2026, 9, 19))
  expect(days[13].date).toEqual(new Date(2026, 10, 1))
  expect(days[7].kind).toBe('rest')
  expect(days[8].kind).toBe('scheduled')

  act(() => home.selectDate(days[8].date))
  expect(home.state.selectedSession).toEqual({
    kind: 'scheduled',
    date: days[8].date,
    workout: { id: 'strength', title: 'Strength' },
  })
  expect(home.state.weekPlan.days.filter((day) => day.isSelected).map((day) => day.date)).toEqual([
    days[8].date,
  ])

  act(() => home.selectDate(days[7].date))
  expect(home.state.selectedSession).toEqual({ kind: 'rest', date: days[7].date })
})

it('keeps setup to the current seven days', () => {
  global.__homeRoutine = null
  act(() => {
    renderer = create(React.createElement(Harness))
  })
  expect(home.state.weekPlan.kind).toBe('setup')
  expect(home.state.weekPlan.days).toHaveLength(7)
})

it('keeps flexible routines as an undated workout list', () => {
  global.__homeRoutine.routineType = 'WEEKLY_COMPLETION'
  act(() => {
    renderer = create(React.createElement(Harness))
  })
  expect(home.state.weekPlan.kind).toBe('flexible')
  expect(home.state.weekPlan.workouts.map(({ id }) => id)).toEqual(['strength'])
  expect(home.state.selectedSession).toBeNull()
})
