const React = require('react')
const { act, create } = require('react-test-renderer')
const { AccessibilityInfo, View } = require('react-native')

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24 }),
}))

const { FeedbackProvider, useFeedback } = require('../../components/feedback/FeedbackProvider')
let controller
function Consumer() {
  controller = useFeedback()
  return React.createElement('Screen')
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

test('announces feedback, permits underlying touches, replaces timers, and dismisses', () => {
  let renderer
  act(() => {
    renderer = create(React.createElement(FeedbackProvider, {}, React.createElement(Consumer)))
  })
  act(() =>
    controller.show('Workout not saved', { message: 'Tap Finish to retry.', duration: 1000 })
  )
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(
    'Workout not saved. Tap Finish to retry.'
  )
  expect(renderer.root.findByType(View).props.pointerEvents).toBe('box-none')
  expect(
    renderer.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel
  ).toContain('Dismiss notification')
  act(() => jest.advanceTimersByTime(900))
  act(() => controller.show('Retrying', { duration: 2000 }))
  act(() => jest.advanceTimersByTime(1000))
  expect(
    renderer.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel
  ).toContain('Retrying')
  act(() => jest.advanceTimersByTime(1000))
  expect(renderer.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0)
  act(() => controller.show('Saved'))
  act(() => renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress())
  expect(renderer.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0)
  act(() => renderer.unmount())
  expect(jest.getTimerCount()).toBe(0)
})
