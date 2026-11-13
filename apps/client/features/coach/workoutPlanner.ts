import { z } from 'zod'
import { parseWorkoutSchedule, workoutSessionFocuses, type WorkoutFocus } from './workoutSchedule'
import { exerciseCatalog } from '../../lib/exercises/catalog'
import type { CoachResponse, CoachWorkout } from './contracts'
import { normalizeHistoryName, resolveHistoryExercise } from './historyQuery'

type Equipment = NonNullable<(typeof exerciseCatalog)[number]['equipment']>
type Exercise = (typeof exerciseCatalog)[number]
const interchangeableExerciseGroups: readonly (readonly string[])[] = [
  ['local:exercise:Dumbbell_Bench_Press', 'local:exercise:Dumbbell_Bench_Press_with_Neutral_Grip'],
]

function exerciseSlotIdentity(id: string): string {
  return interchangeableExerciseGroups.find(group => group.includes(id))?.[0] ?? id
}

const equipmentTerms: [RegExp, Equipment][] = [
  [/\bbody ?weight|bodyweight|no equipment\b/i, 'BODY_ONLY'],
  [/\bdumbbells?\b/i, 'DUMBBELL'], [/\bbarbells?\b/i, 'BARBELL'],
  [/\bbands?\b/i, 'BANDS'], [/\bkettlebells?\b/i, 'KETTLEBELLS'],
  [/\b(?:cable|pulley)\b/i, 'CABLE'], [/\bmachine\b/i, 'MACHINE'],
  [/\b(?:exercise|stability) ball\b/i, 'EXERCISE_BALL'],
  [/\bmedicine ball\b/i, 'MEDICINE_BALL'],
  [/\b(?:pull.?up bar|chin.?up bar|parallel bars?|dip station)\b/i, 'OTHER'],
  [/\bpartner\b/i, 'OTHER'],
]
const groupTerms: [RegExp, string[]][] = [
  [/\bchest\b/i, ['chest']], [/\b(?:back|lats?)\b/i, ['lats', 'middle back', 'lower back', 'traps']],
  [/\bglutes?\b/i, ['glutes']], [/\b(?:quadriceps|quads?)\b/i, ['quadriceps']],
  [/\bhamstrings?\b/i, ['hamstrings']], [/\bcalves?\b/i, ['calves']],
  [/\b(?:legs?|lower body)\b/i, ['quadriceps', 'hamstrings', 'glutes', 'calves']],
  [/\b(?:abs|core|abdominals)\b/i, ['abdominals']], [/\bshoulders?\b/i, ['shoulders']],
  [/\barms?\b/i, ['biceps', 'triceps', 'forearms']], [/\bbiceps\b/i, ['biceps']], [/\btriceps\b/i, ['triceps']],
]
const upper = ['chest', 'shoulders', 'triceps']
const lower = ['quadriceps', 'hamstrings', 'glutes']
const numberWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const unsafeNames = /\b(?:pistol|handstand|muscle.?up)\b/i
function movementFamily(exercise: Exercise): string {
  const name = exercise.name.toLowerCase().replace(/[_-]+/g, ' ')
  const families: [RegExp, string][] = [
    [/press|push.?up/, 'press'], [/\bupright rows?\b/, 'upright-row'], [/\brows?\b/, 'row'], [/\b(?:squats?|lunges?)\b/, 'knee-dominant'],
    [/deadlift|good morning|hip hinge/, 'hinge'], [/\b(?:step.?up|step mill)\b/, 'step-up'], [/\b(?:kickback|flutter kicks?|hip extension)\b/, 'hip-extension'],
    [/\b(?:crunch(?:es)?|sit.?ups?|heel touch(?:er)?s?|toe touch(?:er)?s?|jackknife|elbow to knee|bicycle|air bike|cocoons?|bottoms up|butt.?ups?|hip raise|leg raise|leg lift|leg pull.?in|leg tucks?)\b/, 'trunk-flexion'],
    [/\b(?:side bends?|twists?|windmills?|spell caster|landmine 180)\b/, 'trunk-rotation'],
    [/scaption|power partials?|raise/, 'raise'], [/\bcurl\b/, 'curl'],
    [/extension/, 'extension'], [/fly|flye|flyes/, 'fly'], [/shrug/, 'shrug'], [/bridge|butt lift/, 'bridge'],
    [/plank|dead bug|bird dog|ab rollout|vacuum/, 'trunk-stability'],
  ]
  return families.find(([pattern]) => pattern.test(name))?.[1] ?? name.replace(/\b(?:dumbbell|barbell|kettlebell|with bands?|standing|seated|lying|one arm|two arm)\b/g, '').trim()
}

function hasDurationLimit(request: string): boolean {
  return /\b(?:only have|at most|maximum|no more than|within|fits?|time (?:for|available)|under)\b/i.test(request) || /\bin\s+\d+\s*-?\s*(?:minutes?|mins?)\b/i.test(request)
}

const restPattern = /(-?\d+(?:\.\d+)?|one|two|three|half a)\s*(seconds?|secs?|minutes?|mins?)\s+(?:of\s+)?rest\b|\brest\s+(?:for\s+)?(-?\d+(?:\.\d+)?|one|two|three|half a)\s*(seconds?|secs?|minutes?|mins?)\b/gi

function numberValue(value: string): number {
  return value === 'half a' ? 0.5 : numberWords.indexOf(value.toLowerCase()) + 1 || Number(value)
}

