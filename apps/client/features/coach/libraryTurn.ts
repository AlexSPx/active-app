import { exerciseCatalog } from '../../lib/exercises/catalog'
import type { ApiWorkout } from '../../types/api'
import type { Routine } from '../../types/routine'
import type { CoachResponse } from './contracts'
import {
  coachLibraryChangeSchema,
  coachLibraryEditSchema,
  type CoachLibraryChange,
  type CoachLibraryEdit,
} from './libraryContracts'

type Library = { workouts: ApiWorkout[]; routines: Routine[]; activeRoutineId?: string | null }
type Target = { kind: 'workout'; item: ApiWorkout } | { kind: 'routine'; item: Routine }
type TargetName = { kind?: Target['kind'] | 'active_routine'; name: string }
type Request =
  | { kind: 'list'; targetKind?: Target['kind'] }
  | { kind: 'active' }
  | { kind: 'read'; target: TargetName; tentative?: true }
  | { kind: 'edit'; target: TargetName; action: string }
  | { kind: 'name_needed' }

const clean = (text: string) =>
  text
    .trim()
    .replace(/^["“‘']|["”’']$/g, '')
    .trim()
const normalize = (text: string) => clean(text).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
const targetTitle = (target: Target) =>
  target.kind === 'workout' ? target.item.title : target.item.name
const clarification = (question: string): CoachResponse => ({
  version: 1,
  kind: 'clarification',
  question,
})
const answer = (text: string): CoachResponse => ({
  version: 1,
  kind: 'answer',
  blocks: [{ kind: 'text', text, evidence: [] }],
  limitations: [],
})

function targetName(text: string, fallbackKind?: Target['kind']): TargetName {
  const label = text.replace(/^(?:(?:the|my|a) +)?(?:saved +)?/i, '')
  if (/^(?:active|current) routine$/i.test(label)) return { kind: 'active_routine', name: label }
  const prefix =
    /^(workout(?: template)?|routine)(?=$|\s|:)[ :]*(?:(?:called|named|titled) +)?(.*)$/i.exec(
      label
    )
  const suffix =
    (text !== label || /^["“]/.test(label)) &&
    /^(.*?) (workout(?: template)?|routine)$/i.exec(label)
  if (prefix)
    return { kind: /^routine$/i.test(prefix[1]) ? 'routine' : 'workout', name: clean(prefix[2]) }
  if (suffix)
    return { kind: /^routine$/i.test(suffix[2]) ? 'routine' : 'workout', name: clean(suffix[1]) }
  return { kind: fallbackKind, name: clean(label) }
}

const editVerb =
  '(?:rename|set|change|update|adjust|make|use|give|remove|delete|move|put|place|add|insert|replace|swap|increase|decrease|edit)'
const editStart = new RegExp('^' + editVerb + '\\b', 'i')

function parseRequest(message: string): Request | undefined {
  const text = message
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/^(?:(?:could|can|would) you\s+|please\s+)+/i, '')
  if (/^(?:make|give)(?: me)? (?:a|an|another|new|one)\b/i.test(text)) return
  if (
    /\b(?:logged|recorded|completed|history)\b/i.test(text) &&
    !/\b(?:saved|template|named|called)\b/i.test(text)
  )
    return
  if (
    /^(?:what(?: is|['’]s)|which(?: is)?|show(?: me)?|tell me) (?:my |the )?(?:current|active) routine(?: schedule)?$/i.test(
      text
    )
  )
    return { kind: 'active' }
  const list =
    /^(?:(?:show(?: me)?|list|see|find|what(?: are|['’]re)|which) (?:all (?:of )?)?|(?:what|which) )(?:(?:my|the) )?(?:saved )?(workout templates|workouts|routines|workouts and routines|workout templates and routines|routines and workouts|(?:workout )?library)(?:(?: do i have)? saved| do i have| have i saved)?$/i.exec(
      text
    )
  if (list) {
    const label = list[1].toLowerCase()
    return {
      kind: 'list',
      targetKind:
        label === 'routines'
          ? 'routine'
          : /^workout(?: templates|s)$/.test(label)
            ? 'workout'
            : undefined,
    }
  }

  const rename = /^rename ((?:[^"“]|["“][^"”]+["”])+?) to (.+)$/i.exec(text)
  if (rename)
    return { kind: 'edit', target: targetName(rename[1]), action: `rename to ${rename[2]}` }

  const prefix = new RegExp('^(?:in|for|on) (.+?)[,:]\\s*(' + editVerb + '\\b.*)$', 'i').exec(text)
  if (prefix && !/^(?:a|an) (?!saved\b)/i.test(prefix[1])) {
    return { kind: 'edit', target: targetName(prefix[1]), action: prefix[2] }
  }
  const edit = /^edit (.+?):\s*(.+)$/i.exec(text)
  if (edit) return { kind: 'edit', target: targetName(edit[1]), action: edit[2] }

  const markedTarget =
    '(?:(?:(?:my|the) )?(?:saved )?(?:workout(?: template)?|routine)(?:[ :].*)?|(?:my|the) .+ (?:workout(?: template)?|routine))'
  const targetBeforeValue = new RegExp(
    '^((?:set|change|update|adjust|increase|decrease|make) .+?) (?:in|on) (' +
      markedTarget +
      ') (to .+)$',
    'i'
  ).exec(text)
  if (targetBeforeValue) {
    return {
      kind: 'edit',
      target: targetName(targetBeforeValue[2]),
      action: `${targetBeforeValue[1]} ${targetBeforeValue[3]}`,
    }
  }
  const markedSuffix = new RegExp(
    '^(' + editVerb + '\\s+.+?) (?:in|for|on|from|to|of) (' + markedTarget + ')$',
    'i'
  ).exec(text)
  if (markedSuffix)
    return { kind: 'edit', target: targetName(markedSuffix[2]), action: markedSuffix[1] }
  const plainSuffix = new RegExp('^(' + editVerb + '\\s+.+) (?:in|from) (.+)$', 'i').exec(text)
  if (plainSuffix && /^(?:["“]|\p{Lu})/u.test(plainSuffix[2])) {
    return { kind: 'edit', target: targetName(plainSuffix[2]), action: plainSuffix[1] }
  }
  if (editStart.test(text) && /\b(?:my|saved) (?:workout|routine)\b/i.test(text))
    return { kind: 'name_needed' }

  const read = (label: string, fallbackKind?: Target['kind']): Request | undefined => {
    if (/^(?:a|an) (?!saved\b)/i.test(label)) return
    const target = targetName(label)
    if (target.kind || /^(?:["“]|\p{Lu})/u.test(label)) {
      return { kind: 'read', target: { ...target, kind: target.kind ?? fallbackKind } }
    }
    return { kind: 'read', target: { ...target, kind: fallbackKind }, tentative: true }
  }
  const schedule =
    /^(?:(?:what(?: is|['’]s)|show(?: me)?|tell me|list) )?(?:the )?(?:schedule|pattern|days|order) (?:of|for|in) (.+)$/i.exec(
      text
    )
  if (schedule) return read(schedule[1], 'routine')
  const contents =
    /^(?:show me )?(?:what(?: is|['’]s)|which exercises are|what exercises are|what workouts are|what do i have) (?:inside|in) (.+)$/i.exec(
      text
    )
  if (contents) return read(contents[1])
  const exercises =
    /^(?:show(?: me)?|list|tell me) (?:the )?(?:contents|exercises|workouts) (?:of|in|for) (.+)$/i.exec(
      text
    )
  if (exercises) return read(exercises[1])
  const named =
    /^(?:show(?: me)?|display|open|describe|tell me about|give me the details of) (.+)$/i.exec(text)
  if (named && (targetName(named[1]).kind || /^["“].+["”]$/.test(named[1]))) {
    return { kind: 'read', target: targetName(named[1]) }
  }
  const possessiveSchedule =
    /^(?:what(?: is|['’]s)|show(?: me)?) (.+?)(?:['’]s) (schedule|pattern|workouts|exercises)$/i.exec(
      text
    )
  if (possessiveSchedule) {
    return read(
      possessiveSchedule[1],
      /^exercises$/i.test(possessiveSchedule[2]) ? 'workout' : 'routine'
    )
  }
  const bareTitle = /^(?:show(?: me)?|open|describe|tell me about) (\p{Lu}.+)$/u.exec(text)
  if (bareTitle) return { kind: 'read', target: targetName(bareTitle[1]), tentative: true }
}

function matchName<T>(items: T[], name: string, title: (item: T) => string): T[] {
  const key = normalize(name)
  const exact = items.filter((item) => normalize(title(item)) === key)
  if (exact.length || !key) return exact
  return items.filter((item) => normalize(title(item)).startsWith(`${key} `))
}

function workoutContents(workout: ApiWorkout): string {
  const exercises = workout.workoutTemplate.exercises.map((exercise, index) => {
    const prescription = exercise.coachPrescription?.sets
    const durations =
      typeof exercise.durationSeconds === 'number'
        ? [exercise.durationSeconds]
        : exercise.durationSeconds
    const reps = exercise.reps ?? []
    const weights = exercise.weight ?? []
    const sets = prescription?.length
      ? prescription.map((set) =>
          set.kind === 'timed'
            ? `${set.durationSeconds} sec`
            : `${set.repetitions} reps at ${set.load.kind === 'bodyweight' ? 'bodyweight' : `${set.load.value} kg`}`
        )
      : durations?.length
        ? durations.map((seconds) => `${seconds} sec`)
        : Array.from({ length: Math.max(reps.length, weights.length) }, (_, i) =>
            [
              reps[i] === undefined ? null : `${reps[i]} reps`,
              weights[i] === undefined ? null : `${weights[i]} kg`,
            ]
              .filter(Boolean)
              .join(' at ')
          )
    return `${index + 1}. ${exercise.exerciseTitle || 'Unnamed exercise'}${sets.length ? ` — ${sets.join('; ')}` : ''}`
  })
  return [
    workout.title,
    ...(exercises.length ? exercises : ['No exercises are saved in this workout.']),
  ].join('\n')
}

function routineContents(
  routine: Routine,
  workouts: ApiWorkout[],
  heading = routine.name
): CoachResponse {
  const weekly = routine.routineType === 'WEEKLY_COMPLETION'
  const days = [...routine.pattern]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((day) => {
      const workout = workouts.find((item) => item.id === day.workoutId)
      const label = day.dayType === 'REST' ? 'Rest' : (workout?.title ?? 'Workout unavailable')
      return weekly ? `• ${label}` : `Day ${day.dayIndex} — ${label}`
    })
  return answer(
    [
      heading,
      weekly ? 'Complete these workouts during the week in any order.' : 'Repeating schedule',
      ...(days.length ? days : ['No days are saved in this routine.']),
    ].join('\n')
  )
}

const ordinals = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
]
function numberedPosition(text: string, length: number): number | undefined {
  const label = text
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/^(?:day|session|slot|position|exercise|workout)\s+#?/, '')
    .replace(/\s+(?:day|session|slot|position|exercise|workout)$/, '')
  if (label === 'last' || label === 'end') return length
  if (label === 'start' || label === 'beginning') return 1
  const ordinal = ordinals.indexOf(label)
  if (ordinal >= 0) return ordinal + 1
  const number = /^#?(\d+)(?:st|nd|rd|th)?$/.exec(label)
  return number ? Number(number[1]) : undefined
}

function exercisePosition(workout: ApiWorkout, selector: string): number | undefined {
  const exercises = workout.workoutTemplate.exercises
  const named = matchName(
    exercises.map((exercise, index) => ({ exercise, index })),
    selector,
    ({ exercise }) => exercise.exerciseTitle
  )
  if (named.length > 1) return
  return named.length === 1 ? named[0].index + 1 : numberedPosition(selector, exercises.length)
}

const durationUnits = 'seconds?|secs?|s|minutes?|mins?|m'
const weightUnits = 'kg|kgs|kilograms?|lb|lbs|pounds?'
const quantityUnits = 'reps?|repetitions?|sets?|intervals?|' + durationUnits + '|' + weightUnits
const amount = '(\\d+(?:\\.\\d+)?)'
const setValue = new RegExp('^' + amount + '\\s*(' + quantityUnits + ')$', 'i')

function kilograms(value: number, unit: string): number {
  return /^lb|^pound/i.test(unit) ? Math.round(value * 0.45359237 * 1000) / 1000 : value
}

function seconds(value: number, unit: string): number {
  return /^m/i.test(unit) ? value * 60 : value
}

function quantityChange(position: number, value: number, unit: string): CoachLibraryChange {
  if (/^rep/i.test(unit)) return { kind: 'set_reps', position, reps: value }
  if (/^(?:set|interval)/i.test(unit)) return { kind: 'set_count', position, count: value }
  if (new RegExp('^(?:' + weightUnits + ')$', 'i').test(unit))
    return { kind: 'set_weight', position, kilograms: kilograms(value, unit) }
  return { kind: 'set_duration', position, seconds: seconds(value, unit) }
}

const reviewedExercise = exerciseCatalog.filter(
  (exercise) => !exercise.retired && exercise.setupReviewStatus === 'reviewed'
)
function exerciseWithSets(text: string) {
  const timed = new RegExp(
    '^(.+?) (?:for|with) (?:(\\d+)\\s*(?:x|×|sets? of|intervals? of)\\s*)?' +
      amount +
      '\\s*(' +
      durationUnits +
      ')$',
    'i'
  ).exec(text)
  const strength = new RegExp(
    '^(.+?) (?:for|with) (\\d+)\\s*(?:x|×|sets? of)\\s*(\\d+)(?:\\s*(?:reps?|repetitions?))?(?:\\s*(?:at|using)\\s*(?:(bodyweight)|' +
      amount +
      '\\s*(' +
      weightUnits +
      ')))?$',
    'i'
  ).exec(text)
  const matches = timed ?? strength
  if (!matches) return
  const [exercise, ...alternatives] = matchName(reviewedExercise, matches[1], (item) => item.name)
  if (!exercise || alternatives.length) return
  if (timed) {
    const count = Number(timed[2] ?? 1)
    if (count < 1 || count > 100) return
    return {
      catalogId: exercise.id,
      sets: Array.from({ length: count }, () => ({
        kind: 'timed' as const,
        durationSeconds: seconds(Number(timed[3]), timed[4]),
      })),
    }
  }
  if (!strength || exercise.category === 'CARDIO') return
  const count = Number(strength[2])
  if (count < 1 || count > 100) return
  const load =
    strength[5] !== undefined
      ? { kind: 'kilograms' as const, value: kilograms(Number(strength[5]), strength[6]) }
      : strength[4] || exercise.equipment === 'BODY_ONLY'
        ? { kind: 'bodyweight' as const }
        : undefined
  if (!load) return
  return {
    catalogId: exercise.id,
    sets: Array.from({ length: count }, () => ({
      kind: 'strength' as const,
      repetitions: Number(strength[3]),
      load,
    })),
  }
}

function workoutChange(workout: ApiWorkout, action: string): CoachLibraryChange | undefined {
  const positionOf = (name: string) => exercisePosition(workout, name)
  const length = workout.workoutTemplate.exercises.length
  const fieldPattern = 'reps?|repetitions?|weight|load|sets?|count|duration|time'
  const set = /^(?:set|change|adjust|update|make|increase|decrease) (.+?) (?:to|at) (.+)$/i.exec(
    action
  )
  const use = /^(?:use|give) (.+?) for (.+)$/i.exec(action)
  if (set || use) {
    const subject = set ? set[1] : (use?.[2] ?? '')
    const prefix = new RegExp('^(?:the )?(' + fieldPattern + ') (?:for|of|on) (.+)$', 'i').exec(
      subject
    )
    const suffix = new RegExp("^(.+?)(?:['’]s)?\\s+(" + fieldPattern + ')$', 'i').exec(subject)
    const selector = prefix?.[2] ?? suffix?.[1] ?? subject
    const field = prefix?.[1] ?? suffix?.[2]
    const position = positionOf(selector)
    const text = set ? set[2] : (use?.[1] ?? '')
    const implicitUnit =
      field && (/^rep/i.test(field) ? 'reps' : /^(?:set|count)/i.test(field) ? 'sets' : '')
    const value = setValue.exec(
      implicitUnit && /^\d+$/.test(text) ? `${text} ${implicitUnit}` : text
    )
    if (position && value) {
      const change = quantityChange(position, Number(value[1]), value[2])
      if (field) {
        const expectedKind = /^rep/i.test(field)
          ? 'set_reps'
          : /^(?:set|count)/i.test(field)
            ? 'set_count'
            : /^(?:weight|load)$/i.test(field)
              ? 'set_weight'
              : 'set_duration'
        if (expectedKind !== change.kind) return
      }
      return change
    }
  }
  const reorder = /^(?:move|put|place) (.+?) (to|before|after) (.+)$/i.exec(action)
  if (reorder) {
    const position = positionOf(reorder[1])
    if (!position) return
    const mode = reorder[2].toLowerCase()
    if (mode === 'to') {
      const toPosition = numberedPosition(reorder[3], length)
      if (toPosition) return { kind: 'move_exercise', position, toPosition }
    } else {
      const reference = positionOf(reorder[3])
      if (reference && reference !== position) {
        const toPosition = reference - Number(position < reference) + Number(mode === 'after')
        return { kind: 'move_exercise', position, toPosition }
      }
    }
  }
  const end = /^(?:move|put|place) (.+?) (first|last)$/i.exec(action)
  if (end) {
    const position = positionOf(end[1])
    const toPosition = numberedPosition(end[2], length)
    if (position && toPosition) return { kind: 'move_exercise', position, toPosition }
  }
  const remove = /^(?:remove|delete) (.+)$/i.exec(action)
  if (remove) {
    const position = positionOf(remove[1])
    if (position) return { kind: 'remove_exercise', position }
  }
  const replace = /^(?:replace|swap) (.+?) with (.+)$/i.exec(action)
  if (replace) {
    const position = positionOf(replace[1])
    const exercise = exerciseWithSets(replace[2])
    if (position && exercise) return { kind: 'replace_exercise', position, ...exercise }
  }
  const add = /^(?:add|insert) (.+)$/i.exec(action)
  if (add) {
    const exercise = exerciseWithSets(add[1])
    if (exercise) return { kind: 'add_exercise', ...exercise }
  }
}

function routineChange(
  routine: Routine,
  workouts: ApiWorkout[],
  action: string
): CoachLibraryChange | undefined {
  const length = routine.pattern.length
  const day = (value: string) => numberedPosition(value, length)
  const savedWorkoutId = (name: string) => {
    const matches = matchName(
      workouts,
      targetName(name, 'workout').name,
      (workout) => workout.title
    )
    return matches.length === 1 ? matches[0].id : undefined
  }
  const move = /^(?:move|put|place) (.+?) to (.+)$/i.exec(action)
  if (move) {
    const position = day(move[1])
    const toPosition = day(move[2])
    if (position && toPosition) return { kind: 'move_day', position, toPosition }
  }
  const remove = /^(?:delete|remove) (.+)$/i.exec(action)
  if (remove) {
    const position = day(remove[1])
    if (position) return { kind: 'remove_day', position }
  }
  const replace = /^(?:replace|swap) (.+?) with (.+)$/i.exec(action)
  if (replace) {
    const position = day(replace[1])
    const workoutId = savedWorkoutId(replace[2])
    if (position && workoutId) return { kind: 'replace_day_workout', position, workoutId }
  }
  const insert = /^(?:add|insert) (.+?)(?: (at|as|on|before|after) (.+))?$/i.exec(action)
  if (insert) {
    const mode = insert[2]?.toLowerCase()
    const relative = mode === 'before' || mode === 'after'
    const reference = insert[3]
      ? numberedPosition(insert[3], relative ? length : length + 1)
      : length + 1
    if (!reference || (relative && reference > length)) return
    const position = reference + Number(mode === 'after')
    if (/^(?:a )?rest(?: day)?$/i.test(insert[1])) return { kind: 'insert_rest', position }
    const workoutId = savedWorkoutId(insert[1])
    if (workoutId) return { kind: 'insert_workout', position, workoutId }
  }
}

export async function runLibraryTurn(input: {
  message: string
  readLibrary: () => Promise<Library>
  previewLibraryEdit?: (
    target: CoachLibraryEdit['target'],
    change: CoachLibraryChange,
    library: Library
  ) => string[]
  alive: () => boolean
}): Promise<CoachResponse | undefined> {
  const request = parseRequest(input.message)
  if (!request) return
  if (request.kind === 'name_needed' || ('target' in request && !request.target.name)) {
    return clarification(
      'Which saved workout or routine did you mean? Include its name and what you want to see or change.'
    )
  }
  let library: Library
  try {
    library = await input.readLibrary()
  } catch {
    if (request.kind === 'read' && request.tentative) return
    return answer('I could not read your saved library.')
  }
  if (!input.alive()) return
  const { workouts, routines } = library
  if (request.kind === 'active') {
    if (library.activeRoutineId === null) return answer('You have no active routine.')
    const active = routines.find((routine) => routine.id === library.activeRoutineId)
    if (active) return routineContents(active, workouts, `Active routine — ${active.name}`)
    return answer('I could not identify an active routine from the saved library.')
  }
  if (request.kind === 'list') {
    const sections = []
    if (request.targetKind !== 'routine')
      sections.push(
        `Saved workouts${workouts.length ? `\n${workouts.map((workout) => `• ${workout.title}`).join('\n')}` : ' — none'}`
      )
    if (request.targetKind !== 'workout')
      sections.push(
        `Saved routines${routines.length ? `\n${routines.map((routine) => `• ${routine.name}`).join('\n')}` : ' — none'}`
      )
    return answer(sections.join('\n\n'))
  }

  const targets: Target[] = []
  if (request.target.kind === 'active_routine') {
    const active = routines.find((routine) => routine.id === library.activeRoutineId)
    if (!active)
      return clarification('Which saved routine should I use? I found no active routine.')
    targets.push({ kind: 'routine', item: active })
  }
  if (!request.target.kind || request.target.kind === 'workout')
    targets.push(...workouts.map((item) => ({ kind: 'workout' as const, item })))
  if (!request.target.kind || request.target.kind === 'routine')
    targets.push(...routines.map((item) => ({ kind: 'routine' as const, item })))
  const matches =
    request.target.kind === 'active_routine'
      ? targets
      : matchName(targets, request.target.name, targetTitle)
  const [target] = matches
  if (!target) {
    if (request.kind === 'read' && request.tentative) return
    return clarification(
      `I could not find “${request.target.name}” in your saved library. What is its saved name?`
    )
  }
  if (matches.length > 1) {
    const options = [...new Set(matches.map((match) => `“${targetTitle(match)}” (${match.kind})`))]
    return clarification(
      options.length < matches.length
        ? `More than one saved item matches “${request.target.name}”, and some share the same name and type. Use a unique saved name to identify the item.`
        : `Which saved item did you mean: ${options.join(', ')}? Include its name and type in your request.`
    )
  }
  if (request.kind === 'read') {
    return target.kind === 'workout'
      ? answer(workoutContents(target.item))
      : routineContents(target.item, workouts)
  }

  const name = targetTitle(target)
  const rename = /^rename to (.+)$/i.exec(request.action)
  if (
    rename &&
    !/^["“][^"”]+["”]$/.test(rename[1]) &&
    new RegExp(
      '(?:[;.!?]|,|\\band\\b|\\bthen\\b)\\s*(?:and\\s+|then\\s+)?' + editVerb + '\\b',
      'i'
    ).test(rename[1])
  ) {
    return clarification(`Which single change should I make to “${name}”?`)
  }
  const planned = rename
    ? { kind: 'rename', title: clean(rename[1]) }
    : target.kind === 'workout'
      ? workoutChange(target.item, request.action)
      : routineChange(target.item, workouts, request.action)
  if (!planned) {
    return clarification(
      target.kind === 'workout'
        ? `What single change should I make to “${name}”? For an existing exercise, give its exact name or position. For an addition or replacement, give the catalog exercise and its sets, reps or duration, and load when applicable.`
        : `What single change should I make to “${name}”? Include the day position and, for a workout day, the saved workout’s unique name.`
    )
  }

  const expected = coachLibraryChangeSchema.safeParse(planned)
  if (!expected.success)
    return clarification(
      `What exact change should I make to “${name}”? Check the positions and values in your request.`
    )
  const change = expected.data

  const editTarget = {
    kind: target.kind,
    id: target.item.id,
    title: name,
    updatedAt: target.item.updatedAt,
  }
  if (!input.previewLibraryEdit) {
    return {
      version: 1,
      kind: 'cannot_fulfill',
      reason: 'The saved library preview is unavailable.',
    }
  }
  try {
    const summary = input.previewLibraryEdit(editTarget, change, library)
    coachLibraryEditSchema.parse({ target: editTarget, change, summary })
    return { version: 1, kind: 'library_edit', edit: { target: editTarget, change, summary } }
  } catch {
    return clarification(
      `I could not preview that change to “${name}”. Check the exercise or day position and whether that change applies to the saved item.`
    )
  }
}
