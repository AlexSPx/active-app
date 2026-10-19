const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#faf7fc', '#2d2235', '#76627e', '#dcd0e4', '#624572', '#faf5fc'],
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
jest.mock('../../components/ui/icons', () => ({
  ChevronLeft: 'ChevronLeft',
  ChevronRight: 'ChevronRight',
  MoreHorizontal: 'MoreHorizontal',
}))
jest.mock('../../components/ui/CadenceOverlay', () => {
  const React = require('react')
  return {
    CadenceOverlay: ({ open, children, ...props }) =>
      React.createElement(
        'ConfirmationSheet',
        { ...props, testID: 'confirmation-sheet', accessibilityState: { expanded: open } },
        open ? children : null
      ),
  }
})
jest.mock('../../components/ui/ActionMenu', () => ({
  ActionMenu: ({ actions, label }) => {
    const React = require('react')
    const { Pressable, Text, View } = require('react-native')
    return React.createElement(
      View,
      { accessibilityLabel: label },
      actions.map((action) =>
        React.createElement(
          Pressable,
          {
            key: action.label,
            accessibilityRole: 'button',
            accessibilityLabel: action.label,
            disabled: action.disabled,
            onPress: action.onPress,
          },
          React.createElement(Text, null, action.label)
        )
      )
    )
  },
}))
jest.mock('@shopify/flash-list', () => {
  const React = require('react')
  return {
    FlashList: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({ scrollToIndex: jest.fn() }))
      const rows = props.data.map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: item.id },
          props.renderItem({ item, index }),
          index < props.data.length - 1 ? props.ItemSeparatorComponent?.() : null
        )
      )
      return React.createElement(
        'FlashList',
        {
          testID: 'history-flash-list',
          refreshing: props.refreshing,
          onRefresh: props.onRefresh,
          contentContainerStyle: props.contentContainerStyle,
        },
        props.ListHeaderComponent,
        props.data.length ? rows : props.ListEmptyComponent,
        props.ListFooterComponent
      )
    }),
  }
})
jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }) => options?.headerRight?.() ?? null,
  },
  useLocalSearchParams: () => ({ id: mockRouteId }),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))
jest.mock('../../features/workouts', () => ({
  useWorkoutRecords: () => ({
    workoutRecords: mockRecords,
    loading: mockLoading,
    error: mockError,
    refetch: mockRefetch,
  }),
  useWorkoutMutations: () => ({
    deleteWorkoutRecord: mockDelete,
    loading: mockDeleting,
    error: mockDeleteError,
    clearError: mockClearError,
  }),
}))
jest.mock('../../components/ui/LoadingSpinner', () => ({ LoadingSpinner: 'LoadingSpinner' }))

const { HistoryCalendar } = require('../../features/history/components/HistoryCalendar')
const { recordDurationSeconds } = require('../../features/history/components/record')
const { countSetsForRecord, computeVolumeForRecord } = require('../../utils/workoutUtils')
const { parseServerUtcDate } = require('../../utils/date')
const HistoryPage = require('../../app/(tabs)/(history)/index').default
const RecordScreen = require('../../app/(tabs)/(history)/record/[id]').default
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockDelete = jest.fn()
const mockClearError = jest.fn()
let mockRecords
let mockLoading
let mockError
let mockDeleteError
let mockDeleting
let mockRefetch
let mockRouteId
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
  mockLoading = false
  mockError = null
  mockDeleteError = null
  mockDeleting = false
  mockRouteId = 'record-1'
  mockRefetch = jest.fn().mockResolvedValue(undefined)
  mockPush.mockReset()
  mockReplace.mockReset()
  mockDelete.mockReset()
  mockClearError.mockReset()
})

function mount(component) {
  let tree
  act(() => {
    tree = create(component)
  })
  return tree
}

function findLabel(tree, label) {
  const matches = tree.root.findAll((node) => node.props.accessibilityLabel === label)
  const match =
    matches.find(
      (node) => typeof node.props.onPress === 'function' || typeof node.props.onClick === 'function'
    ) ?? matches[0]
  if (!match) throw new Error(`Could not find accessibility label: ${label}`)
  return match
}

function pressLabel(tree, label) {
  const target = findLabel(tree, label)
  act(() => (target.props.onPress ?? target.props.onClick)())
}

function textContent(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(textContent).join('')
  if (React.isValidElement(value)) return textContent(value.props.children)
  return ''
}

function hasText(tree, text) {
  return tree.root.findAll((node) => textContent(node.props.children).includes(text)).length > 0
}

const longDate = (date) =>
  date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