function prescriptions(request: string) {
  const sets: number[] = [], reps: { min: number; max: number }[] = [], rest: number[] = [], durations: number[] = []
  const addReps = (min: string, max = min) => reps.push({ min: Number(min), max: Number(max) })
  for (const match of request.matchAll(/(-?\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*sets?\b(?:\s+of\s+(-?\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*(?:-|–|—|to)\s*(\d+))?)?/gi)) {
    sets.push(numberValue(match[1])); if (match[2]) addReps(String(numberValue(match[2])), match[3])
  }
  for (const match of request.matchAll(/(-?\d+)\s*[x×]\s*(-?\d+)(?:\s*(?:-|–|—|to)\s*(\d+))?/gi)) {
    sets.push(Number(match[1])); addReps(match[2], match[3])
  }
  for (const match of request.matchAll(/(-?\d+)(?:\s*(?:-|–|—|to)\s*(\d+))?\s*(?:reps?|repetitions?)\b/gi)) addReps(match[1], match[2])
  const withoutPreparation = request.replace(/(-?\d+(?:\.\d+)?)\s*-?\s*(minutes?|mins?)\s+(?:of\s+)?(?:warm[ -]?up|cool[ -]?down)\b/gi, ' ')
  const withoutRest = withoutPreparation.replace(restPattern, (...args: string[]) => {
    const value = args[1] ?? args[3], unit = args[2] ?? args[4]
    rest.push(numberValue(value) * (/^min/i.test(unit) ? 60 : 1)); return ' '
  })
  for (const match of withoutRest.matchAll(/(-?\d+(?:\.\d+)?)\s*-?\s*(minutes?|mins?|hours?|hrs?)\b|\b(half an hour)\b/gi)) durations.push(match[3] ? 30 : Number(match[1]) * (/^(?:hour|hr)/i.test(match[2]) ? 60 : 1))
  if (/\bno rest\b/i.test(request)) rest.push(0)
  const distinct = (values: unknown[]) => new Set(values.map(value => JSON.stringify(value))).size > 1
  const unsupportedRest = /\brest\s+(?:for\s+)?(?:\d+\s*(?:-|–|—|to)\s*\d+|\d+\s*(?:minutes?|mins?)\s+\d+|\d+\s*(?:milliseconds?|hours?|hrs?))\b/i.test(request)
  const unsupported = unsupportedRest || /\b(?:rest\s+(?:for\s+)?(?:\d+\s*(?:-|to)\s*\d+|\w+)\s*(?:hours?|hrs?)|\d+\s*(?:-|to)\s*\d+\s*(?:seconds?|secs?|minutes?|mins?)\s+(?:of\s+)?rest|\d+\s*(?:-|to)\s*\d+\s*(?:minutes?|mins?|hours?|hrs?)|(?:no|not|without)\s+\d+\s*(?:sets?|reps?|repetitions?|[x×]\s*\d+))\b/i.test(request)
  return { sets: sets[0], reps: reps[0], rest: rest[0], duration: durations[0] ?? null, conflict: distinct(sets) || distinct(reps) || distinct(rest) || distinct(durations) || unsupported }
}

function estimatedExerciseSeconds(sets: number, workSeconds: number, restSeconds: number, sides = 1): number {
  const nominalWorkSeconds = sets * 10 * 3 * sides
  const nominalRestSeconds = Math.max(0, sets - 1) * 60
  return Math.max(sets * 120, sets * 120 + workSeconds - nominalWorkSeconds + restSeconds - nominalRestSeconds)
}
const setupTerms: [RegExp, Equipment][] = [
  [/\b(?:rack required|in (?:a )?rack)\b/i, 'BARBELL'],
  [/\b(?:machine required|use (?:the )?machine)\b/i, 'MACHINE'],
  [/\b(?:cable required|use (?:a )?cable|pulley)\b/i, 'CABLE'], [/\b(?:exercise ball|required.*ball)\b/i, 'EXERCISE_BALL'],
  [/\b(?:hang from|pull.?up bar|chin.?up bar|parallel bars?|dip station|above the bars?|smith machine|sturdy elevated platform|rack at chest height|partner|stationary post|secure anchor|anchored)\b/i, 'OTHER'],
]

function missingSetup(exercise: Exercise, request: string, context: SuppliedContext | null): boolean {
  const description = `${exercise.name} ${exercise.instructions.join(' ')}`
  const inventory = `${request} ${(context?.equipment ?? []).join(' ')}`
  const requirements: [RegExp, RegExp][] = [
    [/\b(?:stationary post|fixed post|secure anchor|anchored|attach.{0,40}(?:post|anchor))\b/i, /\b(?:post|anchor)\b/i],
    [/\b(?:wooden block|inch block|block under|block beneath|stand on a block)\b/i, /\bblock\b/i],
    [/\b(?:sturdy support|sturdy object|stable support|secure your feet|feet secured)\b/i, /\b(?:sturdy support|sturdy object|stable support|secured feet)\b/i],
  ]
  const structured = exercise.setupRequirements ?? { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] }
  const implement = exercise.equipment === 'KETTLEBELLS' ? 'kettlebells?' : 'dumbbells?'
  const inventoryCount = new RegExp(`\\b(?:one|a|an|single)\\s+${implement}\\b`, 'i').test(inventory) ? 1 : new RegExp(`\\b(?:pair of|two)\\s+${implement}\\b`, 'i').test(inventory) ? 2 : undefined
  const quantityConflict = structured.minimumEquipmentQuantity !== undefined && ((inventoryCount ?? (/\bfull[- ]gym\b/i.test(inventory) ? 2 : 1)) < structured.minimumEquipmentQuantity)
  const structuredMissing = structured.anchors.some(() => !/\b(?:anchor|post|pull-up bar|chin-up bar|rack|fixed point)\b/i.test(inventory)) ||
    structured.blocks.some(() => !/\bblock\b/i.test(inventory)) ||
    structured.supports.some(support => support === 'secured feet' ? !/\b(?:secured feet|feet secured|foot anchor)\b/i.test(inventory) : !hasBench(request, context) && !/\b(?:support|rack|sturdy chair|stable surface)\b/i.test(inventory))
  const fixedLoadMissing = structured.fixedLoadsKg.some(load => ![...inventory.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs|pounds?)/gi)].some(match => Math.abs(Number(match[1]) * (/^lb/i.test(match[2]) ? 0.45359237 : 1) - load) < 0.05))
  return structuredMissing || quantityConflict || fixedLoadMissing || requirements.some(([required, supplied]) => required.test(description) && !supplied.test(inventory))
}

function requiresBench(exercise: Exercise): boolean {
  return /\bbench\b/i.test(`${exercise.name} ${exercise.instructions.join(' ')}`)
}

function hasBench(request: string, context: SuppliedContext | null): boolean {
  return /\bbench\b|\bfull[- ]gym\b/i.test(request) || (context?.equipment ?? []).some(item => /\bbench\b|\bfull[- ]gym\b/i.test(item))
}

export type PlannerDiagnostics = { equipment: string[]; candidateCounts: number[]; durationMinutes: number | null; estimatedMinutes: number; sets: number; setsExplicit: boolean; refusalReason: string | null; unmetRequirements: string[] }
export type WorkoutTrace = PlannerDiagnostics & { session?: { index: number; title: string; focus: WorkoutFocus | 'shared' }; source: 'model' | 'template' | 'defaults'; assumptions: string[]; validationErrors: string[]; timedOut: boolean }
type Plan = { countRange: { min: number; max: number }; prescription: ReturnType<typeof prescriptions>; mandatoryIds: string[]; slots: Exercise[][]; sets: number; reps: number; restSeconds: number; durationLimitSeconds?: number; repetitionsRange?: { min: number; max: number }; includeCues: boolean; assumptions: string[]; partial: boolean; preparation: { kind: 'warmup' | 'cooldown'; description: string; durationSeconds: number }[] }
type PlanResult = { kind: 'plan'; plan: Plan; diagnostics: PlannerDiagnostics } | { kind: 'clarification'; question: string; diagnostics: PlannerDiagnostics } | { kind: 'infeasible'; reason: string; diagnostics: PlannerDiagnostics }

