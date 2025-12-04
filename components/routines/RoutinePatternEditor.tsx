import { useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Button, Separator } from 'tamagui'
import { Plus, Trash2, ChevronDown, Dumbbell, Moon, Calendar } from '@tamagui/lucide-icons'
import type { RoutinePatternItem, RoutineDayType } from '../../types/routine'
import { Popover } from '@tamagui/popover'
import { Pressable, StyleSheet } from 'react-native'
import { useState } from 'react'
import { useWorkouts } from '../../hooks/useWorkouts'
import type { ApiWorkout } from '../../types/api'
import { FlashList } from '@shopify/flash-list'

export interface RoutinePatternEditorProps {
  pattern: RoutinePatternItem[]
  onChange: (pattern: RoutinePatternItem[]) => void
}

export function RoutinePatternEditor({ pattern, onChange }: RoutinePatternEditorProps) {
  const { workouts } = useWorkouts()

  const setDayType = useCallback(
    (index: number, dayType: RoutineDayType) => {
      const next = pattern.map((p, i) =>
        i === index ? { ...p, dayType, workoutId: dayType === 'REST' ? null : p.workoutId } : p
      )
      onChange(reindex(next))
    },
    [onChange, pattern]
  )

  const setWorkout = useCallback(
    (index: number, workoutId: string | null) => {
      const next = pattern.map((p, i) => (i === index ? { ...p, workoutId } : p))
      onChange(reindex(next))
    },
    [onChange, pattern]
  )

  const addDay = useCallback(() => {
    const next: RoutinePatternItem[] = [
      ...pattern,
      { dayIndex: pattern.length + 1, dayType: 'WORKOUT', workoutId: null },
    ]
    onChange(reindex(next))
  }, [onChange, pattern])

  const removeDay = useCallback(
    (index: number) => {
      const next = pattern.filter((_, i) => i !== index)
      onChange(reindex(next))
    },
    [onChange, pattern]
  )

  const workoutTitle = useCallback(
    (id: string | null) => workouts.find((w) => w.id === id)?.title ?? 'Select workout',
    [workouts]
  )

  return (
    <FlashList
      data={pattern}
      keyExtractor={(_, index) => String(index)}
      style={{ width: '100%', alignSelf: 'stretch' }}
      contentContainerStyle={{ paddingBottom: 8 }}
      renderItem={({ item, index }) => (
        <XStack width="100%" justify="center" mb="$4">
          <DayRow
            index={index}
            item={item}
            onSetDayType={setDayType}
            onSetWorkout={setWorkout}
            onRemove={removeDay}
            workouts={workouts}
            workoutTitle={workoutTitle}
          />
        </XStack>
      )}
      ListFooterComponent={
        <XStack justify="center" width="100%">
          <Button mt="$2" width="90%" icon={Plus} onPress={addDay}>
            <Text>Add day</Text>
          </Button>
        </XStack>
      }
    />
  )
}

function reindex(items: RoutinePatternItem[]): RoutinePatternItem[] {
  return items.map((it, idx) => ({ ...it, dayIndex: idx + 1 }))
}

