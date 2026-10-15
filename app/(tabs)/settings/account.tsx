import { Alert } from 'react-native'
import { useEffect, useState } from 'react'
import { Button, Input, Label, Paragraph, Text, YStack } from 'tamagui'
import { useAuth } from '../../../contexts/AuthContext'
import { useAuthMutations } from '../../../features/auth'
import { SettingsCard, SettingsPage } from '../../../components/settings/SettingsPage'
import { launchFacade } from '../../../features/launch/launchFacade'

export default function AccountSettingsScreen() {
  const { logout, updateUser, user } = useAuth()
  const { deleteAccount, deleteAccountPending: deleting, error: deleteError } = useAuthMutations()
  const presentation = launchFacade.settings.accountPage(user)
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const currentFirstName = user?.firstName ?? ''
  const currentLastName = user?.lastName ?? ''
  const fullName = presentation.fullName
  const dirty = firstName.trim() !== currentFirstName || lastName.trim() !== currentLastName

  useEffect(() => {
    setFirstName(currentFirstName)
    setLastName(currentLastName)
  }, [currentFirstName, currentLastName])

  const saveTrainingName = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const updated = await updateUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      if (!updated) throw new Error('Could not save your training name.')
      setSaved(true)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not save your training name.')
    } finally {
      setSaving(false)
    }
  }
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
    <SettingsPage
      title={presentation.profileEditor ? 'Training profile' : 'Account'}
      description={presentation.description}
    >
      <SettingsCard>
        {!presentation.profileEditor && (
          <YStack gap="$compact">
            <Text fontSize="$caption" color="$colorSubtle">
              Name
            </Text>
            <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600">
              {fullName}
            </Text>
          </YStack>
        )}
        {presentation.email && (
          <YStack gap="$compact">
            <Text fontSize="$caption" color="$colorSubtle">
              {presentation.email.label}
            </Text>
            <Text fontSize="$body" lineHeight="$body">
              {presentation.email.value}
            </Text>
          </YStack>
        )}
        {presentation.profileEditor && (
          <YStack gap="$field">
            <YStack gap="$compact">
              <Label htmlFor="account-training-first-name" fontSize="$caption" color="$colorSubtle">
                {presentation.profileEditor.firstNameLabel}
              </Label>
              <Input
                id="account-training-first-name"
                accessibilityLabel="Training profile first name"
                height="$action"
                rounded="$control"
                bg="$surface"
                borderColor="$borderColor"
                placeholder="First name"
                autoCapitalize="words"
                value={firstName}
                onChangeText={(value) => {
                  setFirstName(value)
                  setSaved(false)
                }}
              />
            </YStack>
            <YStack gap="$compact">
              <Label htmlFor="account-training-last-name" fontSize="$caption" color="$colorSubtle">
                {presentation.profileEditor.lastNameLabel}
              </Label>
              <Input
                id="account-training-last-name"
                accessibilityLabel="Training profile last name"
                height="$action"
                rounded="$control"
                bg="$surface"
                borderColor="$borderColor"
                placeholder="Last name"
                autoCapitalize="words"
                value={lastName}
                onChangeText={(value) => {
                  setLastName(value)
                  setSaved(false)
                }}
              />
            </YStack>
            {(saveError || saved) && (
              <Paragraph
                fontSize="$caption"
                color={saveError ? '$destructive' : '$colorSubtle'}
                accessibilityLiveRegion="polite"
              >
                {saveError || 'Training name saved.'}
              </Paragraph>
            )}
            <Button
              height="$action"
              rounded="$button"
              bg="$primary"
              color="$onPrimary"
              disabled={!dirty || saving}
              opacity={!dirty || saving ? 0.5 : 1}
              onPress={saveTrainingName}
            >
              {saving ? 'Saving…' : presentation.profileEditor.saveLabel}
            </Button>
          </YStack>
        )}
      </SettingsCard>
      {presentation.accountActions.map((action) =>
        action.kind === 'sign-out' ? (
          <Button
            key={action.kind}
            height="$action"
            rounded="$button"
            bg="$backgroundStrong"
            disabled={deleting}
            onPress={confirmSignOut}
          >
            Sign out
          </Button>
        ) : (
          <YStack key={action.kind} gap="$field" mt="$section">
            <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600">
              Delete account
            </Text>
            <Paragraph fontSize="$body" lineHeight="$body" color="$colorSubtle">
              Permanently delete your account and training data, including your workouts, routines,
              and recorded sessions.
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
            {!!deleteError && (
              <Paragraph fontSize="$caption" color="$destructive" accessibilityLiveRegion="polite">
                {deleteError}
              </Paragraph>
            )}
            <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
              You’ll be asked to confirm before anything is deleted.
            </Text>
          </YStack>
        )
      )}
    </SettingsPage>
  )
}
