jest.mock('expo', () => ({ requireOptionalNativeModule: () => global.__widgetAvailable }))
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: (_, listener) => {
      global.__widgetForeground = listener
      return { remove: jest.fn() }
    },
  },
}))
jest.mock('../../features/routines/hooks/useActiveRoutine', () => ({
  useActiveRoutine: () => ({ activeRoutine: global.__widgetRoutine, loading: false, error: null }),
}))
jest.mock('../../features/workouts/hooks/useWorkouts', () => ({
  useWorkouts: () => ({
    workouts: [{ id: 'upper', title: global.__widgetWorkoutTitle }],
    loading: false,
    error: null,
  }),
}))
jest.mock('../../features/workouts/hooks/useWorkoutRecords', () => ({
  useWorkoutRecords: () => ({
    workoutRecords: global.__widgetRecords,
    loading: false,
    error: global.__widgetRecordsError,
  }),
}))
jest.mock('../../stores/authStore', () => ({
  useAuthStore: (select) => select({ isProfileTransitioning: global.__widgetTransition }),
}))
jest.mock('../../features/training/widgets/TodayPlanWidget', () => ({
  default: { updateTimeline: jest.fn(), updateSnapshot: jest.fn() },
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const {
  TodayPlanWidgetSync,
} = require('../../features/training/widgets/TodayPlanWidgetSync.native')
const { Platform } = require('react-native')
const widget = require('../../features/training/widgets/TodayPlanWidget').default
let renderer

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 25, 12))
  jest.clearAllMocks()
  Platform.OS = 'ios'
  global.__widgetAvailable = true
  global.__widgetTransition = false
  global.__widgetWorkoutTitle = 'Upper body'
  global.__widgetRecords = []
  global.__widgetRecordsError = null
  global.__widgetRoutine = {
    name: 'Strength cycle',
    startDate: '2026-10-25',
    pattern: [{ dayType: 'WORKOUT', workoutId: 'upper' }, { dayType: 'REST' }],
  }
})
afterEach(() => {
  if (renderer) act(() => renderer.unmount())
  renderer = null
  jest.useRealTimers()
})

it('publishes changed workouts, rest days on foreground, and no active routine', () => {
  act(() => {
    renderer = create(<TodayPlanWidgetSync />)
  })
  expect(widget.updateTimeline.mock.lastCall[0][0].props.title).toBe('Upper body')
  global.__widgetWorkoutTitle = 'Updated upper body'
  act(() => renderer.update(<TodayPlanWidgetSync />))
  expect(widget.updateTimeline.mock.lastCall[0][0].props.title).toBe('Updated upper body')
  jest.setSystemTime(new Date(2026, 9, 26, 8))
  act(() => global.__widgetForeground('active'))
  expect(widget.updateTimeline.mock.lastCall[0][0].props.title).toBe('Rest day')
  global.__widgetRoutine = null
  act(() => renderer.update(<TodayPlanWidgetSync />))
  expect(widget.updateTimeline.mock.lastCall[0][0].props.title).toBe('No routine')
})

it('clears personal data during profile transitions and when the profile unmounts', () => {
  act(() => {
    renderer = create(<TodayPlanWidgetSync />)
  })
  expect(widget.updateTimeline.mock.lastCall[0][0].props.title).toBe('Upper body')
  global.__widgetTransition = true
  act(() => renderer.update(<TodayPlanWidgetSync />))
  expect(widget.updateSnapshot.mock.lastCall[0].title).toBe('No routine')
  act(() => renderer.unmount())
  renderer = null
  expect(widget.updateSnapshot.mock.lastCall[0].title).toBe('No routine')
})

it('waits safely for a development build containing the native module', () => {
  global.__widgetAvailable = false
  act(() => {
    renderer = create(<TodayPlanWidgetSync />)
  })
  expect(widget.updateTimeline.mock.calls).toEqual([])
  global.__widgetAvailable = true
  act(() => renderer.update(<TodayPlanWidgetSync />))
  expect(widget.updateTimeline.mock.lastCall[0][0].props.title).toBe('Upper body')
})

it('uses Android snapshots and refreshes on changes, midnight and foreground', () => {
  Platform.OS = 'android'
  act(() => {
    renderer = create(<TodayPlanWidgetSync />)
  })
  expect(widget.updateSnapshot.mock.lastCall[0].title).toBe('Upper body')
  expect(widget.updateTimeline.mock.calls).toEqual([])
  global.__widgetWorkoutTitle = 'Updated upper body'
  act(() => renderer.update(<TodayPlanWidgetSync />))
  expect(widget.updateSnapshot.mock.lastCall[0].title).toBe('Updated upper body')
  act(() => jest.advanceTimersByTime(12 * 60 * 60 * 1000))
  expect(widget.updateSnapshot.mock.lastCall[0].title).toBe('Rest day')
  jest.setSystemTime(new Date(2026, 9, 27, 8))
  act(() => global.__widgetForeground('active'))
  expect(widget.updateSnapshot.mock.lastCall[0].title).toBe('Updated upper body')
  global.__widgetRoutine = null
  act(() => renderer.update(<TodayPlanWidgetSync />))
  expect(widget.updateSnapshot.mock.lastCall[0].title).toBe('No routine')
})

it.each(['ios', 'android'])(
  'refreshes weekly progress after workout completion on %s',
  (platform) => {
    Platform.OS = platform
    global.__widgetRoutine = {
      ...global.__widgetRoutine,
      routineType: 'WEEKLY_COMPLETION',
      pattern: [
        { dayType: 'WORKOUT', workoutId: 'upper' },
        { dayType: 'WORKOUT', workoutId: 'lower' },
      ],
    }
    const latestPlan = () =>
      platform === 'ios'
        ? widget.updateTimeline.mock.lastCall[0][0].props
        : widget.updateSnapshot.mock.lastCall[0]
    act(() => {
      renderer = create(<TodayPlanWidgetSync />)
    })
    expect(latestPlan().progress).toEqual({ label: '0 of 2 workouts this week', value: 0 })
    global.__widgetRecords = [{ workoutId: 'upper', createdAt: '2026-10-25T09:00:00Z' }]
    act(() => renderer.update(<TodayPlanWidgetSync />))
    expect(latestPlan().progress).toEqual({ label: '1 of 2 workouts this week', value: 0.5 })
    global.__widgetRecordsError = 'History unavailable'
    act(() => renderer.update(<TodayPlanWidgetSync />))
    expect(latestPlan().title).toBe('Choose a workout')
    expect(latestPlan().progress).toEqual({ label: 'Progress unavailable', value: null })
  }
)
