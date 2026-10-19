jest.mock('../../components/ui/CadenceOverlay', () => ({
  CadenceOverlay: ({ open, children }) => (open ? children : null),
}))

const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 80 }))
jest.mock('react-native', () => {
  const React = require('react')
  const component = (name) => (props) => React.createElement(name, props, props.children)
  return {
    Platform: { OS: 'android' },
    KeyboardAvoidingView: component('KeyboardAvoidingView'),
    ScrollView: component('ScrollView'),
    View: component('View'),
    Text: component('Text'),
    Pressable: component('Pressable'),
    TextInput: component('TextInput'),
    Switch: component('Switch'),
  }
})

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../config/launchPolicy', () => ({
  isBackendEnabledForLaunch: jest.fn(() => true),
}))
jest.mock('../../components/NotificationPermissions', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('../../components/ui/icons', () => ({ Check: () => null, ChevronDown: () => null }))
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({
    background: '#fff',
    foreground: '#111',
    muted: '#777',
    divider: '#ddd',
    accent: '#765080',
    onAccent: '#fff',
  }),
}))
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
const { Button: UiButton } = require('../../components/ui/Controls')

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
  update = jest.fn(async (updates, localPreferences) => {
    if (updates.measurements) {
      settings.bodyWeight = updates.measurements.weightKg
      settings.height = updates.measurements.heightCm
    }
    if (updates.timezone !== undefined) settings.timeZone = updates.timezone
    if (localPreferences?.bodyWeightUnit) settings.bodyWeightUnit = localPreferences.bodyWeightUnit
    if (localPreferences?.heightUnit) settings.heightUnit = localPreferences.heightUnit
    return { id: 'user' }
  })
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
  const input = () => view.root.findByProps({ nativeID: 'body-weight' })
  await act(async () => input().props.onChangeText('80'))
  expect(settings.setBodyWeight).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  const save = () =>
    view.root
      .findAllByType(UiButton)
      .find((button) => button.props.children === 'Save measurements')
  update.mockResolvedValueOnce(null)
  await act(async () => save().props.onPress())
  expect(settings.setBodyWeight).not.toHaveBeenCalled()
  expect(input().props.value).toBe('80')
  expect(save().props.disabled).toBe(false)
  await act(async () => save().props.onPress())
  expect(update).toHaveBeenLastCalledWith(
    { measurements: { weightKg: 80, heightCm: null } },
    { bodyWeightUnit: 'kg', heightUnit: 'cm' }
  )
  expect(settings.setBodyWeight).not.toHaveBeenCalled()
  expect(save().props.disabled).toBe(true)
  await act(async () => view.unmount())
})

test('unit switches preserve canonical values and invalid measurements cannot save', async () => {
  let view
  await act(async () => {
    view = create(React.createElement(BodyScreen))
  })
  const buttons = () => view.root.findAllByType(UiButton)
  await act(async () =>
    buttons()
      .find((button) => button.props.accessibilityLabel === 'lb')
      .props.onPress()
  )
  expect(view.root.findByProps({ nativeID: 'body-weight' }).props.value).toBe('165.3')
  await act(async () =>
    buttons()
      .find((button) => button.props.accessibilityLabel === 'kg')
      .props.onPress()
  )
  expect(view.root.findByProps({ nativeID: 'body-weight' }).props.value).toBe('75')
  await act(async () => view.root.findByProps({ nativeID: 'body-weight' }).props.onChangeText('-2'))
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
  const input = (id) => view.root.findByProps({ nativeID: id })
  await act(async () => input('rest-seconds').props.onChangeText('60'))
  expect(settings.setRestTimerDefaultSeconds).not.toHaveBeenCalled()
  await act(async () =>
    view.root
      .findAllByType(UiButton)
      .find((button) => button.props.children === '2 min')
      .props.onPress()
  )
  expect(settings.restTimerDefaultSeconds).toBe(120)
  await act(async () => view.root.findByType('Switch').props.onValueChange(false))
  await act(async () => view.update(React.createElement(TimerScreen)))
  expect(settings.restTimerDefaultSeconds).toBe(120)
  expect(input('rest-minutes').props.editable).toBe(false)
  expect(input('rest-seconds').props.editable).toBe(false)
  await act(async () => view.unmount())
})

