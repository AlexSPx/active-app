jest.mock('tamagui', () => {
  const React = require('react')
  const primitive =
    (name) =>
    ({ children, ...props }) =>
      React.createElement(name, props, children)
  return {
    getTokenValue: () => 20,
    ...Object.fromEntries(
      [
        'ScrollView',
        'YStack',
        'XStack',
        'Text',
        'Card',
        'Button',
        'Portal',
        'Separator',
        'View',
      ].map((name) => [name, primitive(name)])
    ),
  }
})
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => null
  return Object.fromEntries(
    [
      'MoreHorizontal',
      'Edit3',
      'Trash2',
      'Clock',
      'Dumbbell',
      'Play',
      'CheckCircle2',
      'Calendar',
      'Moon',
    ].map((name) => [name, Icon])
  )
})
jest.mock('@tamagui/popover', () => {
  const React = require('react')
  const Popover = ({ children, ...props }) => React.createElement('Popover', props, children)
  Popover.Trigger = Popover.Content = Popover.Close = ({ children }) => children
  return { Popover }
})
jest.mock('@shopify/flash-list', () => {
  const React = require('react')
  return {
    FlashList: React.forwardRef(({ data, renderItem, ListHeaderComponent, ...props }, ref) =>
      React.createElement(
        'FlashList',
        { ...props, ref },
        ListHeaderComponent,
        data.map((item) =>
          React.createElement(React.Fragment, { key: item.id }, renderItem({ item }))
        )
      )
    ),
  }
})
jest.mock('../../utils/haptics', () => ({ haptics: { medium: jest.fn(), light: jest.fn() } }))
jest.mock('../../components/ui/EmptyState', () => ({ EmptyState: () => null }))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { WorkoutCard } = require('../../features/workouts/components/WorkoutCard')
const { WorkoutList } = require('../../features/workouts/components/WorkoutList')
const { RoutineCard } = require('../../features/routines/components/RoutineCard')

const strength = (name = 'Bench press', reps = [8, 8, 8]) => ({
  exerciseId: name,
  exerciseTitle: name,
  category: 'STRENGTH',
  reps,
  weight: [40, 40, 40],
})
const workout = {
  id: 'workout-1',
  title: 'Upper body',
  workoutTemplate: { exercises: [strength()] },
}
const routine = {
  id: 'routine-1',
  name: 'Strength & recovery',
  routineType: 'SEQUENTIAL',
  pattern: [
    { dayIndex: 1, dayType: 'WORKOUT', workoutId: workout.id },
    { dayIndex: 2, dayType: 'REST', workoutId: null },
  ],
}

function render(Component, props) {
  let renderer
  act(() => {
    renderer = create(React.createElement(Component, props))
  })
  return renderer
}
function texts(renderer) {
  return renderer.root.findAllByType('Text').map((node) => node.children.join(''))
}
function button(renderer, label) {
  return renderer.root
    .findAllByType('Button')
    .find((node) => node.findAllByType('Text').some((text) => text.children.join('') === label))
}

it('summarizes strength and cardio sets and estimated time', () => {
  const mixed = {
    ...workout,
    workoutTemplate: {
      exercises: [
        strength(),
        {
          exerciseId: 'bike',
          exerciseTitle: 'Stationary bike',
          category: 'CARDIO',
          durationSeconds: [600, 600],
        },
      ],
    },
  }
  const renderer = render(WorkoutCard, {
    workout: mixed,
    onStartWorkout: jest.fn(),
    isWorkoutRunning: false,
  })
  expect(texts(renderer)).toEqual(
    expect.arrayContaining(['2 exercises', '5 sets', '~28 min', 'Bench press · Stationary bike'])
  )
})

it('keeps workout detail navigation separate from start, edit, and delete', () => {
  const handlers = {
    onStartWorkout: jest.fn(),
    onPress: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  }
  const renderer = render(WorkoutCard, { workout, isWorkoutRunning: false, ...handlers })
  expect(renderer.root.findByType('Card').props.onPress).toBeUndefined()
  act(() =>
    renderer.root.findByProps({ accessibilityLabel: 'View workout Upper body' }).props.onPress()
  )
  expect(handlers.onPress).toHaveBeenCalledWith(workout)
  act(() => button(renderer, 'Start workout').props.onPress())
  expect(handlers.onStartWorkout).toHaveBeenCalledWith(workout)
  act(() => button(renderer, 'Edit').props.onPress())
  expect(handlers.onEdit).toHaveBeenCalledWith(workout)
  act(() => button(renderer, 'Delete').props.onPress())
  expect(handlers.onDelete).toHaveBeenCalledWith(workout.id)
  expect(handlers.onPress).toHaveBeenCalledTimes(1)
})

it('disables starting another workout while one is running', () => {
  const onStartWorkout = jest.fn()
  const renderer = render(WorkoutCard, {
    workout,
    onStartWorkout,
    isWorkoutRunning: true,
  })
  expect(button(renderer, 'Workout in Progress').props.disabled).toBe(true)
  act(() => button(renderer, 'Workout in Progress').props.onPress())
  expect(onStartWorkout).not.toHaveBeenCalled()
})

