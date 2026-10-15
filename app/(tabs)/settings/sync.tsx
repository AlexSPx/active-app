import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { Stack, useFocusEffect } from 'expo-router'
import { Button, Label, Paragraph, Switch, Text, XStack, YStack } from 'tamagui'
import { SettingsPage } from '../../../components/settings/SettingsPage'
import { launchFacade } from '../../../features/launch/launchFacade'
import { WorkOSSignInButton } from '../../../components/WorkOSSignInButton'
import { getProfileScope, isCurrentProfile } from '../../../lib/profileScope'
import { syncEngine } from '../../../lib/sync'
import type { SyncJob } from '../../../lib/sync/SyncEngine'
import { useAuthStore } from '../../../stores/authStore'
import { useNetworkStore } from '../../../stores/networkStore'

const JOB_LABELS: Record<string, string> = {
  createWorkout: 'Create workout',
  updateWorkout: 'Update workout',
  deleteWorkout: 'Delete workout',
  recordWorkout: 'Record workout',
  deleteWorkoutRecord: 'Delete workout record',
  createRoutine: 'Create routine',
  updateRoutine: 'Update routine',
  deleteRoutine: 'Delete routine',
}

function jobStatus(job: SyncJob): string {
  if (job.blocked_reason) return 'Waiting for a related change'
  if (job.status === 'dead_letter') return 'Needs attention'
  if (job.status === 'auth_required') return 'Sign-in required'
  if (job.status === 'failed') return 'Waiting to retry'
  if (job.status === 'processing') return 'Syncing'
  return 'Queued'
}

function jobMessage(job: SyncJob): string {
  if (job.blocked_reason) return 'This change is waiting for an earlier related change.'
  if (job.status === 'dead_letter') {
    const message = job.error_message?.replace(/^\d{3}:\s*/, '').trim()
    const containsInternalDetails =
      !message ||
      /unknown api method|invalid queued payload|api error:\s*\d+/i.test(message) ||
      /https?:\/\/|[{}\[\]]|\blocal_[\w-]+/i.test(message) ||
      Object.keys(JOB_LABELS).some((endpoint) => message.includes(endpoint)) ||
      (!!job.local_id && message.includes(job.local_id))
    const safeMessage = containsInternalDetails ? 'The server rejected this change.' : message
    return `${safeMessage} You can retry or discard it.`
  }
  if (job.status === 'auth_required') return 'Sign in again to resume syncing.'
  if (job.status === 'failed') return 'This change could not sync yet and will retry automatically.'
  if (job.status === 'processing') return 'This change is syncing now.'
  return 'This change is waiting to sync.'
}

export default function SyncSettingsScreen() {
  const presentation = launchFacade.settings.syncPage()
  if (presentation.kind === 'local-storage') {
    return <LocalStorageScreen title={presentation.title} description={presentation.description} />
  }
  return <SyncSettingsContent title={presentation.title} description={presentation.description} />
}

function LocalStorageScreen({ title, description }: { title: string; description: string }) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <SettingsPage title={title}>
        <Paragraph fontSize="$body" lineHeight="$body" color="$colorSubtle" selectable>
          {description}
        </Paragraph>
      </SettingsPage>
    </>
  )
}

