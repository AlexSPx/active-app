import { FlashList } from '@shopify/flash-list'
import { memo } from 'react'
import { View, YStack, Text, Button } from 'tamagui'
import type { Routine } from '../../types/routine'
import { RoutineCard } from './RoutineCard'
import { EmptyState } from '../ui/EmptyState'
import { ClipboardList } from '@tamagui/lucide-icons'
export interface RoutineListProps {
  routines: Routine[]
  activeRoutineId?: string | null
  onActivate: (routineId: string) => void
  onEditRoutine?: (routine: Routine) => void
  onDeleteRoutine?: (routineId: string) => void
  listHeader?: React.ReactElement
  refreshing?: boolean
  onRefresh?: () => void
  onCreateRoutine?: () => void
  onStartFromToday?: (routineId: string) => void
  disableActions?: boolean
}

export const RoutineList = memo(function RoutineList({
  routines,
  activeRoutineId,
  onActivate,
  onEditRoutine,
  onDeleteRoutine,
  onStartFromToday,
  listHeader,
  refreshing,
  onRefresh,
  onCreateRoutine,
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
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={listHeader}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <EmptyState
            title="No routines yet"
            description="Create your first routine to get started with your training."
            icon={ClipboardList}
            actionLabel={onCreateRoutine ? 'Create Routine' : undefined}
            onAction={onCreateRoutine}
          />
        }
        ItemSeparatorComponent={() => <View height="$4" />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
})
