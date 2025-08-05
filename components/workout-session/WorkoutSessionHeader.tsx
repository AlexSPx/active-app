import { YStack, Text, H3 } from 'tamagui'

interface WorkoutSessionHeaderProps {
  workoutName: string
  date: string
  duration: string
}

export function WorkoutSessionHeader({ workoutName, date, duration }: WorkoutSessionHeaderProps) {
  return (
    <YStack gap="$2" mb="$2">
      <H3 color="$color">{workoutName}</H3>
      <Text fontSize="$4" color="$colorSubtle">
        {date} • {duration}
      </Text>
    </YStack>
  )
}
