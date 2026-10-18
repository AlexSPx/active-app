import { Clock, Play } from '../../../components/ui/icons'
import { Button, Text, XStack, YStack } from 'tamagui'
import { useEffect, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import { useRouter } from 'expo-router'
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

  // Don't render if no workout is running
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

  return (
    <YStack
      position="absolute"
      b={bottomOffset}
      l="$4"
      r="$4"
      onLayout={(event: LayoutChangeEvent) => onHeightChange?.(event.nativeEvent.layout.height)}
    >
      <Button
        unstyled
        bg="$green2"
        borderColor="$green6"
        borderWidth="$0.5"
        p="$2.5"
        rounded="$4"
        pressStyle={{ bg: '$green3' }}
        shadowColor="black"
        shadowOffset={{ width: 0, height: 4 }}
        shadowOpacity={0.15}
        shadowRadius={12}
        elevation={8}
        accessibilityRole="button"
        accessibilityLabel={`Resume ${runningWorkout.name}, workout in progress`}
        accessibilityHint="Opens the running workout session"
        accessibilityValue={{
          text: `${completedSets} of ${totalSets} sets complete. ${formatElapsedTime(elapsedTime)} elapsed.`,
        }}
        onPress={handlePress}
      >
        <XStack items="center" gap="$3" width="100%">
          <XStack
            items="center"
            justify="center"
            width={30}
            height={30}
            bg="$green9"
            rounded="$6"
            shrink={0}
          >
            <Play size={16} color="white" />
          </XStack>
          <YStack flex={1} minW={0} gap="$1">
            <Text fontSize="$3" fontWeight="600" color="$green12" numberOfLines={1}>
              {runningWorkout.name} • In Progress
            </Text>
            <XStack items="center" justify="space-between" gap="$2">
              <XStack items="center" gap="$1" shrink={0}>
                <Clock size={14} color="$green11" />
                <Text fontSize="$2" color="$green11">
                  {formatElapsedTime(elapsedTime)}
                </Text>
              </XStack>
              <Text fontSize="$2" color="$green11">
                {completedSets}/{totalSets} sets
              </Text>
            </XStack>
            {currentExercise && (
              <Text fontSize="$2" color="$green10" numberOfLines={1}>
                {currentExercise.name}
              </Text>
            )}
          </YStack>
        </XStack>
      </Button>
    </YStack>
  )
}
