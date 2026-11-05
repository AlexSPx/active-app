import { useLocalSearchParams, router } from 'expo-router'
import { View } from 'react-native'
import { Button } from '../../components/ui/Controls'
import { syncEngine } from '../../lib/sync'
import { RoutineForm } from '../../features/routines/components/RoutineForm'
import { routineActiveUpdate } from '../../features/routines/routineDraft'
import { useActiveRoutine, useRoutineMutations, useRoutines } from '../../features/routines'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'

export default function EditRoutinePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { routines, loading: loadingRoutines } = useRoutines()
  const { activeRoutine, loading: loadingActive, error: activeError, refetch } = useActiveRoutine()
  const { updateRoutine, loading, error, clearError } = useRoutineMutations()
  const resolvedId = syncEngine.resolveId('routines', id)
  const routine = routines.find((item) => syncEngine.resolveId('routines', item.id) === resolvedId)
  const initialActive =
    !!activeRoutine && syncEngine.resolveId('routines', activeRoutine.id) === resolvedId

  if (loadingRoutines || loadingActive)
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingSpinner />
      </View>
    )
  if (activeError)
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background p-page">
        <ErrorDisplay message="Could not check which routine is active." />
        <Button variant="secondary" onPress={() => void refetch()}>
          Try again
        </Button>
      </View>
    )
  if (!routine)
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background p-page">
        <ErrorDisplay message="Routine not found" />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </View>
    )

  return (
    <RoutineForm
      key={id}
      initialValues={{
        name: routine.name,
        description: routine.description ?? '',
        routineType: routine.routineType ?? 'SEQUENTIAL',
        pattern: routine.pattern.map((day) => ({ ...day, workoutId: day.workoutId ?? null })),
        active: initialActive,
        startDate: routine.startDate ? new Date(routine.startDate) : new Date(),
      }}
      loading={loading}
      error={error}
      onClearError={clearError}
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
          ...routineActiveUpdate(initialActive, data.active),
          ...(data.active ? { startDate: data.startDate.toISOString() } : {}),
        }))
      }
    />
  )
}
