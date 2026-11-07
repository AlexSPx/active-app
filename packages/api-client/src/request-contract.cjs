// Executable request contract; see README for cross-field and protocol semantics.
const { z } = require('zod')
const id = z.string().min(1).max(256).regex(/^(?!\.{1,2}(?![\s\S]))[\s\S]*$/)
const text = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value.trim().length > 0, 'must not be blank')
const notes = z.string().max(10000).nullable()
const version = z.number().int().nonnegative()
const entityVersion = version.positive()
const date = z.iso.date()
const instant = z.iso.datetime()
const zone = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value })
      return value.includes('/') || value === 'UTC'
    } catch {
      return false
    }
  }, 'IANA timezone required')
const obj = (shape) => z.object(shape).strict()
const identity = obj({
  sourceDatasetVersion: id.nullable(),
  sourceKey: id.nullable(),
  legacyNamespace: id.nullable(),
  legacyId: id.nullable(),
}).refine(
  (v) =>
    (v.sourceDatasetVersion !== null) === (v.sourceKey !== null) &&
    (v.legacyNamespace !== null) === (v.legacyId !== null) &&
    (v.sourceKey !== null || v.legacyId !== null),
  'provide at least one complete identity pair'
)
const sets = {
  reps: z.array(z.number().int().nonnegative()).default([]),
  weight: z.array(z.number().finite().nonnegative()).default([]),
  durationSeconds: z.array(z.number().finite().nonnegative()).default([]),
}
const aligned = (v) => v.reps.length === v.weight.length
const templateExercise = obj({
  exerciseId: id,
  ...sets,
  notes: notes.optional().default(null),
}).refine(aligned, 'reps and weight must align')
const template = obj({ exercises: z.array(templateExercise) })
const exerciseRecord = obj({
  exerciseId: id.nullable(),
  identity,
  exerciseName: text,
  ...sets,
  notes: notes.optional().default(null),
}).refine(aligned, 'reps and weight must align')
const patternItem = obj({
  dayIndex: z.number().int().nonnegative(),
  dayType: z.enum(['WORKOUT', 'REST']),
  workoutId: id.nullable(),
}).refine(
  (v) => (v.dayType === 'REST' ? v.workoutId === null : v.workoutId !== null),
  'dayType and workoutId disagree'
)
const pattern = z
  .array(patternItem)
  .min(1)
  .max(7)
  .refine(
    (items) => items.every((item, i) => item.dayIndex === i),
    'day indices must be contiguous from zero'
  )
const measurements = obj({
  weightKg: z.number().finite().positive().nullable(),
  heightCm: z.number().finite().positive().nullable(),
})
const profile = {
  username: z.string().regex(/^[A-Za-z0-9_]{3,30}$/),
  email: z.email().max(254),
  firstName: text,
  lastName: text,
  timezone: zone.nullable(),
  measurements: measurements.nullable(),
  registrationCompleted: z.boolean(),
}
const routineFields = {
  name: text,
  description: notes,
  routineType: z.enum(['SEQUENTIAL', 'WEEKLY_COMPLETION']),
  pattern,
  startDate: date,
  active: z.boolean(),
}
const optional = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()]))
const body = {
  'profile.update': obj({ baseVersion: entityVersion, ...optional(profile) }),
  'workout.create': obj({ title: text, notes: notes.optional().default(null), template }),
  'workout.update': obj({
    baseVersion: entityVersion,
    title: text.optional(),
    notes: notes.optional(),
    template: template.optional(),
  }),
  'routine.create': obj({
    name: text,
    description: notes.optional().default(null),
    routineType: routineFields.routineType.optional().default('SEQUENTIAL'),
    pattern,
    startDate: date,
    active: z.boolean().optional().default(false),
    profileBaseVersion: entityVersion.optional(),
  }).refine(
    (v) => !v.active || v.profileBaseVersion !== undefined,
    'active requires profileBaseVersion'
  ),
  'routine.update': obj({
    baseVersion: entityVersion,
    profileBaseVersion: entityVersion.optional(),
    ...optional(routineFields),
  }).refine(
    (v) => v.active === undefined || v.profileBaseVersion !== undefined,
    'active requires profileBaseVersion'
  ),
  'record.create': obj({
    clientRecordId: id,
    workoutId: id.nullable(),
    workoutTitle: text,
    notes: notes.optional().default(null),
    startTime: instant,
    completedAt: instant,
    completionTimezone: zone,
    exerciseRecords: z.array(exerciseRecord),
  }).refine(
    (v) => Date.parse(v.completedAt) >= Date.parse(v.startTime),
    'completion precedes start'
  ),
  'snapshot.put': obj({
    baseVersion: version,
    historyRevision: version,
    rulesVersion: id,
    currentStreak: version,
    longestStreak: version,
    nextWorkoutId: id.nullable(),
    nextWorkoutDeadline: date.nullable(),
    streakFreezeCount: version,
    lastWorkoutCountedDate: date.nullable(),
    weeklyCompletedWorkoutIds: z.array(id),
    currentWeekStart: date.nullable(),
  }),
  'preferences.put': obj({
    baseVersion: version,
    enabled: z.boolean(),
    schedule: z
      .array(z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/))
      .refine((v) => new Set(v).size === v.length, 'duplicate times'),
    timezone: zone,
  }),
}
const empty = obj({})
const query = {
  'profile.delete': obj({ baseVersion: entityVersion }),
  'catalog.search': obj({ name: text }),
  'workout.delete': obj({ baseVersion: entityVersion }),
  'routine.delete': obj({ baseVersion: entityVersion, profileBaseVersion: entityVersion }),
  'record.delete': obj({ baseVersion: entityVersion }),
}
const path = {
  'progression.logs': obj({ id }),
  'workout.update': obj({ id }),
  'workout.delete': obj({ id }),
  'routine.get': obj({ id }),
  'routine.update': obj({ id }),
  'routine.delete': obj({ id }),
  'record.delete': obj({ id }),
}
const activeOperations = [
  'discovery',
  'profile.get',
  'profile.update',
  'profile.delete',
  'legal.terms',
  'legal.privacy',
  'catalog.get',
  'catalog.search',
  'progression.logs',
  'workout.list',
  'workout.create',
  'workout.update',
  'workout.delete',
  'routine.list',
  'routine.get',
  'routine.active',
  'routine.create',
  'routine.update',
  'routine.delete',
  'history.revision',
  'record.list',
  'record.create',
  'record.delete',
  'snapshot.get',
  'snapshot.put',
  'preferences.get',
  'preferences.put',
]
module.exports = {
  requests: Object.fromEntries(
    activeOperations.map((id) => [
      id,
      { body: body[id] || z.null(), query: query[id] || empty, path: path[id] || empty },
    ])
  ),
  identity,
}
