import type { SQLiteDatabase } from 'expo-sqlite'
import {
  coachLibraryChangeSchema,
  coachLibraryEditSchema,
  type CoachLibraryChange,
  type CoachLibraryEdit,
} from '../../features/coach/libraryContracts'
import { estimateWorkoutSeconds } from '../../features/coach/workoutPlanner'
import { launchFacade } from '../../features/launch/launchFacade'
import { reindexPattern } from '../../features/routines/routineDraft'
import type {
  ApiWorkout,
  ApiWorkoutExercise,
  ApiWorkoutTemplate,
  CoachPrescription,
} from '../../types/api'
import type { Routine, RoutinePatternItem, RoutineType } from '../../types/routine'
import { exerciseCatalog } from '../exercises/catalog'
import { isCurrentProfile, type ProfileScope } from '../profileScope'
import { syncEngine } from '../sync'
import { nextUpdatedAt } from './BaseRepository'
import { RoutineRepository } from './RoutineRepository'
import { WorkoutRepository } from './WorkoutRepository'

type Target = CoachLibraryEdit['target']
type Library = { workouts: ApiWorkout[]; routines: Routine[]; activeRoutineId?: string | null }
type ChangeWithSets = Extract<CoachLibraryChange, { sets: unknown }>
type Set = CoachPrescription['sets'][number]
type SetChange = Extract<
  CoachLibraryChange,
  { kind: 'set_reps' | 'set_weight' | 'set_count' | 'set_duration' }
>

const staleTarget = 'This saved item changed or was deleted. Open a new review.'
const noChange = 'This review would make no changes.'

function positionIndex(position: number, length: number) {
  if (position > length) throw new Error('The requested position is outside the saved list.')
  return position - 1
}

function renamed(current: string, title: string) {
  if (title.length > 100) throw new Error('Keep the name within 100 characters.')
  if (title === current) throw new Error(noChange)
  return [`Rename “${current}” to “${title}”.`]
}

function exerciseName(exercise: ApiWorkoutExercise) {
  return exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' ')
}

function buildExercise({ catalogId, sets }: ChangeWithSets): ApiWorkoutExercise {
  const exercise = exerciseCatalog.find((candidate) => candidate.id === catalogId)
  if (!exercise || exercise.retired || exercise.setupReviewStatus !== 'reviewed')
    throw new Error('Choose an exercise with reviewed setup from the local catalog.')
  const timed = sets[0].kind === 'timed'
  if (exercise.category === 'CARDIO' && !timed)
    throw new Error('Choose timed intervals for this cardio exercise.')
  if (sets.some((set) => (set.kind === 'timed') !== timed))
    throw new Error('Use either strength sets or timed intervals for an exercise.')

  return {
    exerciseId: exercise.id,
    exerciseTitle: exercise.name,
    category: exercise.category,
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles: exercise.secondaryMuscles,
    reps: sets.flatMap((set) => (set.kind === 'strength' ? [set.repetitions] : [])),
    weight: sets.flatMap((set) =>
      set.kind === 'strength' ? [set.load.kind === 'kilograms' ? set.load.value : 0] : []
    ),
    durationSeconds: timed
      ? sets.flatMap((set) => (set.kind === 'timed' ? [set.durationSeconds] : []))
      : null,
    coachPrescription: { sets },
  }
}

function describeSets(sets: Set[]) {
  const groups: { count: number; description: string }[] = []
  for (const set of sets) {
    const description =
      set.kind === 'timed'
        ? `${set.durationSeconds} seconds`
        : `${set.repetitions} reps at ${set.load.kind === 'bodyweight' ? 'bodyweight' : `${set.load.value} kg`}`
    const previous = groups.at(-1)
    if (previous?.description === description) previous.count += 1
    else groups.push({ description, count: 1 })
  }
  return groups.map(({ count, description }) => `${count} × ${description}`).join(', ')
}

