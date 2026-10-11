import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { Stack, useFocusEffect } from 'expo-router'
import { Button, Paragraph, Text, XStack, YStack } from 'tamagui'
import { SettingsPage } from '../../../components/settings/SettingsPage'
import { WorkOSSignInButton } from '../../../components/WorkOSSignInButton'
import { getProfileScope, isCurrentProfile } from '../../../lib/profileScope'
import { syncEngine } from '../../../lib/sync'
import type { SyncJob } from '../../../lib/sync/SyncEngine'
import { useAuthStore } from '../../../stores/authStore'

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
    Alert.alert(
      'Discard this queued change?',
      'This stops only this upload. Your local training data and related queued changes stay on this device.',
      [
        { text: 'Keep change', style: 'cancel' },
        {
          text: 'Discard change',
          style: 'destructive',
          onPress: () => void runJobAction(job.id, () => syncEngine.discardJob(job.id)),
        },
      ]
    )
  }

  const authRequired = serverSession === 'invalid' || (loadedScopeKey === scopeKey && authPaused)
  const visibleJobs = loadedScopeKey === scopeKey && scopeReady ? jobs : []
  const visibleLoadError = loadedScopeKey === scopeKey && loadError
  const visibleActionError = loadedScopeKey === scopeKey ? actionError : null
  const visibleLoading = loading || loadedScopeKey !== scopeKey

  return (
    <>
      <Stack.Screen options={{ title: 'Synchronization' }} />
      <SettingsPage
        title="Synchronization"
        description="Changes stay on this device until they sync with your account."
      >
        {authRequired && (
          <YStack gap="$field" p="$card" rounded="$card" bg="$backgroundHover">
            <Text fontSize="$cardTitle" fontWeight="600" selectable>
              Sign in again to resume syncing
            </Text>
            <Paragraph fontSize="$body" color="$colorSubtle" selectable>
              Your queued changes are saved on this device.
            </Paragraph>
            <WorkOSSignInButton label="Sign in again" />
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
