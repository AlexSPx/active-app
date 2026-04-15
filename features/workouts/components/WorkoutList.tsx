import { FlashList } from '@shopify/flash-list'
import { memo, useEffect, useRef } from 'react'
import type { ApiWorkout } from '../../../types/api'
import { WorkoutCard } from './WorkoutCard'
import { View, YStack, Text, Button } from 'tamagui'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Dumbbell } from '@tamagui/lucide-icons'

export interface WorkoutListProps {
  workouts: ApiWorkout[]
  onStartWorkout: (workout: ApiWorkout) => void
  isWorkoutRunning: boolean
  onEditWorkout?: (workout: ApiWorkout) => void
  onDeleteWorkout?: (workoutId: string) => void
  onWorkoutPress?: (workout: ApiWorkout) => void
  listHeader?: React.ReactElement
  refreshing?: boolean
  onRefresh?: () => void
  onCreateWorkout?: () => void
  focusId?: string
}

export const WorkoutList = memo(
  function WorkoutList({
    workouts,
    onStartWorkout,
    isWorkoutRunning,
    onEditWorkout,
    onDeleteWorkout,
    onWorkoutPress,
    listHeader,
    refreshing,
    onRefresh,
    onCreateWorkout,
    focusId,
  }: WorkoutListProps) {
    const listRef = useRef<any>(null)

    useEffect(() => {
      if (!focusId || !workouts?.length) return
      const index = workouts.findIndex((w) => w.id === focusId)
      if (index >= 0) {
        const t = setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 })
          } catch {}
        }, 50)
        return () => clearTimeout(t)
      }
    }, [focusId, workouts])
    const renderWorkout = ({ item: workout }: { item: ApiWorkout }) => {
      return (
        <WorkoutCard
          workout={workout}
          onStartWorkout={() => onStartWorkout(workout)}
          isWorkoutRunning={isWorkoutRunning}
          onEdit={onEditWorkout ? () => onEditWorkout(workout) : undefined}
          onDelete={onDeleteWorkout ? () => onDeleteWorkout(workout.id) : undefined}
          onPress={onWorkoutPress}
        />
      )
    }

    return (
      <View flex={1}>
        <FlashList
          ref={listRef}
          data={workouts}
          renderItem={renderWorkout}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 48 }}
          ListHeaderComponent={listHeader}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            <EmptyState
              title="No workouts yet"
              description="Start a new workout to track your progress."
              icon={Dumbbell}
              actionLabel={onCreateWorkout ? 'Create Workout' : undefined}
              onAction={onCreateWorkout}
            />
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
      prevProps.isWorkoutRunning === nextProps.isWorkoutRunning &&
      prevProps.refreshing === nextProps.refreshing &&
      prevProps.focusId === nextProps.focusId
    )
  }
)
