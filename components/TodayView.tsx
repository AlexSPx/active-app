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

function sessionHeading(date: Date, dateLabel: string): string {
  const today = new Date()
  return today.getFullYear() === date.getFullYear() &&
    today.getMonth() === date.getMonth() &&
    today.getDate() === date.getDate()
    ? "Today's session"
    : dateLabel
}

export function TodayView({
  session,
  isWorkoutRunning,
  onStartWorkout,
  onOpenWorkout,
  onBrowseWorkouts,
  onManageRoutines,
}: TodayViewProps) {
  const dateLabel = session.date.toLocaleDateString('en-GB', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <View className="gap-field">
      {session.kind === 'scheduled' ? (
        <WorkoutCard
          sessionLabel={sessionHeading(session.date, dateLabel)}
          workout={session.workout}
          isWorkoutRunning={isWorkoutRunning}
          onStartWorkout={onStartWorkout}
          onPress={() => onOpenWorkout(session.workout.id)}
        />
      ) : (
        <View className="gap-field rounded-[22px] bg-featured p-card">
          <UiText textRole="featuredMeta">{dateLabel}</UiText>
          <UiText textRole="featuredTitle" accessibilityRole="header">
            {session.kind === 'rest'
              ? 'Rest day.'
              : session.kind === 'unavailable'
                ? 'Workout unavailable'
                : session.kind === 'before-routine'
                  ? 'Routine has not started'
                  : 'No workout scheduled'}
          </UiText>
          <UiText textRole="featuredMeta">
            {session.kind === 'rest'
              ? 'No workout scheduled for this date.'
              : session.kind === 'unavailable'
                ? 'This workout is scheduled in your active routine but is missing from your library.'
                : session.kind === 'before-routine'
                  ? 'This date is before the start of your active routine.'
                  : 'Your active routine has no workout assigned to this date.'}
          </UiText>
          {session.kind !== 'unavailable' && (
            <Button variant="featured" onPress={onManageRoutines}>
              <UiText textRole="featuredButton">View your routine</UiText>
            </Button>
          )}
          {session.kind === 'unavailable' && (
            <View className="gap-compact">
              <Button variant="featured" onPress={onBrowseWorkouts}>
                <UiText textRole="featuredButton">Browse workouts</UiText>
              </Button>
              <Button variant="featured" onPress={onManageRoutines}>
                <UiText textRole="featuredButton">Manage routine</UiText>
              </Button>
            </View>
          )}
        </View>
      )}
    </View>
  )
}
