jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Vibration: { vibrate: jest.fn() },
  Image: () => null,
}))
jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => null
  return { Trophy: Icon, Timer: Icon, Dumbbell: Icon, BarChart2: Icon }
})
jest.mock('tamagui', () => {
  const React = require('react')
  const primitive = (name) =>
    function Primitive({ children, ...props }) {
      return React.createElement(name, props, children)
    }
  const Sheet = primitive('Sheet')
  Sheet.Overlay = primitive('SheetOverlay')
  Sheet.Handle = primitive('SheetHandle')
  Sheet.Frame = primitive('SheetFrame')
  return {
    Button: primitive('Button'),
    H3: primitive('H3'),
    H4: primitive('H4'),
    Paragraph: primitive('Paragraph'),
    ScrollView: primitive('ScrollView'),
    Separator: primitive('Separator'),
    Sheet,
    Text: primitive('Text'),
    XStack: primitive('XStack'),
    YStack: primitive('YStack'),
  }
})

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
