import { ScrollView, View } from 'react-native'
import { useTabContentInset } from '../../../navigation/TabContentInset'
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
    <View className="min-w-0 flex-1 items-center gap-compact px-compact">
      <UiText textRole="cardTitle" style={{ fontSize: 21, lineHeight: 25 }} selectable>
        {value}
      </UiText>
      <UiText textRole="meta" style={{ fontSize: 10, lineHeight: 15 }}>
        {label}
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
  const bottomInset = useTabContentInset()
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
        contentContainerStyle={{ paddingBottom: bottomInset }}
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-3xl self-center px-page pb-section pt-5">
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
          <UiText textRole="meta" selectable>
            {date.toLocaleDateString([], {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </UiText>
          <UiText textRole="screenTitle" className="mb-2.5 mt-field" selectable>
            {record.workoutTitle}
          </UiText>
          <UiText textRole="bodyMuted" style={{ fontSize: 13 }}>
            A session in the books.
          </UiText>

          <View className="my-[18px] flex-row rounded-[16px] bg-surface px-2.5 py-card">
            <SummaryMetric
              label={intervals > 0 ? 'interval minutes' : 'minutes'}
              value={duration > 0 ? `${Math.round(duration / 60)}` : '—'}
            />
            <View className="w-px self-stretch bg-divider" />
            <SummaryMetric
              label={strengthSets > 0 ? (intervals > 0 ? 'sets / intervals' : 'sets') : 'intervals'}
              value={
                strengthSets > 0
                  ? intervals > 0
                    ? `${strengthSets} / ${intervals}`
                    : `${strengthSets}`
                  : `${intervals}`
              }
            />
            <View className="w-px self-stretch bg-divider" />
            <SummaryMetric
              label="kg lifted"
              value={strengthSets > 0 ? totalVolume.toLocaleString() : '—'}
            />
          </View>

          <UiText textRole="bodyEmphasis" accessibilityRole="header" className="mb-5 mt-0.5">
            Recorded sets
          </UiText>
          <View className="gap-5">
            {record.exerciseRecords.map((exercise, index) => {
              const cardio = isCardioExerciseRecord(exercise)
              const rows = cardio ? exercise.durationSeconds || [] : exercise.reps || []
              const achievements = launchFacade.training.getExerciseAchievements(exercise)
              const oneRm = achievements.some((achievement) => achievement.type === '1RM')
              const volumePr = achievements.some((achievement) => achievement.type === 'VOLUME')

              return (
                <View key={`${exercise.exerciseName}-${index}`} className="gap-0">
                  <UiText textRole="bodyEmphasis" accessibilityRole="header" selectable>
                    {exercise.exerciseName}
                  </UiText>
                  <View className="mt-field flex-row items-center py-2">
                    <UiText
                      textRole="meta"
                      style={{ fontSize: 10, lineHeight: 15 }}
                      className={cardio ? 'w-16 px-2' : 'w-9 px-2'}
                    >
                      {cardio ? 'Interval' : 'Set'}
                    </UiText>
                    {!cardio && (
                      <UiText
                        textRole="meta"
                        style={{ fontSize: 10, lineHeight: 15 }}
                        className="flex-[2] px-2"
                      >
                        Weight (kg)
                      </UiText>
                    )}
                    <UiText
                      textRole="meta"
                      style={{ fontSize: 10, lineHeight: 15 }}
                      className="flex-1 px-2"
                    >
                      {cardio ? 'Duration' : 'Reps'}
                    </UiText>
                  </View>
                  {rows.map((value, rowIndex) => (
                    <View
                      key={rowIndex}
                      className="flex-row items-center border-t border-divider py-[9px]"
                    >
                      <View
                        className={
                          cardio ? 'w-16 flex-row items-center' : 'w-9 flex-row items-center'
                        }
                      >
                        <UiText textRole="caption" className="px-2">
                          {rowIndex + 1}
                        </UiText>
                      </View>
                      {!cardio && (
                        <UiText
                          textRole="body"
                          style={{ fontSize: 12, lineHeight: 18 }}
                          className="flex-[2] px-2"
                          selectable
                        >
                          {(exercise.weight?.[rowIndex] ?? 0).toLocaleString()}
                        </UiText>
                      )}
                      <UiText
                        textRole="body"
                        style={{ fontSize: 12, lineHeight: 18 }}
                        className="flex-1 px-2"
                        selectable
                      >
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
