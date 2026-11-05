import type { ViewInstance } from 'react-native'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
import { CadenceOverlay } from '../../../components/ui/CadenceOverlay'
import { Check, ChevronDown, ChevronRight, Dumbbell, Play } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import type { WorkoutRecord } from '../../../types/api'
import type { TrainingHomeWeekPlan } from '../hooks/useTrainingHomeController'

type FlexibleRoutineViewProps = {
  plan: Extract<TrainingHomeWeekPlan, { kind: 'flexible' }>
  onOpenWorkout: (workoutId: string) => void
  onOpenRecord: (record: WorkoutRecord) => void
  onManageRoutine: () => void
  isWorkoutRunning: boolean
  onResume: () => void
  recordsError: string | null
  onRetryRecords: () => Promise<void>
}

export function FlexibleRoutineView({
  plan,
  onOpenWorkout,
  onOpenRecord,
  onManageRoutine,
  isWorkoutRunning,
  onResume,
  recordsError,
  onRetryRecords,
}: FlexibleRoutineViewProps) {
  const colors = useCadenceColors()
  const [chooserOpen, setChooserOpen] = useState(false)
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const actionRef = useRef<ViewInstance>(null)
  const pendingNavigation = useRef<(() => void) | null>(null)
  const remaining = plan.workouts.filter((item) => !item.completedRecord)
  const completed = plan.workouts.filter((item) => item.completedRecord)
  const complete = plan.completedCount !== null && remaining.length === 0

  const navigateAfterClose = (navigate: () => void) => {
    pendingNavigation.current = navigate
    setChooserOpen(false)
  }

  return (
    <View className="gap-field">
      <Pressable
        className="min-h-touch flex-row items-center gap-field active:opacity-75"
        accessibilityRole="button"
        accessibilityLabel={`Manage routine ${plan.routineName}`}
        onPress={onManageRoutine}
      >
        <UiText textRole="cardTitle" accessibilityRole="header" className="min-w-0 flex-1">
          {plan.routineName}
        </UiText>
        <ChevronRight size={18} color={colors.muted} aria-hidden />
      </Pressable>
      <View className="flex-row items-center justify-between gap-field">
        <UiText textRole="bodyMuted">This week</UiText>
        <UiText textRole="captionEmphasis">
          {plan.completedCount === null
            ? recordsError
              ? 'Progress unavailable'
              : 'Loading progress…'
            : `${plan.completedCount} of ${plan.workouts.length} complete`}
        </UiText>
      </View>
      <View
        className="mb-field flex-row gap-compact"
        accessibilityRole="progressbar"
        accessibilityLabel="Weekly workouts completed"
        accessibilityValue={{
          min: 0,
          max: plan.workouts.length,
          now: plan.completedCount ?? undefined,
          text:
            plan.completedCount === null
              ? 'Progress unavailable'
              : `${plan.completedCount} of ${plan.workouts.length} complete`,
        }}
      >
        {plan.workouts.map((item, index) => (
          <View
            key={item.id}
            className={`h-1.5 min-w-0 flex-1 rounded-full ${index < (plan.completedCount ?? 0) ? 'bg-accent' : 'bg-divider'}`}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ))}
      </View>
      {complete && (
        <UiText textRole="caption">
          All required workouts are complete. Your week resets Monday.
        </UiText>
      )}
      <Button
        ref={actionRef}
        className="flex-row gap-compact"
        onPress={() => {
          if (isWorkoutRunning) {
            onResume()
            return
          }
          setCompletedExpanded(false)
          setChooserOpen(true)
        }}
      >
        {isWorkoutRunning ? (
          <Play size={18} color={colors.onAccent} aria-hidden />
        ) : (
          <Dumbbell size={18} color={colors.onAccent} aria-hidden />
        )}
        <UiText textRole="buttonOnAccent">
          {isWorkoutRunning ? 'Resume workout' : complete ? 'View this week' : 'Choose a workout'}
        </UiText>
      </Button>
      <CadenceOverlay
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        title={complete ? 'This week' : 'Choose a workout'}
        returnFocusRef={actionRef}
        onClosed={() => {
          const navigate = pendingNavigation.current
          pendingNavigation.current = null
          navigate?.()
        }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {plan.completedCount === null ? (
            <View className="gap-field">
              <UiText textRole="bodyMuted">
                {recordsError ? 'Could not load weekly progress.' : 'Loading weekly progress…'}
              </UiText>
              {recordsError && (
                <Button variant="secondary" onPress={() => void onRetryRecords()}>
                  Try again
                </Button>
              )}
            </View>
          ) : (
            <>
              <UiText textRole="bodyMuted">
                {remaining.length} remaining this week. Choose any order.
              </UiText>
              {remaining.map(({ id, workout }) => (
                <Pressable
                  key={id}
                  className="min-h-touch flex-row items-center gap-field border-b border-divider py-field active:opacity-75"
                  accessibilityRole="button"
                  accessibilityLabel={`View workout ${workout?.title ?? 'Unavailable workout'}`}
                  accessibilityState={{ disabled: !workout }}
                  disabled={!workout}
                  onPress={() => navigateAfterClose(() => onOpenWorkout(id))}
                >
                  <UiText textRole="bodyEmphasis" className="min-w-0 flex-1">
                    {workout?.title ?? 'Unavailable workout'}
                  </UiText>
                  <ChevronRight size={18} color={colors.muted} aria-hidden />
                </Pressable>
              ))}
              {completed.length > 0 && (
                <View className="mt-field">
                  <Pressable
                    className="min-h-touch flex-row items-center gap-compact active:opacity-75"
                    accessibilityRole="button"
                    accessibilityLabel="Completed this week"
                    accessibilityState={{ expanded: completedExpanded }}
                    onPress={() => setCompletedExpanded(!completedExpanded)}
                  >
                    <Check size={18} color={colors.accent} aria-hidden />
                    <UiText textRole="bodyMuted" className="flex-1">
                      Completed this week
                    </UiText>
                    <UiText textRole="caption">{completed.length}</UiText>
                    {completedExpanded ? (
                      <ChevronDown size={18} color={colors.muted} aria-hidden />
                    ) : (
                      <ChevronRight size={18} color={colors.muted} aria-hidden />
                    )}
                  </Pressable>
                  {completedExpanded &&
                    completed.map(
                      ({ id, completedRecord }) =>
                        completedRecord && (
                          <Pressable
                            key={id}
                            className="min-h-touch flex-row items-center gap-field py-field active:opacity-75"
                            accessibilityRole="button"
                            accessibilityLabel={`View completed session ${completedRecord.workoutTitle}`}
                            onPress={() => navigateAfterClose(() => onOpenRecord(completedRecord))}
                          >
                            <UiText textRole="body" className="min-w-0 flex-1">
                              {completedRecord.workoutTitle}
                            </UiText>
                            <ChevronRight size={18} color={colors.muted} aria-hidden />
                          </Pressable>
                        )
                    )}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </CadenceOverlay>
    </View>
  )
}
