jest.mock('expo-router', () => ({ useRouter: jest.fn() }))
jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  return {
    Button: ({ children, ...props }) =>
      React.createElement(
        'Button',
        props,
        typeof children === 'string' || typeof children === 'number'
          ? React.createElement('Text', null, children)
          : children
      ),
    UiText: ({ children, ...props }) => React.createElement('Text', props, children),
  }
})
jest.mock('../../components/ui/icons', () => {
  const Icon = () => null
  return {
    AlertTriangle: Icon,
    ArrowRight: Icon,
    BarChart2: Icon,
    Check: Icon,
    ChevronRight: Icon,
    ChevronDown: Icon,
    Play: Icon,
    Dumbbell: Icon,
    Plus: Icon,
  }
})
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({
    accent: '#2D2235',
    background: '#FAF5FC',
    divider: '#DCD0E4',
    foreground: '#2D2235',
    muted: '#76627D',
    onAccent: '#FAF5FC',
  }),
}))
jest.mock('../../components/ProgressionWidget', () => {
  const React = require('react')
  return { ProgressionWidget: (props) => React.createElement('ProgressionWidget', props) }
})
jest.mock('../../components/WidgetManager', () => {
  const React = require('react')
  return { WidgetManager: (props) => React.createElement('WidgetManager', props) }
})
jest.mock('../../features/workouts/components/WorkoutCard', () => {
  const React = require('react')
  return { WorkoutCard: (props) => React.createElement('WorkoutCard', props) }
})
jest.mock('../../features/routines', () => ({
  useActiveRoutine: jest.fn(),
  useRoutines: jest.fn(),
}))
jest.mock('../../features/workouts', () => ({
  useWorkouts: jest.fn(),
  useWorkoutRecords: jest.fn(),
  useWorkoutManagement: jest.fn(),
}))
jest.mock('../../components/ui/CadenceOverlay', () => {
  const React = require('react')
  return {
    CadenceOverlay: ({ children, ...props }) =>
      React.createElement('Overlay', props, props.open ? children : null),
  }
})
jest.mock('../../stores/widgetStore', () => ({ useWidgetStore: jest.fn() }))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { useRouter } = require('expo-router')
const { useActiveRoutine, useRoutines } = require('../../features/routines')
const { useWorkoutManagement, useWorkouts, useWorkoutRecords } = require('../../features/workouts')
const { useWidgetStore } = require('../../stores/widgetStore')
const { TodayView } = require('../../components/TodayView')
const HomeScreen = require('../../app/(tabs)/index').default

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
  records = [],
  recordsLoading = false,
  recordsError = null,
  running = false,
} = {}) {
  const refetchActiveRoutine = jest.fn()
  const refetchRoutines = jest.fn()
  const refetchWorkouts = jest.fn()
  const removeWidget = jest.fn()
  const startWorkout = jest.fn()
  const isWorkoutRunning = jest.fn(() => running)

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
  useWorkoutRecords.mockReturnValue({
    workoutRecords: records,
    loading: recordsLoading,
    error: recordsError,
    refetch: jest.fn(),
  })
  useWorkoutManagement.mockReturnValue({ startWorkout, isWorkoutRunning })
  useWidgetStore.mockReturnValue({ widgets, removeWidget })

  return {
    refetchActiveRoutine,
    refetchRoutines,
    refetchWorkouts,
    removeWidget,
    startWorkout,
    isWorkoutRunning,
  }
}

function renderHome() {
  let renderer
  act(() => {
    renderer = create(React.createElement(HomeScreen))
  })
  return renderer
}

function visibleText(renderer) {
  return renderer.root.findAllByType('Text').map((text) => text.children.join(''))
}

function getButton(renderer, label) {
  return renderer.root
    .findAllByType('Button')
    .find((button) => button.findAllByType('Text').some((text) => text.children.join('') === label))
}

function getDayButton(renderer, phrase) {
  return renderer.root.findAll(
    (node) =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.includes(phrase)
  )[0]
}

function routine(startDate, pattern, routineType = 'SEQUENTIAL') {
  return {
    id: 'routine-1',
    name: 'Strength plan',
    startDate,
    routineType,
    pattern,
  }
}

function workout(id = 'workout-1', title = 'Upper body') {
  return { id, title, workoutTemplate: { exercises: [] } }
}

beforeEach(() => {
  jest.clearAllMocks()
  useRouter.mockReturnValue({ push: mockPush })
})

