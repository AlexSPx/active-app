jest.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
}))
jest.mock('../../components/ui/Controls', () => ({ UiText: 'Text' }))
jest.mock('../../components/ui/icons', () => ({
  ChevronLeft: 'ChevronLeft',
  ChevronRight: 'ChevronRight',
  Dumbbell: 'Dumbbell',
}))
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({ muted: '#aaa' }),
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { WeeklyView } = require('../../components/WeeklyView')

it('keeps the direction chevron outside the moving days throughout a swipe', () => {
  const days = Array.from({ length: 14 }, (_, index) => ({
    kind: 'rest',
    date: new Date(2026, 9, 19 + index),
    weekday: 'Mon',
    isToday: false,
    isSelected: false,
  }))
  let renderer
  act(() => {
    renderer = create(
      React.createElement(WeeklyView, {
        plan: { kind: 'cycle', days },
        onSelectDate: jest.fn(),
        onOpenWorkout: jest.fn(),
      })
    )
  })
  const scroll = renderer.root.findByType('ScrollView')
  const swipeTo = (x) =>
    act(() =>
      scroll.props.onScroll({
        nativeEvent: { contentOffset: { x }, layoutMeasurement: { width: 350 } },
      })
    )
  for (const [offset, direction] of [
    [0, 'ChevronRight'],
    [140, 'ChevronRight'],
    [210, 'ChevronLeft'],
    [350, 'ChevronLeft'],
    [0, 'ChevronRight'],
  ]) {
    swipeTo(offset)
    expect(renderer.root.findAllByType(direction)).toHaveLength(1)
    expect(
      renderer.root.findAllByType(direction === 'ChevronRight' ? 'ChevronLeft' : 'ChevronRight')
    ).toHaveLength(0)
    expect(scroll.findAllByType('ChevronLeft')).toHaveLength(0)
    expect(scroll.findAllByType('ChevronRight')).toHaveLength(0)
  }
  expect(scroll.findAllByType('Pressable')).toHaveLength(14)
  act(() => renderer.unmount())
})