function readSets(exercise: ApiWorkoutExercise): Set[] {
  const prescription = exercise.coachPrescription?.sets
  const timed = exercise.category === 'CARDIO' || prescription?.[0]?.kind === 'timed'
  const invalid = () => new Error(`Check the saved sets for ${exerciseName(exercise)}.`)
  const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0
  const validWeight = (value: number) => Number.isFinite(value) && value >= 0
  if (exercise.coachPrescription && !Array.isArray(prescription)) throw invalid()
  let sets: Set[]
  if (timed) {
    const stored = exercise.durationSeconds
    const durations = typeof stored === 'number' ? [stored] : stored
    if (!Array.isArray(durations) || !durations.length || !durations.every(positiveInteger))
      throw invalid()
    sets = durations.map((durationSeconds) => ({ kind: 'timed', durationSeconds }))
  } else {
    const { reps, weight } = exercise
    if (
      !Array.isArray(reps) ||
      !Array.isArray(weight) ||
      !reps.length ||
      reps.length !== weight.length ||
      !reps.every(positiveInteger) ||
      !weight.every(validWeight)
    )
      throw invalid()
    sets = reps.map((repetitions, index) => {
      const saved = prescription?.[index]
      return {
        kind: 'strength',
        repetitions,
        load:
          saved?.kind === 'strength' && saved.load?.kind === 'bodyweight'
            ? saved.load
            : { kind: 'kilograms', value: weight[index] },
      }
    })
  }
  if (
    prescription &&
    (prescription.length !== sets.length ||
      prescription.some((saved, index) => {
        const set = sets[index]
        if (saved?.kind === 'timed' && set.kind === 'timed')
          return saved.durationSeconds !== set.durationSeconds
        if (saved?.kind === 'strength' && set.kind === 'strength')
          return (
            saved.repetitions !== set.repetitions ||
            saved.load?.kind !== set.load.kind ||
            (saved.load.kind === 'kilograms' &&
              set.load.kind === 'kilograms' &&
              saved.load.value !== set.load.value) ||
            (saved.load.kind === 'bodyweight' && exercise.weight[index] !== 0)
          )
        return true
      }))
  )
    throw invalid()
  return prescription ?? sets
}

function editSets(exercise: ApiWorkoutExercise, change: SetChange) {
  const previous = readSets(exercise)
  const timed = previous[0].kind === 'timed'
  if (change.kind === 'set_duration' && !timed)
    throw new Error('Duration applies to timed intervals.')
  if ((change.kind === 'set_reps' || change.kind === 'set_weight') && timed)
    throw new Error('Reps and weight apply to strength sets.')

  const sets: Set[] =
    change.kind === 'set_count'
      ? Array.from(
          { length: change.count },
          (_, index) => previous[Math.min(index, previous.length - 1)]
        )
      : previous.map((set) => {
          if (change.kind === 'set_duration' && set.kind === 'timed')
            return { ...set, durationSeconds: change.seconds }
          if (change.kind === 'set_reps' && set.kind === 'strength')
            return { ...set, repetitions: change.reps }
          if (change.kind === 'set_weight' && set.kind === 'strength')
            return { ...set, load: { kind: 'kilograms', value: change.kilograms } }
          return set
        })
  const before = describeSets(previous)
  const after = describeSets(sets)
  if (before === after) throw new Error(noChange)

  const updated = { ...exercise }
  if (timed) {
    updated.durationSeconds = sets.flatMap((set) =>
      set.kind === 'timed' ? [set.durationSeconds] : []
    )
  } else {
    if (change.kind === 'set_count' || change.kind === 'set_reps')
      updated.reps = sets.flatMap((set) => (set.kind === 'strength' ? [set.repetitions] : []))
    if (change.kind === 'set_count' || change.kind === 'set_weight')
      updated.weight = sets.flatMap((set) =>
        set.kind === 'strength' ? [set.load.kind === 'kilograms' ? set.load.value : 0] : []
      )
  }
  if (exercise.coachPrescription) {
    const guidance = exercise.coachPrescription.guidance
    const range = guidance?.repetitionsRange
    if (
      change.kind === 'set_reps' &&
      guidance &&
      range &&
      (change.reps < range.min || change.reps > range.max)
    ) {
      const { repetitionsRange, ...remaining } = guidance
      updated.coachPrescription = { ...exercise.coachPrescription, sets, guidance: remaining }
    } else {
      updated.coachPrescription = { ...exercise.coachPrescription, sets }
    }
  }
  return {
    exercise: updated,
    summary: `Change ${exerciseName(exercise)} from ${before} to ${after}.`,
  }
}

