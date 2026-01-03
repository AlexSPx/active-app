export type RoutineDayType = 'WORKOUT' | 'REST'

/**
 * Routine type discriminator:
 * - SEQUENTIAL: Workouts on specific days in a repeating cycle
 * - WEEKLY_COMPLETION: Complete all workouts within a week (Mon-Sun), any order
 */
export type RoutineType = 'SEQUENTIAL' | 'WEEKLY_COMPLETION'

export interface RoutinePatternItem {
  dayIndex: number
  dayType: RoutineDayType
  workoutId: string | null
}

export interface Routine {
  id: string
  name: string
  description: string | null
  userId: string
  routineType?: RoutineType // Defaults to SEQUENTIAL if not specified
  pattern: RoutinePatternItem[]
  startDate: string // Instant (ISO-8601 string) e.g. 2023-10-27T10:00:00Z
  createdAt: string // ISO-8601 string
  updatedAt: string // ISO-8601 string
}

export interface CreateRoutineRequest {
  name: string
  description?: string
  routineType?: RoutineType // Defaults to SEQUENTIAL
  pattern: RoutinePatternItem[]
  startDate?: string // LocalDate (yyyy-MM-dd)
  active?: boolean
}

export interface UpdateRoutineRequest {
  name?: string
  description?: string | null
  routineType?: RoutineType
  pattern?: RoutinePatternItem[]
  startDate?: string // LocalDate (yyyy-MM-dd)
  active?: boolean
}
