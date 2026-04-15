/**
 * Centralized query key factory for TanStack Query.
 *
 * Usage:
 * - queryKeys.workouts.list() returns ['workouts', 'list']
 * - queryKeys.workouts.detail('abc') returns ['workouts', 'detail', 'abc']
 *
 * Invalidation:
 * - queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all }) invalidates all workout queries
 */
export const queryKeys = {
  // Workouts
  workouts: {
    all: ['workouts'] as const,
    list: () => [...queryKeys.workouts.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.workouts.all, 'detail', id] as const,
  },

  // Routines
  routines: {
    all: ['routines'] as const,
    list: () => [...queryKeys.routines.all, 'list'] as const,
    active: () => [...queryKeys.routines.all, 'active'] as const,
    detail: (id: string) => [...queryKeys.routines.all, 'detail', id] as const,
  },

  // Exercises
  exercises: {
    all: ['exercises'] as const,
    search: (query: string) => [...queryKeys.exercises.all, 'search', query] as const,
    logs: (exerciseId: string) => [...queryKeys.exercises.all, 'logs', exerciseId] as const,
  },

  // User
  user: {
    me: ['user', 'me'] as const,
  },

  // Workout Records (history)
  records: {
    all: ['records'] as const,
    list: () => [...queryKeys.records.all, 'list'] as const,
  },

  // Legal content
  legal: {
    all: ['legal'] as const,
    privacy: ['legal', 'privacy'] as const,
    terms: ['legal', 'terms'] as const,
  },
} as const

// Type exports for use with useQuery
export type WorkoutsQueryKey = ReturnType<typeof queryKeys.workouts.list>
export type RoutinesQueryKey = ReturnType<typeof queryKeys.routines.list>
export type ActiveRoutineQueryKey = ReturnType<typeof queryKeys.routines.active>
