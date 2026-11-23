import { z } from 'zod'

const title = z.string().trim().min(1)
const position = z.number().int().positive()
const count = z.number().int().positive().max(100)
const kilograms = z.number().nonnegative()
const seconds = z.number().int().positive()
const repetitions = z.number().int().positive()

const exerciseSets = z
  .array(
    z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('strength'),
        repetitions,
        load: z.discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('bodyweight') }),
          z.strictObject({ kind: z.literal('kilograms'), value: z.number().positive() }),
        ]),
      }),
      z.strictObject({ kind: z.literal('timed'), durationSeconds: seconds }),
    ])
  )
  .min(1)
  .max(100)

export const coachLibraryChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('rename'), title }),
  z.strictObject({ kind: z.literal('set_reps'), position, reps: repetitions }),
  z.strictObject({ kind: z.literal('set_weight'), position, kilograms }),
  z.strictObject({ kind: z.literal('set_count'), position, count }),
  z.strictObject({ kind: z.literal('set_duration'), position, seconds }),
  z.strictObject({ kind: z.literal('remove_exercise'), position }),
  z.strictObject({ kind: z.literal('move_exercise'), position, toPosition: position }),
  z.strictObject({ kind: z.literal('add_exercise'), catalogId: title, sets: exerciseSets }),
  z.strictObject({
    kind: z.literal('replace_exercise'),
    position,
    catalogId: title,
    sets: exerciseSets,
  }),
  z.strictObject({ kind: z.literal('insert_workout'), position, workoutId: title }),
  z.strictObject({ kind: z.literal('insert_rest'), position }),
  z.strictObject({ kind: z.literal('remove_day'), position }),
  z.strictObject({ kind: z.literal('move_day'), position, toPosition: position }),
  z.strictObject({ kind: z.literal('replace_day_workout'), position, workoutId: title }),
])

export const coachLibraryEditSchema = z.strictObject({
  target: z.strictObject({
    kind: z.enum(['workout', 'routine']),
    id: z.string().min(1),
    title: z.string().min(1),
    updatedAt: z.string(),
  }),
  change: coachLibraryChangeSchema,
  summary: z.array(title).min(1),
})

export type CoachLibraryChange = z.infer<typeof coachLibraryChangeSchema>
export type CoachLibraryEdit = z.infer<typeof coachLibraryEditSchema>
