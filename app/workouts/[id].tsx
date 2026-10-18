import { Stack } from 'expo-router'
import { WorkoutDetailView } from '../../features/workouts/components/WorkoutDetailView'
import { useWorkoutDetail } from '../../features/workouts/hooks/useWorkoutDetail'
import { Button, UiText } from '../../components/ui/Controls'
import { useCadenceColors } from '../../components/ui/useCadenceColors'
import { BackHeaderButton } from '../../navigation/BackHeaderButton'

export default function WorkoutDetailScreen() {
  const detail = useWorkoutDetail()
  const colors = useCadenceColors()
  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerBackTitle: 'Workouts',
          headerBackVisible: false,
          headerLeft: () => <BackHeaderButton label="Workouts" fallback="/(tabs)/(workouts)" />,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerRight: detail.workout
            ? () => (
                <Button variant="ghost" onPress={detail.editWorkout}>
                  <UiText textRole="captionEmphasis">Edit</UiText>
                </Button>
              )
            : undefined,
        }}
      />
      <WorkoutDetailView {...detail} />
    </>
  )
}
