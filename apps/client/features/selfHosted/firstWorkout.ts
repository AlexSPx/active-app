import type { SQLiteDatabase } from 'expo-sqlite'
import { z } from 'zod'
import type { Operations } from '../../../../packages/api-client/src'
import { requests } from '../../../../packages/api-client/src/request-contract.cjs'
import { resolveExerciseIdentities } from '../../lib/data/catalogIdentity'
import type { DevicePreferences, DeviceProfile } from './account'
import type { ConnectionScope } from './storage'
import type { User } from '../../types/api'

const exercise = z.object({
  exerciseId: z.string().min(1),
  reps: z
    .array(z.number())
    .nullish()
    .transform((value) => value ?? []),
  weight: z
    .array(z.number())
    .nullish()
    .transform((value) => value ?? []),
  durationSeconds: z
    .array(z.number())
    .nullish()
    .transform((value) => value ?? []),
  notes: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
})
const template = z.object({ exercises: z.array(exercise) })

type Body = Operations['workout.create']['body']
const bodySchema: z.ZodType<Body> = z.object({
  title: z.string().min(1),
  notes: z.string().nullable(),
  template: z.object({ exercises: z.array(exercise) }),
})
function parseBody(value: unknown): Body {
  return bodySchema.parse(requests['workout.create'].body.parse(value))
}
export type SourceSnapshot = {
  user: User
  workoutId: string
  workout: Body
  sourceRow: string
  profile: DeviceProfile
  preferences: DevicePreferences
}

type ImportRow = {
  import_id: string
  operation_key: string
  snapshot: string
  request_payload: string | null
  profile_complete: number
  remote_id: string | null
  remote_version: number | null
}

async function ensureTable(db: SQLiteDatabase) {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS first_workout_import (
    instance_id TEXT NOT NULL, account_id TEXT NOT NULL,
    import_id TEXT NOT NULL, operation_key TEXT NOT NULL, snapshot TEXT NOT NULL,
    request_payload TEXT, profile_complete INTEGER NOT NULL DEFAULT 0,
    remote_id TEXT, remote_version INTEGER,
    PRIMARY KEY (instance_id, account_id)
  )`)
}

export async function captureFirstWorkout(
  db: SQLiteDatabase,
  user: User,
  profile: DeviceProfile,
  preferences: DevicePreferences
): Promise<SourceSnapshot> {
  const row = await db.getFirstAsync<{
    id: string
    title: string
    notes: string | null
    workout_template: string
  }>('SELECT * FROM workouts WHERE is_deleted = 0 ORDER BY created_at DESC, id DESC LIMIT 1')
  if (!row) throw new Error('Create a workout on this device before attaching it.')
  const exercises = template.parse(JSON.parse(row.workout_template)).exercises
  const workout: Body = parseBody({
    title: row.title,
    notes: row.notes,
    template: { exercises },
  })
  return { user, workoutId: row.id, workout, sourceRow: JSON.stringify(row), profile, preferences }
}

export async function prepareFirstWorkout(
  db: SQLiteDatabase,
  scope: ConnectionScope,
  snapshot: SourceSnapshot,
  importId: string,
  operationKey: string
): Promise<SourceSnapshot> {
  await ensureTable(db)
  await db.runAsync(
    `INSERT OR IGNORE INTO first_workout_import
     (instance_id, account_id, import_id, operation_key, snapshot) VALUES (?, ?, ?, ?, ?)`,
    scope.instanceId,
    scope.accountId,
    importId,
    operationKey,
    JSON.stringify(snapshot)
  )
  const saved = await readFirstWorkout(db, scope)
  if (!saved) throw new Error('Could not save the workout attachment')
  return sourceSnapshot(saved)
}

export async function readFirstWorkout(db: SQLiteDatabase, scope: ConnectionScope) {
  await ensureTable(db)
  return db.getFirstAsync<ImportRow>(
    'SELECT * FROM first_workout_import WHERE instance_id = ? AND account_id = ?',
    scope.instanceId,
    scope.accountId
  )
}

export function sourceSnapshot(row: ImportRow): SourceSnapshot {
  return JSON.parse(row.snapshot)
}

export async function markProfileComplete(db: SQLiteDatabase, scope: ConnectionScope) {
  await db.runAsync(
    'UPDATE first_workout_import SET profile_complete = 1 WHERE instance_id = ? AND account_id = ?',
    scope.instanceId,
    scope.accountId
  )
}

export async function freezeWorkoutRequest(
  db: SQLiteDatabase,
  scope: ConnectionScope,
  row: ImportRow,
  catalog: unknown
): Promise<Body> {
  if (row.request_payload) return parseBody(JSON.parse(row.request_payload))
  const snapshot = sourceSnapshot(row)
  const resolved = resolveExerciseIdentities(
    catalog,
    snapshot.workout.template.exercises.map((item) => item.exerciseId)
  )
  if (resolved.some((item) => item.kind === 'unresolved'))
    throw new Error(
      'A workout exercise could not be matched to this server. Your device data is safe.'
    )
  const body: Body = parseBody({
    ...snapshot.workout,
    template: {
      exercises: snapshot.workout.template.exercises.map((item, index) => {
        const identity = resolved[index]
        if (identity.kind !== 'resolved') throw new Error('Exercise identity could not be resolved')
        return { ...item, exerciseId: identity.id }
      }),
    },
  })
  await db.runAsync(
    'UPDATE first_workout_import SET request_payload = ? WHERE instance_id = ? AND account_id = ? AND request_payload IS NULL',
    JSON.stringify(body),
    scope.instanceId,
    scope.accountId
  )
  const saved = await readFirstWorkout(db, scope)
  if (!saved?.request_payload) throw new Error('Could not save the workout request')
  return parseBody(JSON.parse(saved.request_payload))
}

export async function acknowledgeFirstWorkout(
  db: SQLiteDatabase,
  scope: ConnectionScope,
  result: Operations['workout.create']['response']
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE first_workout_import SET remote_id = ?, remote_version = ? WHERE instance_id = ? AND account_id = ?',
      result.id,
      result.version,
      scope.instanceId,
      scope.accountId
    )
  })
}

export async function seedAttachedProfile(
  db: SQLiteDatabase,
  ownerId: string,
  snapshot: SourceSnapshot
) {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS user_profile (id INTEGER PRIMARY KEY CHECK (id = 1), user_json TEXT NOT NULL)'
  )
  await db.runAsync(
    'INSERT OR IGNORE INTO user_profile (id, user_json) VALUES (1, ?)',
    JSON.stringify({
      ...snapshot.user,
      ...snapshot.profile,
      id: ownerId,
      activeRoutineId: null,
    })
  )
}
