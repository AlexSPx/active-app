import { ScrollView, View } from 'react-native'
import { Button, UiBadge, UiText } from '../../../components/ui/Controls'
import { CadenceOverlay } from '../../../components/ui/CadenceOverlay'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import {
  computeVolumeForRecord,
  countSetsForRecord,
  formatSeconds,
  isCardioExerciseRecord,
} from '../../../utils/workoutUtils'
import { parseServerUtcDate } from '../../../utils/date'
import { launchFacade } from '../../launch/launchFacade'
import type { WorkoutRecord } from '../../../types/api'
import { recordDurationSeconds } from './record'

type Props = {
  record: WorkoutRecord | undefined
  loading: boolean
  error: string | null
  onRetry: () => Promise<void>
  deleting: boolean
  deleteError: string | null
  confirmationOpen: boolean
  onOpenConfirmation: () => void
  onCancelConfirmation: () => void
  onConfirmDelete: () => Promise<boolean>
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry: () => Promise<void>
}) {
  return (
    <View className="flex-1 items-start justify-center gap-field bg-background p-page">
      <UiText textRole="cardTitle" accessibilityRole="header">
        {title}
      </UiText>
      <UiText textRole="bodyMuted" accessibilityRole="alert">
        {message}
      </UiText>
      <Button variant="secondary" accessibilityLabel="Try again" onPress={() => void onRetry()}>
        Try again
      </Button>
    </View>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 gap-compact px-compact">
      <UiText textRole="meta">{label}</UiText>
      <UiText textRole="cardTitle" selectable>
        {value}
      </UiText>
    </View>
  )
}

