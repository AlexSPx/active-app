import { Stack } from 'expo-router'
import { RoutineDetailView } from '../../features/routines/components/RoutineDetailView'
import { useRoutineDetail } from '../../features/routines/hooks/useRoutineDetail'
import { useCadenceColors } from '../../components/ui/useCadenceColors'
import { BackHeaderButton } from '../../navigation/BackHeaderButton'

export default function RoutineDetailScreen() {
  const detail = useRoutineDetail()
  const colors = useCadenceColors()
  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerBackTitle: 'Routines',
          headerBackVisible: false,
          headerLeft: () => (
            <BackHeaderButton label="Routines" fallback="/(tabs)/(workouts)/routines" />
          ),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
        }}
      />
      <RoutineDetailView {...detail} />
    </>
  )
}
