import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import { SettingsPage } from '../../components/settings/SettingsPage'
import { Button, Surface, TextField, UiText } from '../../components/ui/Controls'
import { useAuth } from '../../contexts/AuthContext'
import { useSettingsStore } from '../../features/settings'
import { captureFirstWorkout } from '../../features/selfHosted/firstWorkout'
import { getDatabase } from '../../lib/db/connection'
import { getProfileScope, isCurrentProfile, LOCAL_PROFILE_OWNER } from '../../lib/profileScope'
import {
  readAccount,
  readServerWorkouts,
  resumeFirstWorkout,
  type RemoteProfile,
} from '../../features/selfHosted/account'
import {
  cancelConnection,
  disconnectServer,
  deleteServerAccount,
  restoreConnectionLifecycle,
  signInToServer,
  useConnectionLifecycle,
} from '../../features/selfHosted/lifecycle'

export default function ServerSettingsScreen() {
  const { user } = useAuth()
  const settings = useSettingsStore()
  const [url, setUrl] = useState(Platform.OS === 'web' ? location.origin : '')
  const { connection, status } = useConnectionLifecycle()
  const [profile, setProfile] = useState<RemoteProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [workouts, setWorkouts] = useState<string[] | null>(null)

  useEffect(() => {
    let mounted = true
    void restoreConnectionLifecycle()
      .then(() => {
        const saved = useConnectionLifecycle.getState().connection
        if (mounted && saved) setUrl(saved.baseUrl)
      })
      .catch(() => {
        if (mounted) setMessage('Could not restore the server connection. Try again.')
      })
    return () => {
      mounted = false
    }
  }, [])

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reach your server')
    } finally {
      setBusy(false)
    }
  }

  async function signIn(attach = false) {
    let snapshot
    if (attach) {
      const scope = getProfileScope()
      if (scope.ownerId !== LOCAL_PROFILE_OWNER || !user?.registrationCompleted)
        throw new Error('Return to your device profile and finish setting it up first')
      snapshot = await captureFirstWorkout(
        await getDatabase(),
        user,
        {
          firstName: user.firstName,
          lastName: user.lastName,
          timezone: settings.timeZone,
          measurements: { weightKg: settings.bodyWeight, heightCm: settings.height },
          registrationCompleted: user.registrationCompleted,
        },
        {
          enabled: user.notificationPreferences?.emailNotificationsEnabled ?? false,
          schedule: user.notificationPreferences?.schedule ?? [],
          timezone: settings.timeZone,
        }
      )
      if (!isCurrentProfile(scope)) throw new Error('Device profile changed; try again')
    }
    const connected = await signInToServer(url, snapshot)
    if (connected) {
      setProfile(null)
      if (attach)
        setMessage('Workout saved for this account. Select Resume workout upload to continue.')
    }
  }

  return (
    <SettingsPage
      title="Self-hosted account"
      description="Connect your training profile to your own Active server. Workouts and device data stay on this device."
    >
      <Surface>
        <View className="gap-field">
          <UiText>Server URL</UiText>
          <TextField
            accessibilityLabel="Server URL"
            value={url}
            onChangeText={setUrl}
            placeholder="https://active.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            keyboardType="url"
          />
          {!connection ? (
            <>
              <Button disabled={busy} onPress={() => void run(() => signIn())}>
                <UiText>{busy ? 'Connecting…' : 'Sign in to server'}</UiText>
              </Button>
              {Platform.OS !== 'web' && getProfileScope().ownerId === LOCAL_PROFILE_OWNER && (
                <>
                  <UiText textRole="bodyMuted">
                    Attach your device profile and most recent workout to a new account. Your
                    original data stays on this device.
                  </UiText>
                  <Button disabled={busy || !user} onPress={() => void run(() => signIn(true))}>
                    <UiText>Sign in and attach one workout</UiText>
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              <UiText textRole="bodyEmphasis">
                {status === 'auth-paused' ? 'Sign in again to' : 'Connected to'}{' '}
                {connection.baseUrl}
              </UiText>
              <Button
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await signIn()
                  })
                }
              >
                <UiText>Sign in again</UiText>
              </Button>
              {profile && (
                <UiText>
                  {profile.firstName} {profile.lastName} · {profile.email}
                </UiText>
              )}
              <Button
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    setProfile(await readAccount())
                  })
                }
              >
                <UiText>Read server profile</UiText>
              </Button>
              {Platform.OS !== 'web' && (
                <>
                  <UiText textRole="bodyMuted">
                    Resume an attached workout after a connection or upload interruption. Other
                    workouts and history remain on this device.
                  </UiText>
                  <Button
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await resumeFirstWorkout()
                        setMessage(
                          'Your workout was uploaded. The original remains on this device.'
                        )
                      })
                    }
                  >
                    <UiText>Resume workout upload</UiText>
                  </Button>
                </>
              )}
              <Button
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    setWorkouts((await readServerWorkouts()).map((workout) => workout.title))
                  })
                }
              >
                <UiText>Read server workouts</UiText>
              </Button>
              {workouts && (
                <UiText>{workouts.length ? workouts.join('\n') : 'No server workouts yet.'}</UiText>
              )}
              <Button
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await disconnectServer()
                    setProfile(null)
                    setWorkouts(null)
                    setMessage('Disconnected. Your device data is still available.')
                  })
                }
              >
                <UiText>Disconnect server</UiText>
              </Button>
            </>
          )}
          {message && <UiText accessibilityRole="alert">{message}</UiText>}
          {busy && (
            <Button onPress={cancelConnection}>
              <UiText>Cancel</UiText>
            </Button>
          )}
        </View>
      </Surface>
      {connection && (
        <Surface>
          <View className="gap-field">
            <UiText textRole="bodyEmphasis">Delete server account</UiText>
            <UiText>
              This permanently removes this account’s data from the server. Your device workouts,
              profile and identity-provider account are kept. The same provider identity cannot
              register again on this server.
            </UiText>
            {confirmDelete ? (
              <>
                <Button
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await deleteServerAccount()
                      setProfile(null)
                      setConfirmDelete(false)
                      setMessage('Server account deleted. Your device data is still available.')
                    })
                  }
                >
                  <UiText>Confirm deletion / retry</UiText>
                </Button>
                <Button disabled={busy} onPress={() => setConfirmDelete(false)}>
                  <UiText>Keep account</UiText>
                </Button>
              </>
            ) : (
              <Button disabled={busy} onPress={() => setConfirmDelete(true)}>
                <UiText>Delete server account…</UiText>
              </Button>
            )}
          </View>
        </Surface>
      )}
    </SettingsPage>
  )
}
