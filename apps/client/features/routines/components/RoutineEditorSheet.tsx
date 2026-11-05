import { useEffect, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, TextField, UiText } from '../../../components/ui/Controls'
import { Check, ChevronLeft, Plus, Search } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import type { ApiWorkout } from '../../../types/api'
import { toggleWorkoutSelection, workoutMetadata } from '../routineDraft'
import { syncEngine } from '../../../lib/sync'

export interface RoutineEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workouts: ApiWorkout[]
  selected: string[]
  single: boolean
  context: string
  onApply: (selection: string[]) => void
}

export function RoutineEditorSheet(props: RoutineEditorSheetProps) {
  return <WorkoutPicker {...props} />
}

function WorkoutPicker({
  open,
  onOpenChange,
  workouts,
  selected,
  single,
  context,
  onApply,
}: RoutineEditorSheetProps) {
  const colors = useCadenceColors()
  const insets = useSafeAreaInsets()
  const wasOpen = useRef(false)
  const [pending, setPending] = useState(selected)
  const [query, setQuery] = useState('')
  const selection = pending.map((id) => syncEngine.resolveId('workouts', id))
  const results = workouts.filter((workout) =>
    workout.title.toLowerCase().includes(query.trim().toLowerCase())
  )

  useEffect(() => {
    if (open && !wasOpen.current) {
      setPending(selected)
      setQuery('')
    }
    wasOpen.current = open
  }, [open, selected])

  const changeOpen = (next: boolean) => {
    if (!next) Keyboard.dismiss()
    onOpenChange(next)
  }
  const createWorkout = () => {
    changeOpen(false)
    router.push('/workouts/new?returnTo=routine')
  }
  const title = single ? 'Choose a workout.' : 'Choose workouts.'
  const help = single
    ? 'Choose one workout for this training day.'
    : `${selection.length} selected across all searches.`

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => changeOpen(false)}
    >
      <KeyboardAvoidingView
        className="flex-1 bg-background"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          className="flex-1 px-page"
          style={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 12 }}
        >
          <View className="flex-row items-center justify-between">
            <Button
              variant="ghost"
              density="compact"
              className="flex-row justify-start gap-compact pl-0"
              accessibilityLabel="Back to routine"
              onPress={() => changeOpen(false)}
            >
              <ChevronLeft size={18} color={colors.muted} aria-hidden />
              <UiText textRole="caption">Routine</UiText>
            </Button>
            <Button variant="ghost" density="compact" onPress={() => changeOpen(false)}>
              <UiText textRole="captionEmphasis">Cancel</UiText>
            </Button>
          </View>

          {workouts.length ? (
            <View className="flex-1 gap-field pt-section">
              <View className="gap-field">
                <View className="gap-compact">
                  <UiText textRole="screenTitle" accessibilityRole="header">
                    {title}
                  </UiText>
                  <UiText textRole="bodyMuted">For {context}</UiText>
                </View>
                <View className="justify-center">
                  <TextField
                    accessibilityLabel="Search saved workouts"
                    value={query}
                    onChangeText={setQuery}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    placeholder="Search saved workouts"
                    className="pl-12"
                  />
                  <View className="absolute left-compact">
                    <Search size={18} color={colors.muted} aria-hidden />
                  </View>
                </View>
                <UiText textRole="caption">
                  {workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'} saved
                </UiText>
              </View>

              <ScrollView
                className="flex-1"
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
              >
                <View className="gap-compact">
                  {results.map((workout) => {
                    const checked = selection.includes(workout.id)
                    return (
                      <Button
                        key={workout.id}
                        variant={checked ? 'selected' : 'surface'}
                        shape="control"
                        className="h-auto min-h-action flex-row justify-between gap-field p-field"
                        accessibilityRole={single ? 'radio' : 'checkbox'}
                        accessibilityLabel={workout.title}
                        accessibilityState={{ checked }}
                        onPress={() =>
                          setPending(toggleWorkoutSelection(selection, workout.id, single))
                        }
                      >
                        <View className="min-w-0 flex-1 gap-compact">
                          <UiText textRole="bodyEmphasis" numberOfLines={1}>
                            {workout.title}
                          </UiText>
                          <UiText textRole="caption">{workoutMetadata(workout)}</UiText>
                          <UiText textRole="caption" numberOfLines={2}>
                            {workout.workoutTemplate.exercises
                              .map((exercise) => exercise.exerciseTitle)
                              .join(' · ')}
                          </UiText>
                        </View>
                        <View
                          className={`h-6 w-6 items-center justify-center rounded-full border ${checked ? 'border-accent bg-accent' : 'border-divider'}`}
                        >
                          {checked ? (
                            <Check size={15} color={colors.onAccent} strokeWidth={2} />
                          ) : null}
                        </View>
                      </Button>
                    )
                  })}
                  {!results.length && (
                    <View className="gap-field border-t border-divider py-section">
                      <UiText textRole="cardTitle">No matching workouts.</UiText>
                      <UiText textRole="bodyMuted">
                        Try a different workout name or create a workout in your library.
                      </UiText>
                      <Button variant="secondary" onPress={() => setQuery('')}>
                        Clear search
                      </Button>
                    </View>
                  )}
                </View>
              </ScrollView>

              <View className="gap-field border-t border-divider pt-field">
                <UiText textRole="caption">{help}</UiText>
                <Button
                  variant="primary"
                  disabled={!selection.length}
                  onPress={() => {
                    onApply(selection)
                    changeOpen(false)
                  }}
                >
                  {single ? 'Done' : `Done · ${selection.length} selected`}
                </Button>
              </View>
            </View>
          ) : (
            <View className="flex-1 gap-section pt-section">
              <View className="gap-compact">
                <UiText textRole="screenTitle" accessibilityRole="header">
                  {title}
                </UiText>
                <UiText textRole="bodyMuted">For {context}</UiText>
              </View>
              <View className="gap-field">
                <UiText textRole="cardTitle">No saved workouts yet</UiText>
                <UiText textRole="bodyMuted">
                  Create a workout to add a session to this routine.
                </UiText>
                <Button className="h-action flex-row gap-compact" onPress={createWorkout}>
                  <Plus size={18} color={colors.onAccent} aria-hidden />
                  <UiText textRole="buttonOnAccent">Create workout</UiText>
                </Button>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
