import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
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

function SummaryMetric({
  label,
  value,
  divider = false,
}: {
  label: string
  value: string
  divider?: boolean
}) {
  return (
    <View
      className="min-w-0 flex-1 items-center gap-compact border-divider px-compact"
      style={divider && styles.metricDivider}
    >
      <UiText textRole="cardTitle" style={{ fontSize: 21, lineHeight: 25 }} selectable>
        {value}
      </UiText>
      <UiText textRole="meta" style={{ fontSize: 10, lineHeight: 15 }}>
        {label}
      </UiText>
    </View>
  )
}

function RecordTableCell({
  column,
  header = false,
  children,
}: {
  column: 'set' | 'interval' | 'weight' | 'value'
  header?: boolean
  children: ReactNode
}) {
  return (
    <View style={[styles.cell, styles[column]]}>
      <UiText
        textRole={header ? 'meta' : column === 'set' || column === 'interval' ? 'caption' : 'body'}
        style={header ? styles.columnLabel : styles.cellText}
        selectable={!header}
      >
        {children}
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
        <View className="w-full max-w-3xl self-center px-page pb-section" style={styles.content}>
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
          <UiText textRole="screenTitle" style={styles.title} selectable>
            {record.workoutTitle}
          </UiText>
          <UiText textRole="bodyMuted" style={{ fontSize: 13 }}>
            A session in the books.
          </UiText>

          <View className="flex-row bg-surface" style={styles.summary}>
            <SummaryMetric
              divider
              label={intervals > 0 ? 'interval minutes' : 'minutes'}
              value={duration > 0 ? `${Math.round(duration / 60)}` : '—'}
            />
            <SummaryMetric
              divider
              label={strengthSets > 0 ? (intervals > 0 ? 'sets / intervals' : 'sets') : 'intervals'}
              value={
                strengthSets > 0
                  ? intervals > 0
                    ? `${strengthSets} / ${intervals}`
                    : `${strengthSets}`
                  : `${intervals}`
              }
            />
            <SummaryMetric
              label="kg lifted"
              value={strengthSets > 0 ? totalVolume.toLocaleString() : '—'}
            />
          </View>

          <UiText
            textRole="bodyEmphasis"
            accessibilityRole="header"
            style={styles.recordedSetsTitle}
          >
            Recorded sets
          </UiText>
          <View style={styles.exerciseList}>
            {record.exerciseRecords.map((exercise, index) => {
              const cardio = isCardioExerciseRecord(exercise)
              const rows = cardio ? exercise.durationSeconds || [] : exercise.reps || []
              const achievements = launchFacade.training.getExerciseAchievements(exercise)
              const oneRm = achievements.some((achievement) => achievement.type === '1RM')
              const volumePr = achievements.some((achievement) => achievement.type === 'VOLUME')

              return (
                <View key={`${exercise.exerciseName}-${index}`}>
                  <UiText textRole="bodyEmphasis" accessibilityRole="header" selectable>
                    {exercise.exerciseName}
                  </UiText>
                  <View style={[styles.row, styles.tableHeader]}>
                    <RecordTableCell column={cardio ? 'interval' : 'set'} header>
                      {cardio ? 'Interval' : 'Set'}
                    </RecordTableCell>
                    {!cardio && (
                      <RecordTableCell column="weight" header>
                        Weight (kg)
                      </RecordTableCell>
                    )}
                    <RecordTableCell column="value" header>
                      {cardio ? 'Duration' : 'Reps'}
                    </RecordTableCell>
                  </View>
                  {rows.map((value, rowIndex) => (
                    <View
                      key={rowIndex}
                      className="border-divider"
                      style={[styles.row, styles.tableRow]}
                    >
                      <RecordTableCell column={cardio ? 'interval' : 'set'}>
                        {rowIndex + 1}
                      </RecordTableCell>
                      {!cardio && (
                        <RecordTableCell column="weight">
                          {(exercise.weight?.[rowIndex] ?? 0).toLocaleString()}
                        </RecordTableCell>
                      )}
                      <RecordTableCell column="value">
                        {cardio ? formatSeconds(value) : value}
                      </RecordTableCell>
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

const styles = StyleSheet.create({
  content: { paddingTop: 20 },
  title: { marginTop: 12, marginBottom: 10 },
  summary: { marginVertical: 18, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 10 },
  metricDivider: { borderRightWidth: 1 },
  recordedSetsTitle: { marginTop: 2, marginBottom: 20 },
  exerciseList: { gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
  tableHeader: { marginTop: 12, paddingVertical: 8 },
  tableRow: { borderTopWidth: 1, paddingVertical: 9 },
  cell: { paddingHorizontal: 8 },
  set: { width: 36 },
  interval: { width: 64 },
  weight: { flex: 2 },
  value: { flex: 1 },
  columnLabel: { fontSize: 10, lineHeight: 15 },
  cellText: { fontSize: 12, lineHeight: 18 },
})
