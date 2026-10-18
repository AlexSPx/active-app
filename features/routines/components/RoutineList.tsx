import { FlashList } from '@shopify/flash-list'
import { memo } from 'react'
import { View } from 'react-native'
import { UiText } from '../../../components/ui/Controls'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Routine } from '../../../types/routine'
import { RoutineCard } from './RoutineCard'
export interface RoutineListProps {
  routines: Routine[]
  activeRoutineId?: string | null
  workoutTitleById?: Record<string, string>
  onActivate: (routineId: string) => void
  onEditRoutine?: (routine: Routine) => void
  onDeleteRoutine?: (routineId: string) => void
  onPressRoutine?: (routine: Routine) => void
  listHeader?: React.ReactElement
  refreshing?: boolean
  onRefresh?: () => void
  onStartFromToday?: (routineId: string) => void
  disableActions?: boolean
}

export const RoutineList = memo(function RoutineList({
  routines,
  activeRoutineId,
  workoutTitleById,
  onActivate,
  onEditRoutine,
  onDeleteRoutine,
  onPressRoutine,
  onStartFromToday,
  listHeader,
  refreshing,
  onRefresh,
  disableActions,
}: RoutineListProps) {
  const insets = useSafeAreaInsets()
  const renderRoutine = ({ item: routine }: { item: Routine }) => {
    return (
      <RoutineCard
        routine={routine}
        workoutTitleById={workoutTitleById}
        isActive={routine.id === activeRoutineId}
        onActivate={onActivate}
        onEdit={onEditRoutine}
        onDelete={onDeleteRoutine}
        onPress={onPressRoutine}
        onStartFromToday={onStartFromToday}
        disabled={!!disableActions}
      />
    )
  }

  return (
    <View className="w-full max-w-3xl flex-1 self-center">
      <FlashList
        contentInsetAdjustmentBehavior="automatic"
        data={routines}
        renderItem={renderRoutine}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: 24 + insets.bottom,
          paddingHorizontal: 20,
        }}
        ListHeaderComponent={listHeader}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <View className="gap-field py-section">
            <UiText textRole="cardTitle">No routines yet</UiText>
            <UiText textRole="bodyMuted">
              Create a routine to arrange workouts and rest days.
            </UiText>
          </View>
        }
        ItemSeparatorComponent={() => <View className="h-field" />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
})
