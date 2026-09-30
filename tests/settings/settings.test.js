const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('tamagui', () => {
  const React = require('react')
  const components = Object.fromEntries(
    [
      'Button',
      'Input',
      'Label',
      'Paragraph',
      'Text',
      'XStack',
      'YStack',
      'Switch',
      'Separator',
      'Circle',
      'ScrollView',
      'Sheet',
    ].map((name) => [name, (props) => React.createElement(name, props, props.children)])
  )
  components.Switch.Thumb = (props) => React.createElement('Thumb', props)
  return components
})
jest.mock('../../components/settings/SettingsPage', () => ({
  SettingsPage: (props) => require('react').createElement('Page', {}, props.children, props.footer),
}))
jest.mock('@tamagui/lucide-icons', () => ({ Check: () => null, ChevronDown: () => null }))
jest.mock('@vvo/tzdb', () => ({ timeZonesNames: ['Europe/Sofia', 'America/New_York'] }))
jest.mock('expo-linking', () => ({ openURL: jest.fn() }))
jest.mock('../../features/settings', () => ({
  useSettingsStore: jest.fn(),
  useUpdateUser: jest.fn(),
}))
const { useSettingsStore, useUpdateUser } = require('../../features/settings')
const {
  measurementText,
  parseMeasurement,
  parseRestDuration,
} = require('../../features/settings/inputs')
const BodyScreen = require('../../app/(tabs)/settings/body').default
const TimerScreen = require('../../app/(tabs)/settings/rest-timer').default

let settings, update
beforeEach(() => {
  settings = {
    bodyWeight: 75,
    height: null,
    bodyWeightUnit: 'kg',
    heightUnit: 'cm',
    restTimerEnabled: true,
    restTimerDefaultSeconds: 90,
    timeZone: 'Europe/Sofia',
  }
  for (const [setter, field] of Object.entries({
    setBodyWeight: 'bodyWeight',
    setHeight: 'height',
    setBodyWeightUnit: 'bodyWeightUnit',
    setHeightUnit: 'heightUnit',
    setRestTimerEnabled: 'restTimerEnabled',
    setRestTimerDefaultSeconds: 'restTimerDefaultSeconds',
    setTimeZone: 'timeZone',
  })) {
    settings[setter] = jest.fn((value) => {
      settings[field] = value
    })
  }
  update = jest.fn().mockResolvedValue({ id: 'user' })
  useSettingsStore.mockImplementation(() => settings)
  useUpdateUser.mockReturnValue({ updateUserProfile: update, isUpdating: false, error: null })
})

test('measurements preserve optional blanks, convert units, and reject invalid values', () => {
  expect(parseMeasurement('', 'kg')).toBeNull()
  expect(measurementText(null, 'in')).toBe('')
  expect(parseMeasurement('165.3', 'lb')).toBeCloseTo(74.98, 1)
  expect(parseMeasurement('70', 'in')).toBe(177.8)
  expect(measurementText(75, 'lb')).toBe('165.3')
  expect(parseMeasurement('75,5', 'kg')).toBe(75.5)
  for (const text of ['0', '-1', 'abc', 'Infinity', '1e5'])
    expect(parseMeasurement(text, 'kg')).toBeUndefined()
})

test('measurement changes stay staged and failed save preserves the draft', async () => {
  let view
  await act(async () => {
    view = create(React.createElement(BodyScreen))
  })
  const input = () => view.root.findByProps({ id: 'body-weight' })
  await act(async () => input().props.onChangeText('80'))
  expect(settings.setBodyWeight).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  const save = () =>
    view.root
      .findAllByType('Button')
      .find((button) => button.props.children === 'Save measurements')
  update.mockResolvedValueOnce(null)
  await act(async () => save().props.onPress())
  expect(settings.setBodyWeight).not.toHaveBeenCalled()
  expect(input().props.value).toBe('80')
  expect(save().props.disabled).toBe(false)
  await act(async () => save().props.onPress())
  expect(update).toHaveBeenLastCalledWith({ measurements: { weightKg: 80, heightCm: null } })
  expect(settings.setBodyWeight).toHaveBeenCalledWith(80)
  expect(save().props.disabled).toBe(true)
  await act(async () => view.unmount())
})