function excludedEquipment(text: string): Set<Equipment> {
  const excluded = new Set<Equipment>()
  const negatives = /\b(?:no|without|avoid|exclude|don't use|do not use|not using)\s+((?:the\s+)?(?:\w+[ -]?){0,2}(?:equipment|dumbbells?|barbells?|bands?|kettlebells?|cables?|machines?|bodyweight|body weight))\b/gi
  for (const match of text.matchAll(negatives)) {
    const phrase = match[1]
    for (const [pattern, type] of equipmentTerms) if (pattern.test(phrase)) excluded.add(type)
  }
  // A negated item in a list scopes through subsequent equipment items.
  for (const match of text.matchAll(/\b(?:no|without|avoid|exclude)\s+([^.;!?]+)/gi)) {
    const clause = match[1].split(/\b(?:but|except|however)\b/i)[0]
    for (const [pattern, type] of equipmentTerms) if (pattern.test(clause)) excluded.add(type)
  }
  return excluded
}

function restrictionExcludes(exercise: Exercise, text: string): boolean {
  const name = exercise.name.toLowerCase().replace(/[_-]+/g, ' ')
  const instructions = exercise.instructions.join(' ').toLowerCase()
  // Interpret specific restrictions at movement level. “Avoid overhead pressing” does not ban
  // all shoulder work or a shoulder-height band movement.
  if (/\b(?:avoid|no|without|exclude|never)\s+(?:all\s+)?overhead press(?:es|ing)?\b/i.test(text) && /press/i.test(name) && /overhead|military|shoulder|head height|above (?:your|the) head/i.test(`${name} ${instructions}`)) return true
  const prohibitions: [RegExp, RegExp][] = [
    [/\b(?:avoid|no|without|exclude|never)\s+(?:all\s+)?(?:overhead|military) press(?:es|ing)?\b/i, /\b(?:overhead|military|shoulder) press\b|press.{0,50}(?:overhead|head height|above (?:your|the) head)/i],
    [/\b(?:avoid|no|without|exclude|never)\s+(?:all\s+)?squats?\b/i, /\bsquat\b/i],
    [/\b(?:avoid|no|without|exclude|never)\s+(?:all\s+)?lunges?\b/i, /\blunge\b/i],
    [/\b(?:avoid|no|without|exclude|never)\s+(?:all\s+)?push[ -]?ups?\b/i, /push.?up/i],
    [/\bno jumping\b/i, /jump|plyo/i],
    [/\b(?:avoid|no|without|exclude|never)\s+(?:all\s+)?(?:twisting|rotation)\b/i, /twist|rotation/i],
  ]
  if (prohibitions.some(([request, movement]) => request.test(text) && movement.test(`${name} ${instructions}`))) return true
  if (/\b(?:avoid|no|without|exclude|never)\s+(?:loaded\s+)?spinal flexion\b/i.test(text) &&
      movementFamily(exercise) === 'trunk-flexion' &&
      (!/\bloaded\s+spinal flexion\b/i.test(text) || (exercise.equipment ?? 'BODY_ONLY') !== 'BODY_ONLY')) return true
  if (/\bwrist\b/i.test(text) && /\b(?:pain|hurt|ache|discomfort|injur|neutral|avoid|limit)\w*/i.test(text)) {
    if (/\bneutral\b/i.test(text)) return /\b(?:wrist|hands?|grips?|holds?|barbells?|dumbbells?|kettlebells?|support (?:your )?(?:body|weight))\b/i.test(instructions) && !/\b(?:neutral grip|palms? (?:facing|face) (?:each other|inward|in|your torso)|palm facing your torso|hammer curl)\b/i.test(`${name} ${instructions}`)
    return /hands? (?:on|against) (?:the )?(?:floor|ground)|support (?:your )?(?:body|weight) (?:with|on) (?:your )?hands/i.test(instructions)
  }
  return false
}

type SuppliedContext = { profile?: { limitations?: string[]; trainingAge?: string }; equipment?: string[] }

function splitSuppliedContext(message: string): { request: string; context: SuppliedContext | null } {
  const marker = '\nUser-supplied context: '
  const index = message.lastIndexOf(marker)
  if (index < 0) return { request: message, context: null }
  try {
    const context = JSON.parse(message.slice(index + marker.length)) as SuppliedContext
    return { request: message.slice(0, index), context }
  } catch {
    return { request: message, context: null }
  }
}

export function workoutRequestText(message: string): string {
  return splitSuppliedContext(message).request
}

const fullGymEquipment: Equipment[] = ['DUMBBELL', 'BARBELL', 'BANDS', 'KETTLEBELLS', 'CABLE', 'MACHINE']

const contextEquipment: Record<string, Equipment> = {
  'no equipment': 'BODY_ONLY', 'bodyweight only': 'BODY_ONLY', bodyweight: 'BODY_ONLY',
  dumbbells: 'DUMBBELL', dumbbell: 'DUMBBELL', barbell: 'BARBELL', barbells: 'BARBELL',
  'resistance bands': 'BANDS', bands: 'BANDS', band: 'BANDS', kettlebell: 'KETTLEBELLS', kettlebells: 'KETTLEBELLS',
  cable: 'CABLE', cables: 'CABLE', machine: 'MACHINE', machines: 'MACHINE',
}

export function planWorkout(message: string, focus?: WorkoutFocus): PlanResult {
  const { request: messageText, context } = splitSuppliedContext(message)
  const restrictions = context?.profile?.limitations?.filter(x => typeof x === 'string').join('; ') ?? ''
  // The appended JSON is data, not user-authored request language. Only its limitation
  // values participate in movement checks; counts, duration, and exclusions come from the request.
  const safetyText = [messageText, restrictions].filter(Boolean).join('\n')
  message = messageText
  const countPattern = /(?<![\d.])(?:(at least|minimum|at most|up to|maximum|max\.?|no more than|exactly)\s+)?(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|–|—|to)\s*)?(-?\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+((?:(?:beginner|intermediate|advanced|balanced|chest|back|legs?|glutes?|quads?|quadriceps|hamstrings?|calves?|arms?|shoulders?|core|biceps|triceps)\s+)*)(?:exercises?|movements?)\b/gi
  const countMatches = [...message.matchAll(countPattern)]
  const countMatch = countMatches[0]
  const countScopes = new Set(countMatches.map(match => match[4].trim().toLowerCase()))
  const countMinimum = countMatches.length ? Math.max(...countMatches.map(match => match[2] ? numberValue(match[2]) : /^(?:up to|at most|maximum|max\.?|no more than)$/i.test(match[1] ?? '') ? 1 : numberValue(match[3]))) : 3
  const countMaximum = countMatches.length ? Math.min(...countMatches.map(match => /^(?:at least|minimum)$/i.test(match[1] ?? '') ? 8 : numberValue(match[3]))) : 3
  let count = countMatches.length ? (countMatches.every(match => /^(?:at least|minimum)$/i.test(match[1] ?? '')) ? countMinimum : countMaximum) : 3
  const isCap = countMatches.length > 0 && countMatches.every(match => /^(?:up to|at most|maximum|max\.?|no more than)$/i.test(match[1] ?? ''))
  const prescription = prescriptions(message)
  const duration = prescription.duration
  const setsMatch = prescription.sets !== undefined
  const repetitionsRange = prescription.reps && prescription.reps.min !== prescription.reps.max
    ? prescription.reps : /\b(?:rep|repetition) ranges?\b/i.test(message) ? { min: 8, max: 12 } : undefined
  const repsMatch = prescription.reps !== undefined
  const includeCues = /\b(?:coaching|exercise) cues\b/i.test(message)
  let sets = prescription.sets ?? (duration === null ? 3 : Math.min(3, Math.max(1, Math.floor(duration / (count * 2)))) )
  const reps = repetitionsRange ? Math.round((repetitionsRange.min + repetitionsRange.max) / 2) : prescription.reps?.min ?? 10
  const restSeconds = prescription.rest ?? 60
  // Explicit lists are bounded by punctuation or a prescription; other prose is not an identity parser.
  const namedClause = /\b(?:including|include|perform|featuring|consisting of|i want|with)\s+(?:(only|exactly)\s+)?(?:the\s+)?(.+?)(?=[,;]\s*(?:\d+\s*(?:sets?|reps?|exercises?|movements?)|full[- ]gym|bodyweight|no equipment)|[.!?\n]|$)/i.exec(message)
  const colonNames = /\bworkout\s*:\s*([^.!?\n]+)/i.exec(message)?.[1]
  const rawNames = (namedClause?.[2] ?? colonNames)?.replace(/\s+(?:among|in|for)\s+\d+\s+(?:exercises?|movements?).*$/i, '').trim() ?? ''
  const namingShape = (!!colonNames || !!namedClause && (!!namedClause[1] || /^(?:a|an)\s+/i.test(rawNames) || /\b(?:including|include|perform|featuring|consisting of|i want)\b/i.test(namedClause[0]) || /\b(?:exercise|movement|press|row|push[ -]?ups?|spin)\b/i.test(rawNames))) &&
    !/^(?:\d+|one|two|three|four|five)\s+(?:(?:chest|back|legs?|glutes?|arms?|shoulders?|core)\s+)?(?:sets?|exercises?|movements?|days?)\b/i.test(rawNames) && !/^(?:a\s+)?(?:\d+\s*(?:minute|min)\s+)?(?:warm[ -]?up|cool[ -]?down|focus\b|goal\b|full[- ]gym|sets?\b|reps?\b|rests?\b|not\b)/i.test(rawNames) && !/^(?:only\s+)?(?:dumbbells?|barbells?|bands?|kettlebells?|cables?|machines?|bodyweight|no equipment)(?:\s+only)?$/i.test(rawNames)
  const names = namingShape ? rawNames.replace(/^(?:a|an)\s+/i, '').replace(/\s+(?:exercise|movement)$/i, '').split(/\s*(?:,|;)\s*(?:and\s+)?|\s+and\s+/i).map(name => name.trim()).filter(Boolean) : []
  const excluded = excludedEquipment(message)
  const equipmentText = namingShape && namedClause ? message.replace(namedClause[0], ' ') : message
  const explicitlySpecified = new Set<Equipment>()
  for (const [pattern, equipment] of equipmentTerms) if (pattern.test(equipmentText) && !excluded.has(equipment)) explicitlySpecified.add(equipment)
  if (/\bfull[- ]gym\b/i.test(equipmentText)) for (const value of fullGymEquipment) explicitlySpecified.add(value)
  const suppliedEquipment = context?.equipment?.flatMap(value => /\bfull[- ]gym\b/i.test(value) ? fullGymEquipment : contextEquipment[value.trim().toLowerCase()] ? [contextEquipment[value.trim().toLowerCase()]] : [])
  if (suppliedEquipment?.length) {
    explicitlySpecified.clear()
    suppliedEquipment.forEach(value => explicitlySpecified.add(value))
  }
  if (!suppliedEquipment?.length && /\bbody ?weight only\b|\bno equipment\b/i.test(message)) { explicitlySpecified.clear(); explicitlySpecified.add('BODY_ONLY') }
  const equipmentSpecified = explicitlySpecified.size > 0 || excluded.has('BODY_ONLY') || /\b(?:no equipment|body ?weight only)\b/i.test(message)
  const available: Equipment[] = equipmentSpecified ? [...explicitlySpecified] : []
  if (equipmentSpecified && !excluded.has('BODY_ONLY')) available.push('BODY_ONLY')
  const uniqueAvailable = [...new Set(available)]
  const benchAvailable = hasBench(message, context)
  const levelText = `${message} ${context?.profile?.trainingAge ?? ''}`
  const abilityLevel = /\b(?:expert|advanced|experienced)\b/i.test(levelText) ? 'EXPERT' : /\bintermediate\b/i.test(levelText) ? 'INTERMEDIATE' : 'BEGINNER'
  const diagnostics: PlannerDiagnostics = { equipment: uniqueAvailable, candidateCounts: [], durationMinutes: duration, estimatedMinutes: count * sets * 2, sets, setsExplicit: !!setsMatch, refusalReason: null, unmetRequirements: [] }
  const fail = (reason: string): PlanResult => ({ kind: 'infeasible', reason, diagnostics: { ...diagnostics, refusalReason: reason } })
  if (/\b(?:no|not|without|avoid|exclude)\s+(?:(?:more|less|fewer)\s+than\s+)?(?:\d+|one|two|three|four|five|any)\s*(?:sets?|reps?|repetitions?|exercises?|movements?)\b/i.test(message) || /\b(?:sets?|reps?|repetitions?)\s*(?:of\s*)?(?:zero|one|two|three|four|five)\b/i.test(message)) return { kind: 'clarification', question: 'Please specify one supported positive exercise count, set count, and repetition range.', diagnostics }
  if (/\b\d+\s*(?:-|–|—|to)\s*\d+\s*sets?\b/i.test(message)) return { kind: 'clarification', question: 'Please specify one exercise and set count rather than a range.', diagnostics }
  if (countScopes.size > 1 || countMinimum > countMaximum) return { kind: 'clarification', question: 'Please clarify the exercise counts and whether they apply to the whole workout or a specific muscle group.', diagnostics }
  if (prescription.conflict) return { kind: 'clarification', question: 'Please clarify the conflicting or unsupported sets, repetitions, rest, or session duration.', diagnostics }
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) return fail('Session duration must be positive.')
  const namedExercises: Exercise[] = []
  for (const name of names) {
    const resolved = resolveHistoryExercise(name)
    if (resolved.kind !== 'match') {
      const query = normalizeHistoryName(name).replace(/s$/, '')
      const choices = exerciseCatalog.filter(exercise => exercise.setupReviewStatus === 'reviewed' && normalizeHistoryName(exercise.name).includes(query)).slice(0, 5).map(exercise => exercise.name)
      return { kind: 'clarification', question: `I cannot identify “${name}” as one specific catalog exercise.${choices.length ? ` Did you mean ${choices.join(', ')}?` : ' Please name a supported catalog exercise.'} I cannot substitute another movement.`, diagnostics }
    }
    namedExercises.push(resolved.exercise)
  }
  if (new Set(namedExercises.map(exercise => exerciseSlotIdentity(exercise.id))).size !== namedExercises.length) return { kind: 'clarification', question: 'Please choose distinct named exercises.', diagnostics }
  const exactNames = !!namedClause?.[1] && namedExercises.length > 0
  if (namedExercises.length && ((countMatch && (namedExercises.length > count || (exactNames && namedExercises.length !== count))) || (!countMatch && exactNames && namedExercises.length > 8))) return { kind: 'clarification', question: 'The named exercise list conflicts with the requested exercise count. Which count and movements should I use?', diagnostics }
  if (exactNames && !countMatch) count = namedExercises.length
  if (!equipmentSpecified) return { kind: 'clarification', question: 'What equipment can you use: a full gym, specific equipment, or bodyweight only?', diagnostics }
  if (!Number.isSafeInteger(restSeconds) || restSeconds < 0) return fail('Rest must be a whole number of seconds.')
  if (countMinimum < 1 || countMinimum > countMaximum || count < 1 || sets < 1 || sets > 5 || reps < 1 || reps > 30 || (repetitionsRange && (repetitionsRange.min < 1 || repetitionsRange.max > 30 || repetitionsRange.min > repetitionsRange.max))) return fail('The requested exercise, set, or repetition count is outside the supported range.')
  const preparation: Plan['preparation'] = []
  if (/\bwarm[ -]?up\b/i.test(message)) preparation.push({ kind: 'warmup', description: 'Easy movement and rehearsal of the exercises', durationSeconds: Number(/(\d+)\s*-?\s*(?:minutes?|mins?)\s+(?:of\s+)?warm[ -]?up/i.exec(message)?.[1] ?? 5) * 60 })
  if (/\bcool[ -]?down\b/i.test(message)) preparation.push({ kind: 'cooldown', description: 'Easy movement and comfortable stretching', durationSeconds: Number(/(\d+)\s*-?\s*(?:minutes?|mins?)\s+(?:of\s+)?cool[ -]?down/i.exec(message)?.[1] ?? 3) * 60 })
  const preparationMinutes = preparation.reduce((total, part) => total + part.durationSeconds / 60, 0)
  const durationIsMaximum = hasDurationLimit(message)

  const equipmentConflict = /\b(?:conflicts? with|conflict(?:ing)? with) my listed setup\b/i.test(message) &&
    /\b(?:prioriti[sz]e|use) (?:the )?(?:listed )?equipment\b/i.test(message)
  let equipmentExplanation: string | undefined
  if (equipmentConflict) {
    const unavailable = [...new Set([...message.matchAll(/\b(dumbbells?|barbells?|bands?|kettlebells?|cables?|machines?)\b/gi)].map(match => match[1].toLowerCase().replace(/s$/, '')))]
      .filter(item => !uniqueAvailable.some(value => value.toLowerCase().includes(item)))
    const unavailableLabel = unavailable.includes('cable') && unavailable.includes('machine') ? 'cable machine options' : unavailable.join(', ') || 'another setup'
    equipmentExplanation = `The ${unavailableLabel} conflict with the listed setup (${context?.equipment?.join(', ') || uniqueAvailable.join(', ')}); this plan uses only the listed equipment.`
  }

  const focusTargets = { push: [['chest'], ['shoulders'], ['triceps']], pull: [['lats', 'middle back'], ['biceps'], ['traps']], legs: [['quadriceps'], ['hamstrings', 'glutes'], ['calves']] } satisfies Record<WorkoutFocus, string[][]>
  let requested = groupTerms.filter(([pattern]) => pattern.test(message)).map(([, muscles]) => muscles)
  if (!focus && /\bupper[- ]body\b/i.test(message)) requested.push(['chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'traps'])
  if (focus) requested = focusTargets[focus]
  const explicitTargetCount = requested.length
  const fullBody = !focus && /\bfull[- ]body\b/i.test(message)
  const wholeBodyTargets = [lower, upper, ['abdominals', 'lats', 'middle back']]
  if (fullBody) requested.push(...wholeBodyTargets.filter(group => !requested.some(existing => existing.some(muscle => group.includes(muscle)))))
  const targets = requested.length ? requested : wholeBodyTargets
  if (/(?:knee|knees).{0,32}(?:pain|discomfort|injur|hurt|ache)|(?:pain|discomfort|injur|hurt|ache).{0,32}(?:knee|knees)/i.test(restrictions) &&
      /\b(?:legs?|lower body|full[- ]body|squat|lunge)\b/i.test(messageText)) {
    return { kind: 'clarification', question: 'Which lower-body movements, if any, feel comfortable with your knee right now? Should I avoid knee-bending movements such as squats and lunges?', diagnostics }
  }
  let bodyweightFallback = false
  if (context && abilityLevel === 'BEGINNER' && /\beasy to scale\b/i.test(message) && available.includes('BARBELL') && !available.some(item => ['DUMBBELL', 'BANDS', 'KETTLEBELLS'].includes(item))) {
    const hasBodyweightTarget = exerciseCatalog.some(exercise =>
      exercise.setupReviewStatus === 'reviewed' && (exercise.equipment ?? 'BODY_ONLY') === 'BODY_ONLY' && exercise.category === 'STRENGTH' &&
      exercise.level === 'BEGINNER' && exercise.primaryMuscles.some(muscle => targets.some(target => target.includes(muscle.toLowerCase()))) &&
      !unsafeNames.test(exercise.name) && !restrictionExcludes(exercise, safetyText) &&
      (!requiresBench(exercise) || benchAvailable) &&
      !setupTerms.some(([pattern, required]) => pattern.test(`${exercise.name} ${exercise.instructions.join(' ')}`) && !uniqueAvailable.includes(required))
    )
    if (!hasBodyweightTarget) {
      const question = /\b(?:exact count|exactly)\b/i.test(message) && /\b(?:what i can access|what equipment can i access)\b/i.test(message)
        ? 'What is the barbell’s unloaded weight, and do you have lighter plates? Can you comfortably hold the bar on your shoulders and control a hip hinge and row? If those make four suitable exercises infeasible, what other equipment can you access?'
        : /\bwrist\b/i.test(restrictions)
        ? 'What is the barbell’s unloaded weight, and can you grip it while keeping your wrists neutral? Do you have lighter plates or another lighter option?'
        : 'What is the barbell’s unloaded weight, and do you have lighter plates or another lighter option? I can then choose movements that are easy to scale.'
      return { kind: 'clarification', question, diagnostics }
    }
    bodyweightFallback = true
  }
  if (/\bunknown (?:ability|experience)\b/i.test(message)) {
    return { kind: 'clarification', question: 'What exercises or movement patterns can you currently perform comfortably, and what support or equipment is available?', diagnostics }
  }
  const requestedSlots = Math.min(count, 8)
  if (count > 8 && !isCap) diagnostics.unmetRequirements.push(`Requested ${count} exercises; this planner supports up to 8.`)
  const allTargets = [...new Set(targets.flat())]
  const selectedTargets = Array.from({ length: requestedSlots }, (_, i) => targets[i] ?? allTargets)
  const namedEquipmentRequired = /\b(?:using\s+(?:the\s+)?only\s+|with\s+(?:the\s+)?only\s+)(?:dumbbells?|barbells?|bands?|kettlebells?|cables?|machines?)\b|\b(?:dumbbells?|barbells?|bands?|kettlebells?|cables?|machines?)\s+only\b/i.test(message)
  const onlyClause = /\b(?:using|with)\s+only\s+([^,.;!?]+)|\b((?:dumbbells?|barbells?|bands?|kettlebells?|cables?|machines?))\s+only\b/i.exec(message)
  const requiredImplements = new Set(equipmentTerms.filter(([pattern, equipment]) => equipment !== 'BODY_ONLY' && pattern.test(onlyClause?.[1] ?? onlyClause?.[2] ?? '')).map(([, equipment]) => equipment))
  const catalog = exerciseCatalog.filter(exercise => {
    const equipment = exercise.equipment ?? 'BODY_ONLY'
    const description = `${exercise.name} ${exercise.instructions.join(' ')}`
    const needsBench = requiresBench(exercise)
    const catalogEquipment = exercise.equipment ?? 'BODY_ONLY'
    const equipmentConflict = (catalogEquipment === 'BARBELL' && /\bdumbbells?\b/i.test(description)) || (catalogEquipment === 'DUMBBELL' && /\bbarbell\b/i.test(description))
    const setupMissing = missingSetup(exercise, message, context) || (needsBench && !benchAvailable) || setupTerms.some(([pattern, required]) => pattern.test(description) && !available.includes(required))
    const focusForceAllowed = focus === 'push' ? exercise.force !== 'PULL' : focus === 'pull' ? exercise.force !== 'PUSH' : true
    const targetMatch = selectedTargets.some(target => [...exercise.primaryMuscles, ...exercise.secondaryMuscles].some(muscle => target.includes(muscle.toLowerCase())))
    const levelAllowed = abilityLevel === 'EXPERT' || (abilityLevel === 'INTERMEDIATE' ? exercise.level !== 'EXPERT' : exercise.level === 'BEGINNER')
    return exercise.setupReviewStatus === 'reviewed' && uniqueAvailable.includes(equipment) && (!namedEquipmentRequired || requiredImplements.has(equipment)) && (!bodyweightFallback || equipment === 'BODY_ONLY') && !excluded.has(equipment) && !setupMissing && !equipmentConflict && levelAllowed && exercise.category === 'STRENGTH' && (!includeCues || exercise.instructions.length > 0) && !unsafeNames.test(exercise.name) && !restrictionExcludes(exercise, safetyText) && focusForceAllowed && (targetMatch || namedExercises.some(item => item.id === exercise.id)) && (!/\bupper[- ]body\b/i.test(message) || exercise.primaryMuscles.some(muscle => ['chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'traps'].includes(muscle.toLowerCase()))) && (!focus || exercise.primaryMuscles.some(muscle => focusTargets[focus].flat().includes(muscle.toLowerCase())))
  })
  for (const exercise of namedExercises) {
    if (!catalog.some(item => item.id === exercise.id)) {
      const reason = exercise.setupReviewStatus !== 'reviewed' ? 'its setup has not been reviewed' : !uniqueAvailable.includes(exercise.equipment ?? 'BODY_ONLY') ? `the available equipment does not include ${exercise.equipment ?? 'bodyweight'}` : missingSetup(exercise, message, context) || (requiresBench(exercise) && !benchAvailable) ? 'the required setup is not available or specified' : restrictionExcludes(exercise, safetyText) ? 'it conflicts with your stated restriction' : 'its ability level or other setup requirements do not match this request'
      return { kind: 'clarification', question: `${exercise.name} cannot be included because ${reason}. What compatible alternative can you use?`, diagnostics }
    }
  }
  const allCandidates = selectedTargets.map(target => {
    return catalog
    .filter(exercise => exercise.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase())) || exercise.secondaryMuscles.some(muscle => target.includes(muscle.toLowerCase())))
    .filter(exercise => {
      const primary = catalog.filter(candidate => candidate.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase())))
      return primary.length === 0 || exercise.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase()))
    })
    .sort((a, b) => Number(!a.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase()))) - Number(!b.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase()))) || Number(!explicitlySpecified.has(a.equipment ?? 'BODY_ONLY')) - Number(!explicitlySpecified.has(b.equipment ?? 'BODY_ONLY')))
  })
  namedExercises.forEach((exercise, index) => { allCandidates[index] = [exercise]; selectedTargets[index] = exercise.primaryMuscles.map(muscle => muscle.toLowerCase()) })
  diagnostics.candidateCounts = allCandidates.map(slot => slot.length)
  const viableTargets = selectedTargets.filter((_, index) => allCandidates[index].length > 0)
  const candidates = allCandidates.filter(slot => slot.length > 0)
  const targetHasPrimary = catalog.some(exercise => viableTargets.some(target => exercise.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase()))))
  if (!candidates.length || !targetHasPrimary) {
    if (context && abilityLevel === 'BEGINNER' && uniqueAvailable.length === 2 && uniqueAvailable.includes('KETTLEBELLS') && uniqueAvailable.includes('BODY_ONLY') && /\b(?:back|lats?)\b/i.test(message)) {
      return { kind: 'clarification', question: 'What is the kettlebell’s weight, and can you hold a controlled hip hinge and row without discomfort? The catalog’s back-row option is labeled intermediate.', diagnostics }
    }
    if (context && uniqueAvailable.length === 1 && uniqueAvailable[0] === 'BODY_ONLY' && /\b(?:back|lats?)\b/i.test(message) && /\boverhead press(?:ing)?\b/i.test(restrictions)) {
      return { kind: 'clarification', question: 'Do you have secure support such as a pull-up bar, and is overhead reaching comfortable? If not, what other equipment or back movements can you use?', diagnostics }
    }
    if (equipmentConflict) return { kind: 'clarification', question: `The cable machine conflicts with the listed setup (${context?.equipment?.join(', ') || uniqueAvailable.join(', ')}), and I could not establish a setup-reviewed movement for ${targets.map(target => target.join('/')).join(' or ')} using only that setup. What other equipment or movement variation can you use?`, diagnostics }
    const equipmentRequest = explicitlySpecified.size > 0 ? [...explicitlySpecified].join(', ') : 'suitable equipment or movement options'
    return { kind: 'clarification', question: `I could not establish a suitable setup-reviewed catalog movement for this request with ${equipmentRequest}; other catalog setup requirements may be unknown. What equipment and movement variations can you use comfortably?`, diagnostics }
  }
  const chosen: Exercise[] = []
  const assignment: (Exercise | undefined)[] = []
  const assign = (indices: number[]): boolean => {
    if (!indices.length) return true
    const next = indices.reduce((best, index) => candidates[index].filter(e => !chosen.some(c => exerciseSlotIdentity(c.id) === exerciseSlotIdentity(e.id))).length < candidates[best].filter(e => !chosen.some(c => exerciseSlotIdentity(c.id) === exerciseSlotIdentity(e.id))).length ? index : best)
    const diversityCost = (exercise: Exercise) => chosen.filter(item => movementFamily(item) === movementFamily(exercise)).length
    const ordered = [...candidates[next]].sort((a, b) => diversityCost(a) - diversityCost(b))
    for (const exercise of ordered) {
      if (chosen.some(item => exerciseSlotIdentity(item.id) === exerciseSlotIdentity(exercise.id))) continue
      chosen.push(exercise); assignment[next] = exercise
      if (assign(indices.filter(i => i !== next))) return true
      chosen.pop(); delete assignment[next]
    }
    return false
  }
  let assigned = false
  for (let slotCount = candidates.length; slotCount > 0 && !assigned; slotCount--) assigned = assign(Array.from({ length: slotCount }, (_, i) => i))
  if (!assigned) return { kind: 'clarification', question: 'The available movements overlap too much to make a useful distinct session. Which muscle group or exercise variation should I prioritize?', diagnostics }
  const filled = assignment.filter((exercise): exercise is Exercise => exercise !== undefined)
  let selectedAssignments = assignment.flatMap((exercise, index) => exercise ? [{ exercise, target: viableTargets[index] }] : [])
  const scheduleSeconds = (items: typeof selectedAssignments) => preparationMinutes * 60 + items.reduce((sum, item, index) => {
    const name = item.exercise.name.replace(/[_-]+/g, ' ')
    const unilateral = /\b(?:single|one|alternating)[ -]?(?:arm|leg|side)\b/i.test(name)
    const work = sets * reps * 3 * (unilateral ? 2 : 1)
    const rest = Math.max(0, sets - 1) * restSeconds
    return sum + estimatedExerciseSeconds(sets, work, rest, unilateral ? 2 : 1) + (index > 0 ? 30 : 0)
  }, 0)
  // Reduce default sets before dropping requested movements.
  while (durationIsMaximum && duration !== null && !setsMatch && sets > 1 && scheduleSeconds(selectedAssignments) > duration * 60) sets--
  diagnostics.sets = sets
  while (durationIsMaximum && duration !== null && selectedAssignments.length > 1 && scheduleSeconds(selectedAssignments) > duration * 60) {
    if (selectedAssignments.length <= namedExercises.length) return fail('The named exercises do not fit within the requested time limit.')
    selectedAssignments = selectedAssignments.slice(0, -1)
  }
  if (durationIsMaximum && duration !== null && scheduleSeconds(selectedAssignments) > duration * 60) return fail(`The requested work, rest, transitions, and preparation do not fit within ${duration} minutes.`)
  if (!isCap && (selectedAssignments.length < filled.length)) diagnostics.unmetRequirements.push(`The time limit restricts the requested exercise count with the estimated work, rest, transitions and preparation.`)
  diagnostics.estimatedMinutes = Math.ceil(scheduleSeconds(selectedAssignments) / 60)
  if (filled.length < requestedSlots && !isCap) diagnostics.unmetRequirements.push(`Requested ${count} exercises; found ${filled.length} distinct catalog choices with reviewed setup compatible with the known equipment and restrictions; other catalog setup requirements may be unknown.`)
  if (isCap && count > 1 && filled.length === 1 && /\bbalanced\b/i.test(message)) diagnostics.unmetRequirements.push('Only one distinct movement pattern fits this setup, so this is not a balanced session; add equipment or allow another variation.')
  if (/\barms?\b/i.test(message) && /\bbalanced\b/i.test(message) && !['biceps', 'triceps'].every(muscle => selectedAssignments.some(({ exercise }) => exercise.primaryMuscles.some(item => item.toLowerCase() === muscle)))) diagnostics.unmetRequirements.push('The selected movements do not cover both biceps and triceps, so this is not a balanced arm session.')
  if (explicitTargetCount > count || (fullBody && targets.length > count)) diagnostics.unmetRequirements.push(`The request names ${fullBody ? targets.length : explicitTargetCount} muscle groups but allows at most ${count} exercise${count === 1 ? '' : 's'}; some groups are uncovered.`)
  if (allCandidates.some(slot => slot.length === 0)) diagnostics.unmetRequirements.push('Some requested muscle groups have no compatible setup-reviewed catalog exercise in the recorded setup; other catalog options have unknown setup requirements.')
  if (selectedAssignments.some(({ exercise, target }) => !exercise.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase())))) diagnostics.unmetRequirements.push('Some listed exercises involve the requested area secondarily, so target coverage is limited.')
  if (duration !== null && !durationIsMaximum && (diagnostics.estimatedMinutes < duration * 0.8 || diagnostics.estimatedMinutes > duration)) diagnostics.unmetRequirements.push(`The estimated session does not match the requested ${duration}-minute session.`)
  const assumptions = [
    ...(diagnostics.unmetRequirements.length ? [`PARTIAL WORKOUT — ${diagnostics.unmetRequirements.join(' ')}`] : []),
    'Exercise choices are limited to catalog entries with reviewed setup requirements; other catalog options may have unknown setup requirements.',
    ...(equipmentExplanation ? [equipmentExplanation] : []),
    ...(/\bfull[- ]gym\b/i.test(`${message} ${(context?.equipment ?? []).join(' ')}`) ? ['Full gym is treated as including a bench and pairs of dumbbells.'] : []),
    ...(!/\b(?:beginner|novice|intermediate|advanced|expert|experienced)\b/i.test(message) && !context?.profile?.trainingAge
      ? ['No ability level was provided; choose only movements you can perform comfortably and with control.']
      : []),
    ...(!countMatch ? ['Assumed 3 exercises.'] : []),
    ...(!setsMatch ? [`Assumed ${sets} sets.`] : []),
    `${restSeconds} seconds rest between sets${prescription.rest === undefined ? ' (assumed)' : ''}.`,
    ...(repetitionsRange
      ? [`Assumed ${repetitionsRange.min}–${repetitionsRange.max} repetitions per set; ${reps} is the editable starting value.`]
      : !repsMatch ? [`Assumed ${reps} repetitions per set.`] : []),
    ...(/\b(?:coaching|exercise) cues\b/i.test(message) ? ['Catalog coaching cues are included with each selected movement.'] : []),
    ...(duration === null ? ['No duration was specified; allow about 2 minutes per set, including rest and transitions.'] : ['Allow about 2 minutes per set, including rest and transitions; the estimate is approximate.']),
    ...(/\bwrist\b/i.test(safetyText) && /\bneutral\b/i.test(safetyText) ? ['These grip options are conditional: keep your wrists neutral and use them only if comfortable.'] : []),
    'Choose a suitable, controllable load; no load has been prescribed. Stop if a movement causes pain.',
  ]
  const slots = selectedAssignments.map(({ exercise }) => [exercise])
  for (const candidate of catalog) {
    if (selectedAssignments.some(item => item.exercise.id === candidate.id)) continue
    const owner = slots.findIndex(slot => slot.some(exercise => exerciseSlotIdentity(exercise.id) === exerciseSlotIdentity(candidate.id)))
    const eligible = selectedAssignments.flatMap(({ exercise, target }, index) => {
      if (index < namedExercises.length || (owner >= 0 && owner !== index)) return []
      const primary = exercise.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase()))
      const muscles = primary ? candidate.primaryMuscles : candidate.secondaryMuscles
      return slots[index].length < 8 && muscles.some(muscle => target.includes(muscle.toLowerCase())) ? [index] : []
    })
    const next = eligible.sort((a, b) => slots[a].length - slots[b].length)[0]
    if (next !== undefined) slots[next].push(candidate)
  }
  return { kind: 'plan', plan: { countRange: { min: !countMatch ? (exactNames ? count : 1) : diagnostics.unmetRequirements.length ? Math.min(countMinimum, slots.length) : countMinimum, max: countMatch ? countMaximum : exactNames ? count : slots.length }, prescription, mandatoryIds: namedExercises.map(exercise => exercise.id), slots, sets, reps, restSeconds, ...(durationIsMaximum && duration !== null ? { durationLimitSeconds: duration * 60 } : {}), ...(repetitionsRange ? { repetitionsRange } : {}), includeCues, preparation, assumptions, partial: diagnostics.unmetRequirements.length > 0 }, diagnostics }
}

