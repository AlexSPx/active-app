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

    const perms: NotificationPermissionsStatus = await mod.getPermissionsAsync()
    if (!perms.granted) {
      const { granted } = await mod.requestPermissionsAsync()
      if (!granted) {
        console.warn('General notification permissions were denied.')
        initialized = true
        return
      }
    }

    // 5. Handle 'allowsScheduledNotifications' (This is the critical part)
    if (
      Platform.OS === 'android' &&
      !(perms.android && (perms.android as any).allowsScheduledNotifications)
    ) {
      // This request will fail silently on Android 14+, so we check the response
      const resp = await mod.requestPermissionsAsync({
        android: {
          allowsScheduledNotifications: true,
        },
      })

      // The response may nest Android-specific flags under resp.android
      // const updatedPerms = await mod.getPermissionsAsync()
      // const isAllowed = (updatedPerms.android as any)?.allowsScheduledNotifications ?? false

      // if (!isAllowed) {
      //   // Permission is still denied. We must ask the user to enable it manually.
      //   Alert.alert(
      //     'Permission Required',
      //     'To ensure rest timers are accurate, please grant the "Alarms & reminders" permission for this app in your phone\'s settings.',
      //     [
      //       {
      //         text: 'Open Settings',
      //         onPress: openAlarmSettings,
      //       },
      //       {
      //         text: 'Cancel',
      //         style: 'cancel',
      //       },
      //     ],
      //     { cancelable: true }
      //   )
      // }
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