test('month and week calendars show the right period and expose 44px day targets', () => {
  const onNavigatePeriod = jest.fn()
  const onSelectDate = jest.fn()
  const onViewChange = jest.fn()
  const month = mount(
    React.createElement(HistoryCalendar, {
      monthDate: new Date(2026, 0, 31),
      selectedDate: new Date(2026, 0, 31),
      view: 'month',
      workoutDays: new Set(['2026-01-31']),
      onNavigatePeriod,
      onViewChange,
      onSelectDate,
    })
  )
  const monthDays = month.root.findAll(
    (node) =>
      node.props.accessibilityState?.selected !== undefined &&
      typeof node.props.accessibilityLabel === 'string'
  )
  expect(new Set(monthDays.map((node) => node.props.accessibilityLabel)).size).toBe(35)
  expect(
    new Set(
      monthDays
        .filter((node) => node.props.accessibilityState.selected)
        .map((node) => node.props.accessibilityLabel)
    ).size
  ).toBe(1)
  expect(findLabel(month, 'Previous month')).toBeTruthy()
  pressLabel(month, 'Next month')
  expect(onNavigatePeriod).toHaveBeenCalledWith(1)
  act(() => month.unmount())

  const week = mount(
    React.createElement(HistoryCalendar, {
      monthDate: new Date(2026, 0, 31),
      selectedDate: new Date(2026, 0, 31),
      view: 'week',
      workoutDays: new Set(),
      onNavigatePeriod,
      onViewChange,
      onSelectDate,
    })
  )
  const weekDays = week.root.findAll(
    (node) =>
      node.props.accessibilityState?.selected !== undefined &&
      typeof node.props.accessibilityLabel === 'string'
  )
  expect(new Set(weekDays.map((node) => node.props.accessibilityLabel)).size).toBe(7)
  expect(findLabel(week, 'Previous week')).toBeTruthy()
  expect(findLabel(week, 'Next week')).toBeTruthy()
  const dayTargets = week.root.findAll(
    (node) =>
      node.props.accessibilityState?.selected !== undefined &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.className?.includes('min-h-touch') &&
      node.props.className?.includes('min-w-touch')
  )
  expect(new Set(dayTargets.map((node) => node.props.accessibilityLabel)).size).toBe(7)
  expect(
    dayTargets.every(
      (node) =>
        node.props.className?.includes('min-h-touch') &&
        node.props.className?.includes('min-w-touch')
    )
  ).toBe(true)
  act(() => week.unmount())
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

test('record details follow the mock header, summary and recorded-set order', () => {
  mockRecords = [
    {
      ...mockRecord,
      workoutTitle: 'Lower body foundations',
      startTime: '2026-10-14T08:00:00Z',
      createdAt: '2026-10-14T08:38:00Z',
      exerciseRecords: [
        { exerciseName: 'Barbell full squat', reps: [8, 8, 8], weight: [70, 70, 70] },
        { exerciseName: 'Barbell lunge', reps: [10, 10, 10], weight: [20, 20, 20] },
      ],
    },
  ]
  const tree = mount(React.createElement(RecordScreen))
  const text = []
  function collect(node) {
    if (typeof node === 'string') text.push(node)
    else if (Array.isArray(node)) node.forEach(collect)
    else node?.children?.forEach(collect)
  }
  collect(tree.toJSON())
  const headerStart = text.indexOf('October 14, 2026')
  expect(text.slice(headerStart, headerStart + 10)).toEqual([
    'October 14, 2026',
    'Lower body foundations',
    'A session in the books.',
    '38',
    'minutes',
    '6',
    'sets',
    '2,280',
    'kg lifted',
    'Recorded sets',
  ])
  const squatStart = text.indexOf('Barbell full squat')
  expect(text.slice(squatStart, squatStart + 13)).toEqual([
    'Barbell full squat',
    'Set',
    'Weight (kg)',
    'Reps',
    '1',
    '70',
    '8',
    '2',
    '70',
    '8',
    '3',
    '70',
    '8',
  ])
  const lungeStart = text.indexOf('Barbell lunge')
  expect(text.slice(lungeStart, lungeStart + 13)).toEqual([
    'Barbell lunge',
    'Set',
    'Weight (kg)',
    'Reps',
    '1',
    '20',
    '10',
    '2',
    '20',
    '10',
    '3',
    '20',
    '10',
  ])
  expect(hasText(tree, 'Finished at')).toBe(false)
  act(() => tree.unmount())
})

test('opening and cancelling a record never deletes data; explicit confirmation deletes its real ID', async () => {
  mockDelete.mockResolvedValue(true)
  const tree = mount(React.createElement(RecordScreen))
  expect(mockDelete).not.toHaveBeenCalled()
  pressLabel(tree, 'Delete record')
  expect(mockDelete).not.toHaveBeenCalled()
  expect(
    tree.root.findByProps({ testID: 'confirmation-sheet' }).props.accessibilityState.expanded
  ).toBe(true)
  pressLabel(tree, 'Keep record')
  expect(mockDelete).not.toHaveBeenCalled()
  pressLabel(tree, 'Delete record')
  await act(async () => {
    await findLabel(tree, 'Confirm delete record').props.onPress()
  })
  expect(mockDelete).toHaveBeenCalledTimes(1)
  expect(mockDelete).toHaveBeenCalledWith('record-1')
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(history)')
  act(() => tree.unmount())
})

test('failed deletion keeps recorded strength/cardio values and the confirmation available for retry', async () => {
  mockDelete.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const tree = mount(React.createElement(RecordScreen))
  pressLabel(tree, 'Delete record')
  await act(async () => {
    await findLabel(tree, 'Confirm delete record').props.onPress()
  })
  expect(mockReplace).not.toHaveBeenCalled()
  expect(
    tree.root.findByProps({ testID: 'confirmation-sheet' }).props.accessibilityState.expanded
  ).toBe(true)
  expect(hasText(tree, '12:00')).toBe(true)
  expect(hasText(tree, '8:00')).toBe(true)
  expect(hasText(tree, '60')).toBe(true)
  expect(hasText(tree, 'interval minutes')).toBe(true)
  await act(async () => {
    await findLabel(tree, 'Confirm delete record').props.onPress()
  })
  expect(mockDelete).toHaveBeenCalledTimes(2)
  expect(mockDelete).toHaveBeenLastCalledWith('record-1')
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(history)')
  act(() => tree.unmount())
})

test('date selection filters records; Today, Show all, and record navigation work', () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 1, 12))
  mockRecords = [
    mockRecord,
    {
      ...mockRecord,
      id: 'record-2',
      workoutTitle: 'Today run',
      createdAt: '2026-10-01T10:00:00',
      startTime: '2026-10-01T09:00:00',
      exerciseRecords: [{ exerciseName: 'Run', reps: [], weight: [], durationSeconds: [900, 600] }],
    },
  ]
  const tree = mount(React.createElement(HistoryPage))
  const completedDay = `${longDate(new Date(2026, 8, 30))}, completed session`
  pressLabel(tree, completedDay)
  expect(hasText(tree, '1 completed session')).toBe(true)
  expect(hasText(tree, 'Mixed session')).toBe(true)
  expect(hasText(tree, '60 min / 2 sets / 2 intervals / 870 kg')).toBe(true)
  expect(hasText(tree, 'elapsed')).toBe(false)
  expect(hasText(tree, 'Squat · Run')).toBe(false)
  expect(hasText(tree, 'Today run')).toBe(false)
  pressLabel(tree, 'Show all sessions')
  expect(hasText(tree, '2 completed sessions')).toBe(true)
  pressLabel(tree, 'Go to today')
  expect(hasText(tree, 'Today run')).toBe(true)
  expect(hasText(tree, '60 min / 2 intervals')).toBe(true)
  expect(hasText(tree, 'Mixed session')).toBe(false)
  const todayLabel = `${longDate(new Date(2026, 9, 1))}, today, completed session`
  expect(findLabel(tree, todayLabel)).toBeTruthy()
  const recordButton = tree.root.findAll((node) =>
    node.props.accessibilityLabel?.startsWith('View Today run,')
  )[0]
  act(() => recordButton.props.onPress())
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(history)/record/[id]',
    params: { id: 'record-2' },
  })
  act(() => tree.unmount())
  jest.useRealTimers()
})

