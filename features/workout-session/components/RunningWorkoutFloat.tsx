import { useEffect, useState } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import { useRouter } from 'expo-router'
import { Button, UiText } from '../../../components/ui/Controls'
import { Clock, Play } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { useRunningWorkoutStore } from '../stores/runningWorkoutStore'

type RunningWorkoutFloatProps = {
  bottomOffset?: number
  hidden?: boolean
  onHeightChange?: (height: number) => void
}

export default function RunningWorkoutFloat({
  bottomOffset = 90,
  hidden = false,
  onHeightChange,
}: RunningWorkoutFloatProps) {
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
  if (hidden || !workoutRunning || !runningWorkout) {
    return null
  }

  const currentExercise = runningWorkout.exercises[runningWorkout.currentExerciseIndex]
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
      pointerEvents="box-none"
      className="absolute left-page right-page"
      style={{ bottom: bottomOffset }}
      onLayout={(event: LayoutChangeEvent) => onHeightChange?.(event.nativeEvent.layout.height)}
    >
      <Button
        variant="surface"
        shape="card"
        density="card"
        className="w-full flex-row items-center justify-start gap-field shadow-lg"
        accessibilityRole="button"
        accessibilityLabel={`Resume ${runningWorkout.name}, workout in progress`}
        accessibilityHint="Opens the running workout session"
        accessibilityValue={{
          text: `${completedSets} of ${totalSets} sets complete. ${formattedElapsedTime} elapsed.`,
        }}
        onPress={handlePress}
      >
        <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
          <Play size={16} color={colors.onAccent} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-compact">
          <UiText textRole="bodyEmphasis" numberOfLines={1}>
            {runningWorkout.name} • In Progress
          </UiText>
          <View className="flex-row items-center justify-between gap-field">
            <View className="shrink-0 flex-row items-center gap-compact">
              <Clock size={14} color={colors.muted} aria-hidden />
              <UiText textRole="meta">{formattedElapsedTime}</UiText>
            </View>
            <UiText textRole="meta">
              {completedSets}/{totalSets} sets
            </UiText>
          </View>
          {currentExercise && (
            <UiText textRole="meta" numberOfLines={1}>
              {currentExercise.name}
            </UiText>
          )}
        </View>
      </Button>
    </View>
  )
}
