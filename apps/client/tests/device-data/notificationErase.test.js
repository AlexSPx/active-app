const notifications = require('expo-notifications')
const {
  scheduleRestNotification,
  cancelAllScheduledNotifications,
} = require('../../services/notificationService')

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  AndroidNotificationPriority: { HIGH: 'high' },
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
}))

test('erase drains a pending schedule and removes its returned ID before bulk cancellation', async () => {
  let finishSchedule
  let scheduleStarted
  const started = new Promise((resolve) => {
    scheduleStarted = resolve
  })
  notifications.scheduleNotificationAsync.mockImplementation(() => {
    scheduleStarted()
    return new Promise((resolve) => {
      finishSchedule = resolve
    })
  })
  const scheduling = scheduleRestNotification(Date.now() + 60000)
  await started
  const clearing = cancelAllScheduledNotifications()
  await Promise.resolve()
  expect(notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled()
  finishSchedule('old-profile-alert')
  await Promise.all([scheduling, clearing])
  expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-profile-alert')
  expect(notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1)
})
