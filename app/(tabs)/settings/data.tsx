import { Alert } from 'react-native'
import { Button, Paragraph, Text, YStack } from 'tamagui'
import { SettingsPage } from '../../../components/settings/SettingsPage'
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
        <Paragraph color="$colorSubtle">
          Local profile data controls are available when using a device-only training profile.
        </Paragraph>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage
      title="Data on this device"
      description="Your training profile and workout history are stored on this device."
    >
      <YStack gap="$field">
        <Paragraph fontSize="$body" lineHeight="$body" color="$colorSubtle">
          Permanently delete all training profiles, workouts, routines, workout history,
          measurements, and preferences saved on this device, and cancel local notifications. The
          app will return to profile setup.
        </Paragraph>
        <Paragraph fontSize="$body" lineHeight="$body" color="$colorSubtle">
          This cannot be undone.
        </Paragraph>
        <Button
          height="$action"
          rounded="$button"
          bg="$backgroundStrong"
          color="$destructive"
          onPress={confirmErase}
        >
          <Text color="$destructive" fontWeight="600">
            Erase data on this device
          </Text>
        </Button>
      </YStack>
    </SettingsPage>
  )
}
