import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import { SettingsPage } from '../../components/settings/SettingsPage'
import { Button, Surface, TextField, UiText } from '../../components/ui/Controls'
import { useAuth } from '../../contexts/AuthContext'
import { useSettingsStore } from '../../features/settings'
import {
  connectAccount,
  cancelAccountOperation,
  deleteRemoteAccount,
  disconnectAccount,
  initializeFromDevice,
  readAccount,
  type RemoteProfile,
} from '../../features/selfHosted/account'
import { loadConnection, type Connection } from '../../features/selfHosted/storage'

export default function ServerSettingsScreen() {
  const { user } = useAuth()
  const settings = useSettingsStore()
  const [url, setUrl] = useState(Platform.OS === 'web' ? location.origin : '')
  const [connection, setConnection] = useState<Connection | null>(null)
  const [profile, setProfile] = useState<RemoteProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let mounted = true
    void loadConnection()
      .then((saved) => {
        if (!mounted) return
        setConnection(saved)
        if (saved) setUrl(saved.baseUrl)
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
            editable={!busy && !connection}
            keyboardType="url"
          />
          {!connection ? (
            <Button
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const connected = await connectAccount(url)
                  if (!connected) return
                  setConnection(connected)
                  setProfile(await readAccount())
                  setMessage('Connected. Your device profile has not been changed.')
                })
              }
            >
              <UiText>{busy ? 'Connecting…' : 'Sign in to server'}</UiText>
            </Button>
          ) : (
            <>
              <UiText textRole="bodyEmphasis">Connected to {connection.baseUrl}</UiText>
              <Button
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const renewed = await connectAccount(connection.baseUrl)
                    if (renewed) setConnection(renewed)
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
              <UiText textRole="bodyMuted">
                Copy your device name, measurements, time zone and reminder preferences into a new
                server profile. Existing server profiles are preserved. Workout upload is a separate
                step.
              </UiText>
              <Button
                disabled={busy || !user}
                onPress={() =>
                  void run(async () => {
                    if (!user) throw new Error('Finish setting up your device profile first')
                    await initializeFromDevice(
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
                    setProfile(await readAccount())
                    setMessage(
                      'Your device profile was copied to the server. Local training data is unchanged.'
                    )
                  })
                }
              >
                <UiText>Copy device profile / resume</UiText>
              </Button>
              <Button
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await disconnectAccount()
                    setConnection(null)
                    setProfile(null)
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
            <Button onPress={cancelAccountOperation}>
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
                      await deleteRemoteAccount()
                      setConnection(null)
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
