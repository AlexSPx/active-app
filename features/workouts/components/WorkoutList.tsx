import { useTabContentInset } from '../../../navigation/TabContentInset'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { memo, useEffect, useRef } from 'react'
import type { ApiWorkout } from '../../../types/api'
import { WorkoutCard } from './WorkoutCard'
import { View } from 'react-native'
import { UiText } from '../../../components/ui/Controls'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
  focusId?: string
}

export const WorkoutList = memo(function WorkoutList({
  workouts,
  onStartWorkout,
  isWorkoutRunning,
  onEditWorkout,
  onDeleteWorkout,
  onWorkoutPress,
  listHeader,
  refreshing,
  onRefresh,
  focusId,
}: WorkoutListProps) {
  const listRef = useRef<FlashListRef<ApiWorkout>>(null)
  const insets = useSafeAreaInsets()
  const bottomInset = useTabContentInset()

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
    <View className="w-full max-w-3xl flex-1 self-center">
      <FlashList
        ref={listRef}
        data={workouts}
        renderItem={renderWorkout}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingBottom: 24 + insets.bottom + bottomInset,
          paddingHorizontal: 20,
        }}
        ListHeaderComponent={listHeader}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <View className="mt-field gap-field border-t border-divider py-section">
            <UiText textRole="cardTitle">Make your first workout.</UiText>
            <UiText textRole="caption">Choose exercises and set your sets and reps.</UiText>
          </View>
        }
        ItemSeparatorComponent={() => <View className="h-field" />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
})
