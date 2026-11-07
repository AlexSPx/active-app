const { z } = require('zod')
const identity = z.object({ sourceDatasetVersion: z.string().min(1).max(256).nullable(), sourceKey: z.string().min(1).max(256).nullable(), legacyNamespace: z.string().min(1).max(256).nullable(), legacyId: z.string().min(1).max(256).nullable() }).refine(v => (v.sourceDatasetVersion !== null) === (v.sourceKey !== null) && (v.legacyNamespace !== null) === (v.legacyId !== null) && (v.sourceKey !== null || v.legacyId !== null))
const id = z.string().min(1).max(256)
const version = z.number().int().nonnegative()
const positiveVersion = version.positive()
const instant = z.iso.datetime()
const date = z.iso.date()
const zone = z.string().min(1).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return value.includes('/') || value === 'UTC' } catch { return false }
})
const number = z.number().finite().nonnegative()
const category = z.enum(['STRENGTH', 'STRETCHING', 'PLYOMETRICS', 'STRONGMAN', 'POWERLIFTING', 'CARDIO', 'OLYMPIC_WEIGHTLIFTING']).nullable()
const sets = { reps: z.array(version), weight: z.array(number), durationSeconds: z.array(number) }
const achievement = { achievedOneRmValue: number.nullable(), achievedOneRmSetIndex: version.nullable(), achievedTotalVolumeValue: number.nullable() }
const times = { createdAt: instant, updatedAt: instant }
const exercise = z.object({ id, sourceKey: id, retired: z.boolean(), name: z.string(), level: z.enum(['BEGINNER', 'INTERMEDIATE', 'EXPERT']).nullable(), force: z.enum(['PULL', 'PUSH', 'STATIC']).nullable(), mechanic: z.enum(['COMPOUND', 'ISOLATION']).nullable(), equipment: z.enum(['BODY_ONLY', 'MACHINE', 'OTHER', 'FOAM_ROLL', 'KETTLEBELLS', 'DUMBBELL', 'CABLE', 'BARBELL', 'BANDS', 'MEDICINE_BALL', 'EXERCISE_BALL', 'E_Z_CURL_BAR']).nullable(), primaryMuscles: z.array(z.string()), secondaryMuscles: z.array(z.string()), instructions: z.array(z.string()), category })
const templateExercise = z.object({ exerciseId: id, exerciseTitle: z.string(), ...sets, category, primaryMuscles: z.array(z.string()), secondaryMuscles: z.array(z.string()) })
const workout = z.object({ id, title: z.string(), notes: z.string().nullable(), ...times, version: positiveVersion, workoutTemplate: z.object({ id, exercises: z.array(templateExercise), ...times }) })
const pattern = z.array(z.object({ dayIndex: version, dayType: z.enum(['WORKOUT', 'REST']), workoutId: id.nullable() })).min(1).max(7).refine(items => items.every((v, i) => v.dayIndex === i && (v.dayType === 'REST' ? v.workoutId === null : v.workoutId !== null)))
const routine = z.object({ id, name: z.string(), description: z.string().nullable(), userId: id, routineType: z.enum(['SEQUENTIAL', 'WEEKLY_COMPLETION']), pattern, startDate: date, ...times, version: positiveVersion, profileVersion: positiveVersion })
const recordExercise = z.object({ exerciseId: id.nullable(), exerciseName: z.string(), ...sets, notes: z.string().nullable(), ...achievement, identity }).refine(v => v.reps.length === v.weight.length)
const record = z.object({ id, clientRecordId: id, workoutId: id.nullable(), workoutTitle: z.string(), notes: z.string().nullable(), createdAt: instant, startTime: instant, completedAt: instant, completionTimezone: zone, version: positiveVersion, exerciseRecords: z.array(recordExercise) }).refine(v => Date.parse(v.completedAt) >= Date.parse(v.startTime))
const snapshot = z.object({ version: positiveVersion, historyRevision: version, rulesVersion: id, currentStreak: version, longestStreak: version, nextWorkoutId: id.nullable(), nextWorkoutDeadline: date.nullable(), streakFreezeCount: version, lastWorkoutCountedDate: date.nullable(), weeklyCompletedWorkoutIds: z.array(id), currentWeekStart: date.nullable() })
const preferences = z.object({ version: positiveVersion, enabled: z.boolean(), schedule: z.array(z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)), timezone: zone })
const profile = z.object({ id, email: z.email(), username: z.string(), firstName: z.string(), lastName: z.string(), createdAt: instant, timezone: zone.nullable(), activeRoutineId: id.nullable(), measurements: z.object({ weightKg: z.number().positive().nullable(), heightCm: z.number().positive().nullable() }).nullable(), registrationCompleted: z.boolean(), profileVersion: positiveVersion })
const discovery = z.object({ instanceId: id, contractVersion: z.literal('1'), issuer: z.url(), authorizationEndpoint: z.url(), tokenEndpoint: z.url(), endSessionEndpoint: z.url() })
const error = z.object({ code: z.string().min(1), message: z.string(), currentVersion: version.nullable() })
const responses = {
  discovery, 'profile.get': profile, 'profile.update': profile, 'profile.delete': z.object({ deletedUserId: id }),
  'legal.terms': z.string(), 'legal.privacy': z.string(),
  'catalog.get': z.object({ catalogVersion: version, sourceDatasetVersion: id, mappingComplete: z.boolean(), unresolvedSourceKeys: z.array(id), unresolvedLegacyIds: z.array(id), items: z.array(exercise) }), 'catalog.search': z.array(exercise),
  'progression.logs': z.array(z.object({ exerciseRecordId: id, exerciseId: id, exerciseName: z.string(), createdAt: instant, ...sets, ...achievement })),
  'workout.list': z.array(workout), 'workout.create': workout, 'workout.update': workout, 'workout.delete': z.object({ deletedWorkoutId: id, routineVersions: z.array(z.object({ id, version: positiveVersion })) }),
  'routine.list': z.array(routine), 'routine.get': routine, 'routine.active': routine, 'routine.create': routine, 'routine.update': routine, 'routine.delete': z.object({ deletedRoutineId: id, profileVersion: positiveVersion }),
  'history.revision': z.object({ historyRevision: version }), 'record.list': z.array(record), 'record.create': z.object({ workoutRecord: record, historyRevision: version }), 'record.delete': z.object({ deletedRecordId: id, historyRevision: version }),
  'snapshot.get': snapshot, 'snapshot.put': snapshot, 'preferences.get': preferences, 'preferences.put': preferences,
}
module.exports = { responses, error }