function updatedTemplate(template: ApiWorkoutTemplate, exercises: ApiWorkoutExercise[]) {
  const schedule = template.coachSchedule
  if (!schedule) return { ...template, exercises }
  return {
    ...template,
    exercises,
    coachSchedule: {
      ...schedule,
      estimatedSeconds: estimateWorkoutSeconds({
        ref: template.id,
        title: template.id,
        preparation: schedule.preparation,
        exercises: exercises.map((exercise) => ({
          catalogId: exercise.exerciseId,
          sets: readSets(exercise),
          guidance: exercise.coachPrescription?.guidance,
        })),
      }),
      transitionSeconds: Math.max(0, exercises.length - 1) * 30,
    },
  }
}

function workoutChange(
  workout: Pick<ApiWorkout, 'title' | 'workoutTemplate'>,
  change: CoachLibraryChange
): { title: string; template?: ApiWorkoutTemplate; summary: string[] } {
  if (change.kind === 'rename')
    return { title: change.title, summary: renamed(workout.title, change.title) }
  const template = workout.workoutTemplate
  const exercises = [...template.exercises]
  let summary: string
  if (change.kind === 'add_exercise') {
    const exercise = buildExercise(change)
    exercises.push(exercise)
    summary = `Add ${exerciseName(exercise)} at position ${exercises.length} with ${describeSets(change.sets)}.`
  } else {
    switch (change.kind) {
      case 'remove_exercise': {
        const index = positionIndex(change.position, exercises.length)
        const exercise = exercises[index]
        exercises.splice(index, 1)
        summary = `Remove ${exerciseName(exercise)} from position ${change.position}.`
        break
      }
      case 'move_exercise': {
        const index = positionIndex(change.position, exercises.length)
        const destination = positionIndex(change.toPosition, exercises.length)
        const exercise = exercises[index]
        exercises.splice(index, 1)
        exercises.splice(destination, 0, exercise)
        summary = `Move ${exerciseName(exercise)} from position ${change.position} to ${change.toPosition}.`
        break
      }
      case 'replace_exercise': {
        const index = positionIndex(change.position, exercises.length)
        const previous = exercises[index]
        const exercise = buildExercise(change)
        if (previous.exerciseId === exercise.exerciseId)
          throw new Error('Choose a different exercise to replace the saved exercise.')
        exercises[index] = exercise
        summary = `Replace ${exerciseName(previous)} at position ${change.position} with ${exerciseName(exercise)} using ${describeSets(change.sets)}.`
        break
      }
      case 'set_reps':
      case 'set_weight':
      case 'set_count':
      case 'set_duration': {
        const index = positionIndex(change.position, exercises.length)
        const edited = editSets(exercises[index], change)
        exercises[index] = edited.exercise
        summary = edited.summary
        break
      }
      default:
        throw new Error('This change requires a saved routine.')
    }
  }

  if (!exercises.length) throw new Error('Keep at least one exercise in the workout.')
  if (JSON.stringify(exercises) === JSON.stringify(template.exercises)) throw new Error(noChange)
  return {
    title: workout.title,
    template: updatedTemplate(template, exercises),
    summary: [summary],
  }
}

