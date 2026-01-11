import { Clock, Play } from '@tamagui/lucide-icons'
import { Button, Text, XStack, YStack } from 'tamagui'
import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useRunningWorkoutStore } from '../stores/runningWorkoutStore'

export default function RunningWorkoutFloat() {
  const router = useRouter()
  const { runningWorkout, isWorkoutRunning, getElapsedTime } = useRunningWorkoutStore()
  const [elapsedTime, setElapsedTime] = useState(0)

  // Initialize elapsed time on mount
  useEffect(() => {
    if (isWorkoutRunning()) {
      setElapsedTime(getElapsedTime())
    }
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    if (isWorkoutRunning()) {
      // Set initial elapsed time
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
  }, [isWorkoutRunning()])

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
  if (!isWorkoutRunning() || !runningWorkout) {
    return null
  }

  const currentExercise = runningWorkout.exercises[runningWorkout.currentExerciseIndex]

  return (
    <YStack position="absolute" b={90} l="$4" r="$4">
      <Button
        unstyled
        bg="$green2"
        borderColor="$green6"
        borderWidth="$0.5"
        p="$3"
        rounded="$4"
        pressStyle={{ bg: '$green3' }}
        shadowColor="black"
        shadowOffset={{ width: 0, height: 4 }}
        shadowOpacity={0.15}
        shadowRadius={12}
        elevation={8}
        onPress={handlePress}
      >
        <XStack items="center" justify="space-between" width="100%">
          <XStack items="center" gap="$3">
            <XStack
              items="center"
              justify="center"
              width={32}
              height={32}
              bg="$green9"
              rounded="$6"
            >
              <Play size={16} color="white" />
            </XStack>
            <YStack>
              <Text fontSize="$4" fontWeight="600" color="$green12">
                {runningWorkout.name} • In Progress
              </Text>
              <XStack items="center" justify="space-between" gap="$3">
                <XStack items="center" gap="$1">
                  <Clock size={14} color="$green11" />
                  <Text fontSize="$3" color="$green11">
                    {formatElapsedTime(elapsedTime)}
                  </Text>
                </XStack>
                <Text fontSize="$3" color="$green11">
                  {runningWorkout.completedExercises}/{runningWorkout.exercises.length} exercises
                </Text>
              </XStack>
              <XStack flex={1} items="center" justify="space-between">
                <Text fontSize="$3" color="$green10" mb="$1">
                  Current:
                </Text>
                <Text fontSize="$2" fontWeight="500" color="$green11">
                  {currentExercise?.name || 'Finished'}
                </Text>
              </XStack>
            </YStack>
          </XStack>
        </XStack>
      </Button>
      {/* </Animated.View> */}
    </YStack>
  )
}
