import { z } from 'zod'
import type { CoachResponse, CoachWorkout } from './contracts'

// Task-scoped intermediate drafts are generation-only; the rendered response stays the
// production contract. Only per-task fields and handle references are generated; refs,
// version, kind and derived fields are rendered deterministically in trusted code.
// The production contract remains the only persisted or displayed format.
//
// Schema notes:
// - The top level is a union of per-task strictObjects; every discriminating field is a
//   plain enum field, so there is no nested union anywhere. The earlier discriminated-
//   union construction reliably hit zod v4 compiled-path failures ("Cannot read
//   properties of undefined") for this combination, including plain z.union rewrites.
// - Kind-dependent rules (strength sets need a load, text blocks carry text, a workout
//   day needs an index) are enforced by the renderer as issues, and every rendered
//   response is still judged by the full production schema and validation.
const text = z.string().trim().min(1)
const reference = z.string().trim().min(1)

type HandleOptions = { metrics?: string[]; knowledge?: string[] }

const setShape = z.strictObject({
  kind: z.enum(['strength', 'timed']),
  repetitions: z.number().int().positive().optional(),
  load: z
    .strictObject({
      kind: z.enum(['kilograms', 'bodyweight', 'user_selected']),
      value: z.number().positive().optional(),
    })
    .optional(),
  durationSeconds: z.number().int().positive().optional(),
})
const exercisePartShape = z.strictObject({
  exerciseHandle: reference,
  sets: z.array(setShape).min(1),
  restSeconds: z.number().int().nonnegative().optional(),
  effort: z
    .strictObject({
      kind: z.enum(['reps_in_reserve', 'rpe']),
      value: z.number().min(0).max(10),
    })
    .optional(),
  progression: text.optional(),
})
const workoutShape = z.strictObject({
  title: text.optional(),
  exercises: z.array(exercisePartShape).min(1),
  assumptions: z.array(text).optional(),
})
const routineShape = z.strictObject({
  type: z.enum(['SEQUENTIAL', 'WEEKLY_COMPLETION']),
  title: text.optional(),
  workouts: z.array(workoutShape).min(1),
  days: z
    .array(
      z.strictObject({
        kind: z.enum(['workout', 'rest']),
        workout: z.number().int().nonnegative().optional(),
      })
    )
    .optional(),
  weeklyWorkouts: z.array(z.number().int().nonnegative()).optional(),
})
const historyShape = z.strictObject({
  metrics: z.array(reference).optional(),
  summary: text.optional(),
  limitations: z.array(text).optional(),
})
const blockShape = z.strictObject({
  kind: z.enum(['text', 'metric']),
  text: text.optional(),
  knowledge: z.array(reference).optional(),
  metricHandle: reference.optional(),
})
const coachingShape = z.strictObject({ blocks: z.array(blockShape).min(1), limitations: z.array(text).optional() })
function members(handles: HandleOptions) {
  const metricHandle = handles.metrics?.length
    ? z.enum(handles.metrics as [string, ...string[]])
    : reference
  const knowledge = handles.knowledge?.length
    ? z.enum(handles.knowledge as [string, ...string[]])
    : reference
  return [
    z.strictObject({ task: z.literal('coaching'), blocks: z.array(blockShape).min(1), limitations: z.array(text).optional() }),
    z.strictObject({ task: z.literal('history'), metrics: z.array(metricHandle).optional(), summary: text.optional(), limitations: z.array(text).optional() }),
    z.strictObject({ task: z.literal('workout'), ...workoutShape.shape }),
    z.strictObject({ task: z.literal('routine'), ...routineShape.shape }),
    z.strictObject({
      task: z.literal('mixed'),
      parts: z
        .array(
          z.strictObject({
            part: z.enum(['coaching', 'history', 'workout', 'routine']),
            blocks: z.array(z.strictObject({ kind: z.enum(['text', 'metric']), text: text.optional(), knowledge: z.array(knowledge).optional(), metricHandle: metricHandle.optional() })).optional(),
            limitations: z.array(text).optional(),
            metrics: z.array(metricHandle).optional(),
            summary: text.optional(),
            title: text.optional(),
            exercises: z.array(exercisePartShape).optional(),
            workouts: z.array(workoutShape).optional(),
            assumptions: z.array(text).optional(),
            type: z.enum(['SEQUENTIAL', 'WEEKLY_COMPLETION']).optional(),
            days: routineShape.shape.days,
            weeklyWorkouts: z.array(z.number().int().nonnegative()).optional(),
          })
        )
        .min(1),
    }),
    z.strictObject({ task: z.literal('clarification'), question: text }),
    z.strictObject({ task: z.literal('cannot_fulfill'), reason: text }),
  ]
}

export const coachTaskDraftSchema = z.union(members({}))
export type CoachTaskDraft = z.infer<typeof coachTaskDraftSchema>

