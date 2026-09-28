import { memo, useCallback, useMemo, useState } from 'react'
import { Card, YStack, XStack, Text, Button, Separator, Portal } from 'tamagui'
import { Popover } from '@tamagui/popover'
import { MoreHorizontal, Edit3, Trash2, CheckCircle2, Calendar } from '@tamagui/lucide-icons'
import type { Routine } from '../../../types/routine'
import { Pressable, StyleSheet } from 'react-native'
import { haptics } from '../../../utils/haptics'

export interface RoutineCardProps {
  routine: Routine
  isActive?: boolean
  onActivate?: (routineId: string) => void
  onEdit?: (routine: Routine) => void
  onDelete?: (routineId: string) => void
  onStartFromToday?: (routineId: string) => void
  onPress?: (routine: Routine) => void
  disabled?: boolean
}

export const RoutineCard = memo(function RoutineCard({
  routine,
  isActive = false,
  onActivate,
  onEdit,
  onDelete,
  onStartFromToday,
  onPress,
  disabled = false,
}: RoutineCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const summary = useMemo(() => {
    const totalDays = routine.pattern.length
    const restDays = routine.pattern.filter((d) => d.dayType === 'REST').length
    const workoutDays = totalDays - restDays
    const isWeeklyCompletion = routine.routineType === 'WEEKLY_COMPLETION'

    const visibleDays = routine.pattern.slice(0, 4).map((day, index) => ({
      key: `${routine.id}-${day.dayIndex}-${day.dayType}-${index}`,
      label: `Day ${day.dayIndex} · ${day.dayType === 'WORKOUT' ? 'Workout' : 'Rest'}`,
    }))
    const hiddenCount = Math.max(0, totalDays - visibleDays.length)

    return {
      restDays,
      workoutDays,
      typeLabel: isWeeklyCompletion ? 'Weekly' : 'Sequential',
      visibleDays,
      hiddenCount,
    }
  }, [routine.id, routine.pattern, routine.routineType])

  const handleActivate = useCallback(() => {
    if (disabled) return
    if (!isActive) {
      haptics.medium()
      onActivate?.(routine.id)
    }
  }, [disabled, isActive, onActivate, routine.id])

  const handleEdit = useCallback(() => {
    if (disabled) return
    onEdit?.(routine)
  }, [disabled, onEdit, routine])

  const handleDelete = useCallback(() => {
    if (disabled) return
    onDelete?.(routine.id)
  }, [disabled, onDelete, routine.id])

  const handleStartFromToday = useCallback(() => {
    if (disabled) return
    onStartFromToday?.(routine.id)
  }, [disabled, onStartFromToday, routine.id])

  return (
    <Card
      key={routine.id}
      bg="$surface"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius={20}
      p={0}
      overflow="hidden"
      pressStyle={{ scale: 0.99, opacity: 0.96 }}
      opacity={disabled ? 0.7 : 1}
      onPress={onPress && !disabled ? () => onPress(routine) : undefined}
    >
      <YStack>
        <YStack p={16} gap={12}>
          <XStack justify="space-between" items="flex-start" gap="$3">
            <YStack flex={1} gap="$1.5">
              <XStack items="center" gap="$2" flexWrap="wrap">
                <Text
                  fontSize={21}
                  lineHeight={25}
                  fontWeight="700"
                  color="$color"
                  style={{ flexShrink: 1 }}
                >
                  {routine.name}
                </Text>
                {isActive && (
                  <XStack
                    items="center"
                    gap="$1.5"
                    px="$2"
                    py="$1"
                    bg="$backgroundStrong"
                    borderColor="$borderColor"
                    borderWidth={1}
                    rounded="$10"
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel="Active routine"
                  >
                    <CheckCircle2 size={14} color="$green10" />
                    <Text fontSize={12} fontWeight="600" color="$color">
                      Active
                    </Text>
                  </XStack>
                )}
              </XStack>
              {routine.description ? (
                <Text fontSize={13} color="$colorSubtle" numberOfLines={2}>
                  {routine.description}
                </Text>
              ) : null}
            </YStack>

            {(onEdit || onDelete || onActivate || onStartFromToday) && (
              <>
                {menuOpen && (
                  <Portal>
                    <Pressable
                      style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]}
                      onPress={() => setMenuOpen(false)}
                    />
                  </Portal>
                )}
                <Popover
                  open={menuOpen}
                  onOpenChange={(open) => {
                    if (open) haptics.light()
                    setMenuOpen(open)
                  }}
                  size="$2"
                  placement="bottom-end"
                >
                  <Popover.Trigger asChild>
                    <Button
                      unstyled
                      width={48}
                      height={48}
                      accessibilityLabel={`More actions for ${routine.name}`}
                      bg="$backgroundStrong"
                      justify="center"
                      items="center"
                      pressStyle={{ opacity: 0.85 }}
                      style={{ borderRadius: 8 }}
                    >
                      <MoreHorizontal size={14} color="$colorMuted" />
                    </Button>
                  </Popover.Trigger>
                  <Popover.Content
                    p="$2"
                    bg="$surface"
                    borderColor="$borderColor"
                    borderWidth={1}
                    elevate
                  >
                    <YStack width={190} gap="$1">
                      {onEdit && (
                        <Popover.Close asChild>
                          <Button size="$3" chromeless onPress={handleEdit} disabled={disabled}>
                            <XStack items="center" gap="$2" justify="flex-start" width="100%">
                              <Edit3 size={14} color="$color" />
                              <Text color="$color">Edit</Text>
                            </XStack>
                          </Button>
                        </Popover.Close>
                      )}
                      {onStartFromToday && (
                        <Popover.Close asChild>
                          <Button
                            size="$3"
                            chromeless
                            onPress={handleStartFromToday}
                            disabled={disabled}
                          >
                            <XStack items="center" gap="$2" justify="flex-start" width="100%">
                              <Calendar size={14} color="$color" />
                              <Text color="$color">Start today</Text>
                            </XStack>
                          </Button>
                        </Popover.Close>
                      )}
                      {onActivate && !isActive && (
                        <Popover.Close asChild>
                          <Button size="$3" chromeless onPress={handleActivate} disabled={disabled}>
                            <XStack items="center" gap="$2" justify="flex-start" width="100%">
                              <CheckCircle2 size={14} color="$primary" />
                              <Text color="$color">Set active</Text>
                            </XStack>
                          </Button>
                        </Popover.Close>
                      )}
                      {onDelete && (
                        <>
                          <Separator my="$1" borderColor="$borderColor" />
                          <Popover.Close asChild>
                            <Button size="$3" chromeless onPress={handleDelete} disabled={disabled}>
                              <XStack items="center" gap="$2" justify="flex-start" width="100%">
                                <Trash2 size={14} color="$red10" />
                                <Text color="$red10">Delete</Text>
                              </XStack>
                            </Button>
                          </Popover.Close>
                        </>
                      )}
                    </YStack>
                  </Popover.Content>
                </Popover>
              </>
            )}
          </XStack>

          <Text fontSize={13} color="$colorSubtle">
            {summary.typeLabel} · {summary.workoutDays}{' '}
            {summary.workoutDays === 1 ? 'workout' : 'workouts'} · {summary.restDays}{' '}
            {summary.restDays === 1 ? 'rest day' : 'rest days'}
          </Text>

          <XStack flexWrap="wrap" gap={6}>
            {summary.visibleDays.map((day) => (
              <XStack
                key={day.key}
                py={5}
                px={11}
                bg="$backgroundStrong"
                borderColor="$borderColor"
                borderWidth={1}
                style={{ borderRadius: 8 }}
              >
                <Text fontSize={12} color="$colorSubtle">
                  {day.label}
                </Text>
              </XStack>
            ))}
            {summary.hiddenCount > 0 && (
              <XStack py={5} px={4}>
                <Text fontSize={12} color="$colorMuted">
                  +{summary.hiddenCount}
                </Text>
              </XStack>
            )}
          </XStack>

          {onActivate && !isActive && (
            <Button
              unstyled
              width="100%"
              py={14}
              justify="center"
              items="center"
              opacity={disabled ? 0.6 : 1}
              disabled={disabled}
              onPress={handleActivate}
              pressStyle={{ opacity: 0.88 }}
              style={{ borderRadius: 12 }}
              bg="$primary"
            >
              <XStack items="center" gap={8}>
                <CheckCircle2 size={18} color="$onPrimary" fill="$onPrimary" />
                <Text fontSize={14} fontWeight="600" color="$onPrimary">
                  Set active routine
                </Text>
              </XStack>
            </Button>
          )}
        </YStack>
      </YStack>
    </Card>
  )
})
