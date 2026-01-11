import { useTheme, View, YStack } from 'tamagui'
import { FlashList } from '@shopify/flash-list'

import { WorkoutSessionExercise, WorkoutSessionHeader, WorkoutActions, useWorkoutSession, RestTimerOverlay } from '../../features/workout-session'
import { getCurrentDate } from '../../utils/date'
import { useAppNavigation } from '../../navigation/useAppNavigation'
import type { Exercise } from '../../types/workout-session'
import { useUiStore } from '../../stores/uiStore'

export default function WorkoutSessionScreen() {
  const { goBack } = useAppNavigation()
  const {
    // State
    exercises,
    workoutName,
    workoutTag,
    workoutDuration,
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

  const showFinishedCongrats = useUiStore((s) => s.showFinishedCongrats)

  const renderExercise = ({ item: exercise }: { item: Exercise }) => (
    <WorkoutSessionExercise
      exercise={exercise}
      onUpdateSet={updateSet}
      onToggleSetComplete={toggleSetComplete}
      onAddSet={addSet}
      onRemoveSet={removeSet}
      onStartRestTimer={startRestTimer}
    />
  )

  const ListHeaderComponent = () => (
    <WorkoutSessionHeader
      workoutName={workoutName}
      duration={workoutDuration}
      date={getCurrentDate()}
    />
  )

  const ListFooterComponent = () => (
    <View pb="$6">
      <WorkoutActions
        onFinishWorkout={async () => {
          const resp = await finishWorkout()
          if (resp) {
            showFinishedCongrats(resp.workoutRecord, resp.streakUpdate)
          }
        }}
        onCancelWorkout={cancelWorkout}
        onGoBack={goBack}
      />
    </View>
  )

  return (
    <YStack flex={1} px="$4" bg="$background">
      <FlashList
        data={exercises}
        renderItem={renderExercise}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListHeaderComponent={ListHeaderComponent}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        ListFooterComponent={ListFooterComponent}
        showsVerticalScrollIndicator={false}
      />
      <RestTimerOverlay
        active={!!activeTimer}
        remaining={remainingRest}
        total={restTime}
        onExtend={extendRestTimer}
        onSkip={skipRestTimer}
      />
    </YStack>
  )
}
