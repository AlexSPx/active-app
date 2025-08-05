import { YStack, XStack, Text } from 'tamagui'
import { calculateExerciseVolume, formatVolume } from '../../utils/workoutUtils'
import type { WorkoutExercise } from '../../types/history'

interface WorkoutExerciseDetailProps {
  exercise: WorkoutExercise
}

export function WorkoutExerciseDetail({ exercise }: WorkoutExerciseDetailProps) {
  return (
    <YStack gap="$2">
      <XStack justify="space-between" items="center">
        <Text fontSize="$4" fontWeight="600" color="$color">
          {exercise.name}
        </Text>
        <Text fontSize="$3" color="$colorSubtle">
          {formatVolume(calculateExerciseVolume(exercise.sets))}
        </Text>
      </XStack>

      {/* Sets Display */}
      <XStack flexWrap="wrap" gap="$2">
        {exercise.sets.map((set, setIndex) => (
          <XStack
            key={setIndex}
            items="center"
            gap="$1"
            bg="$backgroundHover"
            px="$3"
            py="$2"
            r="$3"
          >
            <Text fontSize="$3" color="$color">
              {set.weight > 0 ? `${set.weight}kg×${set.reps}` : `${set.reps} reps`}
            </Text>
          </XStack>
        ))}
      </XStack>
    </YStack>
  )
}
