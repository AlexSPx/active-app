import { memo, useCallback, useMemo, useState } from 'react'
import { Card, YStack, XStack, Text, Button, Separator, Portal, ScrollView } from 'tamagui'
import { Popover } from '@tamagui/popover'
import {
  MoreHorizontal,
  Edit3,
  Trash2,
  CheckCircle2,
  Calendar,
  Dumbbell,
} from '@tamagui/lucide-icons'
import type { Routine } from '../../../types/routine'
import { Pressable, StyleSheet } from 'react-native'
import { haptics } from '../../../utils/haptics'

export interface RoutineCardProps {
  routine: Routine
  isActive?: boolean
  workoutTitleById?: Record<string, string>
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
  workoutTitleById,
  onActivate,
  onEdit,
  onDelete,
  onStartFromToday,
  onPress,
  disabled = false,
}: RoutineCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isFlexible = routine.routineType === 'WEEKLY_COMPLETION'
  const days = useMemo(
    () => [...routine.pattern].sort((a, b) => a.dayIndex - b.dayIndex),
    [routine.pattern]
  )
  const trainingDays = days.filter((day) => day.dayType === 'WORKOUT')
  const restDays = days.length - trainingDays.length

  const handleActivate = useCallback(() => {
    if (disabled || isActive) return
    haptics.medium()
    onActivate?.(routine.id)
  }, [disabled, isActive, onActivate, routine.id])

  return (
    <Card
      bg="$surface"
      borderColor={isActive ? '$borderAccent' : '$borderColor'}
      borderWidth={1}
      rounded="$card"
      p="$card"
      gap="$card"
      opacity={disabled ? 0.7 : 1}
    >
      <XStack justify="space-between" items="flex-start" gap="$3">
        <YStack
          flex={1}
          minH="$touch"
          gap="$1"
          onPress={onPress && !disabled ? () => onPress(routine) : undefined}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={onPress ? `View routine ${routine.name}` : undefined}
          accessibilityState={{ disabled }}
          pressStyle={onPress && !disabled ? { opacity: 0.75 } : undefined}
        >
          <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600" color="$color">
            {routine.name}
          </Text>
          <XStack items="center" gap="$2" flexWrap="wrap">
            <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
              {isFlexible ? 'Flexible week' : 'Repeating cycle'}
            </Text>
            {isActive && (
              <XStack
                items="center"
                gap="$1"
                bg="$backgroundAccent"
                px="$2"
                py="$1"
                rounded="$badge"
                accessible
                accessibilityLabel="Active routine"
              >
                <CheckCircle2 size="$iconSmall" color="$primary" aria-hidden />
                <Text fontSize="$caption" fontWeight="600" color="$primary">
                  Active
                </Text>
              </XStack>
            )}
          </XStack>
        </YStack>
        {(onEdit || onDelete || onStartFromToday || (onActivate && !isActive)) && (
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
                  width="$touch"
                  height="$touch"
                  disabled={disabled}
                  accessibilityLabel={`More actions for ${routine.name}`}
                  bg="$backgroundTransparent"
                  justify="center"
                  items="center"
                  rounded="$control"
                  pressStyle={{ opacity: 0.85 }}
                >
                  <MoreHorizontal size="$iconSmall" color="$colorSubtle" />
                </Button>
              </Popover.Trigger>
              <Popover.Content
                p="$2"
                bg="$surface"
                borderColor="$borderColor"
                borderWidth={1}
                rounded="$menu"
              >
                <YStack minW="$12" gap="$1">
                  {onEdit && (
                    <Popover.Close asChild>
                      <Button
                        minH="$touch"
                        chromeless
                        onPress={() => {
                          if (!disabled) onEdit(routine)
                        }}
                        disabled={disabled}
                      >
                        <XStack items="center" gap="$2" width="100%">
                          <Edit3 size="$iconSmall" color="$color" />
                          <Text color="$color" fontSize="$caption">
                            Edit
                          </Text>
                        </XStack>
                      </Button>
                    </Popover.Close>
                  )}
                  {onStartFromToday && (
                    <Popover.Close asChild>
                      <Button
                        minH="$touch"
                        chromeless
                        onPress={() => {
                          if (!disabled) onStartFromToday(routine.id)
                        }}
                        disabled={disabled}
                      >
                        <XStack items="center" gap="$2" width="100%">
                          <Calendar size="$iconSmall" color="$color" />
                          <Text color="$color" fontSize="$caption">
                            Start today
                          </Text>
                        </XStack>
                      </Button>
                    </Popover.Close>
                  )}
                  {onActivate && !isActive && (
                    <Popover.Close asChild>
                      <Button minH="$touch" chromeless onPress={handleActivate} disabled={disabled}>
                        <XStack items="center" gap="$2" width="100%">
                          <CheckCircle2 size="$iconSmall" color="$primary" />
                          <Text color="$color" fontSize="$caption">
                            Set active
                          </Text>
                        </XStack>
                      </Button>
                    </Popover.Close>
                  )}
                  {onDelete && (
                    <>
                      <Separator my="$1" borderColor="$borderColor" />
                      <Popover.Close asChild>
                        <Button
                          minH="$touch"
                          chromeless
                          onPress={() => {
                            if (!disabled) onDelete(routine.id)
                          }}
                          disabled={disabled}
                        >
                          <XStack items="center" gap="$2" width="100%">
                            <Trash2 size="$iconSmall" color="$destructive" />
                            <Text color="$destructive" fontSize="$caption">
                              Delete
                            </Text>
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
      {routine.description ? (
        <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle" numberOfLines={2}>
          {routine.description}
        </Text>
      ) : null}
      <XStack gap="$3" flexWrap="wrap">
        <Text fontSize="$caption" color="$colorSubtle">
          {trainingDays.length}{' '}
          {isFlexible
            ? trainingDays.length === 1
              ? 'workout'
              : 'workouts'
            : trainingDays.length === 1
              ? 'training day'
              : 'training days'}
        </Text>
        <Text fontSize="$caption" color="$colorSubtle">
          {isFlexible ? 'Any order' : `${restDays} ${restDays === 1 ? 'rest day' : 'rest days'}`}
        </Text>
      </XStack>
      {isFlexible ? (
        <YStack borderTopWidth={1} borderColor="$borderColor">
          {trainingDays.map((day, index) => (
            <XStack
              key={`${day.dayIndex}-${index}`}
              minH="$touch"
              py="$2"
              gap="$2"
              items="center"
              borderBottomWidth={1}
              borderColor="$borderColor"
              accessible
              accessibilityLabel={`Workout ${index + 1} · ${day.workoutId ? workoutTitleById?.[day.workoutId] || 'Training' : 'Training'}`}
            >
              <Text fontSize="$caption" color="$colorSubtle">
                {index + 1}
              </Text>
              <Text flex={1} fontSize="$caption" lineHeight="$caption" color="$color">
                {day.workoutId
                  ? workoutTitleById?.[day.workoutId] || 'Saved workout'
                  : 'Saved workout'}
              </Text>
              <Dumbbell size="$iconSmall" color="$colorSubtle" aria-hidden />
            </XStack>
          ))}
        </YStack>
      ) : (
        <YStack gap="$2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ grow: 1 }}
          >
            <XStack flex={1} gap="$compact">
              {days.map((day, index) => (
                <YStack
                  key={`${day.dayIndex}-${index}`}
                  flex={1}
                  minW="$2"
                  height="$day"
                  p="$compact"
                  gap="$2"
                  bg="$backgroundStrong"
                  rounded="$day"
                  items="center"
                  accessible
                  accessibilityLabel={`Day ${day.dayIndex} · ${day.dayType === 'WORKOUT' ? 'Training' : 'Rest'}`}
                >
                  <Text fontSize="$caption" color="$colorSubtle">
                    {day.dayIndex}
                  </Text>
                  <YStack
                    flex={1}
                    width="100%"
                    bg={day.dayType === 'WORKOUT' ? '$primary' : '$backgroundTransparent'}
                    rounded="$block"
                    items="center"
                    justify="center"
                  >
                    {day.dayType === 'WORKOUT' ? (
                      <Dumbbell size="$iconSmall" color="$onPrimary" aria-hidden />
                    ) : (
                      <Text fontSize="$body" color="$colorMuted">
                        —
                      </Text>
                    )}
                  </YStack>
                </YStack>
              ))}
            </XStack>
          </ScrollView>
          <XStack gap="$3" items="center">
            <XStack gap="$1" items="center">
              <YStack width="$0.5" height="$0.5" bg="$primary" rounded="$1" />
              <Text fontSize="$caption" color="$colorSubtle">
                Training
              </Text>
            </XStack>
            <Text fontSize="$caption" color="$colorSubtle">
              — Rest
            </Text>
          </XStack>
        </YStack>
      )}
      {onActivate && !isActive && (
        <Button
          width="100%"
          minH="$action"
          height="auto"
          py="$3"
          rounded="$button"
          bg="$primary"
          disabled={disabled}
          opacity={disabled ? 0.6 : 1}
          onPress={handleActivate}
          pressStyle={{ opacity: 0.85 }}
        >
          <CheckCircle2 size="$icon" color="$onPrimary" aria-hidden />
          <Text fontSize="$caption" fontWeight="600" color="$onPrimary" shrink={1}>
            Set active routine
          </Text>
        </Button>
      )}
    </Card>
  )
})
