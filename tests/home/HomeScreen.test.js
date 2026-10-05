jest.mock('tamagui', () => {
  const React = require('react')
  const primitive =
    (name) =>
    ({ children, ...props }) =>
      React.createElement(name, props, children)

  return {
    Button: primitive('Button'),
    Card: primitive('Card'),
    Circle: primitive('Circle'),
    ScrollView: primitive('ScrollView'),
    Text: primitive('Text'),
    XStack: primitive('XStack'),
    YStack: primitive('YStack'),
  }
})

jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => null
  return {
    ChevronRight: Icon,
    ArrowRight: Icon,
    Plus: Icon,
    Check: Icon,
    Circle: Icon,
  }
})
jest.mock('expo-router', () => ({ useRouter: jest.fn(), router: { push: jest.fn() } }))
jest.mock('../../features/routines', () => ({
  useActiveRoutine: jest.fn(),
  useRoutines: jest.fn(),
}))
jest.mock('../../features/workouts', () => ({ useWorkouts: jest.fn() }))
jest.mock('../../stores/widgetStore', () => ({ useWidgetStore: jest.fn() }))
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../components/TodayView', () => {
  const React = require('react')
  return { TodayView: () => React.createElement('TodayView') }
})
jest.mock('../../components/WeeklyView', () => {
  const React = require('react')
  const { Text } = require('tamagui')
  return {
    WeeklyView: ({ inactive }) =>
      React.createElement(
        'WeeklyView',
        { inactive },
        React.createElement(Text, null, 'Your training week')
      ),
  }
})
jest.mock('../../components/ProgressionWidget', () => {
  const React = require('react')
  return {
    ProgressionWidget: (props) => React.createElement('ProgressionWidget', props),
  }
})
jest.mock('../../components/WidgetManager', () => {
  const React = require('react')
  return {
    WidgetManager: (props) => React.createElement('WidgetManager', props),
  }
})
jest.mock('../../components/ui/EmptyState', () => {
  const React = require('react')
  const { Text } = require('tamagui')
  return {
    EmptyState: ({ title, description, actionLabel, onAction }) =>
      React.createElement(
        'EmptyState',
        null,
        React.createElement(Text, null, title),
        React.createElement(Text, null, description),
        actionLabel && React.createElement('Button', { onPress: onAction }, actionLabel)
      ),
  }
})
jest.mock('../../components/ui/ErrorDisplay', () => {
  const React = require('react')
  return { ErrorDisplay: (props) => React.createElement('ErrorDisplay', props) }
})
jest.mock('../../components/ui/LoadingSpinner', () => {
  const React = require('react')
  return { LoadingSpinner: (props) => React.createElement('LoadingSpinner', props) }
})

const React = require('react')
const { act, create } = require('react-test-renderer')
const { useRouter } = require('expo-router')
const { useActiveRoutine, useRoutines } = require('../../features/routines')
const { useWorkouts } = require('../../features/workouts')
const { useAuth } = require('../../contexts/AuthContext')
const { TodayView: ActualTodayView } = jest.requireActual('../../components/TodayView')
const { useWidgetStore } = require('../../stores/widgetStore')
const HomeScreen = require('../../app/(tabs)/index').default
const { WeeklyView: ActualWeeklyView } = jest.requireActual('../../components/WeeklyView')

const mockPush = jest.fn()

function setHomeData({
  activeRoutine = null,
  routines = [],
  workouts = [],
  loading = false,
  activeRoutineError = null,
  routinesError = null,
  workoutsError = null,
  widgets = [],
} = {}) {
  const refetchActiveRoutine = jest.fn()
  const refetchRoutines = jest.fn()
  const refetchWorkouts = jest.fn()
  const removeWidget = jest.fn()

  useActiveRoutine.mockReturnValue({
    activeRoutine,
    loading,
    error: activeRoutineError,
    refetch: refetchActiveRoutine,
  })
  useRoutines.mockReturnValue({
    routines,
    loading,
    error: routinesError,
    refetch: refetchRoutines,
  })
  useWorkouts.mockReturnValue({
    workouts,
    loading,
    error: workoutsError,
    refetch: refetchWorkouts,
  })
  useWidgetStore.mockReturnValue({ widgets, removeWidget })

  return { refetchActiveRoutine, refetchRoutines, refetchWorkouts, removeWidget }
}

function renderHome() {
  let renderer
  act(() => {
    renderer = create(React.createElement(HomeScreen))
  })
  return renderer
}

function getButton(renderer, label) {
  return renderer.root
    .findAllByType('Button')
    .find((button) => button.findAllByType('Text').some((text) => text.children.join('') === label))
}

function visibleText(renderer) {
  return renderer.root.findAllByType('Text').map((text) => text.children.join(''))
}

beforeEach(() => {
  jest.clearAllMocks()
  useRouter.mockReturnValue({ push: mockPush })
  useAuth.mockReturnValue({ user: null })
})

