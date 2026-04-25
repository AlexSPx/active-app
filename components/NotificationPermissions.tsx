import React, { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Separator } from 'tamagui'
import { Bell, Check, Clock, AlertTriangle, ChevronRight } from '@tamagui/lucide-icons'
import * as Notifications from 'expo-notifications'
import { Platform, NativeModules, Alert, AppState } from 'react-native'
import * as Linking from 'expo-linking'
import * as Application from 'expo-application'
import * as Haptics from 'expo-haptics'
import { useFocusEffect } from 'expo-router'
import { registerPushNotifications } from '../services/notificationService'

interface NotificationPermissionsProps {
  onStatusChange?: (status: { notifications: boolean; alarms: boolean }) => void
}

export default function NotificationPermissions({ onStatusChange }: NotificationPermissionsProps) {
  const [notificationsAllowed, setNotificationsAllowed] = useState(false)
  const [alarmsAllowed, setAlarmsAllowed] = useState(false)

  const getExactAlarmPermissionModule = () => {
    const module =
      NativeModules.ExactAlarm ??
      NativeModules.ExactAlarmPermission ??
      null

    if (!module) {
      return null
    }

    if (typeof module.canScheduleExactAlarms === 'function') {
      return () => module.canScheduleExactAlarms()
    }

    if (typeof module.hasExactAlarmPermission === 'function') {
      return () => module.hasExactAlarmPermission()
    }

    return null
  }

  const checkPermissions = async () => {
    // 1. Check Standard Notifications
    const settings = await Notifications.getPermissionsAsync()
    const notifAllowed = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    setNotificationsAllowed(notifAllowed)

    // 2. Check Exact Alarms (Android only)
    let alarmAllowed = true
    if (Platform.OS === 'android') {
      try {
        const checkExactAlarmPermission = getExactAlarmPermissionModule()

        if (checkExactAlarmPermission) {
          alarmAllowed = await checkExactAlarmPermission()
        } else {
          // Fallback if module missing (for example, stale dev client)
          console.warn('Exact alarm native module missing')
        }
      } catch (e) {
        console.warn('Failed to check exact alarm', e)
        alarmAllowed = false
      }
    }
    setAlarmsAllowed(alarmAllowed)

    if (notifAllowed) {
      registerPushNotifications().catch((error) => {
        console.error('Failed to register push notifications after permission check:', error)
      })
    }

    // Notify parent
    onStatusChange?.({ notifications: notifAllowed, alarms: alarmAllowed })
  }

  useFocusEffect(
    useCallback(() => {
      checkPermissions()
      
      const subscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          checkPermissions()
        }
      })

      return () => {
        subscription.remove()
      }
    }, [])
  )

  const requestNotificationPermission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const { granted } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    })
    if (granted) {
        checkPermissions()
    } else {
        Alert.alert('Permission Required', 'Please enable notifications in your device settings to receive updates.')
    }
  }

  const openAlarmSettings = () => {
    Haptics.selectionAsync()
    if (Platform.OS === 'android') {
        const action = 'android.settings.REQUEST_SCHEDULE_EXACT_ALARM'
        const alarmSettingsUri = `package:${Application.applicationId ?? ''}`
        Linking.sendIntent(action, [{ key: 'data', value: alarmSettingsUri }])
    }
  }

  return (
    <YStack gap="$4">
      {/* Standard Notifications */}
      <YStack bg="$color2" p="$4" rounded="$6" gap="$3">
        <XStack justify="space-between" items="center">
          <XStack gap="$3" items="center" flex={1}>
            <YStack bg="$blue3" p="$2" rounded="$4">
              <Bell size={20} color="$blue9" />
            </YStack>
            <YStack flex={1}>
              <Text fontWeight="600">Notifications</Text>
              <Text fontSize="$2" color="$color11">Updates & general alerts</Text>
            </YStack>
          </XStack>
          {notificationsAllowed ? (
            <YStack bg="$green3" p="$1.5" rounded="$10">
              <Check size={16} color="$green9" />
            </YStack>
          ) : (
            <Button size="$3" bg="$blue9" color="white" onPress={requestNotificationPermission}>Allow</Button>
          )}
        </XStack>
      </YStack>

      {/* Alarms & Reminders (Android Only) */}
      {Platform.OS === 'android' && (
        <YStack bg="$color2" p="$4" rounded="$6" gap="$3">
          <XStack justify="space-between" items="center">
            <XStack gap="$3" items="center" flex={1}>
              <YStack bg={alarmsAllowed ? "$green3" : "$surfaceHover"} p="$2" rounded="$4">
                {alarmsAllowed ? <Clock size={20} color="$green9" /> : <AlertTriangle size={20} color="$secondary" />}
              </YStack>
              <YStack flex={1}>
                <Text fontWeight="600">Alarms & Reminders</Text>
                <Text fontSize="$2" color="$color11">Precise timers</Text>
              </YStack>
            </XStack>
            {alarmsAllowed ? (
              <YStack bg="$green3" p="$1.5" rounded="$10">
                <Check size={16} color="$green9" />
              </YStack>
            ) : (
              <Button 
                size="$3" 
                bg="$secondary" 
                color="white" 
                onPress={openAlarmSettings}
              >
                Allow
              </Button>
            )}
          </XStack>
        </YStack>
      )}
    </YStack>
  )
}
