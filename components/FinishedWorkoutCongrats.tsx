import React, { useEffect, useState } from 'react'
import { Vibration, Platform } from 'react-native'
import {
  Button,
  Text,
  XStack,
  YStack,
  Separator,
  Sheet,
  ScrollView,
  Paragraph,
  H3,
  H4,
} from 'tamagui'
import { Trophy, Timer as TimerIcon, Dumbbell, BarChart2 } from '@tamagui/lucide-icons'
import type { WorkoutRecord, StreakUpdateResponse } from '../types/api'
import { StreakView } from './StreakView'

export type FinishedWorkoutCongratsProps = {
  data: WorkoutRecord
  visible?: boolean
  onClose?: () => void
  streak?: StreakUpdateResponse
  userName?: string
}

export function FinishedWorkoutCongrats({
  data,
  visible = true,
  onClose,
  streak,
  userName = 'You',
}: FinishedWorkoutCongratsProps) {
  const [position, setPosition] = useState(0)

  useEffect(() => {
    if (visible) {
      if (Platform.OS === 'android') {
        const pattern = [0, 550]
        Vibration.vibrate(pattern, false)
      } else {
        Vibration.vibrate()
      }
    }
  }, [visible])

  if (!visible) return null

  const formatDuration = (secs?: number) => {
    const s = Math.max(0, Math.floor(secs || 0))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    return `${m}:${String(ss).padStart(2, '0')}`
  }

  // Derive from WorkoutRecord
  const derived = (() => {
    const totalSets = data.exerciseRecords.reduce((acc, ex) => acc + ex.reps.length, 0)
    const totalVolume = data.exerciseRecords.reduce((acc, ex) => {
      return acc + ex.reps.reduce((s, r, i) => s + r * (ex.weight[i] || 0), 0)
    }, 0)
    let durationSeconds = 0
    try {
      if (data.startTime) {
        const start = new Date(data.startTime.endsWith('Z') ? data.startTime : `${data.startTime}Z`)
        const created = new Date(
          data.createdAt.endsWith('Z') ? data.createdAt : `${data.createdAt}Z`
        )
        durationSeconds = Math.max(0, Math.floor((created.getTime() - start.getTime()) / 1000))
      }
    } catch {}
    return {
      workoutName: data.workoutTitle,
      durationSeconds,
      totalSets,
      totalVolume,
    }
  })()

  const pr1rm = (() => {
    let best = { value: 0, setIndex: null as number | null, name: '' }
    for (const ex of data.exerciseRecords) {
      const v = ex.achievedOneRmValue || 0
      if (v > best.value) {
        best = {
          value: v,
          setIndex: typeof ex.achievedOneRmSetIndex === 'number' ? ex.achievedOneRmSetIndex : null,
          name: ex.exerciseName,
        }
      }
    }
    return best.value > 0 ? best : null
  })()

  const prVol = (() => {
    let best = { value: 0, name: '' }
    for (const ex of data.exerciseRecords) {
      const v = ex.achievedTotalVolumeValue || 0
      if (v > best.value) {
        best = { value: v, name: ex.exerciseName }
      }
    }
    return best.value > 0 ? best : null
  })()

  const snapPoints = [85, 50, 25]

  // Collect all achievements so we can render them in a scrollable list
  const achievements = data.exerciseRecords.flatMap((ex) => {
    const items: Array<{
      type: '1RM' | 'VOLUME'
      value: number
      exercise: string
      setIndex?: number | null
    }> = []
    if (typeof ex.achievedOneRmValue === 'number' && ex.achievedOneRmValue > 0) {
      items.push({
        type: '1RM',
        value: ex.achievedOneRmValue,
        exercise: ex.exerciseName,
        setIndex: ex.achievedOneRmSetIndex ?? null,
      })
    }
    if (typeof ex.achievedTotalVolumeValue === 'number' && ex.achievedTotalVolumeValue > 0) {
      items.push({ type: 'VOLUME', value: ex.achievedTotalVolumeValue, exercise: ex.exerciseName })
    }
    return items
  })

  return (
    <>
      <Sheet
        forceRemoveScrollEnabled={position === 0}
        modal
        open={visible}
        onOpenChange={(open) => {
          if (!open) onClose?.()
        }}
        snapPoints={snapPoints}
        snapPointsMode="percent"
        dismissOnSnapToBottom
        position={position}
        onPositionChange={setPosition}
        zIndex={100_000}
        animation="medium"
      >
        <Sheet.Overlay
          bg="$blue9"
          animation="lazy"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Sheet.Handle />
        <Sheet.Frame flex={1} p="$4" justify="flex-start" items="stretch" gap="$3" bg="$background">
          <YStack gap="$3" width="100%">
            <YStack gap="$2" width="100%">
              <H3 style={{ textAlign: 'center' }}>Keep Your Streak Going!</H3>
              <Paragraph color="$color10" style={{ textAlign: 'center' }} fontSize="$3">
                {userName}, you've been doing an amazing job!
              </Paragraph>
              {streak && <StreakView streak={streak} />}
            </YStack>

            <YStack gap="$2" width="100%">
              <H4>{derived.workoutName}</H4>
              {/* Compact stat cards */}
              <XStack width="100%" gap="$2">
                <YStack
                  flex={1}
                  bg="$background"
                  borderWidth={1}
                  borderColor="$borderColor"
                  rounded="$4"
                  p="$2"
                  items="center"
                  gap="$1"
                >
                  <XStack items="center" gap="$1">
                    <TimerIcon size={14} color="$color10" />
                    <Text fontWeight="700" color="$color" fontSize="$3">
                      {formatDuration(derived.durationSeconds)}
                    </Text>
                  </XStack>
                  <Text color="$color10" fontSize="$1">
                    Duration
                  </Text>
                </YStack>

                <YStack
                  flex={1}
                  bg="$background"
                  borderWidth={1}
                  borderColor="$borderColor"
                  rounded="$4"
                  p="$2"
                  items="center"
                  gap="$1"
                >
                  <XStack items="center" gap="$1">
                    <Dumbbell size={14} color="$color10" />
                    <Text fontWeight="700" color="$color" fontSize="$3">
                      {(derived.totalVolume ?? 0).toLocaleString()} kg
                    </Text>
                  </XStack>
                  <Text color="$color10" fontSize="$1">
                    Volume
                  </Text>
                </YStack>

                <YStack
                  flex={1}
                  bg="$background"
                  borderWidth={1}
                  borderColor="$borderColor"
                  rounded="$4"
                  p="$2"
                  items="center"
                  gap="$1"
                >
                  <XStack items="center" gap="$1">
                    <Text fontWeight="700" color="$color" fontSize="$3">
                      {derived.totalSets ?? 0}
                    </Text>
                  </XStack>
                  <Text color="$color10" fontSize="$1">
                    Sets
                  </Text>
                </YStack>
              </XStack>
            </YStack>

            {/* Achievements - only this scrolls */}
            {achievements.length > 0 && (
              <YStack height="$18" gap="$2" width="100%">
                <Separator />
                <H4>New Achievements</H4>
                <ScrollView showsVerticalScrollIndicator>
                  <YStack gap="$2">
                    {achievements.map((a, idx) => (
                      <XStack
                        key={`${a.type}-${a.exercise}-${idx}`}
                        bg="$background"
                        borderWidth={1}
                        borderColor="$borderColor"
                        rounded="$4"
                        px="$3"
                        py="$2"
                        items="center"
                        gap="$3"
                      >
                        {a.type === '1RM' ? (
                          <Trophy size={18} color="$primary" />
                        ) : (
                          <BarChart2 size={18} color="$secondary" />
                        )}
                        <YStack gap="$1" flex={1}>
                          <Text color="$color" fontSize="$3" fontWeight="700">
                            {a.type === '1RM'
                              ? `${a.value.toLocaleString()} kg 1RM` +
                                (typeof a.setIndex === 'number' ? ` (set ${a.setIndex + 1})` : '')
                              : `${a.value.toLocaleString()} kg volume`}
                          </Text>
                          <Text color="$color10" fontSize="$2">
                            {a.exercise}
                          </Text>
                        </YStack>
                      </XStack>
                    ))}
                  </YStack>
                </ScrollView>
              </YStack>
            )}
          </YStack>

          {/* Bottom action - always visible */}
          <Button onPress={onClose} size="$5" width="100%" bg="$primary">
            Continue
          </Button>
        </Sheet.Frame>
      </Sheet>
    </>
  )
}

export default FinishedWorkoutCongrats
