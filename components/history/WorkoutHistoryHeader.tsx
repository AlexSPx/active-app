import { YStack, XStack, Text, H3 } from 'tamagui'
import { Calendar } from '@tamagui/lucide-icons'

interface WorkoutHistoryHeaderProps {
  workoutCount: number
}

export function WorkoutHistoryHeader({ workoutCount }: WorkoutHistoryHeaderProps) {
  return (
    <YStack gap="$2" mb="$2">
      <H3 color="$color">Workout History</H3>
      <XStack items="center" gap="$2">
        <Calendar size={16} color="$colorSubtle" />
        <Text fontSize="$4" color="$colorSubtle">
          {workoutCount} workouts this month
        </Text>
      </XStack>
    </YStack>
  )
}
