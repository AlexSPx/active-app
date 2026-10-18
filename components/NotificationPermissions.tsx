import { useCallback, useState } from 'react'
import * as Notifications from 'expo-notifications'
import { AppState, NativeModules, Platform, View } from 'react-native'
import * as Linking from 'expo-linking'
import * as Application from 'expo-application'
import { useFocusEffect } from 'expo-router'
import { Button, UiText } from './ui/Controls'

interface NotificationPermissionsProps {
  onStatusChange?: (status: { notifications: boolean; alarms: boolean }) => void
  summaryOnly?: boolean
}

export default function NotificationPermissions({
  onStatusChange,
  summaryOnly = false,
}: NotificationPermissionsProps) {
  const [notifications, setNotifications] = useState<boolean | null>(null)
  const [alarms, setAlarms] = useState<boolean | null>(null)
  const [alarmUnavailable, setAlarmUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const checkPermissions = useCallback(async () => {
    try {
      const settings = await Notifications.getPermissionsAsync()
      const allowed =
        settings.granted ||
        settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      setNotifications(allowed)
      let alarmAllowed: boolean | null = true
      if (Platform.OS === 'android') {
        const module = NativeModules.ExactAlarm ?? NativeModules.ExactAlarmPermission
        if (typeof module?.canScheduleExactAlarms === 'function')
          alarmAllowed = await module.canScheduleExactAlarms()
        else if (typeof module?.hasExactAlarmPermission === 'function')
          alarmAllowed = await module.hasExactAlarmPermission()
        else alarmAllowed = null
      }
      setAlarms(alarmAllowed)
      setAlarmUnavailable(alarmAllowed === null)
      setError(null)
      onStatusChange?.({ notifications: allowed, alarms: alarmAllowed === true })
    } catch {
      setError('Unable to check permissions. Review access in device settings.')
    }
  }, [onStatusChange, summaryOnly])

  useFocusEffect(
    useCallback(() => {
      void checkPermissions()
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void checkPermissions()
      })
      return () => subscription.remove()
    }, [checkPermissions])
  )

  const openNotifications = async () => {
    try {
      const current = await Notifications.getPermissionsAsync()
      if (!current.granted && current.canAskAgain) {
        await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        })
        await checkPermissions()
      } else await Linking.openSettings()
    } catch {
      setError('Unable to open notification settings. Try again.')
    }
  }
  const openAlarms = async () => {
    try {
      await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', [
        { key: 'data', value: `package:${Application.applicationId ?? ''}` },
      ])
    } catch {
      setError('Unable to open alarm settings. Try again.')
    }
  }
  if (summaryOnly)
    return (
      <UiText textRole="caption">
        {error
          ? 'Review device access'
          : notifications === null || (Platform.OS === 'android' && alarms === null)
            ? alarmUnavailable
              ? 'Alarm access unavailable · Review access'
              : 'Checking device access…'
            : notifications && alarms
              ? Platform.OS === 'android'
                ? 'Notifications and alarms allowed'
                : 'Notifications allowed'
              : 'Permission needed · Review access'}
      </UiText>
    )

  return (
    <View className="gap-section">
      {[
        {
          title: 'Notifications',
          allowed: notifications,
          description: 'Allow local rest timer alerts and reminders.',
          onPress: openNotifications,
        },
        ...(Platform.OS === 'android'
          ? [
              {
                title: 'Alarms & reminders',
                allowed: alarms,
                description:
                  'Allow precise timer alerts, including when Active is in the background.',
                onPress: openAlarms,
              },
            ]
          : []),
      ].map((permission) => (
        <View key={permission.title} className="gap-field">
          <View className="flex-row items-center justify-between gap-field">
            <UiText textRole="bodyEmphasis" className="flex-1">
              {permission.title}
            </UiText>
            <View className="rounded-control bg-raised px-compact py-compact">
              <UiText textRole={permission.allowed === false ? 'captionDestructive' : 'caption'}>
                {permission.allowed === null
                  ? permission.title === 'Alarms & reminders' && alarmUnavailable
                    ? 'Unavailable'
                    : 'Checking…'
                  : permission.allowed
                    ? 'Allowed'
                    : 'Not allowed'}
              </UiText>
            </View>
          </View>
          <UiText textRole="caption">{permission.description}</UiText>
          {permission.title === 'Alarms & reminders' && (
            <UiText textRole="caption">Android only</UiText>
          )}
          <Button variant="ghost" className="self-start" onPress={permission.onPress}>
            <UiText textRole="captionEmphasis">
              {permission.allowed
                ? 'Manage in device settings ↗'
                : permission.allowed === false
                  ? 'Allow access ↗'
                  : 'Review device settings ↗'}
            </UiText>
          </Button>
        </View>
      ))}
      {!!error && (
        <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
          {error}
        </UiText>
      )}
      {notifications === false && (
        <UiText textRole="caption">
          Rest timer alerts won’t arrive until notifications are allowed.
        </UiText>
      )}
    </View>
  )
}
