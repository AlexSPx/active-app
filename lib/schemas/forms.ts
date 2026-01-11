/**
 * Zod schemas for form validation with React Hook Form.
 */
import { z } from 'zod'

// ==========================================
// Routine Form Schemas
// ==========================================

export const routineTypeSchema = z.enum(['SEQUENTIAL', 'WEEKLY_COMPLETION'])

export const routinePatternItemSchema = z.object({
  dayIndex: z.number(),
  dayType: z.enum(['WORKOUT', 'REST']),
  workoutId: z.string().nullable(),
})

export const createRoutineSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  routineType: routineTypeSchema,
  pattern: z.array(routinePatternItemSchema).min(1, 'At least one day is required'),
  active: z.boolean(),
  startDate: z.date(),
}).refine(
  (data) => {
    // Ensure all WORKOUT days have a workoutId
    return data.pattern.every(p => p.dayType === 'REST' || p.workoutId !== null)
  },
  { message: 'All workout days must have a workout selected', path: ['pattern'] }
)

export type CreateRoutineFormData = z.infer<typeof createRoutineSchema>

// ==========================================
// Workout Form Schemas
// ==========================================

export const createWorkoutSchema = z.object({
  name: z.string().min(1, 'Workout name is required').max(100, 'Name must be 100 characters or less'),
  notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional(),
})

export type CreateWorkoutFormData = z.infer<typeof createWorkoutSchema>

// ==========================================
// Registration Form Schemas
// ==========================================

export const registrationPersonalSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50, 'Username must be 50 characters or less'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
})

export const registrationBodySchema = z.object({
  weight: z.number().min(20, 'Weight must be at least 20kg').max(300, 'Weight must be at most 300kg').nullable(),
  height: z.number().min(100, 'Height must be at least 100cm').max(250, 'Height must be at most 250cm').nullable(),
})

export const registrationSettingsSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required'),
  notificationFrequency: z.number().min(0).max(3),
})

export type RegistrationPersonalData = z.infer<typeof registrationPersonalSchema>
export type RegistrationBodyData = z.infer<typeof registrationBodySchema>
export type RegistrationSettingsData = z.infer<typeof registrationSettingsSchema>
