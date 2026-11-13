import { z } from 'zod'

const id = z.string().trim().min(1).max(200)
const text = z.string().trim().min(1).max(500)
const page = {
  cursor: id.optional(),
  limit: z.number().int().min(1).max(50).default(20),
}
const interval = z
  .strictObject({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
  })
  .refine(({ start, end }) => Date.parse(start) < Date.parse(end), {
    message: 'Start must precede end',
  })

export const readExercisesArgumentsSchema = z.strictObject({
  query: text.optional(),
  ids: z.array(id).max(50).optional(),
  equipment: z.array(text).max(50).optional(),
  muscles: z.array(text).max(50).optional(),
  movementPatterns: z.array(text).max(50).optional(),
  exclusions: z.array(id).max(50).optional(),
  ...page,
})
export const readWorkoutsArgumentsSchema = z.strictObject({ query: text.optional(), ...page })
export const readWorkoutArgumentsSchema = z.strictObject({ id })
export const readRecordsArgumentsSchema = z.strictObject({
  interval,
  workoutId: id.optional(),
  exerciseId: id.optional(),
  ...page,
})
export const readTrainingSummaryArgumentsSchema = z.strictObject({
  interval,
  workoutId: id.optional(),
  exerciseId: id.optional(),
  metrics: z
    .array(
      z.enum([
        'completed_sessions',
        'exercise_exposures',
        'recorded_repetitions',
        'timed_duration_seconds',
        'external_load_volume_kg',
        'best_recorded_sets',
      ])
    )
    .min(1)
    .max(6),
})
export const readCoachKnowledgeArgumentsSchema = z.strictObject({ query: text })

export const coachToolArguments = {
  readExercises: readExercisesArgumentsSchema,
  readWorkouts: readWorkoutsArgumentsSchema,
  readWorkout: readWorkoutArgumentsSchema,
  readRecords: readRecordsArgumentsSchema,
  readTrainingSummary: readTrainingSummaryArgumentsSchema,
  readCoachKnowledge: readCoachKnowledgeArgumentsSchema,
}
export const coachToolNameSchema = z.enum([
  'readExercises',
  'readWorkouts',
  'readWorkout',
  'readRecords',
  'readTrainingSummary',
  'readCoachKnowledge',
])
export type CoachToolName = z.infer<typeof coachToolNameSchema>

export const coachToolCallSchema = z.discriminatedUnion('name', [
  z.strictObject({ id, name: z.literal('readExercises'), arguments: readExercisesArgumentsSchema }),
  z.strictObject({ id, name: z.literal('readWorkouts'), arguments: readWorkoutsArgumentsSchema }),
  z.strictObject({ id, name: z.literal('readWorkout'), arguments: readWorkoutArgumentsSchema }),
  z.strictObject({ id, name: z.literal('readRecords'), arguments: readRecordsArgumentsSchema }),
  z.strictObject({
    id,
    name: z.literal('readTrainingSummary'),
    arguments: readTrainingSummaryArgumentsSchema,
  }),
  z.strictObject({
    id,
    name: z.literal('readCoachKnowledge'),
    arguments: readCoachKnowledgeArgumentsSchema,
  }),
])
export type CoachToolCall = z.infer<typeof coachToolCallSchema>

const errorSchema = z.strictObject({
  kind: z.literal('error'),
  code: z.enum([
    'not_found',
    'invalid_arguments',
    'stale_profile',
    'budget_exceeded',
    'unsupported_metric',
    'scope_exceeded',
    'cancelled',
    'unavailable',
  ]),
  message: text,
})
export const coachToolErrorSchema = errorSchema
const result = <T extends z.ZodType>(value: T) =>
  z.union([z.strictObject({ kind: z.literal('success'), data: value }), errorSchema])
const coverage = z.strictObject({
  queriedInterval: interval,
  localHistoryComplete: z.boolean(),
  limitations: z.array(text),
})
const paginated = <T extends z.ZodType>(item: T) =>
  z.strictObject({
    items: z.array(item).max(50),
    nextCursor: id.nullable(),
  })
const exercise = z.strictObject({
  id,
  sourceKey: id,
  name: text,
  equipment: z.array(text),
  equipmentCompatibility: z.enum(['compatible', 'incompatible', 'unknown']),
  muscles: z.array(text),
  movementPatterns: z.array(text),
  metadataReviewStatus: z.enum([
    'unreviewed',
    'pending_review',
    'model_reviewed',
    'human_reviewed',
  ]),
  instructions: z.array(text).optional(),
  limitations: z.array(text).optional(),
})
const workout = z.strictObject({ id, title: text })
const record = z.strictObject({
  id,
  workoutId: id.nullable(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  exercises: z.array(
    z.strictObject({
      exerciseId: id.nullable(),
      name: text,
      repetitions: z.array(z.number()),
      weightsKg: z.array(z.number()),
      durationSeconds: z.array(z.number()).nullable(),
    })
  ),
})
const metric = z.strictObject({
  id,
  kind: z.enum([
    'completed_sessions',
    'exercise_exposures',
    'recorded_repetitions',
    'timed_duration_seconds',
    'external_load_volume_kg',
    'best_recorded_sets',
    'latest_recorded_sets',
  ]),
  value: z.union([
    z.number(),
    z.array(
      z.strictObject({
        weightKg: z.number().nonnegative(),
        repetitions: z.number().int().positive(),
        exerciseId: id.nullable().optional(),
        exerciseName: text.optional(),
        recordId: id.optional(),
      })
    ),
  ]),
  evidenceIds: z.array(id),
  missingDataCount: z.number().int().nonnegative(),
  definition: text.optional(),
})
export const coachToolResults = {
  readExercises: result(paginated(exercise)),
  readWorkouts: result(paginated(workout)),
  readWorkout: result(
    z.strictObject({
      ...workout.shape,
      notes: text.nullable(),
      exercises: z.array(
        z.strictObject({
          exerciseId: id,
          repetitions: z.array(z.number()).nullable(),
          weightsKg: z.array(z.number()).nullable(),
          durationSeconds: z.array(z.number()).nullable(),
          notes: text.nullable(),
        })
      ),
    })
  ),
  readRecords: result(z.strictObject({ ...paginated(record).shape, coverage })),
  readTrainingSummary: result(z.strictObject({ metrics: z.array(metric), coverage })),
  readCoachKnowledge: result(
    z.strictObject({
      routing: z.literal('special_population_or_symptoms').optional(),
      cards: z
        .array(
          z.strictObject({
            id,
            claim: text,
            applicability: text,
            sourceIds: z.array(id).min(1),
            limitations: z.array(text).optional(),
            reviewStatus: z.enum(['pending_review', 'model_reviewed', 'human_reviewed']),
          })
        )
        .max(5),
      sources: z.array(
        z.strictObject({
          id,
          title: text,
          url: z.url(),
          version: text,
          license: text,
          attribution: text,
          redistributionPermission: text.optional(),
          trainingPermission: text.optional(),
          permissionBasis: text.optional(),
          role: z.enum(['authorship_terms', 'factual_support']).optional(),
          reviewStatus: z.enum(['pending_review', 'model_reviewed', 'human_reviewed']).optional(),
        })
      ),
    })
  ),
}

export type CoachToolArguments = { [K in CoachToolName]: z.infer<(typeof coachToolArguments)[K]> }
export type CoachToolResults = { [K in CoachToolName]: z.infer<(typeof coachToolResults)[K]> }
export type CoachToolError = z.infer<typeof coachToolErrorSchema>