describe('Home setup states', () => {
  it('shows a first-workout state and a disabled week, then opens workout creation', () => {
    setHomeData()
    const renderer = renderHome()

    expect(visibleText(renderer)).toEqual(
      expect.arrayContaining([
        'Your training rhythm',
        'Make room for your routine.',
        'Choose exercises and set your sets and reps to create your first workout.',
        'Create workout',
        'Your progress',
        'Keep an eye on your lifts',
      ])
    )
    expect(getDayButton(renderer, 'no routine set up').props.disabled).toBe(true)
    act(() => getButton(renderer, 'Create workout').props.onPress())
    expect(mockPush).toHaveBeenCalledWith('/workouts/new')
  })

  it('offers routine creation when workouts exist but there is no routine', () => {
    setHomeData({ workouts: [workout()] })
    const renderer = renderHome()

    expect(visibleText(renderer)).toContain('Set up your routine.')
    act(() => getButton(renderer, 'Create routine').props.onPress())
    expect(mockPush).toHaveBeenCalledWith('/routines/new')
  })

  it('offers routine management when saved routines have no active routine', () => {
    setHomeData({ workouts: [workout()], routines: [{ id: 'routine-1' }] })
    const renderer = renderHome()

    expect(visibleText(renderer)).toContain('Choose an active routine.')
    act(() => getButton(renderer, 'Manage routines').props.onPress())
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/(workouts)/routines')
  })

  it('keeps loading and fetch failures separate from setup, with retry across all queries', async () => {
    setHomeData({ loading: true })
    const loadingScreen = renderHome()
    expect(visibleText(loadingScreen)).toContain('Loading your plan...')
    expect(visibleText(loadingScreen)).not.toContain('Make room for your routine.')
    act(() => loadingScreen.unmount())

    const requests = setHomeData({ workoutsError: 'Offline' })
    const errorScreen = renderHome()
    expect(visibleText(errorScreen)).toContain('Failed to load your plan')
    expect(visibleText(errorScreen)).not.toContain('Make room for your routine.')

    await act(async () => getButton(errorScreen, 'Try Again').props.onPress())
    expect(requests.refetchActiveRoutine).toHaveBeenCalledTimes(1)
    expect(requests.refetchRoutines).toHaveBeenCalledTimes(1)
    expect(requests.refetchWorkouts).toHaveBeenCalledTimes(1)
  })
})

describe('Home schedule and workout actions', () => {
  it('keeps a selected scheduled day connected to its workout and start action', () => {
    const monday = new Date()
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const startDate = [
      monday.getFullYear(),
      String(monday.getMonth() + 1).padStart(2, '0'),
      String(monday.getDate()).padStart(2, '0'),
    ].join('-')
    const scheduledWorkout = workout()
    const data = setHomeData({
      activeRoutine: routine(startDate, [
        { dayType: 'WORKOUT', workoutId: scheduledWorkout.id },
        { dayType: 'REST', workoutId: null },
      ]),
      routines: [{ id: 'routine-1' }],
      workouts: [scheduledWorkout],
    })
    const renderer = renderHome()

    act(() => getDayButton(renderer, 'scheduled workout: Upper body').props.onPress())
    const session = renderer.root.findByType(TodayView).props.session
    expect(session.kind).toBe('scheduled')
    expect(session.workout).toBe(scheduledWorkout)

    const card = renderer.root.findByType('WorkoutCard')
    expect(card.props.isWorkoutRunning).toBe(false)
    act(() => card.props.onStartWorkout(scheduledWorkout))
    expect(data.startWorkout).toHaveBeenCalledWith(scheduledWorkout)
    act(() => card.props.onPress(scheduledWorkout))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/(workouts)',
      params: { focusId: scheduledWorkout.id },
    })
  })

  it('distinguishes a rest day from a scheduled workout missing in the library', () => {
    const monday = new Date()
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const startDate = [
      monday.getFullYear(),
      String(monday.getMonth() + 1).padStart(2, '0'),
      String(monday.getDate()).padStart(2, '0'),
    ].join('-')
    setHomeData({
      activeRoutine: routine(startDate, [
        { dayType: 'WORKOUT', workoutId: 'missing' },
        { dayType: 'REST', workoutId: null },
      ]),
      routines: [{ id: 'routine-1' }],
      workouts: [workout()],
    })
    const renderer = renderHome()

    act(() => getDayButton(renderer, 'rest day').props.onPress())
    expect(renderer.root.findByType(TodayView).props.session.kind).toBe('rest')
    expect(visibleText(renderer)).toContain('Rest day.')
    expect(visibleText(renderer)).toContain('No workout scheduled for this date.')
    act(() => getButton(renderer, 'View your routine').props.onPress())
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/(workouts)/routines')

    act(() => getDayButton(renderer, 'scheduled workout unavailable').props.onPress())
    expect(renderer.root.findByType(TodayView).props.session).toMatchObject({
      kind: 'unavailable',
      workoutId: 'missing',
    })
    expect(visibleText(renderer)).toContain('Workout unavailable')
    act(() => getButton(renderer, 'Browse workouts').props.onPress())
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/(workouts)')
  })

  it('keeps flexible weekly completion and unavailable workout references safe', () => {
    setHomeData({
      activeRoutine: routine(
        '2026-09-28',
        [
          { dayType: 'WORKOUT', workoutId: 'workout-1' },
          { dayType: 'WORKOUT', workoutId: 'missing' },
        ],
        'WEEKLY_COMPLETION'
      ),
      routines: [{ id: 'routine-1' }],
      workouts: [workout()],
      records: [
        {
          id: 'completed-1',
          workoutId: 'workout-1',
          workoutTitle: 'Upper body',
          createdAt: new Date().toISOString(),
        },
      ],
    })
    const renderer = renderHome()

    expect(renderer.root.findAllByType(TodayView)).toHaveLength(0)
    expect(visibleText(renderer)).toContain('1 of 2 complete')
    expect(visibleText(renderer)).not.toContain('Unavailable workout')
    act(() => getButton(renderer, 'Choose a workout').props.onPress())
    expect(visibleText(renderer)).toContain('Unavailable workout')
    expect(getDayButton(renderer, 'scheduled workout: Upper body')).toBeUndefined()
  })
})

