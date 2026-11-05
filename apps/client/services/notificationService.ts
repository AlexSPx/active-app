import { Platform } from 'react-native'
import type {
  NotificationHandler,
  NotificationChannelInput,
  NotificationTriggerInput,
  NotificationContentInput,
} from 'expo-notifications'

let Notifications: typeof import('expo-notifications') | null = null
let initialized = false
let scheduledId: string | null = null
let scheduleGeneration = 0
const pendingSchedules = new Set<Promise<void>>()

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
 * Initializes local notifications and creates the Android rest-timer channel.
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
        lockscreenVisibility: mod.AndroidNotificationVisibility.PUBLIC,
      }
      await mod.setNotificationChannelAsync('rest-timer', channelInput)
    }

    // Permissions are requested explicitly in the settings UI.
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
  const operation = scheduleRestNotificationInternal(deadlineMs, scheduleGeneration)
  pendingSchedules.add(operation)
  try {
    await operation
  } finally {
    pendingSchedules.delete(operation)
  }
}

async function scheduleRestNotificationInternal(
  deadlineMs: number,
  generation: number
): Promise<void> {
  const mod = await loadModule()
  if (!mod) return

  try {
    await cancelRestNotification()

    if (generation !== scheduleGeneration) return
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
      ...(Platform.OS === 'ios' ? { sound: 'default' as const } : {}),

      priority: mod.AndroidNotificationPriority.HIGH,
      interruptionLevel: 'timeSensitive',
    }

    const id = await mod.scheduleNotificationAsync({
      content: content,
      trigger: trigger,
    })
    if (generation !== scheduleGeneration) {
      await mod.cancelScheduledNotificationAsync(id)
    } else {
      scheduledId = id
    }
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

/** Cancels every scheduled local notification as part of on-device data erasure. */
export async function cancelAllScheduledNotifications(): Promise<void> {
  scheduleGeneration += 1
  await Promise.all(pendingSchedules)
  const mod = await loadModule()
  if (!mod)
    throw new Error('Notifications are unavailable, so scheduled alerts could not be cleared.')
  await mod.cancelAllScheduledNotificationsAsync()
  scheduledId = null
}
