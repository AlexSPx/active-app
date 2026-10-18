import { useEffect, useState } from 'react'
import { Platform, ScrollView, Vibration, View } from 'react-native'
import { Button, UiText } from './ui/Controls'
import { CadenceOverlay } from './ui/CadenceOverlay'
import { Trophy, Timer as TimerIcon, Dumbbell, BarChart2 } from './ui/icons'
import { useCadenceColors } from './ui/useCadenceColors'
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
  const colors = useCadenceColors()
  // Start the sheet at the middle snap point (50%).
  const [position, setPosition] = useState(1)

  useEffect(() => {
    if (visible) {
      // Reset to 50% whenever opened.
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

  // Derive from WorkoutRecord.
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
  const stats = [
    {
      label: 'Duration',
      value: formatDuration(derived.durationSeconds),
      icon: <TimerIcon size={14} color={colors.muted} aria-hidden />,
    },
    {
      label: 'Volume',
      value: `${(derived.totalVolume ?? 0).toLocaleString()} kg`,
      icon: <Dumbbell size={14} color={colors.muted} aria-hidden />,
    },
    {
      label: 'Sets',
      value: `${derived.totalSets ?? 0}`,
      icon: null,
    },
  ]

  return (
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
      <View className="flex-1 gap-field">
        <ScrollView className="flex-1" showsVerticalScrollIndicator>
          <View className="w-full gap-field">
            <UiText textRole="bodyMuted" className="text-center">
              Your workout is saved on this device.
            </UiText>

            <View className="gap-compact">
              <UiText textRole="cardTitle" accessibilityRole="header">
                {derived.workoutName}
              </UiText>
              <View className="w-full flex-row gap-compact">
                {stats.map(({ label, value, icon }) => (
                  <View
                    key={label}
                    className="min-w-0 flex-1 items-center gap-compact rounded-card border border-divider bg-surface p-compact"
                  >
                    <View className="min-w-0 flex-row items-center justify-center gap-compact">
                      {icon}
                      <UiText textRole="bodyEmphasis" className="shrink text-center">
                        {value}
                      </UiText>
                    </View>
                    <UiText textRole="meta">{label}</UiText>
                  </View>
                ))}
              </View>
            </View>

            {achievements.length > 0 && (
              <View className="gap-field">
                <View className="h-px bg-divider" />
                <UiText textRole="cardTitle" accessibilityRole="header">
                  New Achievements
                </UiText>
                <View className="gap-field">
                  {achievements.map((achievement, index) => (
                    <View
                      key={`${achievement.type}-${achievement.exercise}-${index}`}
                      className="flex-row items-center gap-field rounded-card border border-divider bg-surface px-field py-compact"
                    >
                      {achievement.type === '1RM' ? (
                        <Trophy size={18} color={colors.accent} aria-hidden />
                      ) : (
                        <BarChart2 size={18} color={colors.accent} aria-hidden />
                      )}
                      <View className="min-w-0 flex-1 gap-compact">
                        <UiText textRole="bodyEmphasis">
                          {achievement.type === '1RM'
                            ? `${achievement.value.toLocaleString()} kg 1RM` +
                              (typeof achievement.setIndex === 'number'
                                ? ` (set ${achievement.setIndex + 1})`
                                : '')
                            : `${achievement.value.toLocaleString()} kg volume`}
                        </UiText>
                        <UiText textRole="meta">{achievement.exercise}</UiText>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        <Button onPress={onClose} className="w-full shrink-0">
          Continue
        </Button>
      </View>
    </CadenceOverlay>
  )
}

export default FinishedWorkoutCongrats
