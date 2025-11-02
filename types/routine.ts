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
  createdAt: string // ISO-8601 string
  updatedAt: string // ISO-8601 string
}

export interface CreateRoutineRequest {
  name: string
  description?: string
  pattern: RoutinePatternItem[]
  active?: boolean
}

export interface UpdateRoutineRequest {
  name?: string
  description?: string | null
  pattern?: RoutinePatternItem[]
  active?: boolean
}