it('updates edited sets and callbacks even when exercise IDs and names are unchanged', () => {
  const first = jest.fn()
  const latest = jest.fn()
  const renderer = render(WorkoutCard, { workout, onStartWorkout: first, isWorkoutRunning: false })
  const edited = {
    ...workout,
    workoutTemplate: { exercises: [strength('Bench press', [8, 8, 8, 8, 8])] },
  }
  act(() =>
    renderer.update(
      React.createElement(WorkoutCard, {
        workout: edited,
        onStartWorkout: latest,
        isWorkoutRunning: false,
      })
    )
  )
  expect(texts(renderer)).toContain('5 sets')
  act(() => button(renderer, 'Start workout').props.onPress())
  expect(latest).toHaveBeenCalledWith(edited)
  expect(first).not.toHaveBeenCalled()
})

it('updates workout titles through the list when IDs and list length stay the same', () => {
  const props = { workouts: [workout], onStartWorkout: jest.fn(), isWorkoutRunning: false }
  const renderer = render(WorkoutList, props)
  act(() =>
    renderer.update(
      React.createElement(WorkoutList, {
        ...props,
        workouts: [{ ...workout, title: 'Upper body revised' }],
      })
    )
  )
  expect(texts(renderer)).toContain('Upper body revised')
})

it('shows an active routine with a complete training/rest cycle and no activation action', () => {
  const renderer = render(RoutineCard, { routine, isActive: true, onActivate: jest.fn() })
  expect(texts(renderer)).toEqual(
    expect.arrayContaining(['Repeating cycle', 'Active', '1 training day', '1 rest day'])
  )
  expect(renderer.root.findByProps({ accessibilityLabel: 'Day 1 · Training' })).toBeDefined()
  expect(renderer.root.findByProps({ accessibilityLabel: 'Day 2 · Rest' })).toBeDefined()
  expect(button(renderer, 'Set active routine')).toBeUndefined()
})

it('describes flexible weekly routines and allows activation', () => {
  const onActivate = jest.fn()
  const renderer = render(RoutineCard, {
    routine: { ...routine, routineType: 'WEEKLY_COMPLETION', pattern: [routine.pattern[0]] },
    onActivate,
  })
  expect(texts(renderer)).toEqual(
    expect.arrayContaining(['Flexible week', '1 workout', 'Any order'])
  )
  expect(renderer.root.findByProps({ accessibilityLabel: 'Workout 1 · Training' })).toBeDefined()
  act(() => button(renderer, 'Set active routine').props.onPress())
  expect(onActivate).toHaveBeenCalledWith(routine.id)
})

it('keeps routine actions separate and respects the disabled state', () => {
  const handlers = {
    onPress: jest.fn(),
    onActivate: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onStartFromToday: jest.fn(),
  }
  const renderer = render(RoutineCard, { routine, ...handlers })
  expect(renderer.root.findByType('Card').props.onPress).toBeUndefined()
  act(() => button(renderer, 'Start today').props.onPress())
  expect(handlers.onStartFromToday).toHaveBeenCalledWith(routine.id)
  act(() => button(renderer, 'Edit').props.onPress())
  expect(handlers.onEdit).toHaveBeenCalledWith(routine)
  act(() => button(renderer, 'Delete').props.onPress())
  expect(handlers.onDelete).toHaveBeenCalledWith(routine.id)
  expect(handlers.onPress).not.toHaveBeenCalled()
  act(() =>
    renderer.update(React.createElement(RoutineCard, { routine, ...handlers, disabled: true }))
  )
  expect(button(renderer, 'Set active routine').props.disabled).toBe(true)
  expect(
    renderer.root.findByProps({ accessibilityLabel: `More actions for ${routine.name}` }).props
      .disabled
  ).toBe(true)
  act(() => button(renderer, 'Set active routine').props.onPress())
  expect(handlers.onActivate).not.toHaveBeenCalled()
})

it('bounds exercise summaries and preserves every day in long cycles', () => {
  const manyExercises = {
    ...workout,
    workoutTemplate: {
      exercises: Array.from({ length: 6 }, (_, i) => strength(`Exercise ${i + 1}`)),
    },
  }
  const workoutRenderer = render(WorkoutCard, {
    workout: manyExercises,
    onStartWorkout: jest.fn(),
    isWorkoutRunning: false,
  })
  expect(texts(workoutRenderer)).toContain('18 sets')
  expect(texts(workoutRenderer)).toContain(
    'Exercise 1 · Exercise 2 · Exercise 3 · Exercise 4 · +2 more'
  )
  const longCycle = {
    ...routine,
    pattern: Array.from({ length: 9 }, (_, i) => ({ ...routine.pattern[0], dayIndex: i + 1 })),
  }
  const routineRenderer = render(RoutineCard, { routine: longCycle })
  expect(texts(routineRenderer)).toEqual(expect.arrayContaining(['9 training days']))
  expect(
    routineRenderer.root
      .findAllByType('YStack')
      .filter((node) => node.props.accessibilityLabel?.startsWith('Day '))
  ).toHaveLength(9)
})

it('shows flexible workout names and excludes rest days from session rows', () => {
  const renderer = render(RoutineCard, {
    routine: { ...routine, routineType: 'WEEKLY_COMPLETION' },
    workoutTitleById: { [workout.id]: workout.title },
  })
  expect(texts(renderer)).toContain(workout.title)
  expect(renderer.root.findByProps({ accessibilityLabel: 'Workout 1 · Upper body' })).toBeDefined()
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Workout 2 · Training' })).toHaveLength(
    0
  )
})