export function selectionSchema(plan: Plan) {
  return z.strictObject({ selections: z.strictObject(Object.fromEntries(
    plan.slots.map((slot, index) => [`slot_${index + 1}`, z.enum(slot.map(exercise => exercise.name))])
  )) })
}
export function validateSelection(plan: Plan, raw: unknown): { names?: string[]; errors: string[] } {
  const parsed = z.strictObject({ selections: z.array(z.string()) }).safeParse(raw)
  if (!parsed.success) return { errors: ['Invalid selection schema'] }
  const names = parsed.data.selections
  const errors: string[] = []
  if (names.length !== plan.slots.length) errors.push('Incorrect selection count')
  if (new Set(names).size !== names.length) errors.push('Duplicate exercise')
  const identities = names.map(name => {
    const exercise = plan.slots.flat().find(exercise => exercise.name === name)
    return exercise ? exerciseSlotIdentity(exercise.id) : name
  })
  if (new Set(identities).size !== new Set(names).size) errors.push('Interchangeable exercise variants')
  if (names.some((name, i) => !plan.slots[i]?.some(e => e.name === name))) errors.push('Exercise is not eligible for its slot')
  if (!errors.length && plan.durationLimitSeconds !== undefined && estimateWorkoutSeconds(renderWorkout(plan, names).workout) > plan.durationLimitSeconds) errors.push('Selected exercises exceed the time limit')
  return errors.length ? { errors } : { names, errors }
}
export function renderWorkout(plan: Plan, names: string[]): Extract<CoachResponse, { kind: 'workout_draft' }> {
  const exercises = plan.slots.map((slot, i) => {
    const exercise = slot.find(e => e.name === names[i]) ?? slot[0]
    const guidance = {
      restSeconds: plan.restSeconds,
      ...(plan.repetitionsRange ? { repetitionsRange: plan.repetitionsRange } : {}),
      ...(plan.includeCues ? { cues: Array.from({ length: Math.min(4, exercise.instructions.length) }, (_, index) => exercise.instructions.slice(Math.floor(index * exercise.instructions.length / Math.min(4, exercise.instructions.length)), Math.floor((index + 1) * exercise.instructions.length / Math.min(4, exercise.instructions.length))).join(' ')) } : {}),
    }
    return { catalogId: exercise.id, sets: Array.from({ length: plan.sets }, () => ({ kind: 'strength' as const, repetitions: plan.reps, load: { kind: 'user_selected' as const } })), ...(Object.keys(guidance).length ? { guidance } : {}) }
  })
  const workout: CoachWorkout = { ref: 'workout', title: plan.partial ? 'Partial workout' : 'Workout', preparation: plan.preparation, exercises }
  const estimate = estimateWorkoutSeconds(workout)
  workout.schedule = { estimatedSeconds: estimate, transitionSeconds: Math.max(0, exercises.length - 1) * 30 }
  return { version: 1, kind: 'workout_draft', workout, assumptions: [...plan.assumptions, `Estimated schedule: ${Math.ceil(estimate / 60)} minutes, including preparation, work, rest, transitions and both sides where applicable.`] }
}
export function defaultSelection(plan: Plan): string[] { return plan.slots.map(slot => slot[0].name) }