describe('Home progression widget actions', () => {
  it('opens add mode from the empty state', () => {
    setHomeData()
    const renderer = renderHome()

    act(() => getButton(renderer, 'Add your first widget').props.onPress())
    expect(renderer.root.findByType('WidgetManager').props).toMatchObject({
      isVisible: true,
      mode: 'add',
    })
  })

  it('sorts saved widgets and exposes explicit manage and remove actions', () => {
    const removeWidget = jest.fn()
    const widgets = [
      { id: 'later', position: 2, exerciseId: 'squat', exerciseName: 'Squat', metric: 'volume' },
      { id: 'first', position: 1, exerciseId: 'bench', exerciseName: 'Bench', metric: 'oneRm' },
    ]
    setHomeData({ widgets })
    useWidgetStore.mockReturnValue({ widgets, removeWidget })
    const renderer = renderHome()
    const cards = renderer.root.findAllByType('ProgressionWidget')

    expect(cards.map((card) => card.props.config.id)).toEqual(['first', 'later'])
    act(() => cards[0].props.onManage())
    expect(renderer.root.findByType('WidgetManager').props).toMatchObject({
      isVisible: true,
      mode: 'manage',
    })
    act(() => cards[1].props.onRemove())
    expect(removeWidget).toHaveBeenCalledWith('later')
  })
})

