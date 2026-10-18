import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { syncEngine } from '../../../lib/sync'

export function useWorkoutIdRemap(
  id: string | undefined,
  param: 'id' | 'duplicateId' = 'id'
): void {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = syncEngine.onIdRemap((tableName, oldId, newId) => {
      if (tableName === 'workouts' && id === oldId) {
        router.setParams(param === 'id' ? { id: newId } : { duplicateId: newId })
      }
    })
    const resolvedId = id && syncEngine.resolveId('workouts', id)
    if (resolvedId && resolvedId !== id) {
      router.setParams(param === 'id' ? { id: resolvedId } : { duplicateId: resolvedId })
    }
    return unsubscribe
  }, [id, param, router])
}
