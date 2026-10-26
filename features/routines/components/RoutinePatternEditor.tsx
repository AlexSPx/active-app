import { useState } from 'react'
import { View } from 'react-native'
import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from '../../../components/ui/icons'
import { Button, UiText } from '../../../components/ui/Controls'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import type { RoutinePatternItem } from '../../../types/routine'
import { useWorkouts } from '../../workouts'
import { RoutineEditorSheet } from './RoutineEditorSheet'
import { applyWorkoutSelection, reindexPattern, workoutMetadata } from '../routineDraft'
import { syncEngine } from '../../../lib/sync'

export interface RoutinePatternEditorProps {
  pattern: RoutinePatternItem[]
  onChange: (pattern: RoutinePatternItem[]) => void
  hideRestOption?: boolean
  routineName?: string
}

export function RoutinePatternEditor({
  pattern: rawPattern,
  onChange,
  hideRestOption,
  routineName,
}: RoutinePatternEditorProps) {
  const { workouts, loading, error } = useWorkouts()
  const colors = useCadenceColors()
  const pattern = rawPattern.map((day) => ({
    ...day,
    workoutId: day.workoutId ? syncEngine.resolveId('workouts', day.workoutId) : null,
  }))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDay, setPickerDay] = useState<number | null>(null)

  const update = (next: RoutinePatternItem[]) => onChange(reindexPattern(next))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= pattern.length) return
    const next = [...pattern]
    ;[next[from], next[to]] = [next[to], next[from]]
    update(next)
  }
  const remove = (from: number) => update(pattern.filter((_, index) => index !== from))

  return (
    <View className="gap-field">
      {!!error && <UiText textRole="captionDestructive">{error}</UiText>}
      {hideRestOption ? (
        <>
          {!pattern.length && (
            <View className="gap-compact">
              <UiText textRole="cardTitle">No workouts yet</UiText>
              <UiText textRole="bodyMuted">
                Choose the sessions you want to complete each week.
              </UiText>
            </View>
          )}
          {pattern.map((item, itemIndex) => {
            const assigned = workouts.find((candidate) => candidate.id === item.workoutId)
            return (
              <View
                key={itemIndex}
                className="flex-row items-center gap-field border-b border-divider pb-field"
              >
                <View className="min-w-0 flex-1 gap-compact">
                  <UiText textRole="bodyEmphasis" numberOfLines={1}>
                    {assigned?.title ?? 'Choose a saved workout'}
                  </UiText>
                  <UiText textRole="caption">Any order</UiText>
                </View>
                <Button
                  variant="ghost"
                  density="compact"
                  className="h-touch w-touch p-0"
                  accessibilityLabel={`Remove ${assigned?.title ?? `session ${itemIndex + 1}`} from routine`}
                  onPress={() => remove(itemIndex)}
                >
                  <Trash2 size={18} color={colors.muted} aria-hidden />
                </Button>
              </View>
            )
          })}
          <Button
            variant="ghost"
            className="h-action flex-row gap-compact border border-dashed border-divider"
            onPress={() => {
              setPickerDay(null)
              setPickerOpen(true)
            }}
          >
            <Plus size={18} color={colors.accent} aria-hidden />
            <UiText textRole="captionEmphasis">Choose workouts</UiText>
          </Button>
        </>
      ) : pattern.length ? (
        <>
          {pattern.map((item, itemIndex) => {
            const assigned = workouts.find((candidate) => candidate.id === item.workoutId)
            const selected = item.dayType === 'WORKOUT'
            return (
              <View key={itemIndex} className="gap-field rounded-card bg-surface p-card">
                <View className="flex-row items-center justify-between gap-compact">
                  <UiText textRole="bodyEmphasis">Day {itemIndex + 1}</UiText>
                  <View className="flex-row items-center">
                    <Button
                      variant="ghost"
                      density="compact"
                      className="h-touch w-touch p-0"
                      accessibilityLabel={`Move day ${itemIndex + 1} earlier`}
                      accessibilityHint="Moves this day before the previous day in the repeating cycle."
                      disabled={itemIndex === 0}
                      onPress={() => move(itemIndex, itemIndex - 1)}
                    >
                      <ArrowUp size={18} color={colors.muted} aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      density="compact"
                      className="h-touch w-touch p-0"
                      accessibilityLabel={`Move day ${itemIndex + 1} later`}
                      accessibilityHint="Moves this day after the next day in the repeating cycle."
                      disabled={itemIndex === pattern.length - 1}
                      onPress={() => move(itemIndex, itemIndex + 1)}
                    >
                      <ArrowDown size={18} color={colors.muted} aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      density="compact"
                      className="h-touch w-touch p-0"
                      accessibilityLabel={`Remove day ${itemIndex + 1}`}
                      onPress={() => remove(itemIndex)}
                    >
                      <Trash2 size={18} color={colors.accent} aria-hidden />
                    </Button>
                  </View>
                </View>
                <View
                  className="flex-row gap-compact rounded-control bg-raised p-compact"
                  accessibilityRole="radiogroup"
                  accessibilityLabel={`Day ${itemIndex + 1} type`}
                >
                  {(['WORKOUT', 'REST'] as const).map((type) => (
                    <Button
                      key={type}
                      variant={item.dayType === type ? 'selected' : 'ghost'}
                      className="flex-1"
                      accessibilityRole="radio"
                      accessibilityLabel={`Day ${itemIndex + 1} ${type === 'WORKOUT' ? 'training' : 'rest'}`}
                      accessibilityState={{ checked: item.dayType === type }}
                      onPress={() =>
                        update(
                          pattern.map((day, index) =>
                            index === itemIndex ? { ...day, dayType: type } : day
                          )
                        )
                      }
                    >
                      {type === 'WORKOUT' ? 'Training' : 'Rest'}
                    </Button>
                  ))}
                </View>
                {selected ? (
                  <Button
                    variant="ghost"
                    density="compact"
                    className="h-auto min-h-action flex-row justify-between border-t border-divider px-0 pt-field"
                    accessibilityLabel={`${assigned ? `Change ${assigned.title}` : 'Choose a saved workout'} for day ${itemIndex + 1}`}
                    onPress={() => {
                      setPickerDay(itemIndex)
                      setPickerOpen(true)
                    }}
                  >
                    <View className="min-w-0 flex-1 gap-compact">
                      <UiText textRole="bodyEmphasis" numberOfLines={1}>
                        {assigned?.title ?? 'Choose a workout'}
                      </UiText>
                      <UiText textRole="caption">
                        {assigned ? workoutMetadata(assigned) : 'From your saved workouts'}
                      </UiText>
                    </View>
                    <ChevronRight size={20} color={colors.accent} aria-hidden />
                  </Button>
                ) : (
                  <UiText textRole="caption">No workout scheduled.</UiText>
                )}
              </View>
            )
          })}
          <Button
            variant="ghost"
            className="h-action flex-row gap-compact border border-dashed border-divider"
            onPress={() =>
              update([
                ...pattern,
                { dayIndex: pattern.length + 1, dayType: 'WORKOUT', workoutId: null },
              ])
            }
          >
            <Plus size={18} color={colors.accent} aria-hidden />
            <UiText textRole="captionEmphasis">Add day</UiText>
          </Button>
        </>
      ) : (
        <View className="gap-field border-t border-divider pt-section">
          <UiText textRole="cardTitle">No days yet</UiText>
          <UiText textRole="bodyMuted">
            Add training and rest days in the order you want them to repeat.
          </UiText>
          <Button
            variant="ghost"
            className="h-action flex-row gap-compact border border-dashed border-divider"
            onPress={() => update([{ dayIndex: 1, dayType: 'WORKOUT', workoutId: null }])}
          >
            <Plus size={18} color={colors.accent} aria-hidden />
            <UiText textRole="captionEmphasis">Add first day</UiText>
          </Button>
        </View>
      )}
      <RoutineEditorSheet
        open={pickerOpen && !loading}
        onOpenChange={setPickerOpen}
        workouts={workouts}
        single={!hideRestOption}
        selected={
          hideRestOption
            ? pattern.flatMap((item) => (item.workoutId ? [item.workoutId] : []))
            : pickerDay !== null && pattern[pickerDay]?.workoutId
              ? [pattern[pickerDay].workoutId!]
              : []
        }
        context={`${routineName?.trim() || 'your new routine'} · ${hideRestOption ? 'Any order' : `Day ${(pickerDay ?? 0) + 1}`}`}
        onApply={(selection) => {
          if (hideRestOption) update(applyWorkoutSelection(pattern, selection))
          else if (pickerDay !== null)
            update(
              pattern.map((item, itemIndex) =>
                itemIndex === pickerDay
                  ? { ...item, dayType: 'WORKOUT', workoutId: selection[0] ?? null }
                  : item
              )
            )
        }}
      />
    </View>
  )
}
