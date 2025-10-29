// Notification service with optional Expo Notifications integration.
// Works as a no-op if expo-notifications is not installed or permissions are denied.

let Notifications: any | null = null
let initialized = false
let scheduledId: string | null = null

async function loadModule() {
  if (Notifications) return Notifications
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Notifications = require('expo-notifications')
    return Notifications
  } catch {
    Notifications = null
    return null
  }
}

export async function initNotifications(): Promise<void> {
  if (initialized) return
  const mod = await loadModule()
  if (!mod) {
    initialized = true
    return
  }
  try {
    // Ensure foreground behavior is controlled: don't pop an alert when app is active
    if (mod.setNotificationHandler) {
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowAlert: false,
        }),
      })
    }

    if (mod.setNotificationChannelAsync) {
      await mod.setNotificationChannelAsync('rest-timer', {
        name: 'Rest Timer',
        importance: mod.AndroidImportance?.HIGH ?? 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF7A00',
        sound: 'default',
        lockscreenVisibility: mod.AndroidNotificationVisibility?.PUBLIC ?? 1,
      })
    }

    if (mod.getPermissionsAsync && mod.requestPermissionsAsync) {
      const perms = await mod.getPermissionsAsync()
      if (!perms?.granted) await mod.requestPermissionsAsync()
    }
  } catch {
  } finally {
    initialized = true
  }
}

export async function scheduleRestNotification(deadlineMs: number): Promise<void> {
  const mod = await loadModule()
  if (!mod) return
  try {
    if (scheduledId) {
      try {
        await mod.cancelScheduledNotificationAsync(scheduledId)
      } catch {}
      scheduledId = null
    }
    const when = Math.max(Date.now() + 1000, deadlineMs) // at least 1s in future
    const id = await mod.scheduleNotificationAsync({
      content: {
        title: 'Rest complete',
        body: 'Time to start your next set.',
        sound: 'default',
        // iOS 15+: mark as time-sensitive so it shows on Lock Screen promptly
        interruptionLevel: 'timeSensitive',
      },
      // Use absolute date trigger for better reliability on background/lock
      trigger: { date: new Date(when), channelId: 'rest-timer' },
    })
    scheduledId = id
  } catch {}
}

export async function cancelRestNotification(): Promise<void> {
  const mod = await loadModule()
  if (!mod) return
  try {
    if (scheduledId) {
      await mod.cancelScheduledNotificationAsync(scheduledId)
      scheduledId = null
    }
  } catch {}
}
