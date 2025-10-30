import { Platform } from 'react-native'
import type {
  NotificationHandler,
  NotificationChannelInput,
  NotificationTriggerInput,
  NotificationContentInput,
  NotificationPermissionsStatus,
} from 'expo-notifications'

let Notifications: typeof import('expo-notifications') | null = null
let initialized = false
let scheduledId: string | null = null

/**
 * Lazily loads the expo-notifications module.
 * Returns null if the module is not installed.
 */
async function loadModule(): Promise<typeof import('expo-notifications') | null> {
  if (Notifications) return Notifications
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Notifications = require('expo-notifications')
    return Notifications
  } catch {
    console.warn('expo-notifications is not installed. Notifications will be disabled.')
    Notifications = null
    return null
  }
}

/**
 * Initializes the notification service, sets up the handler,
 * creates the Android channel, and requests permissions.
 */
export async function initNotifications(): Promise<void> {
  if (initialized) return
  const mod = await loadModule()

  if (!mod) {
    initialized = true
    return
  }

  try {
    const handler: NotificationHandler = {
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowAlert: true,
        shouldShowBanner: false,
        shouldShowList: true,
      }),
    }
    mod.setNotificationHandler(handler)

    if (Platform.OS === 'android') {
      const channelInput: NotificationChannelInput = {
        name: 'Rest Timer',
        importance: mod.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF7A00',
        sound: 'default',
        lockscreenVisibility: mod.AndroidNotificationVisibility.PUBLIC,
      }
      await mod.setNotificationChannelAsync('rest-timer', channelInput)
    }

    const perms: NotificationPermissionsStatus = await mod.getPermissionsAsync()
    if (!perms.granted) {
      await mod.requestPermissionsAsync()
    }
  } catch (error: unknown) {
    console.error('Failed to initialize notifications:', error)
  } finally {
    initialized = true
  }
}

/**
 * Schedules a notification for the end of a rest period.
 * Cancels any existing 'rest' notification.
 */
export async function scheduleRestNotification(deadlineMs: number): Promise<void> {
  const mod = await loadModule()
  if (!mod) return

  try {
    await cancelRestNotification()

    const now = Date.now()
    let delayInSeconds = Math.ceil((deadlineMs - now) / 1000)

    const trigger: NotificationTriggerInput = {
      type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delayInSeconds,
      channelId: 'rest-timer',
    }

    const content: NotificationContentInput = {
      title: 'Rest complete',
      body: 'Time to start your next set.',
      sound: 'default',

      priority: mod.AndroidNotificationPriority.HIGH,
      interruptionLevel: 'timeSensitive',
    }

    const id = await mod.scheduleNotificationAsync({
      content: content,
      trigger: trigger,
    })
    scheduledId = id
  } catch (error: unknown) {
    console.error('Failed to schedule notification:', error)
  }
}

/**
 * Cancels the currently scheduled rest notification, if one exists.
 */
export async function cancelRestNotification(): Promise<void> {
  const mod = await loadModule()
  if (!mod) return

  try {
    if (scheduledId) {
      await mod.cancelScheduledNotificationAsync(scheduledId)
      scheduledId = null
    }
  } catch (error: unknown) {
    console.error('Failed to cancel notification:', error)
  }
}