function routineChange(
  routine: Pick<Routine, 'name' | 'routineType' | 'pattern'>,
  change: CoachLibraryChange,
  workouts: ApiWorkout[]
): { name: string; pattern?: RoutinePatternItem[]; summary: string[] } {
  if (change.kind === 'rename')
    return { name: change.title, summary: renamed(routine.name, change.title) }
  const original = reindexPattern([...routine.pattern].sort((a, b) => a.dayIndex - b.dayIndex))
  const pattern = [...original]
  const weekly = routine.routineType === 'WEEKLY_COMPLETION'
  const slot = weekly ? 'session' : 'day'
  const byId = new Map(workouts.map((workout) => [workout.id, workout]))
  const dayName = (day: RoutinePatternItem) =>
    day.dayType === 'REST' ? 'rest' : (byId.get(day.workoutId ?? '')?.title ?? 'unsaved workout')
  let summary: string
  switch (change.kind) {
    case 'insert_rest': {
      if (weekly) throw new Error('Rest days require a sequential routine.')
      const index = positionIndex(change.position, pattern.length + 1)
      pattern.splice(index, 0, { dayIndex: change.position, dayType: 'REST', workoutId: null })
      summary = `Insert a rest day at day ${change.position}.`
      break
    }
    case 'insert_workout':
    case 'replace_day_workout': {
      const workout = byId.get(change.workoutId)
      if (!workout) throw new Error('Choose a workout that is still saved.')
      const insert = change.kind === 'insert_workout'
      const index = positionIndex(change.position, pattern.length + (insert ? 1 : 0))
      const day = pattern[index]
      pattern.splice(index, insert ? 0 : 1, {
        ...(insert ? {} : day),
        dayIndex: change.position,
        dayType: 'WORKOUT',
        workoutId: workout.id,
      })
      summary = insert
        ? `Insert “${workout.title}” at ${slot} ${change.position}.`
        : `Replace ${slot} ${change.position} (${dayName(day)}) with “${workout.title}”.`
      break
    }
    case 'remove_day': {
      const index = positionIndex(change.position, pattern.length)
      const day = pattern[index]
      pattern.splice(index, 1)
      summary = `Remove ${slot} ${change.position} (${dayName(day)}).`
      break
    }
    case 'move_day': {
      const index = positionIndex(change.position, pattern.length)
      const destination = positionIndex(change.toPosition, pattern.length)
      const day = pattern[index]
      pattern.splice(index, 1)
      pattern.splice(destination, 0, day)
      summary = `Move ${dayName(day)} from ${slot} ${change.position} to ${slot} ${change.toPosition}.`
      break
    }
    default:
      throw new Error('This change requires a saved workout.')
  }

  const training = pattern.filter((day) => day.dayType === 'WORKOUT')
  if (!training.length) throw new Error('Keep at least one workout in the routine.')
  if (training.some((day) => !byId.has(day.workoutId ?? '')))
    throw new Error('The routine refers to a workout that is no longer saved.')
  if (weekly && new Set(training.map((day) => day.workoutId)).size !== training.length)
    throw new Error('Choose each weekly workout once.')
  const reindexed = reindexPattern(pattern)
  if (JSON.stringify(reindexed) === JSON.stringify(original)) throw new Error(noChange)
  return { name: routine.name, pattern: reindexed, summary: [summary] }
}

function checkTarget(updatedAt: string, title: string, target: Target) {
  if (updatedAt !== target.updatedAt || title !== target.title) throw new Error(staleTarget)
}

export function previewCoachLibraryEdit(
  target: Target,
  change: CoachLibraryChange,
  library: Library
): string[] {
  const parsed = coachLibraryChangeSchema.parse(change)
  if (target.kind === 'workout') {
    const workout = library.workouts.find((item) => item.id === target.id)
    if (!workout) throw new Error(staleTarget)
    checkTarget(workout.updatedAt, workout.title, target)
    return workoutChange(workout, parsed).summary
  }
  if (target.kind === 'routine') {
    const routine = library.routines.find((item) => item.id === target.id)
    if (!routine) throw new Error(staleTarget)
    checkTarget(routine.updatedAt, routine.name, target)
    return routineChange(routine, parsed, library.workouts).summary
  }
  throw new Error(staleTarget)
}