type DraftSet = {
  kind: 'strength' | 'timed'
  repetitions?: number
  load?: { kind: 'kilograms' | 'bodyweight' | 'user_selected'; value?: number }
  durationSeconds?: number
}
type ExercisePart = {
  exerciseHandle: string
  sets: DraftSet[]
  restSeconds?: number
  effort?: { kind: 'reps_in_reserve' | 'rpe'; value: number }
  progression?: string
}
type WorkoutPart = { title?: string; exercises: ExercisePart[]; assumptions?: string[] }
type RoutinePart = {
  type: 'SEQUENTIAL' | 'WEEKLY_COMPLETION'
  title?: string
  workouts: WorkoutPart[]
  days?: { kind: 'workout' | 'rest'; workout?: number }[]
  weeklyWorkouts?: number[]
}
type CoachingPart = {
  blocks: { kind: 'text' | 'metric'; text?: string; knowledge?: string[]; metricHandle?: string }[]
  limitations?: string[]
}
type HistoryPart = { metrics?: string[]; summary?: string; limitations?: string[] }
type PartInput = {
  part: 'coaching' | 'history' | 'workout' | 'routine'
  blocks?: CoachingPart['blocks']
  limitations?: string[]
  metrics?: string[]
  summary?: string
  title?: string
  exercises?: ExercisePart[]
  workouts?: WorkoutPart[]
  assumptions?: string[]
  type?: 'SEQUENTIAL' | 'WEEKLY_COMPLETION'
  days?: { kind: 'workout' | 'rest'; workout?: number }[]
  weeklyWorkouts?: number[]
}

type AnswerBlock =
  | {
      kind: 'text'
      text: string
      evidence: ({ kind: 'knowledge'; id: string } | { kind: 'metric'; id: string })[]
    }
  | { kind: 'metric'; metricId: string }

// Handles are the returned IDs themselves; membership checks stay in the engine after
// rendering so intermediate and production responses are judged by the same rules.
type RenderedAnswer = { blocks: AnswerBlock[]; limitations: string[] }

const loadChoiceAssumption = 'Loads were left unspecified for you to choose.'

function workoutRef(index: number) {
  return `coach-workout-${index + 1}`
}

function renderSets(exercise: ExercisePart, issues: string[]): CoachWorkout['exercises'][number]['sets'] {
  return exercise.sets.map((set) => {
    if (set.kind === 'timed') {
      if (set.durationSeconds === undefined) issues.push(`${setKindLabel(exercise)}: a timed set needs durationSeconds.`)
      return { kind: 'timed' as const, durationSeconds: set.durationSeconds ?? 1 }
    }
    if (set.repetitions === undefined) issues.push(`${setKindLabel(exercise)}: a strength set needs repetitions.`)
    const load = set.load
    if (load && load.kind === 'kilograms' && load.value === undefined)
      issues.push(`${setKindLabel(exercise)}: a kilogram load needs a positive value.`)
    return {
      kind: 'strength' as const,
      repetitions: set.repetitions ?? 1,
      load: !load
        ? { kind: 'user_selected' as const }
        : load.kind === 'kilograms'
          ? { kind: 'kilograms' as const, value: load.value ?? 0 }
          : { kind: load.kind },
    }
  })
}

function setKindLabel(exercise: ExercisePart) {
  return `Exercise ${exercise.exerciseHandle}`
}

function exerciseHasChoiceLoad(exercises: ExercisePart[]) {
  return exercises.some((exercise) =>
    exercise.sets.some((set) => set.kind === 'strength' && (!set.load || set.load.kind === 'user_selected'))
  )
}

function renderExercise(exercise: ExercisePart, issues: string[]) {
  const guidance: { effort?: ExercisePart['effort']; restSeconds?: number; progression?: string } = {}
  if (exercise.effort !== undefined) guidance.effort = exercise.effort
  if (exercise.restSeconds !== undefined) guidance.restSeconds = exercise.restSeconds
  if (exercise.progression !== undefined) guidance.progression = exercise.progression
  return {
    catalogId: exercise.exerciseHandle,
    sets: renderSets(exercise, issues),
    ...(Object.keys(guidance).length ? { guidance } : {}),
  }
}

function renderWorkoutDraft(part: WorkoutPart, issues: string[]) {
  const exercises = part.exercises.map((exercise) => renderExercise(exercise, issues))
  const assumptions = [...(part.assumptions ?? [])]
  if (exerciseHasChoiceLoad(part.exercises)) assumptions.push(loadChoiceAssumption)
  if (issues.length) return { success: false, issues } as const
  return {
    success: true,
    value: {
      version: 1,
      kind: 'workout_draft' as const,
      workout: { ref: workoutRef(0), title: part.title ?? 'Coach workout', exercises },
      assumptions,
    },
  } as const
}


