jest.mock('../../components/ui/CadenceOverlay', () => ({
  CadenceOverlay: ({ children, ...props }) =>
    require('react').createElement('CadenceOverlay', props, props.open ? children : null),
}))
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Vibration: { vibrate: jest.fn() },
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Animated: {
    Value: jest.fn(function (initialValue) {
      this.value = initialValue
      this.setValue = (nextValue) => {
        this.value = nextValue
      }
      this.stopAnimation = jest.fn()
    }),
    View: 'AnimatedView',
    timing: jest.fn((value, config) => ({
      start: jest.fn(() => value.setValue(config.toValue)),
      stop: jest.fn(),
    })),
    spring: jest.fn((value, config) => ({
      start: jest.fn(() => value.setValue(config.toValue)),
      stop: jest.fn(),
    })),
    parallel: jest.fn((animations) => ({
      start: jest.fn(() => animations.forEach((animation) => animation.start())),
      stop: jest.fn(() => animations.forEach((animation) => animation.stop())),
    })),
  },
  Image: () => null,
  ScrollView: 'ScrollView',
  View: 'View',
}))
jest.mock('../../components/ui/icons', () => {
  const Icon = () => null
  return { Trophy: Icon, Timer: Icon, Dumbbell: Icon, BarChart2: Icon }
})
jest.mock('../../components/ui/Controls', () => ({
  Button: ({ children, ...props }) => require('react').createElement('Button', props, children),
  UiText: ({ children, ...props }) => require('react').createElement('Text', props, children),
}))
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({
    accent: '#624572',
    muted: '#76627e',
  }),
}))
const React = require('react')
const { act, create } = require('react-test-renderer')
const { FinishedWorkoutCongrats } = require('../../components/FinishedWorkoutCongrats')
const { AccessibilityInfo } = require('react-native')

it('shows the saved local duration and counts cardio intervals as sets', () => {
  let renderer
  act(() => {
    renderer = create(
      React.createElement(FinishedWorkoutCongrats, {
        data: {
          id: 'local_record',
          workoutId: 'local_workout',
          workoutTitle: 'Cardio session',
          createdAt: '2026-10-15T10:01:30.000Z',
          startTime: '2026-10-15T10:00:00.000Z',
          exerciseRecords: [
            {
              exerciseName: 'Run',
              reps: [],
              weight: [],
              durationSeconds: [60, 30],
            },
          ],
        },
      })
    )
  })

  const text = renderer.root.findAllByType('Text').map((node) => node.children.join(''))
  expect(text).toContain('1:30')
  expect(text).toContain('2')
  act(() => renderer.unmount())
})

it('keeps saved stats and Continue available on first open and after reopening', async () => {
  const onClose = jest.fn()
  const data = {
    id: 'local_record',
    workoutId: 'local_workout',
    workoutTitle: 'Strength session',
    createdAt: '2026-10-15T10:12:00.000Z',
    startTime: '2026-10-15T10:00:00.000Z',
    exerciseRecords: [
      {
        exerciseName: 'Squat',
        reps: [5, 5],
        weight: [60, 60],
      },
    ],
  }
  let renderer

  await act(async () => {
    renderer = create(
      React.createElement(FinishedWorkoutCongrats, {
        data,
        visible: false,
        onClose,
      })
    )
    await Promise.resolve()
  })
  await act(async () => {
    renderer.update(
      React.createElement(FinishedWorkoutCongrats, {
        data,
        visible: true,
        onClose,
      })
    )
    await Promise.resolve()
  })

  const expectWorkoutContent = () => {
    const text = renderer.root.findAllByType('Text').map((node) => node.children.join(''))
    expect(text).toContain('Strength session')
    expect(text).toContain('12:00')
    expect(text).toContain('600 kg')
    expect(text).toContain('2')
    expect(renderer.root.findByType('Button').props.children).toBe('Continue')
  }

  expectWorkoutContent()
  act(() => renderer.root.findByType('Button').props.onPress())
  expect(onClose).toHaveBeenCalledTimes(1)

  act(() => {
    renderer.update(
      React.createElement(FinishedWorkoutCongrats, {
        data,
        visible: false,
        onClose,
      })
    )
  })
  expect(renderer.root.findAllByType('Text')).toHaveLength(0)

  await act(async () => {
    renderer.update(
      React.createElement(FinishedWorkoutCongrats, {
        data,
        visible: true,
        onClose,
      })
    )
    await Promise.resolve()
  })

  expectWorkoutContent()
  act(() => renderer.unmount())
  expect(AccessibilityInfo.addEventListener).toHaveBeenCalled()
})
