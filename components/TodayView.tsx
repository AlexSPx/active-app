import { View } from 'react-native'
import { Button, UiText } from './ui/Controls'
import { WorkoutCard } from '../features/workouts/components/WorkoutCard'
import type { ApiWorkout } from '../types/api'
import type { TrainingHomeSession } from '../features/training/hooks/useTrainingHomeController'

type TodayViewProps = {
  session: TrainingHomeSession
  isWorkoutRunning: boolean
  onStartWorkout: (workout: ApiWorkout) => void
  onOpenWorkout: (workoutId: string) => void
  onBrowseWorkouts: () => void
  onManageRoutines: () => void
}

function sessionHeading(date: Date): string {
  const today = new Date()
  return today.getFullYear() === date.getFullYear() &&
    today.getMonth() === date.getMonth() &&
    today.getDate() === date.getDate()
    ? "Today's session"
    : 'Selected session'
}

export function TodayView({
  session,
  isWorkoutRunning,
  onStartWorkout,
  onOpenWorkout,
  onBrowseWorkouts,
  onManageRoutines,
}: TodayViewProps) {
  const dateLabel = session.date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <View className="gap-field">
      <View className="gap-compact">
        <UiText textRole="bodyEmphasis" accessibilityRole="header">
          {sessionHeading(session.date)}
        </UiText>
        <UiText textRole="meta">{dateLabel}</UiText>
      </View>

      {session.kind === 'scheduled' ? (
        <WorkoutCard
          workout={session.workout}
          isWorkoutRunning={isWorkoutRunning}
          onStartWorkout={onStartWorkout}
          onPress={() => onOpenWorkout(session.workout.id)}
        />
      ) : (
        <View className="gap-field rounded-card bg-raised p-card">
          <UiText textRole="cardTitle" accessibilityRole="header">
            {session.kind === 'rest'
              ? 'Rest day'
              : session.kind === 'unavailable'
                ? 'Workout unavailable'
                : session.kind === 'before-routine'
                  ? 'Routine has not started'
                  : 'No workout scheduled'}
          </UiText>
          <UiText textRole="bodyMuted">
            {session.kind === 'rest'
              ? 'Take a rest day. Your next workout will stay on its scheduled date.'
              : session.kind === 'unavailable'
                ? 'This workout is scheduled in your active routine but is missing from your library.'
                : session.kind === 'before-routine'
                  ? 'This date is before the start of your active routine.'
                  : 'Your active routine has no workout assigned to this date.'}
          </UiText>
          {session.kind === 'unavailable' && (
            <View className="gap-compact">
              <Button variant="secondary" onPress={onBrowseWorkouts}>
                Browse workouts
              </Button>
              <Button variant="ghost" onPress={onManageRoutines}>
                Manage routine
              </Button>
            </View>
          )}
        </View>
      )}
    </View>
  )
}
