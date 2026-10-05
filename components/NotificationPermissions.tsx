import { useCallback, useState } from 'react'
import { Button, Paragraph, Text, XStack, YStack } from 'tamagui'
import * as Notifications from 'expo-notifications'
import { AppState, NativeModules, Platform } from 'react-native'
import * as Linking from 'expo-linking'
import * as Application from 'expo-application'
import { useFocusEffect } from 'expo-router'
import { registerPushNotifications } from '../services/notificationService'

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
      if (allowed && !summaryOnly) registerPushNotifications().catch(console.error)
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
      <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
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
      </Text>
    )

  return (
    <YStack gap="$section">
      {[
        {
          title: 'Notifications',
          allowed: notifications,
          description: 'Receive training reminders and app updates.',
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
        <YStack key={permission.title} gap="$field">
          <XStack items="center" justify="space-between" gap="$field">
            <Text fontSize="$body" fontWeight="600" flex={1}>
              {permission.title}
            </Text>
            <Text
              fontSize="$caption"
              color={permission.allowed === false ? '$destructive' : '$colorSubtle'}
              bg="$backgroundStrong"
              px="$2"
              py="$compact"
              rounded="$badge"
            >
              {permission.allowed === null
                ? permission.title === 'Alarms & reminders' && alarmUnavailable
                  ? 'Unavailable'
                  : 'Checking…'
                : permission.allowed
                  ? 'Allowed'
                  : 'Not allowed'}
            </Text>
          </XStack>
          <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            {permission.description}
          </Paragraph>
          {permission.title === 'Alarms & reminders' && (
            <Text fontSize="$caption" color="$colorMuted">
              Android only
            </Text>
          )}
          <Button
            chromeless
            self="flex-start"
            color="$primary"
            minH="$touch"
            onPress={permission.onPress}
          >
            {permission.allowed
              ? 'Manage in device settings ↗'
              : permission.allowed === false
                ? 'Allow access ↗'
                : 'Review device settings ↗'}
          </Button>
        </YStack>
      ))}
      {!!error && (
        <Paragraph fontSize="$caption" color="$destructive" accessibilityLiveRegion="polite">
          {error}
        </Paragraph>
      )}
      {notifications === false && (
        <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
          Reminders won’t arrive until notifications are allowed. Your reminder preference is kept.
        </Paragraph>
      )}
    </YStack>
  )
}