test('legal Markdown renders headings, soft and hard breaks, emphasis, lists, dividers, and links', async () => {
  const { MarkdownDisplay } = require('../../components/ui/MarkdownDisplay')
  const Linking = require('expo-linking')
  const getText = (node) => {
    if (!node) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    const children = node.props.children
    return Array.isArray(children)
      ? children.map(getText).join('')
      : typeof children === 'string'
        ? children
        : children?.props
          ? getText(children)
          : ''
  }
  let view
  await act(async () => {
    view = create(
      React.createElement(MarkdownDisplay, {
        content: `# Privacy Policy

The policy
joins softly with **bold** and _care_.

Publisher: Example\x20\x20
Contact: [support](https://example.com/contact)

- First requirement
- Second requirement

---`,
      })
    )
  })
  const heading = view.root
    .findAllByType('Text')
    .find((text) => text.props.accessibilityRole === 'header')
  expect(heading.props.className).toContain('text-screen-title')

  const textNodes = view.root.findAllByType('Text')
  const summary = textNodes.find((text) => getText(text).includes('The policy'))
  expect(getText(summary)).toContain('The policy joins softly with bold and care.')
  const contact = textNodes.find((text) => getText(text).includes('Publisher: Example'))
  expect(getText(contact)).toContain('Publisher: Example\nContact: support')
  expect(textNodes.filter((text) => text.props.children === '•')).toHaveLength(2)
  expect(textNodes.some((text) => text.props.className?.includes('font-dm-semibold'))).toBe(true)
  expect(
    view.root
      .findAllByType('View')
      .some((element) => element.props.className?.includes('h-px bg-divider'))
  ).toBe(true)

  const link = view.root
    .findAllByType('Text')
    .find((text) => text.props.accessibilityRole === 'link')
  link.props.onPress()
  expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/contact')
  await act(async () => view.unmount())
})

test('time-zone search accepts city names and failed updates keep the selected zone', async () => {
  const Selector = require('../../components/TimeZoneSelector').default
  let view
  await act(async () => {
    view = create(React.createElement(Selector, { inline: true }))
  })
  const search = () => view.root.findByProps({ nativeID: 'time-zone-search' })
  await act(async () => search().props.onChangeText('New York'))
  const choices = () =>
    view.root
      .findAllByType('Pressable')
      .filter((button) => button.props.accessibilityRole === 'radio')
  expect(choices()).toHaveLength(1)
  update.mockResolvedValueOnce(null)
  await act(async () => choices()[0].props.onPress())
  expect(settings.setTimeZone).not.toHaveBeenCalled()
  expect(search().props.value).toBe('New York')
  await act(async () => choices()[0].props.onPress())
  expect(update).toHaveBeenLastCalledWith({ timezone: 'America/New_York' })
  expect(settings.timeZone).toBe('America/New_York')
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
    .findAllByType('Pressable')
    .filter((button) => button.props.accessibilityRole === 'radio')
  await act(async () => choices[1].props.onPress())
  expect(select).toHaveBeenCalledWith('America/New_York')
  expect(settings.setTimeZone).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  await act(async () => view.unmount())
})

test('Settings keyboard avoidance includes footer and uses the native header offset on both platforms', async () => {
  const { SettingsPage } = jest.requireActual('../../components/settings/SettingsPage')
  const { Platform } = require('react-native')
  for (const [platform, behavior] of [
    ['android', 'height'],
    ['ios', 'padding'],
  ]) {
    Platform.OS = platform
    let view
    await act(async () => {
      view = create(
        React.createElement(
          SettingsPage,
          { title: 'Body measurements', footer: React.createElement('SaveFooter') },
          React.createElement('Form')
        )
      )
    })
    const avoider = view.root.findByType('KeyboardAvoidingView')
    expect(avoider.props.behavior).toBe(behavior)
    expect(avoider.props.keyboardVerticalOffset).toBe(80)
    expect(avoider.findAllByType('SaveFooter')).toHaveLength(1)
    expect(view.root.findByType('ScrollView').findAllByType('SaveFooter')).toHaveLength(0)
    await act(async () => view.unmount())
  }
  Platform.OS = 'android'
})

test('native reminder frequency defaults safely and preserves explicit Off', async () => {
  const { useAuth } = require('../../contexts/AuthContext')
  const { isBackendEnabledForLaunch } = require('../../config/launchPolicy')
  const { Platform } = require('react-native')
  const PermissionsScreen = require('../../app/(tabs)/settings/permissions').default
  Platform.OS = 'android'
  for (const [user, expected] of [
    [null, '1 / day'],
    [{ email: 'native@example.com' }, '1 / day'],
    [{ notificationFrequency: undefined }, '1 / day'],
    [{ notificationFrequency: 0 }, 'Off'],
    [{ notificationFrequency: 2 }, '2 / day'],
  ]) {
    useAuth.mockReturnValue({ user })
    let view
    await act(async () => {
      view = create(React.createElement(PermissionsScreen))
    })
    const selected = view.root
      .findAll((node) => node.props.accessibilityRole === 'radio')
      .find((radio) => radio.props.accessibilityState?.checked)
    expect(selected.props.accessibilityLabel).toBe(expected)
    expect(update).not.toHaveBeenCalled()
    await act(async () => view.unmount())
  }

  Platform.OS = 'android'
  isBackendEnabledForLaunch.mockReturnValue(false)
  useAuth.mockReturnValue({ user: { notificationFrequency: 0 } })
  let view
  await act(async () => {
    view = create(React.createElement(PermissionsScreen))
  })
  expect(view.root.findAll((node) => node.props.accessibilityRole === 'radio')).toHaveLength(0)
  await act(async () => view.unmount())
  Platform.OS = 'android'
})
