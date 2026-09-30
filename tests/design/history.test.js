const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('tamagui', () => {
  const React = require('react')
  const component = (name) => (props) => React.createElement(name, props, props.children)
  const dialog = component('Dialog')
  for (const name of ['Portal', 'Overlay', 'Content', 'Title'])
    dialog[name] = component(`Dialog.${name}`)
  return Object.fromEntries(
    ['Button', 'Text', 'YStack', 'XStack', 'View', 'ScrollView', 'Card']
      .map((name) => [name, component(name)])
      .concat([['Dialog', dialog]])
  )
})
jest.mock('@tamagui/lucide-icons', () => ({
  ChevronLeft: 'ChevronLeft',
  ChevronRight: 'ChevronRight',
  MoreHorizontal: 'MoreHorizontal',
  ArrowRight: 'ArrowRight',
}))
jest.mock('@tamagui/popover', () => {
  const React = require('react')
  const Popover = (props) => React.createElement('Popover', props, props.children)
  for (const name of ['Trigger', 'Content'])
    Popover[name] = (props) => React.createElement(`Popover.${name}`, props, props.children)
  return { Popover }
})
jest.mock('@tamagui/sheet', () => {
  const React = require('react')
  const Sheet = (props) => React.createElement('Sheet', props, props.open ? props.children : null)
  for (const name of ['Overlay', 'Handle', 'Frame'])
    Sheet[name] = (props) => React.createElement(`Sheet.${name}`, props, props.children)
  return { Sheet }
})
jest.mock('@shopify/flash-list', () => {
  const React = require('react')
  return {
    FlashList: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({ scrollToIndex: mockScroll }))
      return React.createElement(
        'FlashList',
        props,
        props.ListHeaderComponent,
        props.data.length
          ? props.data.map((item, index) =>
              React.createElement(
                React.Fragment,
                { key: item.id },
                props.renderItem({ item, index })
              )
            )
          : props.ListEmptyComponent
      )
    }),
  }
})
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    Stack: {
      Screen: (props) => React.createElement('Header', props, props.options?.headerRight?.()),
    },
    useLocalSearchParams: () => ({ id: 'record-1' }),
    useRouter: () => ({ replace: mockReplace, push: mockPush }),
  }
})
jest.mock('../../features/workouts', () => ({
  useWorkoutRecords: () => ({
    workoutRecords: mockRecords,
    loading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useWorkoutMutations: () => ({
    deleteWorkoutRecord: mockDelete,
    loading: false,
    error: null,
    clearError: jest.fn(),
  }),
}))
jest.mock('../../components/ui/LoadingSpinner', () => ({ LoadingSpinner: 'LoadingSpinner' }))
jest.mock('../../components/ui/ErrorDisplay', () => ({ ErrorDisplay: 'ErrorDisplay' }))

const { HistoryCalendar } = require('../../features/history/components/HistoryCalendar')
const { recordDurationSeconds } = require('../../features/history/components/record')
const { countSetsForRecord, computeVolumeForRecord } = require('../../utils/workoutUtils')
const { parseServerUtcDate } = require('../../utils/date')
const HistoryPage = require('../../app/(tabs)/(history)/index').default
const RecordScreen = require('../../app/(tabs)/(history)/record/[id]').default
const mockScroll = jest.fn()
const mockPush = jest.fn()
let mockRecords
const mockDelete = jest.fn()
const mockReplace = jest.fn()
const mockRecord = {
  id: 'record-1',
  workoutId: 'workout-1',
  workoutTitle: 'Mixed session',
  createdAt: '2026-09-30T09:00:00',
  startTime: '2026-09-30T08:00:00',
  notes: 'Session note',
  exerciseRecords: [
    {
      exerciseName: 'Squat',
      reps: [8, 6],
      weight: [60, 65],
      achievedOneRmValue: 78,
      achievedOneRmSetIndex: 1,
    },
    { exerciseName: 'Run', reps: [], weight: [], durationSeconds: [720, 480], notes: 'Easy pace' },
  ],
}

beforeEach(() => {
  mockRecords = [mockRecord]
  mockScroll.mockReset()
  mockPush.mockReset()
  mockDelete.mockReset()
  mockReplace.mockReset()
})

function mount(component) {
  let tree
  act(() => {
    tree = create(component)
  })
  return tree
}
function pressLabel(tree, label) {
  act(() => {
    tree.root
      .findAllByType('Button')
      .find((button) => button.props.children?.props?.children === label)
      .props.onPress()
  })
}

test('month arrows anchor to day one and the compact calendar contains the selected week', () => {
  const onMonthChange = jest.fn(),
    onSelectDate = jest.fn()
  const tree = mount(
    React.createElement(HistoryCalendar, {
      monthDate: new Date(2026, 0, 31),
      selectedDate: new Date(2026, 0, 31),
      collapsed: true,
      workoutDays: new Set(['2026-01-31']),
      onMonthChange,
      onSelectDate,
      onToggleCollapsed: jest.fn(),
    })
  )
  const days = tree.root
    .findAllByType('Button')
    .filter((button) => button.props.accessibilityState?.selected !== undefined)
  expect(days).toHaveLength(7)
  expect(days.filter((button) => button.props.accessibilityState.selected)).toHaveLength(1)
  expect(
    days.find((button) => button.props.accessibilityState.selected).props.accessibilityLabel
  ).toContain('completed session')
  act(() =>
    tree.root
      .findAllByType('Button')
      .find((button) => button.props.accessibilityLabel === 'Next month')
      .props.onPress()
  )
  expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 1, 1))
  expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 1, 1))
  act(() => tree.unmount())
})

