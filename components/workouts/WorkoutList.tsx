import { FlashList } from '@shopify/flash-list'
import { memo } from 'react'
import type { ApiWorkout } from '../../types/api'
import { WorkoutCard } from './WorkoutCard'
import { View } from 'tamagui'

export interface WorkoutListProps {
  workouts: ApiWorkout[]
  onStartWorkout: (workout: ApiWorkout) => void
  isWorkoutRunning: boolean
  onEditWorkout?: (workout: ApiWorkout) => void
  onDeleteWorkout?: (workoutId: string) => void
}

export const WorkoutList = memo(
  function WorkoutList({
    workouts,
    onStartWorkout,
    isWorkoutRunning,
    onEditWorkout,
    onDeleteWorkout,
  }: WorkoutListProps) {
    const renderWorkout = ({ item: workout }: { item: ApiWorkout }) => {
      return (
        <WorkoutCard
          workout={workout}
          onStartWorkout={() => onStartWorkout(workout)}
          isWorkoutRunning={isWorkoutRunning}
          onEdit={onEditWorkout ? () => onEditWorkout(workout) : undefined}
          onDelete={onDeleteWorkout ? () => onDeleteWorkout(workout.id) : undefined}
        />
      )
    }

    return (
      <View flex={1} mt="$3" mb="$8">
        <FlashList
          data={workouts}
          renderItem={renderWorkout}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View height="$4" />}
          showsVerticalScrollIndicator={false}
        />
      </View>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if workouts array or running state has changed
    return (
      prevProps.workouts.length === nextProps.workouts.length &&
      prevProps.workouts.every((workout, index) => workout.id === nextProps.workouts[index]?.id) &&
      prevProps.isWorkoutRunning === nextProps.isWorkoutRunning
    )
  }
)
