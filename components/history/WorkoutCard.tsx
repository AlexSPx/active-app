import { YStack, XStack, Text, H4 } from 'tamagui'
import { Clock, TrendingUp, Dumbbell } from '@tamagui/lucide-icons'
import { ExpandableCard } from '../ui/ExpandableCard'
import { StatItem } from '../ui/StatItem'
import { Badge } from '../ui/Badge'
import { WorkoutExerciseDetail } from './WorkoutExerciseDetail'
import { formatDate } from '../../utils/dateUtils'
import { formatVolume } from '../../utils/workoutUtils'
import type { WorkoutSession } from '../../types/history'

interface WorkoutCardProps {
  workout: WorkoutSession
}

export function WorkoutCard({ workout }: WorkoutCardProps) {
  const header = (
    <YStack>
      <XStack items="center" gap="$2">
        <H4 color="$color">{workout.name}</H4>
        {workout.notes && <Badge variant="secondary">PR</Badge>}
      </XStack>
      <Text fontSize="$3" color="$colorSubtle">
        {formatDate(workout.date)}
      </Text>
    </YStack>
  )

  const stats = (
    <XStack justify="space-between" items="center">
      <StatItem
        icon={<Clock size={16} color="$colorSubtle" />}
        value={workout.duration}
        label="m"
      />
      <StatItem
        icon={<Dumbbell size={16} color="$colorSubtle" />}
        value={workout.totalSets}
        label="sets"
      />
      <StatItem
        icon={<TrendingUp size={16} color="$colorSubtle" />}
        value={formatVolume(workout.totalVolume)}
        label=""
      />
    </XStack>
  )

  const content = (
    <YStack gap="$3">
      {/* Exercise List */}
      <YStack gap="$3">
        {workout.exercises.map((exercise, index) => (
          <WorkoutExerciseDetail key={index} exercise={exercise} />
        ))}
      </YStack>

      {/* Notes */}
      {workout.notes && (
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="600" color="$color">
            Notes
          </Text>
          <Text fontSize="$3" color="$colorSubtle">
            {workout.notes}
          </Text>
        </YStack>
      )}
    </YStack>
  )

  return (
    <ExpandableCard header={header} stats={stats}>
      {content}
    </ExpandableCard>
  )
}
