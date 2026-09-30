import { FlashList } from '@shopify/flash-list'
import { memo, useEffect, useRef } from 'react'
import type { ApiWorkout } from '../../../types/api'
import { WorkoutCard } from './WorkoutCard'
import { View, YStack, Text, getTokenValue } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export interface WorkoutListProps {
  workouts: ApiWorkout[]
  onStartWorkout: (workout: ApiWorkout) => void
  isWorkoutRunning: boolean
  routineNameByWorkoutId?: Record<string, string>
  onEditWorkout?: (workout: ApiWorkout) => void
  onDeleteWorkout?: (workoutId: string) => void
  onWorkoutPress?: (workout: ApiWorkout) => void
  listHeader?: React.ReactElement
  refreshing?: boolean
  onRefresh?: () => void
  focusId?: string
}

export const WorkoutList = memo(function WorkoutList({
  workouts,
  onStartWorkout,
  isWorkoutRunning,
  routineNameByWorkoutId,
  onEditWorkout,
  onDeleteWorkout,
  onWorkoutPress,
  listHeader,
  refreshing,
  onRefresh,
  focusId,
}: WorkoutListProps) {
  const listRef = useRef<any>(null)
  const insets = useSafeAreaInsets()

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
        routineName={routineNameByWorkoutId?.[workout.id]}
        onEdit={onEditWorkout ? () => onEditWorkout(workout) : undefined}
        onDelete={onDeleteWorkout ? () => onDeleteWorkout(workout.id) : undefined}
        onPress={onWorkoutPress}
      />
    )
  }

  return (
    <View flex={1} width="100%" maxW="$content" self="center">
      <FlashList
        ref={listRef}
        data={workouts}
        renderItem={renderWorkout}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: getTokenValue('$section', 'space') + insets.bottom,
          paddingHorizontal: getTokenValue('$page', 'space'),
        }}
        ListHeaderComponent={listHeader}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <YStack py="$section" gap="$2">
            <Text fontSize="$cardTitle" fontWeight="600">
              No workouts yet
            </Text>
            <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
              Create a workout with your exercises, sets and reps.
            </Text>
          </YStack>
        }
        ItemSeparatorComponent={() => <View height={getTokenValue('$field', 'space')} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
})
