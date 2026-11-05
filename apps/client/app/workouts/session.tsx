import { useCallback, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Stack } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { FlashList } from '@shopify/flash-list'
import { UiText } from '../../components/ui/Controls'

import {
  WorkoutSessionExercise,
  WorkoutSessionHeader,
  WorkoutActions,
  useWorkoutSession,
  RestTimerOverlay,
  useRunningWorkoutStore,
} from '../../features/workout-session'
import { getCurrentDate } from '../../utils/date'
import { useAppNavigation } from '../../navigation/useAppNavigation'
import type { Exercise } from '../../types/workout-session'
import { useWorkoutCompletion } from '../../features/workout-session/hooks/useWorkoutCompletion'
import { getRestTimerNextStepText } from '../../features/workout-session/utils'

function SessionExerciseSeparator() {
  return <View style={{ height: 16 }} />
}

export default function WorkoutSessionScreen() {
  const { goBack } = useAppNavigation()
  const headerHeight = useHeaderHeight()
  const [footerHeight, setFooterHeight] = useState(0)
  const startTime = useRunningWorkoutStore((state) => state.runningWorkout?.startTime ?? null)
  const {
    // State
    exercises,
    workoutName,
    // Actions
    updateSet,
    toggleSetComplete,
    addSet,
    removeSet,
    startRestTimer,
    extendRestTimer,
    skipRestTimer,
    finishWorkout,
    cancelWorkout,
    // Timer state
    activeTimer,
    restTime,
    remainingRest,
  } = useWorkoutSession()

  const finishWorkoutWithFeedback = useWorkoutCompletion(finishWorkout)

  const renderExercise = useCallback(
    ({ item: exercise, index }: { item: Exercise; index: number }) => (
      <WorkoutSessionExercise
        exercise={exercise}
        index={index}
        onUpdateSet={updateSet}
        onToggleSetComplete={toggleSetComplete}
        onAddSet={addSet}
        onRemoveSet={removeSet}
        onStartRestTimer={startRestTimer}
      />
    ),
    [addSet, removeSet, startRestTimer, toggleSetComplete, updateSet]
  )

  const sessionDate = useMemo(() => getCurrentDate(), [])
  const ListHeaderComponent = useCallback(
    () => (
      <WorkoutSessionHeader workoutName={workoutName} startTime={startTime} date={sessionDate} />
    ),
    [sessionDate, startTime, workoutName]
  )
  const sessionList = useMemo(
    () => (
      <FlashList
        style={{ flex: 1 }}
        data={exercises}
        renderItem={renderExercise}
        keyExtractor={(item) => item.sessionId}
        ItemSeparatorComponent={SessionExerciseSeparator}
        ListHeaderComponent={ListHeaderComponent}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
      />
    ),
    [ListHeaderComponent, exercises, renderExercise]
  )
  const nextStepText = useMemo(
    () =>
      activeTimer
        ? getRestTimerNextStepText(exercises, activeTimer)
        : 'Continue whenever you are ready.',
    [activeTimer, exercises]
  )

  const leaveAction = useCallback(
    () => (
      <Pressable
        className="min-h-touch justify-center px-compact"
        accessibilityRole="button"
        accessibilityLabel="Leave workout session"
        onPress={goBack}
      >
        <UiText textRole="captionEmphasis">Leave</UiText>
      </Pressable>
    ),
    [goBack]
  )

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <View className="flex-1 bg-background px-page">
        <Stack.Screen
          options={{
            title: 'Workout',
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: leaveAction,
          }}
        />
        {sessionList}
        <View
          className="bg-transparent"
          onLayout={(event: LayoutChangeEvent) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          <WorkoutActions
            onFinishWorkout={finishWorkoutWithFeedback}
            onCancelWorkout={cancelWorkout}
            onGoBack={goBack}
          />
        </View>
        <RestTimerOverlay
          active={!!activeTimer}
          remaining={remainingRest}
          total={restTime}
          nextStepText={nextStepText}
          onExtend={extendRestTimer}
          onSkip={skipRestTimer}
          bottomOffset={footerHeight}
        />
      </View>
    </KeyboardAvoidingView>
  )
}