test('record calculations retain strength volume, actual cardio intervals and UTC parsing', () => {
  expect(countSetsForRecord(mockRecord)).toBe(4)
  expect(computeVolumeForRecord(mockRecord)).toBe(870)
  expect(recordDurationSeconds(mockRecord)).toBe(1200)
  expect(parseServerUtcDate(mockRecord.createdAt).toISOString()).toBe('2026-09-30T09:00:00.000Z')
  expect(
    recordDurationSeconds({
      ...mockRecord,
      startTime: '2026-09-30T08:00:00Z',
      createdAt: '2026-09-30T09:00:00Z',
      exerciseRecords: [mockRecord.exerciseRecords[0]],
    })
  ).toBe(3600)
})

test('opening and cancelling a record never deletes data; explicit confirmation deletes its real ID', async () => {
  mockDelete.mockResolvedValue(true)
  const tree = mount(React.createElement(RecordScreen))
  expect(mockDelete).not.toHaveBeenCalled()
  pressLabel(tree, 'Delete record')
  expect(mockDelete).not.toHaveBeenCalled()
  pressLabel(tree, 'Keep record')
  expect(mockDelete).not.toHaveBeenCalled()
  pressLabel(tree, 'Delete record')
  const deleteButtons = tree.root
    .findAllByType('Button')
    .filter((button) => button.props.children?.props?.children === 'Delete record')
  await act(async () => {
    await deleteButtons[deleteButtons.length - 1].props.onPress()
  })
  expect(mockDelete).toHaveBeenCalledTimes(1)
  expect(mockDelete).toHaveBeenCalledWith('record-1')
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(history)')
  act(() => tree.unmount())
})

test('failed deletion keeps the confirmation and recorded sets available', async () => {
  mockDelete.mockResolvedValue(false)
  const tree = mount(React.createElement(RecordScreen))
  pressLabel(tree, 'Delete record')
  const deleteButtons = tree.root
    .findAllByType('Button')
    .filter((button) => button.props.children?.props?.children === 'Delete record')
  await act(async () => {
    await deleteButtons[deleteButtons.length - 1].props.onPress()
  })
  expect(mockReplace).not.toHaveBeenCalled()
  expect(tree.root.findByType('Sheet').props.open).toBe(true)
  expect(tree.root.findAllByType('Text').some((text) => text.props.children === '12:00')).toBe(true)
  expect(tree.root.findAllByType('Text').some((text) => text.props.children === '8:00')).toBe(true)
  act(() => tree.unmount())
})

test('selecting a calendar date jumps to its session week and Today selects the current day', () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 1, 12))
  const tree = mount(React.createElement(HistoryPage))
  act(() =>
    tree.root
      .findAllByType('Button')
      .find((button) => button.props.accessibilityLabel === 'Previous month')
      .props.onPress()
  )
  act(() =>
    tree.root
      .findAllByType('Button')
      .find((button) => button.props.accessibilityLabel === 'Expand month calendar')
      .props.onPress()
  )
  act(() =>
    tree.root
      .findAllByType('Button')
      .find(
        (button) =>
          button.props.accessibilityLabel?.includes('September 30') &&
          button.props.accessibilityLabel.includes('completed session')
      )
      .props.onPress()
  )
  expect(mockScroll).toHaveBeenLastCalledWith({ index: 0, animated: true, viewPosition: 0 })
  pressLabel(tree, 'Today')
  const selected = tree.root
    .findAllByType('Button')
    .find((button) => button.props.accessibilityState?.selected)
  expect(selected.props.accessibilityLabel).toContain('October 1')
  expect(
    tree.root
      .findAllByType('Text')
      .some((text) => [].concat(text.props.children).join('') === '2 intervals')
  ).toBe(true)
  expect(
    tree.root
      .findAllByType('Text')
      .some((text) => [].concat(text.props.children).join('') === '870 kg volume')
  ).toBe(true)
  act(() => tree.root.findByType('Card').props.onPress())
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(history)/record/[id]',
    params: { id: 'record-1' },
  })
  act(() => tree.unmount())
  jest.useRealTimers()
})

test('empty history keeps its calendar and refreshable list with a useful workout action', () => {
  mockRecords = []
  const tree = mount(React.createElement(HistoryPage))
  expect(
    tree.root
      .findAllByType('Button')
      .some((button) => button.props.accessibilityLabel === 'Expand month calendar')
  ).toBe(true)
  expect(tree.root.findByType('FlashList').props.onRefresh).toEqual(expect.any(Function))
  pressLabel(tree, 'Choose a workout')
  expect(mockPush).toHaveBeenCalledWith('/workouts')
  act(() => tree.unmount())
})
