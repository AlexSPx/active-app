import { FlashList } from '@shopify/flash-list'
import { memo } from 'react'
import type { ApiWorkout } from '../../types/api'
import { WorkoutCard } from './WorkoutCard'
import { View, YStack, Text, Button } from 'tamagui'

export interface WorkoutListProps {
  workouts: ApiWorkout[]
  onStartWorkout: (workout: ApiWorkout) => void
  isWorkoutRunning: boolean
  onEditWorkout?: (workout: ApiWorkout) => void
  onDeleteWorkout?: (workoutId: string) => void
  listHeader?: React.ReactElement
  refreshing?: boolean
  onRefresh?: () => void
  onCreateWorkout?: () => void
}

export const WorkoutList = memo(
  function WorkoutList({
    workouts,
    onStartWorkout,
    isWorkoutRunning,
    onEditWorkout,
    onDeleteWorkout,
    listHeader,
    refreshing,
    onRefresh,
    onCreateWorkout,
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
      <View flex={1}>
        <FlashList
          data={workouts}
          renderItem={renderWorkout}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 48 }}
          ListHeaderComponent={listHeader}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            <YStack items="center" justify="center" py="$8">
              <Text fontSize="$6" color="$color11">
                No workouts yet
              </Text>
              <Text fontSize="$4" color="$color10" mt="$2">
                Create your first workout to get started
              </Text>
              {onCreateWorkout && (
                <Button mt="$4" onPress={onCreateWorkout}>
                  Create Workout
                </Button>
              )}
            </YStack>
          }
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