test('unit switches preserve canonical values and invalid measurements cannot save', async () => {
  let view
  await act(async () => {
    view = create(React.createElement(BodyScreen))
  })
  const buttons = () => view.root.findAllByType('Button')
  await act(async () =>
    buttons()
      .find((button) => button.props.children === 'lb')
      .props.onPress()
  )
  expect(view.root.findByProps({ id: 'body-weight' }).props.value).toBe('165.3')
  await act(async () =>
    buttons()
      .find((button) => button.props.children === 'kg')
      .props.onPress()
  )
  expect(view.root.findByProps({ id: 'body-weight' }).props.value).toBe('75')
  await act(async () => view.root.findByProps({ id: 'body-weight' }).props.onChangeText('-2'))
  expect(
    buttons().find((button) => button.props.children === 'Save measurements').props.disabled
  ).toBe(true)
  expect(update).not.toHaveBeenCalled()
  await act(async () => view.unmount())
})

test('rest duration accepts 0:01 through 59:59 and rejects incomplete or invalid values', () => {
  expect(parseRestDuration('0', '1')).toBe(1)
  expect(parseRestDuration('59', '59')).toBe(3599)
  for (const pair of [
    ['0', '0'],
    ['1', '60'],
    ['60', '0'],
    ['1', ''],
    ['1.5', '0'],
    ['-1', '0'],
  ])
    expect(parseRestDuration(...pair)).toBeNull()
})

test('rest timer presets persist and turning it off keeps duration and disables edits', async () => {
  let view
  await act(async () => {
    view = create(React.createElement(TimerScreen))
  })
  const input = (id) => view.root.findByProps({ id })
  await act(async () => input('rest-seconds').props.onChangeText('60'))
  expect(settings.setRestTimerDefaultSeconds).not.toHaveBeenCalled()
  await act(async () =>
    view.root
      .findAllByType('Button')
      .find((button) => button.props.children === '2 min')
      .props.onPress()
  )
  expect(settings.restTimerDefaultSeconds).toBe(120)
  await act(async () => view.root.findByType('Switch').props.onCheckedChange(false))
  await act(async () => view.update(React.createElement(TimerScreen)))
  expect(settings.restTimerDefaultSeconds).toBe(120)
  expect(input('rest-minutes').props.disabled).toBe(true)
  expect(input('rest-seconds').props.disabled).toBe(true)
  await act(async () => view.unmount())
})

test('legal reading uses quiet headings, dividers, and preserves working links', async () => {
  const { MarkdownDisplay } = require('../../components/ui/MarkdownDisplay')
  const Linking = require('expo-linking')
  let view
  await act(async () => {
    view = create(
      React.createElement(MarkdownDisplay, {
        content: '### Contact us\nRead the policy at [our site](https://example.com/policy).\n---',
      })
    )
  })
  const heading = view.root
    .findAllByType('Text')
    .find((text) => text.props.accessibilityRole === 'header')
  expect(heading.props.fontSize).toBe('$body')
  expect(heading.props.lineHeight).toBe('$body')
  expect(view.root.findAllByType('Separator')).toHaveLength(1)
  const link = view.root
    .findAllByType('Text')
    .find((text) => text.props.accessibilityRole === 'link')
  link.props.onPress()
  expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/policy')
  await act(async () => view.unmount())
})

test('time-zone search accepts city names and failed updates keep the selected zone', async () => {
  const Selector = require('../../components/TimeZoneSelector').default
  let view
  await act(async () => {
    view = create(React.createElement(Selector, { inline: true }))
  })
  await act(async () => view.root.findByType('Input').props.onChangeText('New York'))
  const choices = () =>
    view.root.findAllByType('Button').filter((button) => button.props.accessibilityRole === 'radio')
  expect(choices()).toHaveLength(1)
  update.mockResolvedValueOnce(null)
  await act(async () => choices()[0].props.onPress())
  expect(settings.setTimeZone).not.toHaveBeenCalled()
  expect(view.root.findByType('Input').props.value).toBe('New York')
  await act(async () => choices()[0].props.onPress())
  expect(update).toHaveBeenLastCalledWith({ timezone: 'America/New_York' })
  expect(settings.setTimeZone).toHaveBeenCalledWith('America/New_York')
  await act(async () => view.unmount())
})

test('controlled time-zone selector stages registration without updating profile or settings', async () => {
  const Selector = require('../../components/TimeZoneSelector').default
  const select = jest.fn()
  let view
  await act(async () => {
    view = create(
      React.createElement(Selector, { inline: true, value: 'Europe/Sofia', onValueChange: select })
    )
  })
  const choices = view.root
    .findAllByType('Button')
    .filter((button) => button.props.accessibilityRole === 'radio')
  await act(async () => choices[1].props.onPress())
  expect(select).toHaveBeenCalledWith('America/New_York')
  expect(settings.setTimeZone).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  await act(async () => view.unmount())
})
