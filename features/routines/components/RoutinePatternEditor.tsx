import { useCallback, useState } from 'react'
import { YStack, XStack, Text, Button, Separator } from 'tamagui'
import { Plus, Trash2, ChevronDown, Dumbbell, Moon, Calendar } from '@tamagui/lucide-icons'
import type { RoutinePatternItem, RoutineDayType } from '../../../types/routine'
import { router } from 'expo-router'
import { Popover } from '@tamagui/popover'
import { Pressable, StyleSheet } from 'react-native'
import { useWorkouts } from '../../workouts'
import type { ApiWorkout } from '../../../types/api'
import { FlashList } from '@shopify/flash-list'

export interface RoutinePatternEditorProps {
  pattern: RoutinePatternItem[]
  onChange: (pattern: RoutinePatternItem[]) => void
  hideRestOption?: boolean
}

export function RoutinePatternEditor({
  pattern,
  onChange,
  hideRestOption,
}: RoutinePatternEditorProps) {
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
        <XStack width="100%" justify="center" mb="$2">
          <DayRow
            index={index}
            item={item}
            onSetDayType={setDayType}
            onSetWorkout={setWorkout}
            onRemove={removeDay}
            workouts={workouts}
            workoutTitle={workoutTitle}
            hideRestOption={hideRestOption}
          />
        </XStack>
      )}
      ListFooterComponent={
        <XStack justify="center" width="100%">
          <Button mt="$2" width="100%" size="$4" icon={Plus} onPress={addDay}>
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
  hideRestOption,
}: {
  index: number
  item: RoutinePatternItem
  onSetDayType: (index: number, v: RoutineDayType) => void
  onSetWorkout: (index: number, id: string | null) => void
  onRemove: (index: number) => void
  workouts: ApiWorkout[]
  workoutTitle: (id: string | null) => string
  hideRestOption?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  const isWorkout = item.dayType === 'WORKOUT'
  const isRest = item.dayType === 'REST'

  return (
    <YStack
      bg="$surface"
      p="$3"
      rounded="$4"
      borderWidth={1}
      borderColor={isWorkout ? '$primary' : isRest ? '$secondary' : '$borderColor'}
      gap="$2"
      width="100%"
    >
      {/* Header */}
      <XStack justify="space-between" items="center">
        <XStack items="center" gap="$2">
          <Calendar size={18} color="$colorSubtle" />
          <Text fontSize="$5" fontWeight="600" color="$color">
            Day {index + 1}
          </Text>
        </XStack>
        <Button
          size="$4"
          width={48}
          height={48}
          chromeless
          icon={Trash2}
          accessibilityLabel={`Remove day ${index + 1}`}
          onPress={() => onRemove(index)}
          color="$red10"
          hoverStyle={{ bg: '$red2' }}
          pressStyle={{ bg: '$red3' }}
        />
      </XStack>

      {/* Day Type Selection */}
      {!hideRestOption && (
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
      )}

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
                    <YStack width="100%" items="center" gap="$2" px="$3" py="$2">
                      <Text color="$colorSubtle" text="center">
                        Create a workout template before assigning this day.
                      </Text>
                      <Popover.Close asChild>
                        <Button
                          size="$4"
                          bg="$primary"
                          onPress={() => router.push('/workouts/new?returnTo=routine')}
                        >
                          <Text color="$onPrimary" fontWeight="600">
                            Create workout
                          </Text>
                        </Button>
                      </Popover.Close>
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
