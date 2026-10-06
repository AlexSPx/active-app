import { RoutineForm } from '../../features/routines/components/RoutineForm'
import { useRoutineMutations } from '../../features/routines'
import { posthog } from '../../services/posthog'

export default function NewRoutinePage() {
  const { createRoutine, loading, error } = useRoutineMutations()
  return (
    <RoutineForm
      loading={loading}
      error={error}
      onSave={async (data) => {
        const payload = {
          name: data.name.trim(),
          description: data.description?.trim() || undefined,
          routineType: data.routineType,
          pattern: data.pattern.map((day, index) => ({
            ...day,
            dayIndex: index + 1,
            workoutId: day.dayType === 'REST' ? null : day.workoutId,
          })),
          active: data.active,
          ...(data.active ? { startDate: data.startDate.toISOString() } : {}),
        }
        const created = await createRoutine(payload)
        if (!created) return false
        posthog.capture('routine_created', {
          routineType: data.routineType,
          workoutDays: payload.pattern.filter((day) => day.dayType === 'WORKOUT').length,
          restDays: payload.pattern.filter((day) => day.dayType === 'REST').length,
          active: data.active,
        })
        return true
      }}
    />
  )
}