/** Recheck the original planner constraints against an edited workout. */
export function validateWorkoutReview(request: string, draft: Extract<CoachResponse, { kind: 'workout_draft' | 'routine_draft' }>): string[] {
  const schedule = parseWorkoutSchedule(workoutRequestText(request))
  const scheduleErrors = schedule.kind === 'weekly' && (draft.kind !== 'routine_draft' || draft.workouts.length !== schedule.sessions)
    ? [`The routine must contain ${schedule.sessions} workout sessions.`] : []
  if (draft.kind === 'routine_draft') {
    const focuses = workoutSessionFocuses(schedule)
    const ordered = draft.routine.type === 'WEEKLY_COMPLETION' ? draft.routine.workoutRefs : draft.routine.days.flatMap(day => day.kind === 'workout' ? [day.workoutRef] : [])
    return [...scheduleErrors, ...ordered.flatMap((ref, index) => {
      const workout = draft.workouts.find(workout => workout.ref === ref)
      return workout ? validateSessionReview(request, workout, focuses[index]) : ['The routine references an unknown workout.']
    })]
  }
  return [...scheduleErrors, ...validateSessionReview(request, draft.workout)]
}

function validateSessionReview(request: string, workout: CoachWorkout, focus?: WorkoutFocus): string[] {
  const result = planWorkout(request, focus)
  if (result.kind !== 'plan') return ['The original request no longer produces a compatible workout.']
  const errors: string[] = []
  for (const id of result.plan.mandatoryIds) {
    if (!workout.exercises.some(exercise => exercise.catalogId === id)) errors.push(`The required exercise ${exerciseCatalog.find(exercise => exercise.id === id)?.name ?? id} is missing.`)
  }
  if (new Set(workout.exercises.map(exercise => exercise.catalogId)).size !== workout.exercises.length) errors.push('Duplicate exercise')
  if (new Set(workout.exercises.map(exercise => exerciseSlotIdentity(exercise.catalogId))).size !== new Set(workout.exercises.map(exercise => exercise.catalogId)).size) errors.push('Interchangeable exercise variants')
  for (const selection of workout.exercises) {
    if (!result.plan.slots.some(slot => slot.some(exercise => exercise.id === selection.catalogId)))
      errors.push(`Exercise ${selection.catalogId} does not match the original setup or restrictions.`)
  }
  const { min: minimum, max: maximum } = result.plan.countRange
  if (workout.exercises.length < minimum || workout.exercises.length > maximum) errors.push('The edited workout must keep the requested exercise count.')
  for (const part of result.plan.preparation) {
    if (!workout.preparation?.some(item => item.kind === part.kind && item.durationSeconds >= part.durationSeconds)) errors.push(`The requested ${part.kind} is missing.`)
  }
  const prescription = result.plan.prescription
  if (prescription.duration !== null && result.plan.durationLimitSeconds !== undefined && estimateWorkoutSeconds(workout) > prescription.duration * 60)
    errors.push(`The estimated schedule exceeds ${prescription.duration} minutes.`)
  if (prescription.sets !== undefined && workout.exercises.some(exercise => exercise.sets.length !== prescription.sets))
    errors.push(`Each exercise must have the requested ${prescription.sets} sets.`)
  if (prescription.reps && workout.exercises.some(exercise => exercise.sets.some(set => set.kind !== 'strength' || set.repetitions < prescription.reps!.min || set.repetitions > prescription.reps!.max)))
    errors.push('Each set must keep the requested repetitions.')
  if (prescription.reps && prescription.reps.min !== prescription.reps.max && workout.exercises.some(exercise => exercise.guidance?.repetitionsRange?.min !== prescription.reps!.min || exercise.guidance?.repetitionsRange?.max !== prescription.reps!.max))
    errors.push('Each exercise must keep the requested repetition range.')
  if (prescription.rest !== undefined && workout.exercises.some(exercise => (exercise.guidance?.restSeconds ?? 60) !== prescription.rest))
    errors.push(`Each exercise must keep the requested ${prescription.rest} seconds rest.`)
  return errors
}

export function estimateWorkoutSeconds(workout: Extract<CoachResponse, { kind: 'workout_draft' }>['workout']): number {
  let seconds = (workout.preparation ?? []).reduce((sum, part) => sum + part.durationSeconds, 0)
  workout.exercises.forEach((selection, index) => {
    const exercise = exerciseCatalog.find(item => item.id === selection.catalogId)
    const unilateral = exercise && /\b(?:single|one|alternating)[ -]?(?:arm|leg|side)\b/i.test(exercise.name.replace(/_/g, ' '))
    const sides = unilateral ? 2 : 1
    const work = selection.sets.reduce((sum, set) => sum + (set.kind === 'timed' ? set.durationSeconds : set.repetitions * 3) * sides, 0)
    const rest = Math.max(0, selection.sets.length - 1) * (selection.guidance?.restSeconds ?? 60)
    seconds += estimatedExerciseSeconds(selection.sets.length, work, rest, unilateral ? 2 : 1) + (index > 0 ? 30 : 0)
  })
  return seconds
}