export class CoachLibraryRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async read(): Promise<Library> {
    const routinesRepo = new RoutineRepository(this.db)
    const [workouts, routines, activeRoutine] = await Promise.all([
      new WorkoutRepository(this.db).getAll(),
      routinesRepo.getAll(),
      routinesRepo.getActive(),
    ])
    return { workouts, routines, activeRoutineId: activeRoutine?.id ?? null }
  }

  async save(input: {
    edit: CoachLibraryEdit
    revision: string
    scope: ProfileScope
    isAllowed: () => boolean
  }): Promise<void> {
    if (!input.revision.trim()) throw new Error('An edit revision is required.')
    const edit = coachLibraryEditSchema.parse(input.edit)
    const serialized = JSON.stringify(edit)
    const revision = JSON.stringify([input.revision, 'library_edit'])
    const assertScope = () => {
      if (!isCurrentProfile(input.scope) || !input.isAllowed())
        throw new Error('Profile changed while saving the edit.')
      if (launchFacade.api.backendMode() !== 'device')
        throw new Error('Coach library edits are available in device mode.')
    }
    assertScope()
    await syncEngine.withIdRemapLock(async () => {
      assertScope()
      await this.db.withTransactionAsync(async () => {
        const existing = await this.db.getFirstAsync<{ draft_json: string }>(
          'SELECT draft_json FROM coach_draft_saves WHERE revision = ?',
          revision
        )
        assertScope()
        if (existing) {
          if (existing.draft_json !== serialized)
            throw new Error('This edit revision was already saved with different content.')
          return
        }
        const { target, change } = edit
        const now = nextUpdatedAt(target.updatedAt)
        const checkSummary = (summary: string[]) => {
          if (JSON.stringify(summary) !== JSON.stringify(edit.summary)) throw new Error(staleTarget)
          assertScope()
        }
        let changes: number
        if (target.kind === 'workout') {
          // Use the stored template so read-time exercise labels do not overwrite legacy metadata.
          const row = await this.db.getFirstAsync<{
            title: string
            created_at: string | null
            updated_at: string | null
            workout_template: string | null
          }>(
            'SELECT title, created_at, updated_at, workout_template FROM workouts WHERE id = ? AND is_deleted = 0',
            target.id
          )
          if (!row) throw new Error(staleTarget)
          const createdAt = row.created_at || ''
          const updatedAt = row.updated_at || createdAt
          checkTarget(updatedAt, row.title, target)
          const workoutTemplate: ApiWorkoutTemplate =
            change.kind === 'rename'
              ? { id: target.id, exercises: [], createdAt, updatedAt }
              : JSON.parse(row.workout_template || '{}')
          if (!Array.isArray(workoutTemplate?.exercises))
            throw new Error('The saved workout template is invalid.')
          const mutation = workoutChange({ title: row.title, workoutTemplate }, change)
          checkSummary(mutation.summary)
          const template = mutation.template
            ? JSON.stringify({ ...mutation.template, updatedAt: now })
            : row.workout_template
          const result = await this.db.runAsync(
            `UPDATE workouts SET title = ?, workout_template = ?, updated_at = ?, is_synced = 0
             WHERE id = ? AND is_deleted = 0 AND title = ? AND updated_at IS ? AND workout_template IS ?`,
            mutation.title,
            template,
            now,
            target.id,
            row.title,
            row.updated_at,
            row.workout_template
          )
          changes = result.changes
        } else {
          const row = await this.db.getFirstAsync<{
            name: string
            routine_type: RoutineType | null
            updated_at: string | null
            pattern: string | null
          }>(
            'SELECT name, routine_type, updated_at, pattern FROM routines WHERE id = ? AND is_deleted = 0',
            target.id
          )
          if (!row) throw new Error(staleTarget)
          checkTarget(row.updated_at || '', row.name, target)
          const pattern: RoutinePatternItem[] =
            change.kind === 'rename' ? [] : JSON.parse(row.pattern || '[]')
          if (!Array.isArray(pattern)) throw new Error('The saved routine pattern is invalid.')
          const workouts =
            change.kind === 'rename' ? [] : await new WorkoutRepository(this.db).getAll()
          const mutation = routineChange(
            { name: row.name, routineType: row.routine_type ?? undefined, pattern },
            change,
            workouts
          )
          checkSummary(mutation.summary)
          const result = await this.db.runAsync(
            `UPDATE routines SET name = ?, pattern = COALESCE(?, pattern), updated_at = ?, is_synced = 0
             WHERE id = ? AND is_deleted = 0 AND name = ? AND updated_at IS ?
               AND routine_type IS ? AND pattern IS ?`,
            mutation.name,
            mutation.pattern ? JSON.stringify(mutation.pattern) : null,
            now,
            target.id,
            row.name,
            row.updated_at,
            row.routine_type,
            row.pattern
          )
          changes = result.changes
        }
        if (changes !== 1) throw new Error(staleTarget)
        assertScope()
        await this.db.runAsync(
          'INSERT INTO coach_draft_saves (revision, draft_json, result_json) VALUES (?, ?, ?)',
          revision,
          serialized,
          '{}'
        )
        assertScope()
      })
    })
  }
}