describe('Flexible Home', () => {
  function setupFlexible(count, completedCount = 0, extra = {}) {
    const workouts = Array.from({ length: count }, (_, index) =>
      workout(`workout-${index}`, `Workout ${index}`)
    )
    const records = workouts.slice(0, completedCount).map((item, index) => ({
      id: `record-${index}`,
      workoutId: item.id,
      workoutTitle: `Finished ${index}`,
      createdAt: new Date().toISOString(),
      exerciseRecords: [],
    }))
    setHomeData({
      workouts,
      records,
      activeRoutine: routine(
        '2026-01-01',
        workouts.map((item) => ({ dayType: 'WORKOUT', workoutId: item.id })),
        'WEEKLY_COMPLETION'
      ),
      ...extra,
    })
    return renderHome()
  }

  it.each([2, 5])(
    'shows %i segments and fresh, partial, and complete states without workouts on Home',
    (count) => {
      for (const done of [0, 1, count]) {
        const tree = setupFlexible(count, done)
        expect(visibleText(tree)).toContain(`${done} of ${count} complete`)
        expect(visibleText(tree)).toContain('Strength plan')
        expect(visibleText(tree)).not.toContain('Workout 0')
        expect(tree.root.findAllByType('WorkoutCard')).toHaveLength(0)
        const progress = tree.root.findAll(
          (node) => node.props.accessibilityRole === 'progressbar'
        )[0]
        expect(progress.props.accessibilityValue).toMatchObject({ min: 0, max: count, now: done })
        expect(progress.props.children).toHaveLength(count)
        act(() =>
          getButton(tree, done === count ? 'View this week' : 'Choose a workout').props.onPress()
        )
        expect(visibleText(tree)).toContain(
          `${count - done} remaining this week. Choose any order.`
        )
        expect(visibleText(tree)).not.toContain('Finished 0')
        if (done) {
          expect(getDayButton(tree, 'Completed this week').props.accessibilityState.expanded).toBe(
            false
          )
          act(() => getDayButton(tree, 'Completed this week').props.onPress())
          expect(visibleText(tree)).toContain('Finished 0')
        }
        act(() => tree.unmount())
      }
    }
  )

  it('routes remaining workouts through the existing preview and completed sessions by record ID after closing', () => {
    const tree = setupFlexible(2, 1)
    act(() => getButton(tree, 'Choose a workout').props.onPress())
    act(() => getDayButton(tree, 'View workout Workout 1').props.onPress())
    expect(mockPush).not.toHaveBeenCalled()
    act(() => tree.root.findByType('Overlay').props.onClosed())
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/(workouts)',
      params: { focusId: 'workout-1' },
    })
    act(() => getButton(tree, 'Choose a workout').props.onPress())
    act(() => getDayButton(tree, 'Completed this week').props.onPress())
    act(() => getDayButton(tree, 'View completed session Finished 0').props.onPress())
    act(() => tree.root.findByType('Overlay').props.onClosed())
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/(history)/record/[id]',
      params: { id: 'record-0' },
    })
  })

  it.each([2, 5])('resumes the existing session with %i required workouts', (count) => {
    const tree = setupFlexible(count, 1, { running: true })
    expect(getButton(tree, 'Choose a workout')).toBeUndefined()
    act(() => getButton(tree, 'Resume workout').props.onPress())
    expect(mockPush).toHaveBeenCalledWith('/workouts/session')
    expect(tree.root.findByType('Overlay').props.open).toBe(false)
  })

  it('counts each required workout once and uses its latest current-week record, excluding other weeks and workouts', () => {
    const { startOfWeek } = require('../../utils/date')
    const monday = startOfWeek(new Date())
    const prior = new Date(monday)
    prior.setMilliseconds(-1)
    const next = new Date(monday)
    next.setDate(next.getDate() + 7)
    const record = (id, workoutId, date) => ({
      id,
      workoutId,
      workoutTitle: id,
      createdAt: date.toISOString(),
      exerciseRecords: [],
    })
    const tree = setupFlexible(2, 0, {
      activeRoutine: routine(
        '2026-01-01',
        ['workout-0', 'workout-1', 'workout-0'].map((workoutId) => ({
          dayType: 'WORKOUT',
          workoutId,
        })),
        'WEEKLY_COMPLETION'
      ),
      records: [
        record('repeat', 'workout-0', new Date()),
        record('first', 'workout-0', monday),
        record('prior', 'workout-1', prior),
        record('next', 'workout-1', next),
        record('unrelated', 'other', monday),
      ],
    })
    expect(visibleText(tree)).toContain('1 of 2 complete')
    act(() => getButton(tree, 'Choose a workout').props.onPress())
    act(() => getDayButton(tree, 'Completed this week').props.onPress())
    expect(visibleText(tree)).toContain('repeat')
    expect(visibleText(tree)).not.toContain('first')
    act(() => getDayButton(tree, 'View completed session repeat').props.onPress())
    act(() => tree.root.findByType('Overlay').props.onClosed())
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/(history)/record/[id]',
      params: { id: 'repeat' },
    })
  })

  it('opens the existing History fallback record identity even when the saved template is missing', () => {
    const createdAt = new Date().toISOString()
    const tree = setupFlexible(2, 0, {
      workouts: [workout('workout-1')],
      records: [
        {
          id: null,
          workoutId: 'workout-0',
          workoutTitle: 'Deleted template session',
          createdAt,
          exerciseRecords: [],
        },
      ],
    })
    expect(visibleText(tree)).toContain('1 of 2 complete')
    act(() => getButton(tree, 'Choose a workout').props.onPress())
    act(() => getDayButton(tree, 'Completed this week').props.onPress())
    act(() => getDayButton(tree, 'View completed session Deleted template session').props.onPress())
    act(() => tree.root.findByType('Overlay').props.onClosed())
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/(history)/record/[id]',
      params: { id: `workout-0-${createdAt}` },
    })
  })

  it('shows loading progress without treating completed workouts as remaining', () => {
    const tree = setupFlexible(2, 1, { recordsLoading: true })
    expect(visibleText(tree)).toContain('Loading progress…')
    act(() => getButton(tree, 'Choose a workout').props.onPress())
    expect(visibleText(tree)).toContain('Loading weekly progress…')
    expect(getDayButton(tree, 'View workout')).toBeUndefined()
  })

  it('keeps unknown completion out of the remaining list and offers retry on failure', () => {
    const tree = setupFlexible(2, 0, { recordsError: 'Offline' })
    expect(visibleText(tree)).toContain('Progress unavailable')
    act(() => getButton(tree, 'Choose a workout').props.onPress())
    expect(visibleText(tree)).toContain('Could not load weekly progress.')
    expect(visibleText(tree)).not.toContain('Workout 0')
    act(() => getButton(tree, 'Try again').props.onPress())
    expect(useWorkoutRecords().refetch).toHaveBeenCalledTimes(1)
  })
})
