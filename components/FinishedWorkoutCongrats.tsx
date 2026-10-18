import React, { useEffect, useState } from 'react'
import { Vibration, Platform } from 'react-native'
import { Button, Text, XStack, YStack, Separator, ScrollView, Paragraph, H3, H4 } from 'tamagui'
import { CadenceOverlay } from './ui/CadenceOverlay'
import { Trophy, Timer as TimerIcon, Dumbbell, BarChart2 } from './ui/icons'
import { launchFacade } from '../features/launch/launchFacade'
import type { WorkoutRecord } from '../types/api'

export type FinishedWorkoutCongratsProps = {
  data: WorkoutRecord
  visible?: boolean
  onClose?: () => void
}

export function FinishedWorkoutCongrats({
  data,
  visible = true,
  onClose,
}: FinishedWorkoutCongratsProps) {
  // Start the sheet at the middle snap point (50%)
  const [position, setPosition] = useState(1)

  useEffect(() => {
    if (visible) {
      // Reset to 50% whenever opened
      setPosition(1)
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
    const totalSets = data.exerciseRecords.reduce(
      (acc, ex) => acc + Math.max(ex.reps.length, ex.durationSeconds?.length ?? 0),
      0
    )
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

  const snapPoints = [85, 50, 25]
  const achievements = launchFacade.training.getWorkoutAchievements(data)

  return (
    <>
      <CadenceOverlay
        title="Workout saved"
        open={visible}
        onOpenChange={(open) => {
          if (!open) onClose?.()
        }}
        snapPoints={snapPoints}
        position={position}
        onPositionChange={setPosition}
      >
        <YStack flex={1} justify="flex-start" items="stretch" gap="$3">
          <ScrollView flex={1} showsVerticalScrollIndicator>
            <YStack gap="$3" width="100%">
              <YStack gap="$2" width="100%">
                <Paragraph color="$color10" style={{ textAlign: 'center' }} fontSize="$3">
                  Your workout is saved on this device.
                </Paragraph>
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

              {achievements.length > 0 && (
                <YStack gap="$2" width="100%">
                  <Separator />
                  <H4>New Achievements</H4>
                  <YStack>
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
                  </YStack>
                </YStack>
              )}
            </YStack>
          </ScrollView>

          {/* Bottom action - always visible */}
          <Button onPress={onClose} size="$5" width="100%" bg="$primary" style={{ flexShrink: 0 }}>
            Continue
          </Button>
        </YStack>
      </CadenceOverlay>
    </>
  )
}

export default FinishedWorkoutCongrats