export function RecordDetailView({
  record,
  loading,
  error,
  onRetry,
  deleting,
  deleteError,
  confirmationOpen,
  onOpenConfirmation,
  onCancelConfirmation,
  onConfirmDelete,
}: Props) {
  if (loading && !record) {
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background">
        <LoadingSpinner />
        <UiText textRole="bodyMuted">Loading record…</UiText>
      </View>
    )
  }
  if (error && !record) {
    return <ErrorState title="Failed to load record" message={error} onRetry={onRetry} />
  }
  if (!record) {
    return (
      <View className="flex-1 items-start justify-center gap-field bg-background p-page">
        <UiText textRole="cardTitle" accessibilityRole="header">
          Record not found
        </UiText>
        <UiText textRole="bodyMuted">It may have been deleted or not yet synced.</UiText>
      </View>
    )
  }

  const date = parseServerUtcDate(record.createdAt)
  const totalSets = countSetsForRecord(record)
  const strengthSets = record.exerciseRecords.reduce(
    (sum, exercise) => sum + (exercise.reps?.length || 0),
    0
  )
  const intervals = totalSets - strengthSets
  const totalVolume = computeVolumeForRecord(record)
  const duration = recordDurationSeconds(record)

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-3xl self-center gap-field px-page py-section">
          {!!error && (
            <View className="gap-compact rounded-control border border-divider bg-raised p-field">
              <UiText textRole="bodyMuted" accessibilityRole="alert">
                Could not refresh this record: {error}
              </UiText>
              <Button
                variant="secondary"
                accessibilityLabel="Try again"
                onPress={() => void onRetry()}
                className="self-start"
              >
                Try again
              </Button>
            </View>
          )}
          <UiText textRole="screenTitle" selectable>
            {record.workoutTitle}
          </UiText>
          <View className="gap-compact">
            <UiText textRole="caption" selectable>
              {date.toLocaleDateString([], {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </UiText>
            <UiText textRole="caption" selectable>
              Finished at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </UiText>
          </View>

          <View className="flex-row flex-wrap rounded-card border border-divider bg-surface py-card">
            <SummaryMetric
              label={intervals > 0 ? 'Interval time' : 'Duration'}
              value={duration > 0 ? formatSeconds(duration) : '—'}
            />
            <SummaryMetric
              label={strengthSets > 0 ? (intervals > 0 ? 'Sets / intervals' : 'Sets') : 'Intervals'}
              value={
                strengthSets > 0
                  ? intervals > 0
                    ? `${strengthSets} / ${intervals}`
                    : `${strengthSets}`
                  : `${intervals}`
              }
            />
            <SummaryMetric
              label="Volume · kg × reps"
              value={strengthSets > 0 ? totalVolume.toLocaleString() : '—'}
            />
          </View>

          <UiText textRole="bodyEmphasis" accessibilityRole="header" className="pt-field">
            Recorded exercises
          </UiText>
          <View className="gap-field">
            {record.exerciseRecords.map((exercise, index) => {
              const cardio = isCardioExerciseRecord(exercise)
              const rows = cardio ? exercise.durationSeconds || [] : exercise.reps || []
              const volume =
                exercise.reps?.reduce(
                  (sum, reps, rowIndex) => sum + reps * (exercise.weight?.[rowIndex] || 0),
                  0
                ) || 0
              const achievements = launchFacade.training.getExerciseAchievements(exercise)
              const oneRm = achievements.some((achievement) => achievement.type === '1RM')
              const volumePr = achievements.some((achievement) => achievement.type === 'VOLUME')

              return (
                <View
                  key={`${exercise.exerciseName}-${index}`}
                  className="gap-compact rounded-card border border-divider bg-surface p-card"
                >
                  <UiText textRole="bodyEmphasis" accessibilityRole="header" selectable>
                    {exercise.exerciseName}
                  </UiText>
                  <UiText textRole="caption">
                    {rows.length}{' '}
                    {cardio
                      ? rows.length === 1
                        ? 'recorded interval'
                        : 'recorded intervals'
                      : 'sets'}
                    {!cardio ? ` · ${volume.toLocaleString()} kg volume` : ''}
                  </UiText>
                  <View className="flex-row items-center gap-field border-b border-divider pb-compact">
                    <UiText textRole="meta" className="flex-1">
                      {cardio ? 'Interval' : 'Set'}
                    </UiText>
                    {!cardio && (
                      <UiText textRole="meta" className="flex-1 text-right">
                        Weight · kg
                      </UiText>
                    )}
                    <UiText textRole="meta" className="flex-1 text-right">
                      {cardio ? 'Duration' : 'Reps'}
                    </UiText>
                  </View>
                  {rows.map((value, rowIndex) => (
                    <View
                      key={rowIndex}
                      className="min-h-touch flex-row items-center gap-field border-b border-divider py-compact"
                    >
                      <View className="flex-1 flex-row items-center gap-compact">
                        <UiText textRole="bodyMuted">{rowIndex + 1}</UiText>
                        {!cardio && oneRm && exercise.achievedOneRmSetIndex === rowIndex && (
                          <UiBadge variant="pill">PR</UiBadge>
                        )}
                      </View>
                      {!cardio && (
                        <UiText textRole="body" className="flex-1 text-right" selectable>
                          {(exercise.weight?.[rowIndex] ?? 0).toLocaleString()}
                        </UiText>
                      )}
                      <UiText textRole="body" className="flex-1 text-right" selectable>
                        {cardio ? formatSeconds(value) : value}
                      </UiText>
                    </View>
                  ))}
                  {rows.length === 0 && <UiText textRole="bodyMuted">No recorded sets.</UiText>}
                  {(oneRm || volumePr) && (
                    <View className="gap-compact pt-field">
                      <UiBadge variant="pill">Personal record</UiBadge>
                      {oneRm && (
                        <UiText textRole="captionEmphasis">
                          Est. 1RM record · {exercise.achievedOneRmValue?.toLocaleString()} kg
                        </UiText>
                      )}
                      {volumePr && (
                        <UiText textRole="captionEmphasis">
                          Volume record · {exercise.achievedTotalVolumeValue?.toLocaleString()} kg
                        </UiText>
                      )}
                    </View>
                  )}
                  {!!exercise.notes && (
                    <UiText textRole="bodyMuted" selectable>
                      {exercise.notes}
                    </UiText>
                  )}
                </View>
              )
            })}
          </View>

          {!!record.notes && (
            <View className="gap-field pt-section">
              <UiText textRole="bodyEmphasis" accessibilityRole="header">
                Session notes
              </UiText>
              <UiText textRole="bodyMuted" selectable>
                {record.notes}
              </UiText>
            </View>
          )}
        </View>
      </ScrollView>
      <CadenceOverlay
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (!open) onCancelConfirmation()
        }}
        title="Delete this record?"
        dismissible={!deleting}
      >
        <UiText textRole="bodyMuted">
          {record.workoutTitle} · {date.toLocaleDateString([], { day: 'numeric', month: 'long' })}.
          Its recorded values and notes will be removed.
        </UiText>
        {!!deleteError && (
          <UiText textRole="bodyDestructive" accessibilityRole="alert">
            {deleteError}
          </UiText>
        )}
        <Button
          variant="surface"
          loading={deleting}
          disabled={deleting}
          accessibilityLabel="Confirm delete record"
          onPress={() => void onConfirmDelete()}
        >
          <UiText textRole="bodyDestructive">{deleting ? 'Deleting…' : 'Delete record'}</UiText>
        </Button>
        <Button
          variant="secondary"
          disabled={deleting}
          accessibilityLabel="Keep record"
          onPress={onCancelConfirmation}
        >
          Keep record
        </Button>
      </CadenceOverlay>
    </View>
  )
}