type RoutineRender = { success: true; value: Extract<CoachResponse, { kind: 'routine_draft' }> } | { success: false; issues: string[] }

function renderRoutineDraft(part: RoutinePart, issues: string[]): RoutineRender {
  const assumptions = part.workouts.flatMap((workout, index) =>
    (workout.assumptions ?? []).map(assumption => `${workout.title ?? `Workout ${index + 1}`}: ${assumption}`)
  )
  if (part.workouts.some(workout => exerciseHasChoiceLoad(workout.exercises))) assumptions.push(loadChoiceAssumption)
  const workouts = part.workouts.map((workout, index) => {
    return {
      ref: workoutRef(index),
      title: workout.title ?? `Workout ${index + 1}`,
      exercises: workout.exercises.map((exercise) => renderExercise(exercise, issues)),
    }
  })
  const available = `available indices are 0 to ${workouts.length - 1}`
  if (part.type === 'WEEKLY_COMPLETION') {
    const weekly = part.weeklyWorkouts
    if (!weekly?.length) issues.push('A weekly completion routine requires weeklyWorkouts.')
    else {
      const counts = new Map<number, number>()
      for (const index of weekly)
        if (!Number.isInteger(index) || index < 0 || index >= workouts.length)
          issues.push(`weeklyWorkouts references workout index ${index}; ${available}.`)
      for (const index of weekly) counts.set(index, (counts.get(index) ?? 0) + 1)
      for (const [index, count] of counts)
        if (count > 1)
          issues.push(`Workout index ${index} is scheduled ${count} times; schedule each workout once.`)
      for (let index = 0; index < workouts.length; index++)
        if (!counts.has(index))
          issues.push(`Workout index ${index} is not scheduled; include every workout once.`)
      if (!issues.length)
        return {
          success: true,
          value: {
            version: 1,
            kind: 'routine_draft' as const,
            workouts,
            routine: { type: part.type, title: part.title ?? 'Coach routine', workoutRefs: weekly.map(workoutRef) },
            assumptions,
          },
        }
    }
    return { success: false, issues }
  }
  const days = part.days
  if (!days?.length) issues.push('A sequential routine requires a days schedule.')
  else {
    const renderedDays: ({ kind: 'workout'; workoutRef: string } | { kind: 'rest' })[] = []
    const scheduled = new Set<number>()
    for (const day of days) {
      if (day.kind === 'rest') {
        if (day.workout !== undefined)
          issues.push('A rest day does not take a workout index.')
        renderedDays.push({ kind: 'rest' })
        continue
      }
      if (day.workout === undefined) issues.push('A workout day needs a workout index.')
      else {
        if (day.workout < 0 || day.workout >= workouts.length)
          issues.push(`Day workout index ${day.workout}; ${available}.`)
        if (scheduled.has(day.workout))
          issues.push(`Workout index ${day.workout} is scheduled twice; schedule each workout once.`)
        scheduled.add(day.workout)
        renderedDays.push({ kind: 'workout', workoutRef: workoutRef(day.workout) })
      }
    }
    for (let index = 0; index < workouts.length; index++)
      if (!scheduled.has(index))
        issues.push(`Workout index ${index} is not scheduled; include every workout once.`)
    if (!issues.length)
      return {
        success: true,
        value: {
          version: 1,
          kind: 'routine_draft' as const,
          workouts,
          routine: { type: part.type, title: part.title ?? 'Coach routine', days: renderedDays },
          assumptions,
        },
      }
  }
  return { success: false, issues }
}

function addCoachingBlocks(part: CoachingPart, answer: RenderedAnswer, issues: string[]) {
  for (const block of part.blocks) {
    if (block.kind === 'metric') {
      if (block.metricHandle === undefined) {
        issues.push('A metric block needs a metricHandle.')
        continue
      }
      answer.blocks.push({ kind: 'metric', metricId: block.metricHandle })
    } else {
      if (block.text === undefined) {
        issues.push('A text block needs text.')
        continue
      }
      if (block.metricHandle !== undefined) issues.push('A text block does not take a metricHandle.')
      answer.blocks.push({
        kind: 'text',
        text: block.text,
        evidence: (block.knowledge ?? []).map((handle) => ({ kind: 'knowledge' as const, id: handle })),
      })
    }
  }
  answer.limitations.push(...(part.limitations ?? []))
}

function addHistoryBlocks(part: HistoryPart, answer: RenderedAnswer, issues: string[]) {
  if (part.summary !== undefined) answer.blocks.push({ kind: 'text', text: part.summary, evidence: [] })
  for (const handle of part.metrics ?? []) answer.blocks.push({ kind: 'metric', metricId: handle })
  answer.limitations.push(...(part.limitations ?? []))
}

export type RenderTaskDraftResult =
  | { success: true; response: CoachResponse }
  | { success: false; issues: string[] }

