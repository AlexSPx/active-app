const React = require('react')
const { act, create } = require('react-test-renderer')
let mockSettings
const mockSchedule = jest.fn(async () => {})
const mockPermission = jest.fn(async () => {})
const mockSave = jest.fn(async (_scope, changes) => Object.assign(mockSettings, changes))
jest.mock('../../services/notificationService', () => ({
  configureWeightReminder: (...args) => mockSchedule(...args),
  requestWeightReminderPermission: () => mockPermission(),
}))
jest.mock('../../lib/profileScope', () => ({
  getProfileScope: () => ({ ownerId: 'local', generation: 1 }),
  isCurrentProfile: () => true,
}))
jest.mock('../../features/settings/stores/settingsStore', () => ({
  useSettingsStore: (selector) => selector(mockSettings),
  saveSettingsProfile: (...args) => mockSave(...args),
}))
jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({ accent: '#111', foreground: '#111', onAccent: '#fff' }),
}))
const { WeightReminderSettings } = require('../../components/WeightReminderSettings')
const { Button } = require('../../components/ui/Controls')
const { Switch } = require('react-native')

test('turns on, changes hour, then turns off a daily reminder', async () => {
  mockSettings = { weightReminderEnabled: false, weightReminderHour: 8 }
  let view
  await act(async () => {
    view = create(React.createElement(WeightReminderSettings))
  })
  await act(async () => {
    view.root.findByType(Switch).props.onValueChange(true)
  })
  await act(async () => {
    view.update(React.createElement(WeightReminderSettings))
  })
  await act(async () => {
    view.root
      .findAllByType(Button)
      .find((node) => node.props.accessibilityLabel === 'Later reminder hour')
      .props.onPress()
  })
  await act(async () => {
    view.update(React.createElement(WeightReminderSettings))
  })
  await act(async () => {
    view.root.findByType(Switch).props.onValueChange(false)
  })
  expect(mockSchedule.mock.calls).toEqual([
    [true, 8],
    [true, 9],
    [false, 9],
  ])
  expect(mockPermission).toHaveBeenCalledTimes(2)
  expect(mockSettings).toEqual({ weightReminderEnabled: false, weightReminderHour: 9 })
  act(() => view.unmount())
})

test('permission denial leaves the reminder off and shows an explanation', async () => {
  mockSettings = { weightReminderEnabled: false, weightReminderHour: 8 }
  mockSchedule.mockClear()
  mockSave.mockClear()
  mockPermission.mockRejectedValueOnce(new Error('Allow notifications in device settings.'))
  let view
  await act(async () => {
    view = create(React.createElement(WeightReminderSettings))
  })
  await act(async () => {
    view.root.findByType(Switch).props.onValueChange(true)
  })
  expect(mockSettings.weightReminderEnabled).toBe(false)
  expect(mockSchedule).not.toHaveBeenCalled()
  expect(mockSave).not.toHaveBeenCalled()
  expect(
    view.root
      .findAll((node) => node.props.accessibilityLiveRegion === 'polite')
      .some((node) => node.props.children === 'Allow notifications in device settings.')
  ).toBe(true)
  act(() => view.unmount())
})
