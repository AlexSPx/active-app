import { useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  MoreHorizontal,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
} from '@tamagui/lucide-icons'
import { YStack, XStack, Text, Button, ScrollView, Sheet, Dialog, getTokenValue } from 'tamagui'
import type { RoutinePatternItem } from '../../../types/routine'
import { useWorkouts } from '../../workouts'
import { RoutineEditorSheet } from './RoutineEditorSheet'
import { applyWorkoutSelection, reindexPattern, workoutMetadata } from '../routineDraft'
import { syncEngine } from '../../../lib/sync'

export interface RoutinePatternEditorProps {
  pattern: RoutinePatternItem[]
  onChange: (pattern: RoutinePatternItem[]) => void
  hideRestOption?: boolean
  routineName?: string
}

export function RoutinePatternEditor({
  pattern: rawPattern,
  onChange,
  hideRestOption,
  routineName,
}: RoutinePatternEditorProps) {
  const { workouts, loading, error } = useWorkouts()
  const insets = useSafeAreaInsets()
  const pattern = rawPattern.map((day) => ({
    ...day,
    workoutId: day.workoutId ? syncEngine.resolveId('workouts', day.workoutId) : null,
  }))
  const [selectedDay, setSelectedDay] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [menu, setMenu] = useState<number | null>(null)
  const index = Math.min(selectedDay, Math.max(0, pattern.length - 1))
  const day = pattern[index]
  const workout = workouts.find((item) => item.id === day?.workoutId)
  const training = pattern.filter((item) => item.dayType === 'WORKOUT').length
  const update = (next: RoutinePatternItem[]) => onChange(reindexPattern(next))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= pattern.length) return
    const next = [...pattern]
    ;[next[from], next[to]] = [next[to], next[from]]
    update(next)
    setSelectedDay(to)
    setMenu(null)
  }
  const remove = (from: number) => {
    update(pattern.filter((_, itemIndex) => itemIndex !== from))
    setSelectedDay(Math.max(0, Math.min(from, pattern.length - 2)))
    setMenu(null)
  }
  const more = (itemIndex: number, label: string) => (
    <Button
      chromeless
      width="$touch"
      height="$touch"
      color="$colorSubtle"
      accessibilityLabel={`More actions for ${label}`}
      accessibilityState={{ expanded: menu === itemIndex }}
      onPress={() => {
        Keyboard.dismiss()
        setMenu(itemIndex)
      }}
    >
      <MoreHorizontal size="$icon" color="$colorSubtle" aria-hidden />
    </Button>
  )

  // Selected day/workout actions - shared between Sheet (native) and Dialog (web).
  const menuContent =
    menu !== null && pattern[menu] ? (
      <YStack gap="$field">
        <Text fontSize="$header" lineHeight="$header" fontWeight="600">
          {hideRestOption ? `Workout ${menu + 1}` : `Day ${menu + 1}`} actions
        </Text>
        <Text fontSize="$body" lineHeight="$body" color="$colorSubtle" numberOfLines={2}>
          {pattern[menu].dayType === 'REST'
            ? 'Rest'
            : (workouts.find((item) => item.id === pattern[menu].workoutId)?.title ??
              'Choose a saved workout')}
        </Text>
        <Button
          chromeless
          minH="$touch"
          justify="flex-start"
          disabled={menu === 0}
          opacity={menu === 0 ? 0.4 : 1}
          onPress={() => move(menu, menu - 1)}
        >
          <ArrowUp size="$icon" aria-hidden />
          {`Move ${hideRestOption ? 'up' : 'earlier'}`}
        </Button>
        <Button
          chromeless
          minH="$touch"
          justify="flex-start"
          disabled={menu === pattern.length - 1}
          opacity={menu === pattern.length - 1 ? 0.4 : 1}
          onPress={() => move(menu, menu + 1)}
        >
          <ArrowDown size="$icon" aria-hidden />
          {`Move ${hideRestOption ? 'down' : 'later'}`}
        </Button>
        <Button
          chromeless
          minH="$touch"
          justify="flex-start"
          color="$destructive"
          onPress={() => remove(menu)}
        >
          <Trash2 size="$icon" color="$destructive" aria-hidden />
          {`Remove ${hideRestOption ? 'workout' : 'day'}`}
        </Button>
        <Button
          minH="$action"
          rounded="$button"
          bg="$backgroundHover"
          onPress={() => setMenu(null)}
        >
          Cancel
        </Button>
      </YStack>
    ) : null

  return (
    <YStack gap="$field">
      {error && (
        <Text color="$destructive" fontSize="$caption">
          {error}
        </Text>
      )}
      {hideRestOption ? (
        <>
          <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            {pattern.length} {pattern.length === 1 ? 'session' : 'sessions'} · Any order ·
            Monday–Sunday
          </Text>
          {!pattern.length && (
            <YStack gap="$compact">
              <Text fontSize="$header" fontWeight="600">
                No workouts yet
              </Text>
              <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
                Choose the sessions you want to complete each week.
              </Text>
            </YStack>
          )}
          {pattern.map((item, itemIndex) => {
            const assigned = workouts.find((candidate) => candidate.id === item.workoutId)
            return (
              <YStack key={itemIndex} borderBottomWidth={1} borderColor="$borderColor" pb="$field">
                <XStack items="center" gap="$field">
                  <Text color="$colorSubtle" fontSize="$caption">
                    {itemIndex + 1}
                  </Text>
                  <YStack flex={1} gap="$compact">
                    <Text fontSize="$exerciseTitle" lineHeight="$exerciseTitle" fontWeight="600">
                      {assigned?.title ?? 'Choose a saved workout'}
                    </Text>
                    <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                      {assigned ? workoutMetadata(assigned) : 'Workout unavailable'}
                    </Text>
                  </YStack>
                  {more(itemIndex, assigned?.title ?? `session ${itemIndex + 1}`)}
                </XStack>
              </YStack>
            )
          })}
          <Button
            minH="$action"
            rounded="$button"
            bg="$backgroundHover"
            color="$primary"
            onPress={() => setPickerOpen(true)}
          >
            + Add workouts
          </Button>
        </>
      ) : pattern.length ? (
        <>
          <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            {pattern.length === 1 ? 'Repeats every day' : `Repeats every ${pattern.length} days`} ·{' '}
            {training} training · {pattern.length - training} rest
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }}>
            <XStack gap="$compact">
              {pattern.map((item, itemIndex) => (
                <Button
                  key={itemIndex}
                  width="$touch"
                  height="$day"
                  rounded="$day"
                  p="$compact"
                  bg={index === itemIndex ? '$backgroundAccent' : '$backgroundHover'}
                  borderWidth={1}
                  borderColor={index === itemIndex ? '$primary' : '$backgroundTransparent'}
                  accessibilityLabel={`Day ${itemIndex + 1}: ${item.dayType === 'REST' ? 'Rest' : (workouts.find((candidate) => candidate.id === item.workoutId)?.title ?? 'Choose workout')}`}
                  accessibilityState={{ selected: index === itemIndex }}
                  onPress={() => {
                    setSelectedDay(itemIndex)
                    setMenu(null)
                  }}
                >
                  <YStack height="100%" width="100%" gap="$compact">
                    <Text fontSize="$caption" color="$colorSubtle" text="center">
                      {itemIndex + 1}
                    </Text>
                    <YStack
                      flex={1}
                      rounded="$block"
                      justify="center"
                      items="center"
                      bg={
                        item.dayType === 'REST'
                          ? '$backgroundTransparent'
                          : item.workoutId
                            ? '$primary'
                            : '$surface'
                      }
                    >
                      <Text
                        color={
                          item.dayType === 'REST'
                            ? '$colorMuted'
                            : item.workoutId
                              ? '$onPrimary'
                              : '$primary'
                        }
                        fontSize="$body"
                        fontWeight="600"
                      >
                        {item.dayType === 'REST' ? '—' : item.workoutId ? 'T' : '+'}
                      </Text>
                    </YStack>
                  </YStack>
                </Button>
              ))}
            </XStack>
          </ScrollView>
          <Text fontSize="$caption" color="$colorSubtle">
            T · Training — · Rest
          </Text>
          <YStack
            bg="$surface"
            rounded="$menu"
            p="$field"
            gap="$field"
            borderWidth={1}
            borderColor="$borderColor"
          >
            <XStack items="center" justify="space-between">
              <Text fontSize="$header" fontWeight="600">
                Day {index + 1}
              </Text>
              {more(index, `day ${index + 1}`)}
            </XStack>
            <XStack bg="$backgroundHover" rounded="$menu" p="$compact" gap="$compact">
              {(['WORKOUT', 'REST'] as const).map((type) => (
                <Button
                  key={type}
                  flex={1}
                  minH="$touch"
                  rounded="$control"
                  bg={day.dayType === type ? '$surface' : '$backgroundTransparent'}
                  color={day.dayType === type ? '$primary' : '$colorSubtle'}
                  accessibilityState={{ selected: day.dayType === type }}
                  onPress={() =>
                    update(
                      pattern.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, dayType: type } : item
                      )
                    )
                  }
                >
                  {type === 'WORKOUT' ? 'Training' : 'Rest'}
                </Button>
              ))}
            </XStack>
            {day.dayType === 'REST' ? (
              <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
                Rest day. No workout scheduled.
              </Text>
            ) : (
              <Button
                height="auto"
                minH="$action"
                chromeless
                px="$0"
                accessibilityLabel={`${workout ? `Change ${workout.title}` : 'Choose a saved workout'} for day ${index + 1}`}
                onPress={() => setPickerOpen(true)}
              >
                <XStack width="100%" items="center" gap="$field">
                  <YStack flex={1} gap="$compact">
                    <Text fontSize="$exerciseTitle" lineHeight="$exerciseTitle" fontWeight="600">
                      {workout?.title ?? 'Choose a workout'}
                    </Text>
                    <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                      {workout ? workoutMetadata(workout) : 'From your saved workouts'}
                    </Text>
                  </YStack>
                  <ChevronRight size="$icon" color="$primary" aria-hidden />
                </XStack>
              </Button>
            )}
          </YStack>
          <Button
            minH="$action"
            rounded="$button"
            bg="$backgroundHover"
            color="$primary"
            onPress={() => {
              update([
                ...pattern,
                { dayIndex: pattern.length + 1, dayType: 'WORKOUT', workoutId: null },
              ])
              setSelectedDay(pattern.length)
              setMenu(null)
            }}
          >
            <Plus size="$icon" color="$primary" aria-hidden />
            Add day
          </Button>
        </>
      ) : (
        <YStack gap="$field">
          <Text fontSize="$header" fontWeight="600">
            No days yet
          </Text>
          <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
            Add training and rest days in the order you want them to repeat.
          </Text>
          <Button
            minH="$action"
            rounded="$button"
            bg="$backgroundHover"
            color="$primary"
            onPress={() => {
              update([{ dayIndex: 1, dayType: 'WORKOUT', workoutId: null }])
              setSelectedDay(0)
            }}
          >
            + Add first day
          </Button>
        </YStack>
      )}
      {/* Use Dialog on web (Sheet does not trap focus or handle Escape there), Sheet on native */}
      {menuContent &&
        (Platform.OS === 'web' ? (
          <Dialog
            modal
            open
            onOpenChange={(open) => {
              if (!open) setMenu(null)
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay
                key="overlay"
                animation="slow"
                opacity={0.5}
                enterStyle={{ opacity: 0 }}
                exitStyle={{ opacity: 0 }}
              />
              <Dialog.Content
                bordered
                rounded="$menu"
                key="content"
                animation={['quick', { opacity: { overshootClamping: true } }]}
                enterStyle={{ opacity: 0 }}
                exitStyle={{ opacity: 0 }}
                bg="$surface"
                p="$page"
              >
                {menuContent}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>
        ) : (
          <Sheet
            open
            onOpenChange={(open) => {
              if (!open) setMenu(null)
            }}
            modal
            snapPointsMode="fit"
            dismissOnSnapToBottom
          >
            <Sheet.Overlay bg="$background" opacity={0.6} />
            <Sheet.Handle bg="$colorMuted" />
            <Sheet.Frame bg="$surface" borderTopLeftRadius="$sheet" borderTopRightRadius="$sheet">
              <YStack p="$page" pb={Math.max(insets.bottom, getTokenValue('$page', 'space'))}>
                {menuContent}
              </YStack>
            </Sheet.Frame>
          </Sheet>
        ))}
      <RoutineEditorSheet
        open={pickerOpen && !loading}
        onOpenChange={setPickerOpen}
        workouts={workouts}
        single={!hideRestOption}
        selected={
          hideRestOption
            ? pattern.flatMap((item) => (item.workoutId ? [item.workoutId] : []))
            : day?.workoutId
              ? [day.workoutId]
              : []
        }
        context={`${routineName?.trim() || 'your new routine'} · ${hideRestOption ? 'Any order' : `Day ${index + 1}`}`}
        onApply={(selection) => {
          if (hideRestOption) update(applyWorkoutSelection(pattern, selection))
          else
            update(
              pattern.map((item, itemIndex) =>
                itemIndex === index
                  ? { ...item, dayType: 'WORKOUT', workoutId: selection[0] ?? null }
                  : item
              )
            )
        }}
      />
    </YStack>
  )
}
