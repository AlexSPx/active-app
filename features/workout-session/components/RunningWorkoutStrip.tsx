import { useEffect, useState } from 'react'
import { Pressable, View, type LayoutChangeEvent } from 'react-native'
import { useRouter } from 'expo-router'
import { UiText } from '../../../components/ui/Controls'
import { Clock } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { useRunningWorkoutStore } from '../stores/runningWorkoutStore'

const stripSurfaceStyle = {
  bottom: -16,
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
}

type RunningWorkoutStripProps = {
  onHeightChange?: (height: number) => void
}

export default function RunningWorkoutStrip({ onHeightChange }: RunningWorkoutStripProps) {
  const router = useRouter()
  const colors = useCadenceColors()
  const { runningWorkout, isWorkoutRunning, getElapsedTime } = useRunningWorkoutStore()
  const [elapsedTime, setElapsedTime] = useState(0)
  const workoutRunning = isWorkoutRunning()

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    if (workoutRunning) {
      setElapsedTime(getElapsedTime())
      interval = setInterval(() => {
        setElapsedTime(getElapsedTime())
      }, 1000)
    } else {
      setElapsedTime(0)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [workoutRunning, getElapsedTime])

  const formatElapsedTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const handlePress = () => {
    if (runningWorkout) {
      router.push('/workouts/session')
    }
  }

  // Don't render if no workout is running.
  if (!workoutRunning || !runningWorkout) {
    return null
  }

  const completedSets = runningWorkout.exercises.reduce(
    (total, exercise) => total + exercise.sessionSets.filter((set) => set.completed).length,
    0
  )
  const totalSets = runningWorkout.exercises.reduce(
    (total, exercise) => total + exercise.sessionSets.length,
    0
  )
  const formattedElapsedTime = formatElapsedTime(elapsedTime)

  return (
    <View
      className="mx-8"
      style={{ marginBottom: -6 }}
      onLayout={(event: LayoutChangeEvent) => onHeightChange?.(event.nativeEvent.layout.height - 6)}
    >
      <View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 bg-surface"
        style={{
          ...stripSurfaceStyle,
          boxShadow: [{ inset: true, offsetX: 0, offsetY: 1, blurRadius: 4, color: '#0000001A' }],
        }}
      />
      <Pressable
        hitSlop={{ top: 6 }}
        className="min-h-touch w-full flex-row items-center justify-start gap-compact rounded-t-[24px] px-field py-2 hover:opacity-90 active:opacity-80 focus:border-2 focus:border-accent"
        accessibilityRole="button"
        accessibilityLabel={`Resume ${runningWorkout.name}, workout in progress`}
        accessibilityHint="Opens the running workout session"
        accessibilityValue={{
          text: `${completedSets} of ${totalSets} sets complete. ${formattedElapsedTime} elapsed.`,
        }}
        onPress={handlePress}
      >
        <UiText textRole="bodyEmphasis" className="min-w-0 flex-1" numberOfLines={1}>
          {runningWorkout.name}
        </UiText>
        <View className="shrink-0 flex-row items-center gap-compact">
          <Clock size={12} color={colors.muted} aria-hidden />
          <UiText textRole="meta">{formattedElapsedTime}</UiText>
        </View>
        <UiText textRole="meta" className="shrink-0">
          {completedSets}/{totalSets} sets
        </UiText>
      </Pressable>
    </View>
  )
}
