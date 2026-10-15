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
      'This permanently removes every local training profile, workout, routine, preference, saved sign-in credential, pending sync payload, and scheduled rest-timer alert on this device. It does not delete information previously sent to an online account.',
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
          Erasing clears every saved local profile and its workouts, routines, measurements,
          preferences, sign-in credentials, queued payloads, cached training data, and scheduled
          local notifications. The app will return to profile setup.
        </Paragraph>
        <Paragraph fontSize="$body" lineHeight="$body" color="$colorSubtle">
          Data previously sent to an online account is not removed by this device action.
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
