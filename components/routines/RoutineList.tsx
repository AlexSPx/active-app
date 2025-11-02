import { FlashList } from '@shopify/flash-list'
import { memo } from 'react'
import { View, YStack, Text, Button } from 'tamagui'
import type { Routine } from '../../types/routine'
import { RoutineCard } from './RoutineCard'

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
  disableActions?: boolean
}

export const RoutineList = memo(function RoutineList({
  routines,
  activeRoutineId,
  onActivate,
  onEditRoutine,
  onDeleteRoutine,
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
          <YStack items="center" justify="center" py="$8">
            <Text fontSize="$6" color="$color11">
              No routines yet
            </Text>
            <Text fontSize="$4" color="$color10" mt="$2">
              Create your first routine to get started
            </Text>
            {onCreateRoutine && (
              <Button mt="$4" onPress={onCreateRoutine}>
                Create Routine
              </Button>
            )}
          </YStack>
        }
        ItemSeparatorComponent={() => <View height="$4" />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
})
