import React, { useEffect } from 'react'
import { Vibration, Platform } from 'react-native'
import { Portal } from '@tamagui/portal'
import { YStack, XStack, Text, View, Separator, Button } from 'tamagui'
import { Trophy, Timer as TimerIcon, Dumbbell, BarChart2 } from '@tamagui/lucide-icons'
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
  if (!visible) return null

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = []
    if (visible) {
      if (Platform.OS === 'android') {
        const pattern = [0, 550]
        Vibration.vibrate(pattern, false)
      } else {
        Vibration.vibrate()
      }
    }
    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
  }, [visible])

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
    // durationSeconds: difference between createdAt and startTime if provided
    let durationSeconds = 0
    try {
      if (data.startTime) {
        const [dPart, tPart] = data.startTime.split('T')
        const [y, m, d] = dPart.split('-').map((v) => parseInt(v, 10))
        const [hhRaw, mmRaw, ssMsRaw] = tPart.split(':')
        const hh = parseInt(hhRaw, 10) || 0
        const mm = parseInt(mmRaw, 10) || 0
        const [ssRaw, msRaw] = (ssMsRaw || '0').split('.')
        const ss = parseInt(ssRaw, 10) || 0
        const ms = parseInt(msRaw || '0', 10) || 0
        const start = new Date(y, (m || 1) - 1, d || 1, hh, mm, ss, ms)
        const hasTz = /Z$/i.test(data.createdAt) || /[+-]\d{2}:?\d{2}$/.test(data.createdAt)
        const createdUtc = new Date(hasTz ? data.createdAt : `${data.createdAt}Z`)
        let createdLocal = createdUtc
        if (!hasTz) {
          const [cd, ct] = data.createdAt.split('T')
          const [cy, cm, cdn] = cd.split('-').map((v) => parseInt(v, 10))
          const [chhRaw, cmmRaw, cssMsRaw] = ct.split(':')
          const chh = parseInt(chhRaw, 10) || 0
          const cmm = parseInt(cmmRaw, 10) || 0
          const [cssRaw, cmsRaw] = (cssMsRaw || '0').split('.')
          const css = parseInt(cssRaw, 10) || 0
          const cms = parseInt(cmsRaw || '0', 10) || 0
          createdLocal = new Date(cy, (cm || 1) - 1, cdn || 1, chh, cmm, css, cms)
        }
        const diffs = [
          createdUtc.getTime() - start.getTime(),
          createdLocal.getTime() - start.getTime(),
        ]
        const positives = diffs.filter((d) => d >= 0)
        const chosen = positives.length > 0 ? Math.min(...positives) : Math.max(...diffs)
        durationSeconds = Math.max(0, Math.floor(chosen / 1000))
      }
    } catch {}
    return {
      workoutName: data.workoutTitle,
      durationSeconds,
      totalSets,
      totalVolume,
    }
  })()

  const finalWorkoutName = derived.workoutName
  const finalDurationSeconds = derived.durationSeconds
  const finalTotalSets = derived.totalSets
  const finalTotalVolume = derived.totalVolume

  // Compute achievements from record: pick the highest values across exercises
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

  return (
    <Portal>
      <YStack position="absolute" t={0} l={0} r={0} b={0}>
        {/* Backdrop */}
        <Button
          unstyled
          position="absolute"
          t={0}
          l={0}
          r={0}
          b={0}
          bg="$background"
          opacity={0.2}
          onPress={onClose}
        />

        {/* Centered Card */}
        <YStack flex={1} items="center" justify="center" px="$4">
          <YStack
            width="90%"
            bg="$surface"
            borderColor="$primary"
            borderWidth="$0.5"
            rounded="$8"
            overflow="hidden"
            shadowColor="black"
            shadowOffset={{ width: 0, height: 8 }}
            shadowOpacity={0.2}
            shadowRadius={18}
            style={{ maxWidth: 440 }}
          >
            {/* Colorful header */}
            <XStack bg="$primary" items="center" justify="center" p="$4" gap="$2">
              <Trophy size={28} color="$color" />
              <Text fontSize="$8" fontWeight="800" color="$color">
                Workout Complete
              </Text>
            </XStack>
            {/* Body */}
            <YStack p="$5" gap="$2" items="center">
              {!!finalWorkoutName && (
                <Text fontSize="$6" fontWeight="700" color="$color" style={{ textAlign: 'center' }}>
                  {finalWorkoutName}
                </Text>
              )}
              <Text color="$color10" style={{ textAlign: 'center' }}>
                You finished your workout. Great job!
              </Text>

              {/* Stats row */}
              <XStack mt="$2" items="center" width="100%">
                <XStack flex={1} items="center" justify="center" gap="$2">
                  <TimerIcon size={16} color="$colorSubtle" />
                  <Text fontWeight="700" color="$color">
                    {formatDuration(finalDurationSeconds)}
                  </Text>
                </XStack>
                <Separator vertical mx="$3" />
                <XStack flex={1} items="center" justify="center" gap="$2">
                  <Dumbbell size={16} color="$colorSubtle" />
                  <Text fontWeight="700" color="$color">
                    {(finalTotalVolume ?? 0).toLocaleString()} kg
                  </Text>
                </XStack>
                <Separator vertical mx="$3" />
                <XStack flex={1} items="center" justify="center" gap="$2">
                  <Text fontWeight="700" color="$color">
                    {finalTotalSets ?? 0}
                  </Text>
                  <Text color="$colorSubtle">sets</Text>
                </XStack>
              </XStack>
              {/* Achievements (smaller, padded inside body) */}
              {(pr1rm || prVol) && (
                <YStack gap="$2" width="100%" items="center">
                  <Separator my="$2" />
                  <Text fontSize="$3" fontWeight="700" color="$color">
                    New achievements
                  </Text>
                  <XStack gap="$2" items="center" justify="center" flexWrap="wrap">
                    {pr1rm && (
                      <XStack bg="$primary" rounded="$3" px="$2" py="$1" items="center" gap="$1">
                        <Trophy size={12} color="$color" />
                        <Text color="$color" fontSize="$2" fontWeight="700">
                          {`${pr1rm.value.toLocaleString()} kg 1RM${
                            pr1rm.setIndex !== null ? ` (set ${pr1rm.setIndex + 1})` : ''
                          }`}
                          {pr1rm.name ? ` • ${pr1rm.name}` : ''}
                        </Text>
                      </XStack>
                    )}
                    {prVol && (
                      <XStack bg="$secondary" rounded="$3" px="$2" py="$1" items="center" gap="$1">
                        <BarChart2 size={12} color="$color" />
                        <Text color="$color" fontSize="$2" fontWeight="700">
                          {`${prVol.value.toLocaleString()} kg volume`}
                          {prVol.name ? ` • ${prVol.name}` : ''}
                        </Text>
                      </XStack>
                    )}
                  </XStack>
                </YStack>
              )}
            </YStack>
          </YStack>
        </YStack>
      </YStack>
    </Portal>
  )
}

export default FinishedWorkoutCongrats