/** Renders a task draft into the production contract with no invented values. */
export function renderTaskDraft(draft: CoachTaskDraft): RenderTaskDraftResult {
  const issues: string[] = []
  if (draft.task === 'clarification')
    return { success: true, response: { version: 1, kind: 'clarification', question: draft.question } }
  if (draft.task === 'cannot_fulfill')
    return { success: true, response: { version: 1, kind: 'cannot_fulfill', reason: draft.reason } }
  if (draft.task === 'workout') {
    const response = renderWorkoutDraft(draft, issues)
    return response.success
      ? { success: true, response: response.value as CoachResponse }
      : { success: false, issues: response.issues }
  }
  if (draft.task === 'routine') {
    const rendered = renderRoutineDraft(draft, issues)
    return rendered.success
      ? { success: true, response: rendered.value as CoachResponse }
      : { success: false, issues: rendered.issues }
  }
  if (draft.task === 'mixed') {
    const parts = draft.parts
    const structural = parts.filter((part) => part.part === 'workout' || part.part === 'routine')
    if (structural.length > 1)
      return {
        success: false,
        issues: [
          'Mixed parts include more than one workout or routine; the response contract holds one draft.',
        ],
      }
    if (structural.length === 1) {
      if (parts.length > 1)
        return {
          success: false,
          issues: [
            'A workout or routine draft cannot be combined with coaching or history parts in the same response; split the request or choose one part.',
          ],
        }
      const part = parts[0]
      const draftIssues: string[] = []
      const response =
        part.part === 'workout'
          ? renderWorkoutDraft(normalizeWorkoutPart(part), draftIssues)
          : renderRoutineDraft(normalizeRoutinePart(part), draftIssues)
      if (draftIssues.length) return { success: false, issues: draftIssues }
      if (!response.success) return { success: false, issues: response.issues }
      return { success: true, response: response.value as CoachResponse }
    }
    const answer: RenderedAnswer = { blocks: [], limitations: [] }
    for (const part of parts) {
      if (part.part === 'coaching') {
        if (!part.blocks?.length) {
          issues.push('A coaching part needs blocks.')
          continue
        }
        addCoachingBlocks({ ...part, blocks: part.blocks }, answer, issues)
      } else if (part.part === 'history') addHistoryBlocks(part, answer, issues)
      else issues.push(`A ${part.part} part cannot merge into an answer; render it as its own task.`)
    }
    if (issues.length) return { success: false, issues }
    if (!answer.blocks.length) return { success: false, issues: ['Mixed parts produced no content.'] }
    return {
      success: true,
      response: { version: 1, kind: 'answer', blocks: answer.blocks, limitations: answer.limitations },
    }
  }
  if (draft.task === 'coaching') {
    const answer: RenderedAnswer = { blocks: [], limitations: [] }
    addCoachingBlocks(draft, answer, issues)
    if (issues.length) return { success: false, issues }
    return {
      success: true,
      response: { version: 1, kind: 'answer', blocks: answer.blocks, limitations: answer.limitations },
    }
  }
  const answer: RenderedAnswer = { blocks: [], limitations: [] }
  addHistoryBlocks(draft, answer, issues)
  if (issues.length) return { success: false, issues }
  if (!answer.blocks.length)
    return { success: false, issues: ['Compute at least one metric or provide a summary.'] }
  return {
    success: true,
    response: { version: 1, kind: 'answer', blocks: answer.blocks, limitations: answer.limitations },
  }
}

function normalizeWorkoutPart(part: PartInput): WorkoutPart {
  return {
    title: part.title,
    exercises: part.exercises ?? part.workouts?.[0]?.exercises ?? [],
    assumptions: part.assumptions,
  }
}

function normalizeRoutinePart(part: PartInput): RoutinePart {
  return {
    type: part.type ?? 'SEQUENTIAL',
    title: part.title,
    workouts: part.workouts ?? [{ exercises: part.exercises ?? [] }],
    days: part.days,
    weeklyWorkouts: part.weeklyWorkouts,
  }
}

// Full-contract content is still accepted from callers that enforced the production
// schema themselves (frozen captured-output replays, owns-schema harnesses); the
// generation schema is task-scoped, so ordinary model output has `task`, never `kind`.
export function isProductionResponseShape(content: unknown) {
  return (
    typeof content === 'object' &&
    content !== null &&
    typeof (content as { kind?: unknown }).kind === 'string'
  )
}

export type TaskDraftHandleOptions = { metrics?: string[]; knowledge?: string[] }

/** Handle enums reflect IDs returned this turn; they are rebuilt before each generation call.
 *  Exercise handles stay free strings: production retrieval does not establish compatibility. */
export function coachTaskDraftJsonSchema(handles: TaskDraftHandleOptions = {}) {
  return z.toJSONSchema(z.union(members(handles)))
}
