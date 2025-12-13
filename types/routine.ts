export type RoutineDayType = 'WORKOUT' | 'REST'

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
  pattern: RoutinePatternItem[]
  startDate: string // Instant (ISO-8601 string) e.g. 2023-10-27T10:00:00Z
  createdAt: string // ISO-8601 string
  updatedAt: string // ISO-8601 string
}

export interface CreateRoutineRequest {
  name: string
  description?: string
  pattern: RoutinePatternItem[]
  startDate?: string // LocalDate (yyyy-MM-dd)
  active?: boolean
}

export interface UpdateRoutineRequest {
  name?: string
  description?: string | null
  pattern?: RoutinePatternItem[]
  startDate?: string // LocalDate (yyyy-MM-dd)
  active?: boolean
}