function SyncSettingsContent({ title, description }: { title: string; description: string }) {
  const { manualOffline, isReady, restoreError, setManualOffline, retryRestore } = useNetworkStore()
  const networkReady = isReady && !restoreError
  const profileOwnerId = useAuthStore((state) => state.profileOwnerId)
  const isProfileTransitioning = useAuthStore((state) => state.isProfileTransitioning)
  const serverSession = useAuthStore((state) => state.serverSession)
  const profileGeneration = getProfileScope().generation
  const scope = useMemo(getProfileScope, [profileOwnerId, profileGeneration])
  const scopeKey = `${scope.ownerId}:${scope.generation}`
  const scopeReady =
    scope.ownerId === profileOwnerId && !isProfileTransitioning && isCurrentProfile(scope)

  const [jobs, setJobs] = useState<SyncJob[]>([])
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [authPaused, setAuthPaused] = useState(false)
  const [networkBusy, setNetworkBusy] = useState(false)
  const [networkActionError, setNetworkActionError] = useState<string | null>(null)
  const refreshRevision = useRef(0)

  useEffect(() => {
    setJobs([])
    setLoadedScopeKey(null)
    setLoading(true)
    setLoadError(false)
    setActionError(null)
    setBusyId(null)
    setAuthPaused(false)
  }, [scopeKey])

  const refreshJobs = useCallback(
    async (showLoading = false) => {
      if (!scopeReady) return
      const revision = ++refreshRevision.current
      if (showLoading) setLoading(true)
      setLoadError(false)
      try {
        const nextJobs = await syncEngine.listJobs()
        if (revision !== refreshRevision.current || !isCurrentProfile(scope)) return
        setJobs(nextJobs)
        setAuthPaused(syncEngine.authPaused)
        setLoadedScopeKey(scopeKey)
      } catch {
        if (revision !== refreshRevision.current || !isCurrentProfile(scope)) return
        setJobs([])
        setLoadError(true)
        setLoadedScopeKey(scopeKey)
      } finally {
        if (revision === refreshRevision.current && isCurrentProfile(scope)) setLoading(false)
      }
    },
    [scope, scopeKey, scopeReady]
  )

  useFocusEffect(
    useCallback(() => {
      if (!scopeReady) return
      void refreshJobs(true)
      return syncEngine.on('sync:change', () => void refreshJobs())
    }, [refreshJobs, scopeReady])
  )

  const runJobAction = useCallback(
    async (jobId: string, action: () => Promise<void>) => {
      if (!scopeReady || !isCurrentProfile(scope)) return
      setBusyId(jobId)
      setActionError(null)
      try {
        await action()
        if (isCurrentProfile(scope)) await refreshJobs()
      } catch {
        if (isCurrentProfile(scope)) {
          setActionError('Could not update this queued change. Please try again.')
        }
      } finally {
        if (isCurrentProfile(scope)) setBusyId(null)
      }
    },
    [refreshJobs, scope, scopeReady]
  )

  const confirmDiscard = (job: SyncJob) => {
    const message = job.request_payload
      ? 'This stops retries. The server may already have applied this change if its reply was lost. Your local training data and related queued changes stay on this device.'
      : 'This stops only this upload. Your local training data and related queued changes stay on this device.'
    Alert.alert('Discard this queued change?', message, [
      { text: 'Keep change', style: 'cancel' },
      {
        text: 'Discard change',
        style: 'destructive',
        onPress: () => void runJobAction(job.id, () => syncEngine.discardJob(job.id)),
      },
    ])
  }

  const updateManualOffline = async (nextValue: boolean) => {
    if (!networkReady || networkBusy) return
    setNetworkBusy(true)
    setNetworkActionError(null)
    try {
      await setManualOffline(nextValue)
    } catch {
      setNetworkActionError('Could not save offline preference. Please try again.')
    } finally {
      setNetworkBusy(false)
    }
  }

  const restoreNetworkSettings = async () => {
    setNetworkBusy(true)
    setNetworkActionError(null)
    try {
      await retryRestore()
    } catch {
      setNetworkActionError('Could not restore offline preference. Please try again.')
    } finally {
      setNetworkBusy(false)
    }
  }

  const authRequired = serverSession === 'invalid' || (loadedScopeKey === scopeKey && authPaused)
  const visibleJobs = loadedScopeKey === scopeKey && scopeReady ? jobs : []
  const visibleLoadError = loadedScopeKey === scopeKey && loadError
  const visibleActionError = loadedScopeKey === scopeKey ? actionError : null
  const visibleLoading = loading || loadedScopeKey !== scopeKey

  return (
    <>
      <Stack.Screen options={{ title }} />
      <SettingsPage title={title} description={description}>
        <XStack items="center" justify="space-between" gap="$field">
          <YStack flex={1} gap="$compact">
            <Label htmlFor="sync-offline" fontSize="$body" fontWeight="600">
              Work offline
            </Label>
            <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
              Queued changes stay on this device. Turn this off to resume syncing when the service
              is available.
            </Paragraph>
          </YStack>
          <Switch
            id="sync-offline"
            accessibilityLabel="Work offline"
            checked={manualOffline}
            disabled={!networkReady || networkBusy}
            onCheckedChange={(value) => void updateManualOffline(value)}
            bg={manualOffline ? '$primary' : '$backgroundStrong'}
          >
            <Switch.Thumb bg="$surface" />
          </Switch>
        </XStack>

        {!!restoreError && (
          <YStack gap="$field">
            <Paragraph color="$destructive" accessibilityLiveRegion="polite" selectable>
              Could not restore saved offline preference. Server actions are paused.
            </Paragraph>
            <Button
              minH="$action"
              disabled={networkBusy}
              onPress={() => void restoreNetworkSettings()}
            >
              {networkBusy ? 'Retrying…' : 'Retry restore'}
            </Button>
          </YStack>
        )}
        {!!networkActionError && (
          <Paragraph color="$destructive" accessibilityLiveRegion="polite" selectable>
            {networkActionError}
          </Paragraph>
        )}

        {authRequired && (
          <YStack gap="$field" p="$card" rounded="$card" bg="$backgroundHover">
            <Text fontSize="$cardTitle" fontWeight="600" selectable>
              Sign in again to resume syncing
            </Text>
            <Paragraph fontSize="$body" color="$colorSubtle" selectable>
              Your queued changes are saved on this device.
            </Paragraph>
            {networkReady && !manualOffline ? (
              <WorkOSSignInButton label="Sign in again" />
            ) : (
              <Paragraph fontSize="$body" color="$colorSubtle" selectable>
                Turn off offline mode when the service is available to sign in and resume syncing.
              </Paragraph>
            )}
          </YStack>
        )}

        {!!visibleActionError && (
          <Paragraph color="$destructive" accessibilityLiveRegion="polite" selectable>
            {visibleActionError}
          </Paragraph>
        )}

        <YStack gap="$field">
          <Text fontSize="$sectionTitle" fontWeight="600" selectable>
            Queued changes
          </Text>
          {visibleLoading ? (
            <Paragraph color="$colorSubtle" accessibilityLiveRegion="polite" selectable>
              Loading sync status…
            </Paragraph>
          ) : visibleLoadError ? (
            <YStack gap="$field">
              <Paragraph color="$destructive" selectable>
                Could not load sync status.
              </Paragraph>
              <Button minH="$action" onPress={() => void refreshJobs(true)} disabled={!scopeReady}>
                Try again
              </Button>
            </YStack>
          ) : visibleJobs.length === 0 ? (
            <Paragraph color="$colorSubtle" selectable>
              You’re all caught up.
            </Paragraph>
          ) : (
            visibleJobs.map((job) => {
              const canRetry =
                networkReady &&
                !manualOffline &&
                !authRequired &&
                !job.blocked_reason &&
                (job.status === 'failed' || job.status === 'dead_letter')
              const canDiscard = job.status !== 'processing'
              const busy = busyId === job.id

              return (
                <YStack
                  key={job.id}
                  gap="$field"
                  p="$card"
                  rounded="$card"
                  borderWidth={1}
                  borderColor="$borderColor"
                >
                  <XStack justify="space-between" gap="$field" items="center">
                    <Text fontSize="$exerciseTitle" fontWeight="600" selectable>
                      {JOB_LABELS[job.endpoint] ?? 'Training change'}
                    </Text>
                    <Text fontSize="$caption" color="$colorSubtle" selectable>
                      {jobStatus(job)}
                    </Text>
                  </XStack>
                  <Paragraph fontSize="$body" color="$colorSubtle" selectable>
                    {jobMessage(job)}
                  </Paragraph>
                  <XStack gap="$field">
                    {canRetry && (
                      <Button
                        flex={1}
                        minH="$action"
                        disabled={!!busyId || !scopeReady}
                        onPress={() => void runJobAction(job.id, () => syncEngine.retryJob(job.id))}
                      >
                        {busy ? 'Retrying…' : 'Retry'}
                      </Button>
                    )}
                    {canDiscard && (
                      <Button
                        flex={1}
                        minH="$action"
                        chromeless
                        disabled={!!busyId || !scopeReady}
                        onPress={() => confirmDiscard(job)}
                      >
                        Discard
                      </Button>
                    )}
                  </XStack>
                </YStack>
              )
            })
          )}
        </YStack>
      </SettingsPage>
    </>
  )
}