function DayRow({
  index,
  item,
  onSetDayType,
  onSetWorkout,
  onRemove,
  workouts,
  workoutTitle,
}: {
  index: number
  item: RoutinePatternItem
  onSetDayType: (index: number, v: RoutineDayType) => void
  onSetWorkout: (index: number, id: string | null) => void
  onRemove: (index: number) => void
  workouts: ApiWorkout[]
  workoutTitle: (id: string | null) => string
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  const isWorkout = item.dayType === 'WORKOUT'
  const isRest = item.dayType === 'REST'

  return (
    <YStack
      bg="$surface"
      p="$4"
      rounded="$5"
      borderWidth={1}
      borderColor={isWorkout ? '$primary' : isRest ? '$secondary' : '$borderColor'}
      gap="$3"
      width="100%"
    >
      {/* Header */}
      <XStack justify="space-between" items="center">
        <XStack items="center" gap="$2">
          <Calendar size={20} color="$colorSubtle" />
          <Text fontSize="$6" fontWeight="600" color="$color">
            Day {index + 1}
          </Text>
        </XStack>
        <Button
          size="$3"
          chromeless
          icon={Trash2}
          onPress={() => onRemove(index)}
          color="$red10"
          hoverStyle={{ bg: '$red2' }}
          pressStyle={{ bg: '$red3' }}
        />
      </XStack>

      <Separator borderColor="$borderColor" />

      {/* Day Type Selection */}
      <YStack gap="$2">
        <Text fontSize="$3" fontWeight="500" color="$colorSubtle" textTransform="uppercase">
          Type
        </Text>
        <XStack gap="$3" flex={1}>
          <Button
            flex={1}
            size="$4"
            icon={Dumbbell}
            bg={isWorkout ? '$primary' : '$backgroundHover'}
            borderWidth={isWorkout ? 0 : 1}
            borderColor="$borderColor"
            onPress={() => onSetDayType(index, 'WORKOUT')}
            pressStyle={{
              bg: isWorkout ? '$primaryPress' : '$surfacePress',
              scale: 0.97,
            }}
            hoverStyle={{
              bg: isWorkout ? '$primaryHover' : '$surfaceHover',
            }}
          >
            <Text
              color={isWorkout ? '$onPrimary' : '$color'}
              fontWeight={isWorkout ? '600' : '500'}
            >
              Workout
            </Text>
          </Button>
          <Button
            flex={1}
            size="$4"
            icon={Moon}
            bg={isRest ? '$secondary' : '$backgroundHover'}
            borderWidth={isRest ? 0 : 1}
            borderColor="$borderColor"
            onPress={() => onSetDayType(index, 'REST')}
            pressStyle={{
              bg: isRest ? '$secondaryPress' : '$surfacePress',
              scale: 0.97,
            }}
            hoverStyle={{
              bg: isRest ? '$secondaryHover' : '$surfaceHover',
            }}
          >
            <Text color={isRest ? '$onSecondary' : '$color'} fontWeight={isRest ? '600' : '500'}>
              Rest
            </Text>
          </Button>
        </XStack>
      </YStack>

      {/* Workout Selection */}
      {isWorkout && (
        <>
          {menuOpen && (
            <Pressable
              style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]}
              onPress={() => setMenuOpen(false)}
            />
          )}
          <YStack gap="$2">
            <Text fontSize="$3" fontWeight="500" color="$colorSubtle" textTransform="uppercase">
              Workout
            </Text>
            <Popover open={menuOpen} onOpenChange={setMenuOpen} size="$2" placement="bottom">
              <Popover.Trigger asChild>
                <Button
                  size="$4"
                  iconAfter={ChevronDown}
                  bg={item.workoutId ? '$backgroundAccent' : '$backgroundHover'}
                  borderWidth={1}
                  borderColor={item.workoutId ? '$borderAccent' : '$borderColor'}
                  hoverStyle={{
                    bg: item.workoutId ? '$backgroundAccentHover' : '$surfaceHover',
                  }}
                  pressStyle={{
                    scale: 0.98,
                  }}
                >
                  <Text
                    color={item.workoutId ? '$primary' : '$colorSubtle'}
                    fontWeight={item.workoutId ? '500' : '400'}
                  >
                    {workoutTitle(item.workoutId)}
                  </Text>
                </Button>
              </Popover.Trigger>
              <Popover.Content
                p="$2"
                bg="$surface"
                borderColor="$borderColor"
                borderWidth={1}
                elevate
                shadowRadius={8}
                shadowOpacity={0.2}
              >
                <YStack width={280} height={300} gap="$1">
                  {workouts.map((w) => (
                    <Popover.Close asChild key={w.id}>
                      <Button
                        size="$3"
                        chromeless
                        onPress={() => onSetWorkout(index, w.id)}
                        hoverStyle={{
                          bg: '$backgroundHover',
                        }}
                        pressStyle={{
                          bg: '$surfacePress',
                        }}
                      >
                        <XStack width="100%" justify="flex-start">
                          <Text fontSize="$4">{w.title}</Text>
                        </XStack>
                      </Button>
                    </Popover.Close>
                  ))}
                  {workouts.length === 0 && (
                    <YStack width="100%" items="center">
                      <Text color="$colorMuted" px="$3" py="$2">
                        No workouts available
                      </Text>
                    </YStack>
                  )}
                  {item.workoutId && workouts.length > 0 && (
                    <>
                      <Separator my="$1" borderColor="$borderColor" />
                      <Popover.Close asChild>
                        <Button
                          size="$3"
                          chromeless
                          onPress={() => onSetWorkout(index, null)}
                          hoverStyle={{
                            bg: '$red2',
                          }}
                        >
                          <XStack width="100%" justify="flex-start">
                            <Text color="$red10">Clear selection</Text>
                          </XStack>
                        </Button>
                      </Popover.Close>
                    </>
                  )}
                </YStack>
              </Popover.Content>
            </Popover>
          </YStack>
        </>
      )}
    </YStack>
  )
}
