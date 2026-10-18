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
  useWorkoutManagement: jest.fn(),
}))
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../features/launch/launchFacade', () => ({
  launchFacade: { training: { getWeeklyCompletion: jest.fn() } },
}))
jest.mock('../../stores/widgetStore', () => ({ useWidgetStore: jest.fn() }))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { useRouter } = require('expo-router')
const { useActiveRoutine, useRoutines } = require('../../features/routines')
const { useWorkoutManagement, useWorkouts } = require('../../features/workouts')
const { useAuth } = require('../../contexts/AuthContext')
const { launchFacade } = require('../../features/launch/launchFacade')
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
} = {}) {
  const refetchActiveRoutine = jest.fn()
  const refetchRoutines = jest.fn()
  const refetchWorkouts = jest.fn()
  const removeWidget = jest.fn()
  const startWorkout = jest.fn()
  const isWorkoutRunning = jest.fn(() => false)

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
  useAuth.mockReturnValue({ user: null })
  launchFacade.training.getWeeklyCompletion.mockReturnValue(null)
})

describe('Home setup states', () => {
  it('shows a first-workout state and a disabled week, then opens workout creation', () => {
    setHomeData()
    const renderer = renderHome()

    expect(visibleText(renderer)).toEqual(
      expect.arrayContaining([
        'Your training week',
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
    expect(visibleText(renderer)).toContain('Rest day')

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
    launchFacade.training.getWeeklyCompletion.mockReturnValue(['workout-1'])
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
    })
    const renderer = renderHome()

    expect(renderer.root.findAllByType(TodayView)).toHaveLength(0)
    expect(visibleText(renderer)).toContain('1 of 2 complete')
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
