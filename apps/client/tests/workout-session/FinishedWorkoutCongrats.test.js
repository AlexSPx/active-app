jest.mock('../../components/ui/CadenceOverlay', () => ({
  CadenceOverlay: ({ children, ...props }) =>
    require('react').createElement('CadenceOverlay', props, props.open ? children : null),
}))
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Vibration: { vibrate: jest.fn() },
  Image: () => null,
  ScrollView: 'ScrollView',
  View: 'View',
}))
jest.mock('../../components/ui/icons', () => {
  const Icon = () => null
  return { Trophy: Icon, Timer: Icon, Dumbbell: Icon, BarChart2: Icon }
})
jest.mock('../../components/ui/Controls', () => ({
  Button: 'Button',
  UiText: 'Text',
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
