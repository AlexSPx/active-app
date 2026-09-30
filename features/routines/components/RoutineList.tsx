import { FlashList } from '@shopify/flash-list'
import { memo } from 'react'
import { View, YStack, Text, getTokenValue } from 'tamagui'
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
    <View flex={1} width="100%" maxW="$content" self="center">
      <FlashList
        data={routines}
        renderItem={renderRoutine}
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
              No routines yet
            </Text>
            <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
              Create a routine to arrange workouts and rest days.
            </Text>
          </YStack>
        }
        ItemSeparatorComponent={() => <View height={getTokenValue('$field', 'space')} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
})
