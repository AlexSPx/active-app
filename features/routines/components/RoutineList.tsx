import { FlashList } from '@shopify/flash-list'
import { memo } from 'react'
import { View } from 'tamagui'
import type { Routine } from '../../../types/routine'
import { RoutineCard } from './RoutineCard'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ClipboardList } from '@tamagui/lucide-icons'
export interface RoutineListProps {
  routines: Routine[]
  activeRoutineId?: string | null
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
  const renderRoutine = ({ item: routine }: { item: Routine }) => {
    return (
      <RoutineCard
        routine={routine}
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
    <View flex={1}>
      <FlashList
        data={routines}
        renderItem={renderRoutine}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 20 }}
        ListHeaderComponent={listHeader}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <EmptyState
            title="No routines yet"
            description="Create your first routine to get started with your training."
            icon={ClipboardList}
          />
        }
        ItemSeparatorComponent={() => <View height={12} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
})
