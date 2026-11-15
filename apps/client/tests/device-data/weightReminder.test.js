const notifications = require('expo-notifications')
const {
  configureWeightReminder,
  cancelAllScheduledNotifications,
} = require('../../services/notificationService')
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'daily-weight-reminder'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
}))
beforeEach(() => jest.clearAllMocks())
test('enabling, changing the hour and disabling replace the same repeating reminder', async () => {
  await configureWeightReminder(true, 8)
  await configureWeightReminder(true, 19)
  await configureWeightReminder(false, 19)
  expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2)
  expect(notifications.scheduleNotificationAsync.mock.calls[1][0]).toMatchObject({
    identifier: 'daily-weight-reminder',
    trigger: { type: 'daily', hour: 19, minute: 0 },
  })
  expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3)
})
test('device erase waits for an in-flight reminder and cancels all notifications', async () => {
  let finish, started
  const running = new Promise((resolve) => {
    started = resolve
  })
  notifications.scheduleNotificationAsync.mockImplementationOnce(() => {
    started()
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const pending = configureWeightReminder(true, 8)
  await running
  const erase = cancelAllScheduledNotifications()
  finish('daily-weight-reminder')
  await Promise.all([pending, erase])
  expect(notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1)
  expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
    'daily-weight-reminder'
  )
})

test('a newer profile reminder supersedes an in-flight schedule', async () => {
  let finish, started
  const running = new Promise((resolve) => {
    started = resolve
  })
  notifications.scheduleNotificationAsync.mockImplementationOnce(() => {
    started()
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const first = configureWeightReminder(true, 8)
  await running
  const second = configureWeightReminder(true, 20)
  finish('daily-weight-reminder')
  await Promise.all([first, second])
  expect(notifications.scheduleNotificationAsync.mock.calls.at(-1)[0].trigger.hour).toBe(20)
})

test('does not schedule when notification access is denied', async () => {
  notifications.getPermissionsAsync.mockResolvedValueOnce({ granted: false })
  await expect(configureWeightReminder(true, 8)).rejects.toThrow('Allow notifications')
  expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled()
})
