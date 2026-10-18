import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Switch, View } from 'react-native'
import { Stack, useFocusEffect } from 'expo-router'
import { Button, Surface, UiText } from '../../../components/ui/Controls'
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
        <UiText textRole="bodyMuted" selectable>
          {description}
        </UiText>
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
        <View className="flex-row items-center justify-between gap-field">
          <View className="flex-1 gap-compact">
            <UiText textRole="bodyEmphasis">Work offline</UiText>
            <UiText textRole="caption">
              Queued changes stay on this device. Turn this off to resume syncing when the service
              is available.
            </UiText>
          </View>
          <Switch
            nativeID="sync-offline"
            accessibilityLabel="Work offline"
            value={manualOffline}
            disabled={!networkReady || networkBusy}
            onValueChange={(value) => void updateManualOffline(value)}
            accessibilityState={{ checked: manualOffline, disabled: !networkReady || networkBusy }}
            thumbColorClassName="accent-surface"
            trackColorOnClassName="accent-accent"
            trackColorOffClassName="accent-raised"
            ios_backgroundColorClassName="accent-raised"
          />
        </View>

        {!!restoreError && (
          <View className="gap-field">
            <UiText textRole="bodyDestructive" accessibilityLiveRegion="polite" selectable>
              Could not restore saved offline preference. Server actions are paused.
            </UiText>
            <Button
              className="min-h-action"
              disabled={networkBusy}
              onPress={() => void restoreNetworkSettings()}
            >
              {networkBusy ? 'Retrying…' : 'Retry restore'}
            </Button>
          </View>
        )}
        {!!networkActionError && (
          <UiText textRole="bodyDestructive" accessibilityLiveRegion="polite" selectable>
            {networkActionError}
          </UiText>
        )}

        {authRequired && (
          <View className="gap-field rounded-card bg-raised p-card">
            <UiText textRole="cardTitle" selectable>
              Sign in again to resume syncing
            </UiText>
            <UiText textRole="bodyMuted" selectable>
              Your queued changes are saved on this device.
            </UiText>
            {networkReady && !manualOffline ? (
              <WorkOSSignInButton label="Sign in again" />
            ) : (
              <UiText textRole="bodyMuted" selectable>
                Turn off offline mode when the service is available to sign in and resume syncing.
              </UiText>
            )}
          </View>
        )}

        {!!visibleActionError && (
          <UiText textRole="bodyDestructive" accessibilityLiveRegion="polite" selectable>
            {visibleActionError}
          </UiText>
        )}

        <View className="gap-field">
          <UiText textRole="cardTitle" selectable>
            Queued changes
          </UiText>
          {visibleLoading ? (
            <UiText textRole="bodyMuted" accessibilityLiveRegion="polite" selectable>
              Loading sync status…
            </UiText>
          ) : visibleLoadError ? (
            <View className="gap-field">
              <UiText textRole="bodyDestructive" selectable>
                Could not load sync status.
              </UiText>
              <Button
                className="min-h-action"
                onPress={() => void refreshJobs(true)}
                disabled={!scopeReady}
              >
                Try again
              </Button>
            </View>
          ) : visibleJobs.length === 0 ? (
            <UiText textRole="bodyMuted" selectable>
              You’re all caught up.
            </UiText>
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
                <Surface key={job.id}>
                  <View className="flex-row items-center justify-between gap-field">
                    <UiText textRole="bodyEmphasis" selectable>
                      {JOB_LABELS[job.endpoint] ?? 'Training change'}
                    </UiText>
                    <UiText textRole="caption" selectable>
                      {jobStatus(job)}
                    </UiText>
                  </View>
                  <UiText textRole="bodyMuted" selectable>
                    {jobMessage(job)}
                  </UiText>
                  <View className="flex-row gap-field">
                    {canRetry && (
                      <Button
                        className="min-h-action flex-1"
                        disabled={!!busyId || !scopeReady}
                        onPress={() => void runJobAction(job.id, () => syncEngine.retryJob(job.id))}
                      >
                        {busy ? 'Retrying…' : 'Retry'}
                      </Button>
                    )}
                    {canDiscard && (
                      <Button
                        className="min-h-action flex-1"
                        variant="ghost"
                        disabled={!!busyId || !scopeReady}
                        onPress={() => confirmDiscard(job)}
                      >
                        Discard
                      </Button>
                    )}
                  </View>
                </Surface>
              )
            })
          )}
        </View>
      </SettingsPage>
    </>
  )
}