test('history cards show the compact title and summary from the mock', () => {
  mockRecords = [
    {
      ...mockRecord,
      workoutTitle: 'Lower body foundations',
      startTime: '2026-10-14T08:00:00',
      createdAt: '2026-10-14T08:38:00',
      exerciseRecords: [
        { exerciseName: 'Squat', reps: [10, 10, 10, 10, 10, 10], weight: [38, 38, 38, 38, 38, 38] },
      ],
    },
  ]
  const tree = mount(React.createElement(HistoryPage))
  expect(hasText(tree, 'Lower body foundations')).toBe(true)
  expect(hasText(tree, '38 min / 6 sets / 2,280 kg')).toBe(true)
  expect(hasText(tree, 'Squat')).toBe(false)
  const card = tree.root.findAll((node) =>
    node.props.accessibilityLabel?.startsWith('View Lower body foundations,')
  )[0]
  act(() => card.props.onPress())
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(history)/record/[id]',
    params: { id: 'record-1' },
  })
  act(() => tree.unmount())
})

test('history summaries use singular labels for one set and one interval', () => {
  mockRecords = [
    {
      ...mockRecord,
      id: 'record-single-counts',
      exerciseRecords: [
        { exerciseName: 'Squat', reps: [5], weight: [100] },
        { exerciseName: 'Run', reps: [], weight: [], durationSeconds: [60] },
      ],
    },
  ]
  const tree = mount(React.createElement(HistoryPage))
  expect(hasText(tree, '60 min / 1 set / 1 interval / 500 kg')).toBe(true)
  expect(hasText(tree, '1 sets')).toBe(false)
  expect(hasText(tree, '1 intervals')).toBe(false)
  act(() => tree.unmount())
})

