import { XStack, Card } from 'tamagui'
import { StatItem } from '../ui/StatItem'
import type { WorkoutSession } from '../../types/history'

interface WorkoutStatsProps {
  workouts: WorkoutSession[]
}

export function WorkoutStats({ workouts }: WorkoutStatsProps) {
  const totalVolume = workouts.reduce((total, w) => total + w.totalVolume, 0)
  const avgDuration = Math.round(
    workouts.reduce((total, w) => total + w.duration, 0) / workouts.length
  )
  const totalSets = workouts.reduce((total, w) => total + w.totalSets, 0)

  return (
    <Card elevate size="$3" p="$4" mb="$2" bg="$surface" borderColor="$borderColor">
      <XStack justify="space-between">
        <StatItem
          value={totalVolume.toLocaleString()}
          label="Total Volume (kg)"
          layout="vertical"
        />
        <StatItem value={avgDuration} label="Avg Duration (min)" layout="vertical" />
        <StatItem value={totalSets} label="Total Sets" layout="vertical" />
      </XStack>
    </Card>
  )
}
