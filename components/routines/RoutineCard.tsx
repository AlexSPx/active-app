import { memo, useCallback, useMemo, useState } from 'react'
import { Card, YStack, XStack, Text, Button, Separator, Portal } from 'tamagui'
import { Popover } from '@tamagui/popover'
import { MoreHorizontal, Edit3, Trash2, CheckCircle2 } from '@tamagui/lucide-icons'
import type { Routine } from '../../types/routine'
import { Pressable, StyleSheet } from 'react-native'
import { Badge } from '../ui/Badge'

export interface RoutineCardProps {
  routine: Routine
  isActive?: boolean
  onActivate?: (routineId: string) => void
  onEdit?: (routine: Routine) => void
  onDelete?: (routineId: string) => void
  disabled?: boolean
}

export const RoutineCard = memo(function RoutineCard({
  routine,
  isActive = false,
  onActivate,
  onEdit,
  onDelete,
  disabled = false,
}: RoutineCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const stats = useMemo(() => {
    const totalDays = routine.pattern.length
    const restDays = routine.pattern.filter((d) => d.dayType === 'REST').length
    const workoutDays = totalDays - restDays
    return { totalDays, restDays, workoutDays }
  }, [routine.pattern])

  const handleActivate = useCallback(() => {
    if (disabled) return
    if (!isActive) onActivate?.(routine.id)
  }, [disabled, isActive, onActivate, routine.id])

  const handleEdit = useCallback(() => {
    if (disabled) return
    onEdit?.(routine)
  }, [disabled, onEdit, routine])

  const handleDelete = useCallback(() => {
    if (disabled) return
    onDelete?.(routine.id)
  }, [disabled, onDelete, routine.id])

  return (
    <Card
      key={routine.id}
      bg="$surface"
      borderColor="$borderColor"
      borderWidth="$0.5"
      p="$4"
      rounded="$6"
      elevate
      pressStyle={{ scale: 0.98, opacity: 0.9 }}
    >
      <YStack gap="$3">
        <XStack justify="space-between" items="center">
          <XStack items="center" gap="$2">
            <Text fontSize="$6" fontWeight="700" color="$color">
              {routine.name}
            </Text>
            {isActive && <Badge variant="success">Active</Badge>}
          </XStack>

          {(onEdit || onDelete || onActivate) && (
            <>
              {menuOpen && (
                <Portal>
                  <Pressable
                    style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]}
                    onPress={() => setMenuOpen(false)}
                  />
                </Portal>
              )}
              <Popover open={menuOpen} onOpenChange={setMenuOpen} size="$2" placement="bottom-end">
                <Popover.Trigger asChild>
                  <Button size="$3" circular icon={MoreHorizontal} disabled={disabled} />
                </Popover.Trigger>
                <Popover.Content
                  p="$2"
                  bg="$surface"
                  borderColor="$borderColor"
                  borderWidth="$0.5"
                  elevate
                >
                  <YStack width={170} gap="$1">
                    {onEdit && (
                      <Popover.Close asChild>
                        <Button size="$3" chromeless onPress={handleEdit} disabled={disabled}>
                          <XStack items="center" gap="$2">
                            <Edit3 size={14} />
                            <Text>Edit</Text>
                          </XStack>
                        </Button>
                      </Popover.Close>
                    )}
                    {onActivate && !isActive && (
                      <Popover.Close asChild>
                        <Button size="$3" chromeless onPress={handleActivate} disabled={disabled}>
                          <XStack items="center" gap="$2">
                            <CheckCircle2 size={14} />
                            <Text>Set Active</Text>
                          </XStack>
                        </Button>
                      </Popover.Close>
                    )}
                    {onDelete && (
                      <Popover.Close asChild>
                        <Button size="$3" chromeless onPress={handleDelete} disabled={disabled}>
                          <XStack items="center" gap="$2">
                            <Trash2 size={14} color="red" />
                            <Text color="$red10">Delete</Text>
                          </XStack>
                        </Button>
                      </Popover.Close>
                    )}
                  </YStack>
                </Popover.Content>
              </Popover>
            </>
          )}
        </XStack>

        {routine.description ? (
          <Text fontSize="$3" color="$colorSubtle" numberOfLines={2}>
            {routine.description}
          </Text>
        ) : (
          <Text fontSize="$3" color="$color10" fontStyle="italic">
            No description
          </Text>
        )}

        <XStack gap="$6" items="center">
          <Text fontSize="$3" color="$colorSubtle">
            {stats.totalDays} day pattern
          </Text>
          <Text fontSize="$3" color="$colorSubtle">
            {stats.workoutDays} workouts
          </Text>
          <Text fontSize="$3" color="$colorSubtle">
            {stats.restDays} rest
          </Text>
        </XStack>

        <Separator my="$2" />

        {onActivate && (
          <XStack justify="flex-end">
            <Button size="$3" disabled={isActive || disabled} onPress={handleActivate}>
              {isActive ? 'Active' : 'Set Active'}
            </Button>
          </XStack>
        )}
      </YStack>
    </Card>
  )
})
