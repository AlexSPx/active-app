import { useTheme, View } from 'tamagui'
import { FlashList } from '@shopify/flash-list'

import { WorkoutSessionExercise } from '../../components/workout-session/WorkoutSessionExercise'
import { WorkoutSessionHeader } from '../../components/workout-session/WorkoutSessionHeader'
import { WorkoutActions } from '../../components/workout-session/WorkoutActions'
import { getCurrentDate } from '../../utils/dateUtils'
import { useWorkoutSession } from '../../hooks/useWorkoutSession'
import { useAppNavigation } from '../../navigation/useAppNavigation'
import type { Exercise } from '../../types/workout-session'

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
    finishWorkout,
  } = useWorkoutSession()

  const theme = useTheme()

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
      <WorkoutActions onFinishWorkout={finishWorkout} onGoBack={goBack} />
    </View>
  )

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 16 }}>
      <FlashList
        data={exercises}
        renderItem={renderExercise}
        keyExtractor={(item) => item.id}
        estimatedItemSize={200}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListHeaderComponent={ListHeaderComponent}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        ListFooterComponent={ListFooterComponent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}