test('period arrows navigate by a week in Week mode and a month in Month mode', () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 1, 12))
  const tree = mount(React.createElement(HistoryPage))
  pressLabel(tree, 'Week')
  pressLabel(tree, 'Previous week')
  expect(findLabel(tree, `${longDate(new Date(2026, 8, 24))}`)).toBeTruthy()
  pressLabel(tree, 'Next week')
  expect(findLabel(tree, `${longDate(new Date(2026, 9, 1))}, today`)).toBeTruthy()
  pressLabel(tree, 'Month')
  pressLabel(tree, 'Next month')
  expect(findLabel(tree, `${longDate(new Date(2026, 10, 1))}`)).toBeTruthy()
  act(() => tree.unmount())
  jest.useRealTimers()
})

test('empty, loading, and error states keep the calendar usable and history refreshable', async () => {
  mockRecords = []
  mockLoading = true
  let tree = mount(React.createElement(HistoryPage))
  expect(findLabel(tree, 'Go to today')).toBeTruthy()
  expect(findLabel(tree, 'Next month')).toBeTruthy()
  expect(hasText(tree, 'Loading history…')).toBe(true)
  act(() => tree.unmount())

  mockLoading = false
  mockError = 'offline'
  tree = mount(React.createElement(HistoryPage))
  expect(findLabel(tree, 'Previous month')).toBeTruthy()
  expect(hasText(tree, 'Could not load history: offline')).toBe(true)
  await act(async () => {
    await findLabel(tree, 'Try again').props.onPress()
  })
  expect(mockRefetch).toHaveBeenCalledTimes(1)
  act(() => tree.unmount())

  mockError = null
  mockRecords = []
  tree = mount(React.createElement(HistoryPage))
  expect(hasText(tree, 'No records yet')).toBe(true)
  const list = tree.root.findByProps({ testID: 'history-flash-list' })
  expect(list.props.onRefresh).toEqual(expect.any(Function))
  await act(async () => {
    await list.props.onRefresh()
  })
  expect(mockRefetch).toHaveBeenCalledTimes(2)
  act(() => tree.unmount())
})

test('a refresh error retains cached records and offers retry', () => {
  mockError = 'sync unavailable'
  const tree = mount(React.createElement(HistoryPage))
  expect(hasText(tree, 'Could not load history: sync unavailable')).toBe(true)
  expect(hasText(tree, 'Mixed session')).toBe(true)
  expect(findLabel(tree, 'Try again')).toBeTruthy()
  act(() => tree.unmount())
})

test('history and record details reserve the floating tab content inset', () => {
  const { TabContentInsetContext } = require('../../navigation/TabContentInset')
  const withInset = (screen, inset) =>
    React.createElement(
      TabContentInsetContext.Provider,
      { value: inset },
      React.createElement(screen)
    )
  const history = mount(withInset(HistoryPage, 164))
  expect(history.root.findByType('FlashList').props.contentContainerStyle.paddingBottom).toBe(164)
  act(() => history.update(withInset(HistoryPage, 240)))
  expect(history.root.findByType('FlashList').props.contentContainerStyle.paddingBottom).toBe(240)
  act(() => history.unmount())

  const detail = mount(withInset(RecordScreen, 164))
  const { ScrollView } = require('react-native')
  expect(detail.root.findByType(ScrollView).props.contentContainerStyle.paddingBottom).toBe(164)
  act(() => detail.update(withInset(RecordScreen, 240)))
  expect(detail.root.findByType(ScrollView).props.contentContainerStyle.paddingBottom).toBe(240)
  act(() => detail.unmount())
})
