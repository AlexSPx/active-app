import { Alert, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { useAuthMutations } from '../../../features/auth'
import { SettingsCard, SettingsPage } from '../../../components/settings/SettingsPage'
import { Button, TextField, UiText } from '../../../components/ui/Controls'
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
          <View className="gap-compact">
            <UiText textRole="caption">Name</UiText>
            <UiText textRole="cardTitle" selectable>
              {fullName}
            </UiText>
          </View>
        )}
        {presentation.email && (
          <View className="gap-compact">
            <UiText textRole="caption">{presentation.email.label}</UiText>
            <UiText selectable>{presentation.email.value}</UiText>
          </View>
        )}
        {presentation.profileEditor && (
          <View className="gap-field">
            <View className="gap-compact">
              <UiText textRole="caption">{presentation.profileEditor.firstNameLabel}</UiText>
              <TextField
                id="account-training-first-name"
                accessibilityLabel="Training profile first name"
                placeholder="First name"
                autoCapitalize="words"
                value={firstName}
                onChangeText={(value) => {
                  setFirstName(value)
                  setSaved(false)
                }}
              />
            </View>
            <View className="gap-compact">
              <UiText textRole="caption">{presentation.profileEditor.lastNameLabel}</UiText>
              <TextField
                id="account-training-last-name"
                accessibilityLabel="Training profile last name"
                placeholder="Last name"
                autoCapitalize="words"
                value={lastName}
                onChangeText={(value) => {
                  setLastName(value)
                  setSaved(false)
                }}
              />
            </View>
            {(saveError || saved) && (
              <UiText
                textRole={saveError ? 'captionDestructive' : 'caption'}
                accessibilityLiveRegion="polite"
              >
                {saveError || 'Training name saved.'}
              </UiText>
            )}
            <Button disabled={!dirty || saving} loading={saving} onPress={saveTrainingName}>
              {saving ? 'Saving…' : presentation.profileEditor.saveLabel}
            </Button>
          </View>
        )}
      </SettingsCard>
      {presentation.accountActions.map((action) =>
        action.kind === 'sign-out' ? (
          <Button
            key={action.kind}
            variant="secondary"
            disabled={deleting}
            onPress={confirmSignOut}
          >
            Sign out
          </Button>
        ) : (
          <View key={action.kind} className="gap-field">
            <UiText accessibilityRole="header" textRole="cardTitle">
              Delete account
            </UiText>
            <UiText textRole="bodyMuted">
              Permanently delete your account and training data, including your workouts, routines,
              and recorded sessions.
            </UiText>
            <Button
              variant="surface"
              accessibilityLabel={deleting ? 'Deleting account' : 'Delete account'}
              disabled={deleting}
              loading={deleting}
              onPress={confirmDelete}
            >
              <UiText textRole="bodyDestructive">
                {deleting ? 'Deleting…' : 'Delete account'}
              </UiText>
            </Button>
            {!!deleteError && (
              <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
                {deleteError}
              </UiText>
            )}
            <UiText textRole="caption">
              You’ll be asked to confirm before anything is deleted.
            </UiText>
          </View>
        )
      )}
    </SettingsPage>
  )
}
