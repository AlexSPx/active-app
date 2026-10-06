import { Alert } from 'react-native'
import { Button, Paragraph, Text, YStack } from 'tamagui'
import { useAuth } from '../../../contexts/AuthContext'
import { useAuthMutations } from '../../../features/auth'
import { SettingsPage } from '../../../components/settings/SettingsPage'

export default function AccountSettingsScreen() {
  const { logout, user } = useAuth()
  const { deleteAccount, deleteAccountPending: deleting, error } = useAuthMutations()
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Your account'
  const confirmSignOut = () =>
    Alert.alert('Sign out of Active?', 'You’ll need to sign in again to access your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        onPress: () => {
          void logout()
        },
      },
    ])
  const removeAccount = async () => {
    const success = await deleteAccount()
    if (success) void logout()
    else Alert.alert('Unable to delete account', 'Please try again.')
  }
  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'Your account, workouts, routines, and recorded sessions will be permanently deleted. This cannot be undone.',
      [
        { text: 'Keep account', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: removeAccount },
      ]
    )
  return (
    <SettingsPage title="Account" description="Your signed-in account.">
      <YStack gap="$section">
        <YStack gap="$compact">
          <Text fontSize="$caption" color="$colorSubtle">
            Name
          </Text>
          <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600">
            {fullName}
          </Text>
        </YStack>
        <YStack gap="$compact">
          <Text fontSize="$caption" color="$colorSubtle">
            Email
          </Text>
          <Text fontSize="$body" lineHeight="$body">
            {user?.email ?? 'Not set'}
          </Text>
        </YStack>
      </YStack>
      <Button
        height="$action"
        rounded="$button"
        bg="$backgroundStrong"
        disabled={deleting}
        onPress={confirmSignOut}
      >
        Sign out
      </Button>
      <YStack gap="$field" mt="$section">
        <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600">
          Delete account
        </Text>
        <Paragraph fontSize="$body" lineHeight="$body" color="$colorSubtle">
          Permanently delete your account and training data, including your workouts, routines, and
          recorded sessions.
        </Paragraph>
        <Button
          height="$action"
          rounded="$button"
          bg="$backgroundStrong"
          color="$destructive"
          disabled={deleting}
          onPress={confirmDelete}
        >
          {deleting ? 'Deleting…' : 'Delete account'}
        </Button>
        {!!error && (
          <Paragraph fontSize="$caption" color="$destructive" accessibilityLiveRegion="polite">
            {error}
          </Paragraph>
        )}
        <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
          You’ll be asked to confirm before anything is deleted.
        </Text>
      </YStack>
    </SettingsPage>
  )
}
