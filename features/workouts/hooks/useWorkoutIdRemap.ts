import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { syncEngine } from '../../../lib/sync'

export function useWorkoutIdRemap(id: string | undefined): void {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = syncEngine.onIdRemap((tableName, oldId, newId) => {
      if (tableName === 'workouts' && id === oldId) router.setParams({ id: newId })
    })
    const resolvedId = id && syncEngine.resolveId('workouts', id)
    if (resolvedId && resolvedId !== id) router.setParams({ id: resolvedId })
    return unsubscribe
  }, [id, router])
}
