import { memo, useCallback, useMemo, useState } from 'react'
import { Card, YStack, XStack, Text, Button, Separator, Portal, Theme } from 'tamagui'
import { Popover } from '@tamagui/popover'
import { MoreHorizontal, Edit3, Trash2, CheckCircle2, Calendar, Dumbbell, Coffee, ListChecks } from '@tamagui/lucide-icons'
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

  const stats = useMemo(() => {
    const totalDays = routine.pattern.length
    const restDays = routine.pattern.filter((d) => d.dayType === 'REST').length
    const workoutDays = totalDays - restDays
    return { totalDays, restDays, workoutDays }
  }, [routine.pattern])

  const isWeeklyCompletion = routine.routineType === 'WEEKLY_COMPLETION'

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

  return (
    <Theme name={isActive ? 'blue' : undefined}>
      <Card
        key={routine.id}
        bg="$surface"
        borderColor={isActive ? '$blue8' : '$borderColor'}
        borderWidth={isActive ? 1.5 : 1}
        p="$4"
        rounded="$5"
        animation="quick"
        pressStyle={{ scale: 0.98, opacity: 0.9 }}
        onPress={onPress ? () => onPress(routine) : undefined}
      >
        <YStack gap="$3">
          {/* Header Section */}
          <XStack justify="space-between" items="flex-start">
            <YStack flex={1} gap="$1">
              <XStack items="center" gap="$2" flexWrap="wrap">
                <Text fontSize="$6" fontWeight="800" color="$color">
                  {routine.name}
                </Text>
                <XStack
                  bg={isWeeklyCompletion ? '$green3' : '$blue3'}
                  px="$2"
                  py="$1"
                  rounded="$2"
                  items="center"
                  gap="$1"
                >
                  {isWeeklyCompletion ? (
                    <ListChecks size={12} color="$green10" />
                  ) : (
                    <Calendar size={12} color="$blue10" />
                  )}
                  <Text
                    fontSize="$1"
                    fontWeight="600"
                    color={isWeeklyCompletion ? '$green10' : '$blue10'}
                    textTransform="uppercase"
                  >
                    {isWeeklyCompletion ? 'Weekly' : 'Sequential'}
                  </Text>
                </XStack>
              </XStack>
              {routine.description ? (
                <Text fontSize="$3" color="$colorSubtle" numberOfLines={2}>
                  {routine.description}
                </Text>
              ) : (
                <Text fontSize="$3" color="$colorMuted" fontStyle="italic">
                  No description provided
                </Text>
              )}
            </YStack>

            {(onEdit || onDelete || onActivate) && (
              <XStack ml="$2">
                {menuOpen && (
                  <Portal>
                    <Pressable
                      style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]}
                      onPress={() => setMenuOpen(false)}
                    />
                  </Portal>
                )}
                <Popover open={menuOpen} onOpenChange={(open) => {
                  if (open) haptics.light()
                  setMenuOpen(open)
                }} size="$2" placement="bottom-end">
                  <Popover.Trigger asChild>
                    <Button 
                      size="$3" 
                      circular 
                      icon={MoreHorizontal} 
                      disabled={disabled} 
                      chromeless
                      hoverStyle={{ bg: '$backgroundHover' }}
                    />
                  </Popover.Trigger>
                  <Popover.Content
                    p="$2"
                    bg="$surface"
                    borderColor="$borderColor"
                    borderWidth={1}
                    elevate
                    enterStyle={{ y: -10, opacity: 0 }}
                    exitStyle={{ y: -10, opacity: 0 }}
                    animation={[
                      'quick',
                      {
                        opacity: {
                          overshootClamping: true,
                        },
                      },
                    ]}
                  >
                    <YStack width={240} gap="$1">
                      {onEdit && (
                        <Popover.Close asChild>
                          <Button size="$3" chromeless onPress={handleEdit} disabled={disabled} justify="flex-start">
                            <XStack gap="$2" items="center">
                              <Edit3 size={16} color="$color" />
                              <Text color="$color" numberOfLines={1}>Edit Routine</Text>
                            </XStack>
                          </Button>
                        </Popover.Close>
                      )}
                      {onStartFromToday && (
                        <Popover.Close asChild>
                          <Button size="$3" chromeless onPress={() => onStartFromToday(routine.id)} disabled={disabled} justify="flex-start">
                            <XStack gap="$2" items="center">
                              <Calendar size={16} color="$color" />
                              <Text color="$color" numberOfLines={1}>Start from today</Text>
                            </XStack>
                          </Button>
                        </Popover.Close>
                      )}
                      {onActivate && !isActive && (
                        <Popover.Close asChild>
                          <Button size="$3" chromeless onPress={handleActivate} disabled={disabled} justify="flex-start">
                            <XStack gap="$2" items="center">
                              <CheckCircle2 size={16} color="$primary" />
                              <Text color="$color" numberOfLines={1}>Set as Active</Text>
                            </XStack>
                          </Button>
                        </Popover.Close>
                      )}
                      {onDelete && (
                        <>
                          <Separator my="$1" />
                          <Popover.Close asChild>
                            <Button size="$3" chromeless onPress={handleDelete} disabled={disabled} justify="flex-start" theme="red">
                              <XStack gap="$2" items="center">
                                <Trash2 size={16} color="$red10" />
                                <Text color="$red10" numberOfLines={1}>Delete Routine</Text>
                              </XStack>
                            </Button>
                          </Popover.Close>
                        </>
                      )}
                    </YStack>
                  </Popover.Content>
                </Popover>
              </XStack>
            )}
          </XStack>

          <Separator />

          {/* Stats Section */}
          <XStack justify="space-between" gap="$2">
            <YStack flex={1} bg="$backgroundStrong" p="$2" rounded="$3" items="center" gap="$1">
              <Calendar size={16} color="$blue10" />
              <Text fontSize="$4" fontWeight="700" color="$color">
                {stats.totalDays}
              </Text>
              <Text fontSize="$1" color="$colorSubtle" textTransform="uppercase" letterSpacing={1} numberOfLines={1}>
                Days
              </Text>
            </YStack>
            
            <YStack flex={1} bg="$backgroundStrong" p="$2" rounded="$3" items="center" gap="$1">
              <Dumbbell size={16} color="$green10" />
              <Text fontSize="$4" fontWeight="700" color="$color">
                {stats.workoutDays}
              </Text>
              <Text fontSize="$1" color="$colorSubtle" textTransform="uppercase" letterSpacing={1} numberOfLines={1}>
                Workouts
              </Text>
            </YStack>

            <YStack flex={1} bg="$backgroundStrong" p="$2" rounded="$3" items="center" gap="$1">
              <Coffee size={16} color="$secondary" />
              <Text fontSize="$4" fontWeight="700" color="$color">
                {stats.restDays}
              </Text>
              <Text fontSize="$1" color="$colorSubtle" textTransform="uppercase" letterSpacing={1} numberOfLines={1}>
                Rest
              </Text>
            </YStack>
          </XStack>

          {/* Action Footer */}
          {onActivate && !isActive && (
            <Button 
              size="$3" 
              bg="$primary"
              color="$onPrimary"
              disabled={disabled} 
              onPress={handleActivate}
              icon={<CheckCircle2 size={16} color="$onPrimary" />}
              mt="$1"
            >
              <Text fontSize="$3" fontWeight="600">Set as Active Routine</Text>
            </Button>
          )}
          
          {isActive && (
             <XStack bg="$backgroundAccent" p="$2" rounded="$3" items="center" justify="center" gap="$2" mt="$1">
                <CheckCircle2 size={14} color="$primary" />
                <Text color="$primary" fontWeight="700" fontSize="$3">Currently Active</Text>
             </XStack>
          )}
        </YStack>
      </Card>
    </Theme>
  )
})
