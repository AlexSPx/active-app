import { z } from 'zod'

const text = z.string().trim().min(1)
const reference = z.string().trim().min(1)

export const coachEvidenceReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('record'), id: reference }),
  z.strictObject({ kind: z.literal('workout'), id: reference }),
  z.strictObject({ kind: z.literal('knowledge'), id: reference }),
  z.strictObject({ kind: z.literal('metric'), id: reference }),
])

const answerBlockSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    text,
    evidence: z.array(coachEvidenceReferenceSchema),
  }),
  z.strictObject({ kind: z.literal('metric'), metricId: reference }),
])

const loadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('kilograms'), value: z.number().positive() }),
  z.strictObject({ kind: z.literal('bodyweight') }),
  z.strictObject({ kind: z.literal('user_selected') }),
])

const setSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('strength'),
    repetitions: z.number().int().positive(),
    load: loadSchema,
  }),
  z.strictObject({ kind: z.literal('timed'), durationSeconds: z.number().int().positive() }),
])

const guidanceSchema = z.strictObject({
  effort: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('reps_in_reserve'), value: z.number().min(0).max(10) }),
      z.strictObject({ kind: z.literal('rpe'), value: z.number().min(1).max(10) }),
    ])
    .optional(),
  restSeconds: z.number().int().nonnegative().optional(),
  repetitionsRange: z.strictObject({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  }).refine(({ min, max }) => min <= max, 'Minimum repetitions must not exceed maximum repetitions').optional(),
  cues: z.array(text).min(1).max(4).optional(),
  progression: text.optional(),
})

export const coachWorkoutSchema = z.strictObject({
  ref: reference,
  title: text,
  preparation: z.array(z.strictObject({ kind: z.enum(['warmup', 'cooldown']), description: text, durationSeconds: z.number().int().positive() })).optional(),
  schedule: z.strictObject({ estimatedSeconds: z.number().int().nonnegative(), transitionSeconds: z.number().int().nonnegative() }).optional(),
  exercises: z
    .array(
      z.strictObject({
        catalogId: reference,
        sets: z.array(setSchema).min(1),
        guidance: guidanceSchema.optional(),
      })
    )
    .min(1),
})

const routineSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('SEQUENTIAL'),
    title: text,
    days: z
      .array(
        z.discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('workout'), workoutRef: reference }),
          z.strictObject({ kind: z.literal('rest') }),
        ])
      )
      .min(1),
  }),
  z.strictObject({
    type: z.literal('WEEKLY_COMPLETION'),
    title: text,
    workoutRefs: z.array(reference).min(1),
  }),
])

const answerSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('answer'),
  blocks: z.array(answerBlockSchema).min(1),
  limitations: z.array(text),
})
const workoutDraftSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('workout_draft'),
  workout: coachWorkoutSchema,
  assumptions: z.array(text),
})
const routineDraftSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('routine_draft'),
  workouts: z.array(coachWorkoutSchema).min(1),
  routine: routineSchema,
  assumptions: z.array(text),
})
const clarificationSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('clarification'),
  question: text,
})
const cannotFulfillSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('cannot_fulfill'),
  reason: text,
})

const coachResponseShapeSchema = z.discriminatedUnion('kind', [
  answerSchema,
  workoutDraftSchema,
  routineDraftSchema,
  clarificationSchema,
  cannotFulfillSchema,
])

export const coachResponseSchema = coachResponseShapeSchema.superRefine((response, context) => {
  if (response.kind !== 'routine_draft') return

  const included = new Set<string>()
  for (const workout of response.workouts) {
    if (included.has(workout.ref)) {
      context.addIssue({ code: 'custom', message: `Duplicate workout reference: ${workout.ref}` })
    }
    included.add(workout.ref)
  }
  const referenced =
    response.routine.type === 'SEQUENTIAL'
      ? response.routine.days.flatMap((day) => (day.kind === 'workout' ? [day.workoutRef] : []))
      : response.routine.workoutRefs
  const scheduled = new Set<string>()
  for (const ref of referenced) {
    if (!included.has(ref))
      context.addIssue({ code: 'custom', message: `Unknown workout reference: ${ref}` })
    if (scheduled.has(ref))
      context.addIssue({ code: 'custom', message: `Duplicate routine workout reference: ${ref}` })
    scheduled.add(ref)
  }
  if (!referenced.length)
    context.addIssue({ code: 'custom', message: 'Routine must include at least one workout' })
  for (const ref of included) {
    if (!scheduled.has(ref))
      context.addIssue({ code: 'custom', message: `Unscheduled workout reference: ${ref}` })
  }
})

export type CoachResponse = z.infer<typeof coachResponseSchema>
export type CoachWorkout = z.infer<typeof coachWorkoutSchema>
export type CoachEvidenceReference = z.infer<typeof coachEvidenceReferenceSchema>

// Cross-reference checks run in validation.ts; JSON Schema cannot express them.
export function coachResponseJsonSchema() {
  return z.toJSONSchema(coachResponseShapeSchema)
}

// The engine still validates all generated responses with the complete production schema.
export function coachResponseVariantJsonSchema(kind: 'answer' | 'workout_draft' | 'routine_draft') {
  const selected = kind === 'answer' ? answerSchema : kind === 'workout_draft' ? workoutDraftSchema : routineDraftSchema
  return z.toJSONSchema(z.union([selected, clarificationSchema, cannotFulfillSchema]))
}
