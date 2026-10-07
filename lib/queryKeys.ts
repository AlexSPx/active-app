/** Query keys for profile-owned data. Keeping the owner in every private key
 * prevents a late query or mutation from populating another profile's cache.
 */
function keysForOwner(ownerId: string) {
  const root = ['profile', ownerId] as const
  const workouts = [...root, 'workouts'] as const
  const routines = [...root, 'routines'] as const
  const exercises = [...root, 'exercises'] as const
  const records = [...root, 'records'] as const

  return {
    workouts: {
      all: workouts,
      list: () => [...workouts, 'list'] as const,
      detail: (id: string) => [...workouts, 'detail', id] as const,
    },
    routines: {
      all: routines,
      list: () => [...routines, 'list'] as const,
      active: () => [...routines, 'active'] as const,
      detail: (id: string) => [...routines, 'detail', id] as const,
    },
    exercises: {
      all: exercises,
      search: (query: string) => [...exercises, 'search', query] as const,
      logs: (exerciseId: string) => [...exercises, 'logs', exerciseId] as const,
    },
    user: {
      me: [...root, 'user', 'me'] as const,
    },
    records: {
      all: records,
      list: () => [...records, 'list'] as const,
    },
  }
}

export const queryKeys = {
  forOwner: keysForOwner,
  legal: {
    all: ['legal'] as const,
    privacy: ['legal', 'privacy'] as const,
    terms: ['legal', 'terms'] as const,
  },
} as const

type OwnerQueryKeys = ReturnType<typeof queryKeys.forOwner>
export type WorkoutsQueryKey = ReturnType<OwnerQueryKeys['workouts']['list']>
export type RoutinesQueryKey = ReturnType<OwnerQueryKeys['routines']['list']>
export type ActiveRoutineQueryKey = ReturnType<OwnerQueryKeys['routines']['active']>