describe('Home empty and setup states', () => {
  it('shows setup and a non-interactive week preview for a new account', () => {
    setHomeData()
    const renderer = renderHome()
    const text = visibleText(renderer)

    expect(text).toEqual(
      expect.arrayContaining([
        'Create your first workout',
        'Choose exercises and set your sets and reps.',
        'Create workout',
        'Your training week',
        'Create a workout, then add it to a routine.',
        'Your widgets',
        'Choose an exercise and metric to track your progress here.',
      ])
    )
    expect(renderer.root.findByType('WeeklyView').props.inactive).toBe(true)
    expect(getButton(renderer, 'Add widget')).toBeDefined()

    act(() => getButton(renderer, 'Create workout').props.onPress())
    expect(mockPush).toHaveBeenCalledWith('/workouts/new')
  })

  it('renders the existing weekly calendar dimmed and without day actions when inactive', () => {
    setHomeData()
    let renderer
    act(() => {
      renderer = create(
        React.createElement(ActualWeeklyView, {
          selectedDate: new Date(),
          onSelectDate: jest.fn(),
          inactive: true,
        })
      )
    })

    expect(visibleText(renderer)).toEqual(
      expect.arrayContaining([
        'Your training week',
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
        'Sun',
      ])
    )
    const calendar = renderer.root.findAllByType('XStack').find((row) => row.props.width === '100%')
    expect(calendar).toBeDefined()
    expect(renderer.root.findAllByType('ScrollView')).toHaveLength(0)
    const dayGroups = renderer.root
      .findAllByType('YStack')
      .filter((day) => day.props.accessibilityLabel)
    expect(dayGroups).toHaveLength(7)
    expect(dayGroups.every((day) => !day.props.onPress)).toBe(true)
    expect(dayGroups.every((day) => day.props.accessibilityRole !== 'button')).toBe(true)
  })

  it('moves from workout setup to routine creation when workouts exist', () => {
    setHomeData({ workouts: [{ id: 'workout-1' }] })
    const renderer = renderHome()
    const text = visibleText(renderer)

    expect(text).toContain('Set up your routine')
    expect(text).toContain('Your workouts are ready. Create a routine to plan your training.')
    expect(text).toContain('Create a routine to see your training plan here.')
    act(() => getButton(renderer, 'Create routine').props.onPress())
    expect(mockPush).toHaveBeenCalledWith('/routines/new')
  })

  it('offers routine management when routines exist without an active routine', () => {
    setHomeData({
      workouts: [{ id: 'workout-1' }],
      routines: [{ id: 'routine-1' }],
    })
    const renderer = renderHome()

    expect(visibleText(renderer)).toContain('Choose an active routine')
    expect(visibleText(renderer)).toContain('Activate a routine to see its schedule here.')
    act(() => getButton(renderer, 'Manage routines').props.onPress())
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/(workouts)/routines')
  })

  it('restores the active plan and configured widget actions for populated accounts', () => {
    const widget = { id: 'widget-1', position: 0 }
    setHomeData({
      activeRoutine: { id: 'routine-1' },
      routines: [{ id: 'routine-1' }],
      workouts: [{ id: 'workout-1' }],
      widgets: [widget],
    })
    const renderer = renderHome()

    expect(renderer.root.findAllByType('TodayView')).toHaveLength(1)
    expect(renderer.root.findAllByType('WeeklyView')).toHaveLength(1)
    expect(renderer.root.findByType('WeeklyView').props.inactive).toBeUndefined()
    const progressionWidget = renderer.root.findByType('ProgressionWidget')
    expect(progressionWidget.props.config).toBe(widget)
    act(() => getButton(renderer, 'Manage').props.onPress())
    expect(renderer.root.findByType('WidgetManager').props.mode).toBe('manage')

    act(() => getButton(renderer, 'Add').props.onPress())
    expect(renderer.root.findByType('WidgetManager').props.isVisible).toBe(true)
  })

  it('opens and closes the widget manager when no exercises are tracked', () => {
    setHomeData({ workouts: [{ id: 'workout-1' }] })
    const renderer = renderHome()

    act(() => getButton(renderer, 'Add').props.onPress())
    expect(renderer.root.findByType('WidgetManager').props.isVisible).toBe(true)
    act(() => renderer.root.findByType('WidgetManager').props.onClose())
    expect(renderer.root.findByType('WidgetManager').props.isVisible).toBe(false)
  })

  it('keeps scheduled days selectable and marks the selected day in the active calendar', () => {
    const selectedDate = new Date()
    const onSelectDate = jest.fn()
    setHomeData({
      activeRoutine: {
        startDate: '2020-01-01',
        pattern: [{ dayType: 'WORKOUT', workoutId: 'workout-1' }],
      },
    })
    let renderer
    act(() => {
      renderer = create(React.createElement(ActualWeeklyView, { selectedDate, onSelectDate }))
    })
    const days = renderer.root
      .findAllByType('YStack')
      .filter((day) => day.props.accessibilityRole === 'button')
    expect(days).toHaveLength(7)
    expect(days.filter((day) => day.props.accessibilityState.selected)).toHaveLength(1)
    expect(days.every((day) => day.props.accessibilityLabel.includes('scheduled workout'))).toBe(
      true
    )
    act(() => days[0].props.onPress())
    expect(onSelectDate).toHaveBeenCalledWith(expect.any(Date))
    expect(onSelectDate.mock.calls[0][0].getDay()).toBe(1)
  })

  it('shows a flexible weekly checklist once, without a duplicate daily list', () => {
    setHomeData({
      activeRoutine: { id: 'routine-1', routineType: 'WEEKLY_COMPLETION' },
      workouts: [{ id: 'workout-1' }],
    })
    const renderer = renderHome()
    expect(renderer.root.findAllByType('WeeklyView')).toHaveLength(1)
    expect(renderer.root.findAllByType('TodayView')).toHaveLength(0)
  })

  it('updates weekly completion when the user streak changes and keeps unavailable references safe', () => {
    setHomeData({
      activeRoutine: {
        name: 'Flexible week',
        routineType: 'WEEKLY_COMPLETION',
        pattern: [
          { dayType: 'WORKOUT', workoutId: 'workout-1' },
          { dayType: 'WORKOUT', workoutId: 'workout-1' },
          { dayType: 'WORKOUT', workoutId: 'missing' },
        ],
      },
      workouts: [{ id: 'workout-1', title: 'Upper body', workoutTemplate: { exercises: [] } }],
    })
    let renderer
    const props = { selectedDate: new Date(), onSelectDate: jest.fn() }
    act(() => {
      renderer = create(React.createElement(ActualWeeklyView, props))
    })
    expect(visibleText(renderer)).toEqual(
      expect.arrayContaining(['Upper body', 'Unavailable workout', '0/2 done'])
    )
    expect(
      renderer.root.findAllByType('Button').filter((button) => button.props.disabled)
    ).toHaveLength(1)
    useAuth.mockReturnValue({ user: { streak: { weeklyCompletedWorkoutIds: ['workout-1'] } } })
    act(() => renderer.update(React.createElement(ActualWeeklyView, props)))
    expect(visibleText(renderer)).toContain('1/2 done')
    expect(visibleText(renderer)).not.toContain('All scheduled workouts are complete.')
  })

  it('changes the selected session and distinguishes missing workouts from rest', () => {
    setHomeData({
      activeRoutine: {
        startDate: '2026-09-28',
        pattern: [
          { dayType: 'WORKOUT', workoutId: 'workout-1' },
          { dayType: 'REST', workoutId: null },
          { dayType: 'WORKOUT', workoutId: 'missing' },
        ],
      },
      workouts: [
        {
          id: 'workout-1',
          title: 'Upper body',
          workoutTemplate: {
            exercises: [
              { category: 'STRENGTH', reps: [8, 8] },
              { category: 'CARDIO', durationSeconds: [60] },
            ],
          },
        },
      ],
    })
    let renderer
    act(() => {
      renderer = create(
        React.createElement(ActualTodayView, { selectedDate: new Date(2026, 8, 28) })
      )
    })
    expect(visibleText(renderer)).toEqual(
      expect.arrayContaining(['Upper body', '2 exercises · 3 sets'])
    )
    act(() =>
      renderer.update(React.createElement(ActualTodayView, { selectedDate: new Date(2026, 8, 29) }))
    )
    expect(visibleText(renderer)).toContain('Rest day')
    act(() =>
      renderer.update(React.createElement(ActualTodayView, { selectedDate: new Date(2026, 8, 30) }))
    )
    expect(visibleText(renderer)).toContain('Workout unavailable')
  })

  it('keeps loading and fetch errors out of empty states, and retries all setup queries', async () => {
    setHomeData({ loading: true })
    const loadingScreen = renderHome()
    expect(loadingScreen.root.findByType('LoadingSpinner').props.text).toBe('Loading your plan...')
    expect(visibleText(loadingScreen)).not.toContain('Create your first workout')
    act(() => loadingScreen.unmount())

    const requests = setHomeData({ workoutsError: 'Offline' })
    const errorScreen = renderHome()
    expect(errorScreen.root.findByType('ErrorDisplay').props.title).toBe('Failed to load your plan')
    expect(visibleText(errorScreen)).not.toContain('Create your first workout')

    await act(async () => errorScreen.root.findByType('ErrorDisplay').props.onRetry())
    expect(requests.refetchActiveRoutine).toHaveBeenCalledTimes(1)
    expect(requests.refetchRoutines).toHaveBeenCalledTimes(1)
    expect(requests.refetchWorkouts).toHaveBeenCalledTimes(1)
  })
})
