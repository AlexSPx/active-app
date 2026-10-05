import { useLocalSearchParams, router } from 'expo-router'
import { YStack, Button } from 'tamagui'
import { syncEngine } from '../../lib/sync'
import { RoutineForm } from '../../features/routines/components/RoutineForm'
import { useRoutineMutations, useRoutines } from '../../features/routines'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'

export default function EditRoutinePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { routines, loading: loadingRoutines } = useRoutines()
  const { updateRoutine, loading, error } = useRoutineMutations()
  const routine = routines.find((item) => item.id === syncEngine.resolveId('routines', id))
  if (loadingRoutines)
    return (
      <YStack flex={1} bg="$background" items="center" justify="center">
        <LoadingSpinner />
      </YStack>
    )
  if (!routine)
    return (
      <YStack flex={1} bg="$background" items="center" justify="center" p="$page" gap="$field">
        <ErrorDisplay message="Routine not found" />
        <Button minH="$action" rounded="$button" onPress={() => router.back()}>
          Go back
        </Button>
      </YStack>
    )
  return (
    <RoutineForm
      key={id}
      initialValues={{
        name: routine.name,
        description: routine.description ?? '',
        routineType: routine.routineType ?? 'SEQUENTIAL',
        pattern: routine.pattern.map((day) => ({ ...day, workoutId: day.workoutId ?? null })),
        active: false,
        startDate: routine.startDate ? new Date(routine.startDate) : new Date(),
      }}
      loading={loading}
      error={error}
      onSave={async (data) =>
        !!(await updateRoutine(routine.id, {
          name: data.name.trim(),
          description: data.description?.trim() || null,
          routineType: data.routineType,
          pattern: data.pattern.map((day, index) => ({
            ...day,
            dayIndex: index + 1,
            workoutId: day.dayType === 'REST' ? null : day.workoutId,
          })),
          active: data.active || undefined,
          startDate: data.startDate.toISOString(),
        }))
      }
    />
  )
}
