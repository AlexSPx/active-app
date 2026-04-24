import { Platform, Alert } from 'react-native'
import * as Linking from 'expo-linking'
import * as Application from 'expo-application'
import type {
  NotificationHandler,
  NotificationChannelInput,
  NotificationTriggerInput,
  NotificationContentInput,
  NotificationPermissionsStatus,
} from 'expo-notifications'
import { apiService } from './apiService'
import { useAuthStore } from '../stores/authStore'

let Notifications: typeof import('expo-notifications') | null = null
let initialized = false
let scheduledId: string | null = null
let lastRegisteredUserId: string | null = null
let lastRegisteredPushToken: string | null = null

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
async function openAlarmSettings() {
  if (Platform.OS === 'android') {
    const action = 'android.settings.REQUEST_SCHEDULE_EXACT_ALARM'
    const alarmSettingsUri = `package:${Application.applicationId ?? ''}`
    await Linking.sendIntent(action, [{ key: 'data', value: alarmSettingsUri }])
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

    // 5. Handle 'allowsScheduledNotifications' (This is the critical part)
    // We do NOT request permissions here automatically anymore.
    // Permissions are requested explicitly in the UI (e.g. Register screen or Settings).
  } catch (error: unknown) {
    console.error('Failed to initialize notifications:', error)
  } finally {
    // Attempt to register push notifications/token once init path completes
    initialized = true
  }
}

export async function registerPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return

  const mod = await loadModule()
  if (!mod) return

  const authState = useAuthStore.getState()
  const userId = authState.user?.id ?? null
  if (!authState.isAuthenticated || !userId) {
    lastRegisteredUserId = null
    lastRegisteredPushToken = null
    return
  }

  const permissions = await mod.getPermissionsAsync()
  const notificationsAllowed =
    permissions.granted ||
    permissions.ios?.status === mod.IosAuthorizationStatus.PROVISIONAL

  if (!notificationsAllowed) {
    return
  }

  if (Platform.OS === 'android') {
    const channelInput: NotificationChannelInput = {
      name: 'Streak Reminders',
      importance: mod.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF7A00',
      sound: 'default',
      lockscreenVisibility: mod.AndroidNotificationVisibility.PUBLIC,
    }
    await mod.setNotificationChannelAsync('streak-reminders', channelInput)
  }

  try {
    const tokenResponse = await mod.getExpoPushTokenAsync({
      projectId: '8dee9569-7b46-47df-b72f-21833f59e85c',
    })

    const expoPushToken = tokenResponse.data

    console.log('Push token: ', expoPushToken)

    if (expoPushToken && expoPushToken.trim() !== '') {
      if (lastRegisteredUserId === userId && lastRegisteredPushToken === expoPushToken) {
        return
      }

      try {
        const updated = await apiService.registerPushToken(expoPushToken)
        // Update user in auth store to reflect any server-side changes
        useAuthStore.getState().setUser(updated)
        lastRegisteredUserId = userId
        lastRegisteredPushToken = expoPushToken
      } catch (e) {
        console.error('Failed to register push token with server:', e)
      }
    }
  } catch (error) {
    console.error('Failed to get push notification token:', error)
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
