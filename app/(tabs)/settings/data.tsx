import { Alert, View } from 'react-native'
import { SettingsPage } from '../../../components/settings/SettingsPage'
import { Button, UiText } from '../../../components/ui/Controls'
import { launchFacade } from '../../../features/launch/launchFacade'
import { useAuthStore } from '../../../stores/authStore'

export default function DeviceDataSettingsScreen() {
  const eraseDeviceData = useAuthStore((state) => state.eraseDeviceData)
  const localProfile = launchFacade.auth.getStartupPlan().kind === 'local-profile'

  const confirmErase = () => {
    Alert.alert(
      'Erase data on this device?',
      'This permanently deletes all training profiles, workouts, routines, workout history, measurements, and preferences saved on this device, and cancels local notifications. The app will return to profile setup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase data',
          style: 'destructive',
          onPress: () => void eraseDeviceData().catch(() => {}),
        },
      ]
    )
  }

  if (!localProfile) {
    return (
      <SettingsPage title="Data on this device">
        <UiText textRole="bodyMuted">
          Local profile data controls are available when using a device-only training profile.
        </UiText>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage
      title="Data on this device"
      description="Your training profile and workout history are stored on this device."
    >
      <View className="gap-field">
        <UiText textRole="bodyMuted">
          Permanently delete all training profiles, workouts, routines, workout history,
          measurements, and preferences saved on this device, and cancel local notifications. The
          app will return to profile setup.
        </UiText>
        <UiText textRole="bodyMuted">This cannot be undone.</UiText>
        <Button
          variant="surface"
          accessibilityLabel="Erase data on this device"
          onPress={confirmErase}
        >
          <UiText textRole="bodyDestructive">Erase data on this device</UiText>
        </Button>
      </View>
    </SettingsPage>
  )
}
