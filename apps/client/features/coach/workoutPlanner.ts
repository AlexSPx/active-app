import { z } from 'zod'
import { parseWorkoutSchedule, singleWorkoutFocus, workoutSessionFocuses, workoutSessionRequests, workoutVariation, type WorkoutFocus } from './workoutSchedule'
import { exerciseCatalog } from '../../lib/exercises/catalog'
import type { CoachResponse, CoachWorkout } from './contracts'
import { normalizeHistoryName, resolveHistoryExercise } from './historyQuery'

type Equipment = NonNullable<(typeof exerciseCatalog)[number]['equipment']>
type Exercise = (typeof exerciseCatalog)[number]
const interchangeableExerciseGroups: readonly (readonly string[])[] = [
  ['local:exercise:Dumbbell_Bench_Press', 'local:exercise:Dumbbell_Bench_Press_with_Neutral_Grip', 'local:exercise:Close-Grip_Dumbbell_Press', 'local:exercise:One_Arm_Dumbbell_Bench_Press', 'local:exercise:Dumbbell_Floor_Press'],
]

function exerciseSlotIdentity(id: string): string {
  return interchangeableExerciseGroups.find(group => group.includes(id))?.[0] ?? id
}

const equipmentTerms: [RegExp, Equipment][] = [
  [/\bbody ?weight|bodyweight|no equipment\b/i, 'BODY_ONLY'],
  [/\bdumbbells?\b/i, 'DUMBBELL'], [/\bbarbells?\b/i, 'BARBELL'],
  [/\bbands?\b/i, 'BANDS'], [/\bkettlebells?\b/i, 'KETTLEBELLS'],
  [/\b(?:cables?|pulleys?)\b/i, 'CABLE'], [/\bmachines?\b/i, 'MACHINE'],
  [/\b(?:exercise|stability) ball\b/i, 'EXERCISE_BALL'],
  [/\bmedicine ball\b/i, 'MEDICINE_BALL'],
  [/\b(?:pull.?up bar|chin.?up bar|parallel bars?|dip station)\b/i, 'OTHER'],
  [/\bpartner\b/i, 'OTHER'],
]
const groupTerms: [RegExp, string[]][] = [
  [/\bchest\b/i, ['chest']], [/\b(?:back|lats?)\b/i, ['lats', 'middle back', 'lower back', 'traps']],
  [/\bglutes?\b/i, ['glutes']], [/\b(?:quadriceps|quads?)\b/i, ['quadriceps']],
  [/\bhamstrings?\b/i, ['hamstrings']], [/\bcalves?\b/i, ['calves']],
  [/\b(?:legs?|lower[- ]body)\b/i, ['quadriceps', 'hamstrings', 'glutes', 'calves']],
  [/\b(?:abs|core|abdominals)\b/i, ['abdominals']], [/\bshoulders?\b/i, ['shoulders']],
  [/\barms?\b/i, ['biceps', 'triceps', 'forearms']], [/\bbiceps\b/i, ['biceps']], [/\btriceps\b/i, ['triceps']],
]
const upper = ['chest', 'shoulders', 'triceps']
const lower = ['quadriceps', 'hamstrings', 'glutes']
const defaultExerciseCount = 6
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

const intervalWorkPattern = /(-?\d+(?:\.\d+)?)\s*-?\s*(seconds?|secs?|s|minutes?|mins?|m)\s*(?:of\s+)?(?:work\b|intervals?\b|on\b(?=[^.!?\n]*\b(?:off|rest)\b))|\bwork\s+(?:for\s+)?(-?\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/gi
const intervalOffPattern = /(-?\d+(?:\.\d+)?)\s*-?\s*(seconds?|secs?|s|minutes?|mins?|m)\s+off\b/gi
const restPattern = /(-?\d+(?:\.\d+)?|one|two|three|half a)\s*(seconds?|secs?|minutes?|mins?)\s+(?:of\s+)?rest\b|\brest\s+(?:for\s+)?(-?\d+(?:\.\d+)?|one|two|three|half a)\s*(seconds?|secs?|minutes?|mins?)\b|(-?\d+(?:\.\d+)?|one|two|three|half a)\s*(seconds?|secs?|minutes?|mins?)\s+between\s+(?:sets?|exercises?|movements?)\b/gi

function numberValue(value: string): number {
  return value === 'half a' ? 0.5 : numberWords.indexOf(value.toLowerCase()) + 1 || Number(value)
}

function prescriptions(request: string) {
  const hiit = /\b(?:hiit|high[- ]intensity interval training)\b/i.test(request)
  const timed = hiit || /\b(?:timed (?:sets?|intervals?|workout)|work intervals?)\b/i.test(request) ||
    [...request.matchAll(intervalWorkPattern)].length > 0
  const work: number[] = []
  if (timed) {
    request = request.replace(intervalWorkPattern, (...args: string[]) => {
      work.push(Number(args[1] ?? args[3]) * (/^m/i.test(args[2] ?? args[4]) ? 60 : 1))
      return ' '
    }).replace(intervalOffPattern, (_match, value: string, unit: string) => `${Number(value) * (/^m/i.test(unit) ? 60 : 1)} seconds rest`)
  }
  const sets: number[] = [], reps: { min: number; max: number }[] = [], rest: number[] = [], durations: number[] = []
  const addReps = (min: string, max = min) => reps.push({ min: Number(min), max: Number(max) })
  const setsRanges = [...request.matchAll(/\b(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*sets?\b/gi)]
  const invalidSetsRange = setsRanges.some(([, min, max]) => Number(min) < 1 || Number(min) > Number(max))
  const withStartingSets = request.replace(/\b(\d+)\s*(?:-|–|—|to)\s*\d+\s*sets?\b/gi, '$1 sets')
  const withQualifiedSets = withStartingSets.replace(/\b((?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)(?:working|hard|heavy|straight)\s+sets\b/gi, '$1sets')
  for (const match of withQualifiedSets.matchAll(/(-?\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*sets?\b(?:\s+of\s+(-?\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*(?:-|–|—|to)\s*(\d+))?)?/gi)) {
    sets.push(numberValue(match[1])); if (match[2]) addReps(String(numberValue(match[2])), match[3])
  }
  for (const match of request.matchAll(/(-?\d+)\s*[x×]\s*(-?\d+)(?:\s*(?:-|–|—|to)\s*(\d+))?/gi)) {
    sets.push(Number(match[1])); addReps(match[2], match[3])
  }
  for (const match of request.matchAll(/(-?\d+)(?:\s*(?:-|–|—|to)\s*(\d+))?\s*(?:reps?|repetitions?)\b/gi)) addReps(match[1], match[2])
  const withoutPreparation = request.replace(/(-?\d+(?:\.\d+)?)\s*-?\s*(minutes?|mins?)\s+(?:of\s+)?(?:warm[ -]?up|cool[ -]?down)\b/gi, ' ')
  const withoutRest = withoutPreparation.replace(restPattern, (...args: string[]) => {
    const value = args[1] ?? args[3] ?? args[5], unit = args[2] ?? args[4] ?? args[6]
    rest.push(numberValue(value) * (/^min/i.test(unit) ? 60 : 1)); return ' '
  })
  for (const match of withoutRest.matchAll(/(-?\d+(?:\.\d+)?)\s*-?\s*(minutes?|mins?|hours?|hrs?)\b|\b(half an hour)\b/gi)) durations.push(match[3] ? 30 : Number(match[1]) * (/^(?:hour|hr)/i.test(match[2]) ? 60 : 1))
  if (/\bno rest\b/i.test(request)) rest.push(0)
  const distinct = (values: unknown[]) => new Set(values.map(value => JSON.stringify(value))).size > 1
  const unsupportedRest = /\brest\s+(?:for\s+)?(?:\d+\s*(?:-|–|—|to)\s*\d+|\d+\s*(?:minutes?|mins?)\s+\d+|\d+\s*(?:milliseconds?|hours?|hrs?))\b/i.test(request)
  const unsupported = unsupportedRest || /\b(?:rest\s+(?:for\s+)?(?:\d+\s*(?:-|to)\s*\d+|\w+)\s*(?:hours?|hrs?)|\d+\s*(?:-|to)\s*\d+\s*(?:seconds?|secs?|minutes?|mins?)\s+(?:of\s+)?rest|\d+\s*(?:-|to)\s*\d+\s*(?:minutes?|mins?|hours?|hrs?)|(?:no|not|without)\s+\d+\s*(?:sets?|reps?|repetitions?|[x×]\s*\d+))\b/i.test(request)
  return {
    sets: sets[0], setsRange: setsRanges[0] ? { min: Number(setsRanges[0][1]), max: Number(setsRanges[0][2]) } : undefined, reps: reps[0], rest: rest[0], duration: durations[0] ?? null,
    intervalSeconds: timed ? work[0] ?? 30 : null,
    assumedWork: timed && !work.length, hiit,
    conflict: invalidSetsRange || distinct(setsRanges.map(match => match.slice(1))) || distinct(sets) || distinct(reps) || distinct(rest) || distinct(durations) || distinct(work) || unsupported || (timed && reps.length > 0),
  }
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

function implementQuantity(inventory: string, implement: string): number | undefined {
  if (new RegExp(String.raw`\b(?:one|a|an|single|1)\s+${implement}\b`, 'i').test(inventory)) return 1
  if (new RegExp(String.raw`\b(?:pair of|two|2)\s+${implement}\b`, 'i').test(inventory)) return 2
  return undefined
}

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
  const inventoryCount = implementQuantity(inventory, implement)
  const quantityConflict = structured.minimumEquipmentQuantity !== undefined && ((inventoryCount ?? (/\bfull[- ]gym\b/i.test(inventory) ? 2 : 1)) < structured.minimumEquipmentQuantity)
  const structuredMissing = structured.anchors.some(anchor => {
    if (anchor === 'bench press rack') {
      if (/\b(?:no|without|avoid) (?:a |the )?(?:flat bench|bench|(?:bench press )?rack)\b/i.test(inventory)) return true
      return !/\b(?:full[- ]gym|bench press station|flat bench and (?:a )?rack|rack and (?:a )?flat bench)\b/i.test(inventory)
    }
    return !/\b(?:anchor|post|pull-up bar|chin-up bar|rack|fixed point)\b/i.test(inventory)
  }) ||
    structured.blocks.some(() => !/\bblock\b/i.test(inventory)) ||
    structured.supports.some(support => support === 'secured feet' ? !/\b(?:secured feet|feet secured|foot anchor)\b/i.test(inventory) : !hasBench(request, context) && !/\b(?:support|rack|sturdy chair|stable surface)\b/i.test(inventory))
  const fixedLoadMissing = structured.fixedLoadsKg.some(load => ![...inventory.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs|pounds?)/gi)].some(match => Math.abs(Number(match[1]) * (/^lb/i.test(match[2]) ? 0.45359237 : 1) - load) < 0.05))
  return missingBench(exercise, request, context) || structuredMissing || quantityConflict || fixedLoadMissing || requirements.some(([required, supplied]) => required.test(description) && !supplied.test(inventory))
}

const benchDenial = /\b(?:no|without|avoid|(?:do not|don['’]t) have|(?:can['’]t|cannot) use)\s+(?:access to\s+)?(?:(?:an?|any|the)\s+)?(?:(flat|incline|decline|adjustable)\s+)?bench(?:es)?\b/gi
const benchMention = /\b(?:(flat|incline|decline|adjustable)\s+)?bench(?:es)?\b/i

function benchInventory(request: string, context: SuppliedContext | null) {
  const inventory = `${request} ${(context?.equipment ?? []).join(', ')}`
  const denied = [...inventory.matchAll(benchDenial)].map(match => match[1]?.toLowerCase() ?? 'all')
  const positive = inventory.replace(benchDenial, '')
  const fullGym = /\bfull[- ]gym\b/i.test(positive)
  const adjustable = /\badjustable bench\b/i.test(positive)
  return {
    any: !denied.includes('all') && (fullGym || benchMention.test(positive)),
    incline: !denied.includes('incline') && (fullGym || adjustable || /\bincline bench\b/i.test(positive)),
    decline: !denied.includes('decline') && (fullGym || /\bdecline bench\b/i.test(positive)),
  }
}

function hasBench(request: string, context: SuppliedContext | null): boolean {
  return benchInventory(request, context).any
}

function missingBench(exercise: Exercise, request: string, context: SuppliedContext | null): boolean {
  const description = `${exercise.name} ${exercise.instructions.join(' ')}`
  if (!benchMention.test(description) && !exercise.setupRequirements?.supports.includes('bench')) return false
  const bench = benchInventory(request, context)
  if (!bench.any) return true
  if (/\bincline\b/i.test(exercise.name) || /\binclin(?:e|ed) bench\b/i.test(description)) return !bench.incline
  if (/\bdecline\b/i.test(exercise.name) || /\bdeclin(?:e|ed) bench\b/i.test(description)) return !bench.decline
  return false
}

type Plan = { countRange: { min: number; max: number }; prescription: ReturnType<typeof prescriptions>; mandatoryIds: string[]; slots: Exercise[][]; sets: number; reps: number; restSeconds: number; durationLimitSeconds?: number; repetitionsRange?: { min: number; max: number }; includeCues: boolean; assumptions: string[]; partial: boolean; compoundFirst: boolean; preparation: { kind: 'warmup' | 'cooldown'; description: string; durationSeconds: number }[] }
type PlanResult = { kind: 'plan'; plan: Plan } | { kind: 'clarification'; question: string } | { kind: 'infeasible'; reason: string }

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
    [/\b(?:(?:avoid|no|without|exclude|never)\s+(?:all\s+)?overhead\s+(?:movements?|work|reach(?:ing)?|exercises?)|keep\s+overhead\s+(?:movements?|work|exercises?)\s+out)\b/i, /\b(?:overhead|pulldowns?|pull[ -]?ups?|chin[ -]?ups?|military press|shoulder press|above (?:your|the) head)\b/i],
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

const implementPattern = '(?:dumbbells?|barbells?|bands?|kettlebells?|cables?|machines?)'
const inventoryQuantityPattern = '(?:(?:a pair of|pair of|a single|single|one|two|1|2|a)\\s+)?'
const implementsOnlyPattern = new RegExp(String.raw`\b(?:use|using|with)\s+only\s+(?:the\s+)?(${inventoryQuantityPattern}${implementPattern}[^,.;!?\n]*)|\b(${inventoryQuantityPattern}${implementPattern})\s+only\b`, 'i')
const equipmentClausePattern = new RegExp(String.raw`^(?:only\s+)?(?:${inventoryQuantityPattern}${implementPattern}|bodyweight|no equipment)(?:\s+(?:and|or)\s+${inventoryQuantityPattern}${implementPattern})*(?:\s+only)?$`, 'i')

const fullGymEquipment: Equipment[] = ['DUMBBELL', 'BARBELL', 'BANDS', 'KETTLEBELLS', 'CABLE', 'MACHINE']

const contextEquipment: Record<string, Equipment> = {
  'no equipment': 'BODY_ONLY', 'bodyweight only': 'BODY_ONLY', bodyweight: 'BODY_ONLY',
  dumbbells: 'DUMBBELL', dumbbell: 'DUMBBELL', barbell: 'BARBELL', barbells: 'BARBELL',
  'resistance bands': 'BANDS', bands: 'BANDS', band: 'BANDS', kettlebell: 'KETTLEBELLS', kettlebells: 'KETTLEBELLS',
  cable: 'CABLE', cables: 'CABLE', machine: 'MACHINE', machines: 'MACHINE',
}

export function planWorkout(message: string, focus?: WorkoutFocus): PlanResult {
  const { request: messageText, context } = splitSuppliedContext(message)
  focus ??= singleWorkoutFocus(messageText)
  const restrictions = context?.profile?.limitations?.filter(x => typeof x === 'string').join('; ') ?? ''
  // The appended JSON is data, not user-authored request language. Only its limitation
  // values participate in movement checks; counts, duration, and exclusions come from the request.
  const safetyText = [messageText, restrictions].filter(Boolean).join('\n')
  message = messageText
  const countPattern = /(?<![\d.])(?:(at least|minimum|at most|up to|maximum|max\.?|no more than|exactly)\s+)?(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|–|—|to)\s*)?(-?\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+((?:(?:beginner|intermediate|advanced|balanced|chest|back|legs?|glutes?|quads?|quadriceps|hamstrings?|calves?|arms?|shoulders?|core|biceps|triceps|selectori[sz]ed|(?:resistance[- ]|loop[- ]|long[- ])?(?:bands?|barbells?|dumbbells?|kettlebells?|cables?|machines?)|barbell|dumbbell|kettlebell|cable|machine|band|body ?weights?)\s+)*)(?:exercises?|movements?)\b/gi
  // A sub-requirement such as "one exercise to be a goblet squat" constrains a member of the
  // workout, not the exercise total, so it must not participate in the total-count check.
  const roleMention = /\b(?:(?:i(?:'d| would) like|please\s+(?:make|let)|make|let)\s+)?(?:(?:exactly|at least|at most|just|only)\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:beginner|intermediate|advanced|balanced|chest|back|legs?|glutes?|quads?|quadriceps|hamstrings?|calves?|arms?|shoulders?|core|biceps|triceps|selectori[sz]ed|(?:resistance[- ]|loop[- ]|long[- ])?(?:bands?|barbells?|dumbbells?|kettlebells?|cables?|machines?)|barbell|dumbbell|kettlebell|cable|machine|band|body ?weights?)\s+)*(?:exercises?|movements?)\s+(?:to\s+(?:be|start|open|lead|finish|end|close|include)|being)\b/gi
  const countMatches = [...message.replace(roleMention, ' ').matchAll(countPattern)]
  const countMatch = countMatches[0]
  const countScopes = new Set(countMatches.map(match => match[4].trim().toLowerCase()))
  const countMinimum = countMatches.length ? Math.max(...countMatches.map(match => match[2] ? numberValue(match[2]) : /^(?:up to|at most|maximum|max\.?|no more than)$/i.test(match[1] ?? '') ? 1 : numberValue(match[3]))) : 1
  const countMaximum = countMatches.length ? Math.min(...countMatches.map(match => /^(?:at least|minimum)$/i.test(match[1] ?? '') ? 8 : numberValue(match[3]))) : defaultExerciseCount
  let count = countMatches.length && countMatches.every(match => /^(?:at least|minimum)$/i.test(match[1] ?? '')) ? countMinimum : countMaximum
  const isCap = countMatches.length > 0 && countMatches.every(match => /^(?:up to|at most|maximum|max\.?|no more than)$/i.test(match[1] ?? ''))
  const prescription = prescriptions(message)
  const duration = prescription.duration
  const intervalSeconds = prescription.intervalSeconds
  const timed = intervalSeconds !== null
  const setsMatch = prescription.sets !== undefined
  const repetitionsRange = prescription.reps && prescription.reps.min !== prescription.reps.max
    ? prescription.reps : /\b(?:rep|repetition) ranges?\b/i.test(message) ? { min: 8, max: 12 } : undefined
  const repsMatch = prescription.reps !== undefined
  const includeCues = /\b(?:coaching|exercise) cues\b/i.test(message)
  const reps = repetitionsRange ? Math.round((repetitionsRange.min + repetitionsRange.max) / 2) : prescription.reps?.min ?? 10
  const restSeconds = prescription.rest ?? (timed ? 15 : reps <= 8 && /\bstrength\b/i.test(message) ? 90 : 60)
  // Explicit lists are bounded by punctuation or a prescription; other prose is not an identity parser.
  // Candidates are scanned in order of appearance and the first that actually names movements is
  // kept: quantity clauses ("exactly 3 band exercises") and inventory clauses ("a barbell and
  // rack") are skipped so a later genuine list such as "include a Romanian deadlift" is found.
  const colonNames = /\bworkout\s*:\s*([^.!?\n]+)/i.exec(message)?.[1]
  const listClausePattern = /\b(?:including|include|perform|featuring|consisting of|i want(?!\s+to\b)|with)\s+(?:(only|exactly)\s+)?(?:the\s+)?(.+?)(?=(?:\s+and\s+|[,;]\s*(?:and\s+)?)(?:use|give me|keep it to|prescribe)\s+\d+|\s+and\s+(?:also\s+)?(?:include|including|perform|featuring|consisting of)\b|[,;]\s*(?:\d+\s*(?:sets?|reps?|exercises?|movements?)|full[- ]gym|bodyweight|no equipment)|[.!?]|$)/gi
  const roleClausePattern = /\b(?:i(?:'d| would) like|make|let|have|i want)\s+(?:exactly\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:beginner|intermediate|advanced|balanced|chest|back|legs?|glutes?|quads?|quadriceps|hamstrings?|calves?|arms?|shoulders?|core|biceps|triceps)\s+)*(?:exercises?|movements?)\s+(?:to\s+(?:be|start|open|lead|finish|end|close|include)|being)\s+(?:(only|exactly)\s+)?(?:the\s+)?(.+?)(?=[.!?]|$)/gi
  const scopedCountNoun = /^(?:\d+(?:\s*(?:-|\u2013|\u2014|to)\s*\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:beginner|intermediate|advanced|balanced|chest|back|legs?|glutes?|arms?|shoulders?|core|biceps|triceps|selectori[sz]ed|(?:resistance[- ]|loop[- ]|long[- ])?(?:bands?|barbells?|dumbbells?|kettlebells?|cables?|machines?)|barbell|dumbbell|kettlebell|cable|machine|band|body ?weights?|plyo|isolation|compound|strength|cardio|working|hiit|upper[- ]body|lower[- ]body)\s+)*(?:sets?|exercises?|movements?|days?)\s*$/i
  const inventoryOnly = /^(?:a|an|one|two|three|the|my|some)?\s*(?:light\s+|heavy\s+|single\s+)?(?:dumbbells?|barbells?|kettlebells?|bands?|cables?|machines?)(?:\s+(?:and|or)\s+(?:a\s+|an\s+|the\s+)?(?:dumbbells?|barbells?|kettlebells?|bands?|cables?|machines?|rack|rig|bench|stand|pull[- ]?up bar))*(?:\s+(?:and|or)\s+nothing\s+else)?(?:\s+only)?$/i
  const nameCandidates = [...message.matchAll(listClausePattern), ...message.matchAll(roleClausePattern)]
    .map(match => ({ match, raw: (match[2] ?? '').replace(/\s+(?:among|in|for)\s+\d+\s+(?:exercises?|movements?).*$/i, '').trim() }))
    .sort((a, b) => a.match.index - b.match.index)
  const namesAPlan = (raw: string) => /^(?:a\s+)?(?:body ?weight(?:[- ]only)?\s+)?(?:routine|workout|training plan|split)\b/i.test(raw)
  const selectedClause = nameCandidates.find(({ match, raw }) => raw && !namesAPlan(raw) &&
    !/^both (?:pressing|pushing|pulling|rowing)\b/i.test(raw) &&
    (!!colonNames || !!match[1] || /^(?:a|an)\s+/i.test(raw) ||
      /\b(?:including|include|perform|featuring|consisting of|i want)\b/i.test(match[0]) ||
      /(?:to\s+(?:be|start|open|lead|finish|end|close|include)|being)\s/i.test(match[0]) ||
      /\b(?:exercise|movement|press|row|push[ -]?ups?|spin)\b/i.test(raw)) &&
    !/^(?:\d+(?:\s*(?:-|\u2013|\u2014|to)\s*\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:chest|back|legs?|glutes?|arms?|shoulders?|core|selectori[sz]ed|barbells?|dumbbells?|kettlebells?|cables?|machines?|bands?|body ?weights?|working)\s+)*(?:sets?|exercises?|movements?|days?)\b/i.test(raw) &&
    !scopedCountNoun.test(raw) &&
    !/^(?:a\s+)?(?:\d+\s*(?:minute|min)\s+)?(?:warm[ -]?up|cool[ -]?down|focus\b|goal\b|full[- ]gym|sets?\b|reps?\b|rests?\b|not\b)/i.test(raw) &&
    !equipmentClausePattern.test(raw) && !inventoryOnly.test(raw))
  const namedClause = selectedClause?.match
  const namesClause = selectedClause?.raw ?? ''
  const rawNames = (namesClause || (nameCandidates.length ? '' : colonNames ?? ''))?.trim() ?? ''
  const namingShape = !!selectedClause || (!nameCandidates.length && !!colonNames)
  const names = rawNames
    ? rawNames.replace(/^(?:a|an)\s+/i, '').replace(/\s+(?:exercise|movement)$/i, '').split(/\s*(?:,|;)\s*(?:and\s+)?|\s+and\s+/i).map(name => name.trim()).filter(Boolean)
    : []
  const excluded = excludedEquipment(message)
  const equipmentText = selectedClause ? message.replace(namedClause![0], ' ') : message
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
  const levelText = `${message} ${context?.profile?.trainingAge ?? ''}`
  const abilityLevel = /\b(?:expert|advanced|experienced)\b/i.test(levelText) ? 'EXPERT' : /\bintermediate\b/i.test(levelText) ? 'INTERMEDIATE' : 'BEGINNER'
  const unmetRequirements: string[] = []
  const fail = (reason: string): PlanResult => ({ kind: 'infeasible', reason })
  if (/\b(?:no|not|without|avoid|exclude)\s+(?:(?:more|less|fewer)\s+than\s+)?(?:\d+|one|two|three|four|five|any)\s*(?:sets?|reps?|repetitions?|exercises?|movements?)\b/i.test(message) || /\b(?:sets?|reps?|repetitions?)\s*(?:of\s*)?(?:zero|one|two|three|four|five)\b/i.test(message)) return { kind: 'clarification', question: 'Please specify one supported positive exercise count, set count, and repetition range.' }
  if (countScopes.size > 1 || countMinimum > countMaximum) return { kind: 'clarification', question: 'Please clarify the exercise counts and whether they apply to the whole workout or a specific muscle group.' }
  if (prescription.conflict) return { kind: 'clarification', question: 'Please clarify the conflicting or unsupported sets, repetitions, rest, or session duration.' }
  if (timed && (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 1))
    return fail('Work intervals must be a positive whole number of seconds.')
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) return fail('Session duration must be positive.')
  const resolvedNamed: Exercise[] = []
  for (const name of names) {
    const resolved = resolveHistoryExercise(name)
    if (resolved.kind !== 'match') {
      const query = normalizeHistoryName(name).replace(/s$/, '')
      const choices = exerciseCatalog.filter(exercise => exercise.setupReviewStatus === 'reviewed' && normalizeHistoryName(exercise.name).includes(query)).slice(0, 5).map(exercise => exercise.name)
      return { kind: 'clarification', question: `I cannot identify “${name}” as one specific catalog exercise.${choices.length ? ` Did you mean ${choices.join(', ')}?` : ' Please name a supported catalog exercise.'} I cannot substitute another movement.` }
    }
    resolvedNamed.push(resolved.exercise)
  }
  if (new Set(resolvedNamed.map(exercise => exerciseSlotIdentity(exercise.id))).size !== resolvedNamed.length) return { kind: 'clarification', question: 'Please choose distinct named exercises.' }
  const exactNames = !!namedClause?.[1] && resolvedNamed.length > 0
  if (resolvedNamed.length && ((countMatch && (resolvedNamed.length > count || (exactNames && resolvedNamed.length !== count))) || (!countMatch && exactNames && resolvedNamed.length > 8))) return { kind: 'clarification', question: 'The named exercise list conflicts with the requested exercise count. Which count and movements should I use?' }
  if (exactNames && !countMatch) count = resolvedNamed.length
  let sets = prescription.sets ?? (timed || duration === null ? 3 : Math.min(3, Math.max(1, Math.floor(duration / (count * 2)))))
  if (!equipmentSpecified) return { kind: 'clarification', question: 'What equipment can you use: a full gym, specific equipment, or bodyweight only?' }
  if (!Number.isSafeInteger(restSeconds) || restSeconds < 0) return fail('Rest must be a whole number of seconds.')
  if (countMinimum < 1 || countMinimum > countMaximum || count < 1 || sets < 1 || sets > 6 || reps < 1 || reps > 30 || (repetitionsRange && (repetitionsRange.min < 1 || repetitionsRange.max > 30 || repetitionsRange.min > repetitionsRange.max))) return fail('The requested exercise, set, or repetition count is outside the supported range.')
  const preparation: Plan['preparation'] = []
  if (/\bwarm[ -]?up\b/i.test(message)) preparation.push({ kind: 'warmup', description: 'Easy movement and rehearsal of the exercises', durationSeconds: Number(/(\d+)\s*-?\s*(?:minutes?|mins?)\s+(?:of\s+)?warm[ -]?up/i.exec(message)?.[1] ?? 5) * 60 })
  if (/\bcool[ -]?down\b/i.test(message)) preparation.push({ kind: 'cooldown', description: 'Easy movement and comfortable stretching', durationSeconds: Number(/(\d+)\s*-?\s*(?:minutes?|mins?)\s+(?:of\s+)?cool[ -]?down/i.exec(message)?.[1] ?? 3) * 60 })
  const preparationMinutes = preparation.reduce((total, part) => total + part.durationSeconds / 60, 0)
  const durationIsMaximum = hasDurationLimit(message)
  const enforceLimit = durationIsMaximum || timed

  const equipmentConflict = /\b(?:conflicts? with|conflict(?:ing)? with) my listed setup\b/i.test(message) &&
    /\b(?:prioriti[sz]e|use) (?:the )?(?:listed )?equipment\b/i.test(message)
  let equipmentExplanation: string | undefined
  if (equipmentConflict) {
    const unavailable = [...new Set([...message.matchAll(/\b(dumbbells?|barbells?|bands?|kettlebells?|cables?|machines?)\b/gi)].map(match => match[1].toLowerCase().replace(/s$/, '')))]
      .filter(item => !uniqueAvailable.some(value => value.toLowerCase().includes(item)))
    const unavailableLabel = unavailable.includes('cable') && unavailable.includes('machine') ? 'cable machine options' : unavailable.join(', ') || 'another setup'
    equipmentExplanation = `The ${unavailableLabel} conflict with the listed setup (${context?.equipment?.join(', ') || uniqueAvailable.join(', ')}); this plan uses only the listed equipment.`
  }

  const focusTargets = { push: [['chest'], ['shoulders'], ['triceps']], pull: [['lats', 'middle back'], ['biceps'], ['traps']], legs: [['quadriceps'], ['hamstrings', 'glutes'], ['calves']], upper: [upper, ['lats', 'middle back', 'traps', 'biceps', 'forearms']] } satisfies Record<WorkoutFocus, string[][]>
  let requested = groupTerms.filter(([pattern]) => pattern.test(message)).map(([, muscles]) => muscles)
  if (!focus && /\bupper[- ]body\b/i.test(message)) requested.push(['chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'traps'])
  if (focus) requested = focusTargets[focus]
  const twoFloorPushes = focus === 'push' && count === 2 && uniqueAvailable.every(equipment => equipment === 'BODY_ONLY')
  if (twoFloorPushes) {
    requested = [['chest'], ['triceps']]
  }
  const explicitTargetCount = requested.length
  const fullBody = !focus && /\b(?:full|whole)[- ]body\b/i.test(message)
  const canLoadPull = uniqueAvailable.some(equipment => equipment === 'BARBELL' || equipment === 'DUMBBELL' || equipment === 'CABLE')
  const wholeBodyTargets = [lower, upper, canLoadPull ? ['lats', 'middle back'] : ['abdominals', 'lats', 'middle back']]
  if (fullBody) requested.push(...wholeBodyTargets.filter(group => !requested.some(existing => existing.some(muscle => group.includes(muscle)))))
  const targets = requested.length ? requested : wholeBodyTargets
  if (/(?:knee|knees).{0,32}(?:pain|discomfort|injur|hurt|ache)|(?:pain|discomfort|injur|hurt|ache).{0,32}(?:knee|knees)/i.test(restrictions) &&
      /\b(?:legs?|lower[- ]body|full[- ]body|squat|lunge)\b/i.test(messageText)) {
    return { kind: 'clarification', question: 'Which lower-body movements, if any, feel comfortable with your knee right now? Should I avoid knee-bending movements such as squats and lunges?' }
  }
  let bodyweightFallback = false
  if (context && abilityLevel === 'BEGINNER' && /\beasy to scale\b/i.test(message) && available.includes('BARBELL') && !available.some(item => ['DUMBBELL', 'BANDS', 'KETTLEBELLS'].includes(item))) {
    const hasBodyweightTarget = exerciseCatalog.some(exercise =>
      exercise.setupReviewStatus === 'reviewed' && (exercise.equipment ?? 'BODY_ONLY') === 'BODY_ONLY' && exercise.category === 'STRENGTH' &&
      exercise.level === 'BEGINNER' && exercise.primaryMuscles.some(muscle => targets.some(target => target.includes(muscle.toLowerCase()))) &&
      !unsafeNames.test(exercise.name) && !restrictionExcludes(exercise, safetyText) &&
      !missingSetup(exercise, message, context) &&
      !setupTerms.some(([pattern, required]) => pattern.test(`${exercise.name} ${exercise.instructions.join(' ')}`) && !uniqueAvailable.includes(required))
    )
    if (!hasBodyweightTarget) {
      const question = /\b(?:exact count|exactly)\b/i.test(message) && /\b(?:what i can access|what equipment can i access)\b/i.test(message)
        ? 'What is the barbell’s unloaded weight, and do you have lighter plates? Can you comfortably hold the bar on your shoulders and control a hip hinge and row? If those make four suitable exercises infeasible, what other equipment can you access?'
        : /\bwrist\b/i.test(restrictions)
        ? 'What is the barbell’s unloaded weight, and can you grip it while keeping your wrists neutral? Do you have lighter plates or another lighter option?'
        : 'What is the barbell’s unloaded weight, and do you have lighter plates or another lighter option? I can then choose movements that are easy to scale.'
      return { kind: 'clarification', question }
    }
    bodyweightFallback = true
  }
  if (/\bunknown (?:ability|experience)\b/i.test(message)) {
    return { kind: 'clarification', question: 'What exercises or movement patterns can you currently perform comfortably, and what support or equipment is available?' }
  }
  const broadBack = !focus && !resolvedNamed.length && requested.length === 1 && /\bback\b/i.test(message) &&
    !/\b(?:upper back|lower back|horizontal|rows? only|no (?:pulldowns?|overhead work))\b/i.test(message)
  const broadLegs = !focus && !resolvedNamed.length && requested.length === 1 && /\b(?:legs?|lower[- ]body)\b/i.test(message)
  if (!countMatch && broadBack && sets >= 6) count = Math.min(count, 3)
  if (!countMatch && broadLegs) count = Math.min(count, 4)
  const requestedSlots = Math.min(count, 8)
  if (count > 8 && !isCap) unmetRequirements.push(`Requested ${count} exercises; this planner supports up to 8.`)
  const allTargets = [...new Set(targets.flat())]
  const addTrunkSlot = canLoadPull && (fullBody || requested.length === 0)
  const preferredTargets = broadLegs ? focusTargets.legs : targets
  const selectedTargets = Array.from({ length: requestedSlots }, (_, i) =>
    preferredTargets[i] ?? (addTrunkSlot && i === targets.length ? ['abdominals'] : allTargets))
  const compoundFirst = !timed && !resolvedNamed.length &&
    !/\b(?:first|last|lead|start|finish|before|after|prioriti[sz]e)\b/i.test(message) &&
    (broadLegs || fullBody || requested.length === 0 || focus !== undefined || /\bstrength\b/i.test(message))
  const onlyClause = implementsOnlyPattern.exec(message)
  const requiredImplements = new Set(equipmentTerms.filter(([pattern, equipment]) => equipment !== 'BODY_ONLY' && pattern.test(onlyClause?.[1] ?? onlyClause?.[2] ?? '')).map(([, equipment]) => equipment))
  // Qualified exercise counts such as "exactly 4 barbell exercises" name the implement the
  // counted movements must use, so they join the required-implement set.
  const countQualifiers: Partial<Record<Equipment, RegExp>> = {
    DUMBBELL: /\b(?:resistance[- ])?dumbbells?\b/i, BARBELL: /\b(?:resistance[- ])?barbells?\b/i,
    BANDS: /\b(?:resistance[- ])?bands?\b/i, KETTLEBELLS: /\b(?:resistance[- ])?kettlebells?\b/i,
    CABLE: /\b(?:resistance[- ])?cables?\b/i, MACHINE: /\b(?:resistance[- ])?machines?\b/i,
  }
  for (const [equipment, qualifier] of Object.entries(countQualifiers))
    if (qualifier && countMatches.some(match => qualifier.test(match[0]))) requiredImplements.add(equipment as Equipment)
  const inventory = `${message} ${(context?.equipment ?? []).join(' ')}`
  const unknownDumbbellQuantity = requiredImplements.has('DUMBBELL') && !/\bfull[- ]gym\b/i.test(inventory) && implementQuantity(inventory, 'dumbbells?') === undefined
  const potentialPairChoices = new Set<string>()
  const catalog = exerciseCatalog.filter(exercise => {
    const equipment = exercise.equipment ?? 'BODY_ONLY'
    const description = `${exercise.name} ${exercise.instructions.join(' ')}`
    const equipmentConflict = (equipment === 'BARBELL' && /\bdumbbells?\b/i.test(description)) || (equipment === 'DUMBBELL' && /\bbarbell\b/i.test(description))
    if (exercise.setupReviewStatus !== 'reviewed' || !uniqueAvailable.includes(equipment) ||
      (requiredImplements.size && !requiredImplements.has(equipment)) || (bodyweightFallback && equipment !== 'BODY_ONLY') ||
      excluded.has(equipment) || equipmentConflict ||
      setupTerms.some(([pattern, required]) => pattern.test(description) && !available.includes(required))) return false
    const focusForceAllowed = focus === 'push' ? exercise.force !== 'PULL' : focus === 'pull' ? exercise.force !== 'PUSH' : true
    const targetMatch = selectedTargets.some(target => [...exercise.primaryMuscles, ...exercise.secondaryMuscles].some(muscle => target.includes(muscle.toLowerCase())))
    const levelAllowed = abilityLevel === 'EXPERT' || (abilityLevel === 'INTERMEDIATE' ? exercise.level !== 'EXPERT' : exercise.level === 'BEGINNER' || (!!exercise.floorVariationCue && (exercise.equipment === 'DUMBBELL' || twoFloorPushes)))
    const strengthExercise = exercise.category === 'STRENGTH' || exercise.sourceKey === 'Dumbbell_Floor_Press'
    if (!levelAllowed || (!strengthExercise && !(timed && (exercise.category === 'CARDIO' || (prescription.hiit && exercise.category === 'PLYOMETRICS')))) ||
      (includeCues && !exercise.instructions.length) || unsafeNames.test(exercise.name) || restrictionExcludes(exercise, safetyText) ||
      !focusForceAllowed || (!targetMatch && !resolvedNamed.some(item => item.id === exercise.id)) ||
      (!focus && /\bupper[- ]body\b/i.test(message) && !exercise.primaryMuscles.some(muscle => focusTargets.upper.flat().includes(muscle.toLowerCase()))) ||
      (focus && !exercise.primaryMuscles.some(muscle => focusTargets[focus].flat().includes(muscle.toLowerCase())))) return false
    if (!missingSetup(exercise, message, context)) return true
    if (unknownDumbbellQuantity && equipment === 'DUMBBELL' && !missingSetup(exercise, `${message} I have two dumbbells.`, context))
      potentialPairChoices.add(exercise.id)
    return false
  })
  const confirmDumbbellQuantity = { kind: 'clarification', question: countMatch && !isCap
    ? `Do you have one dumbbell or two dumbbells? A pair may be needed to give you ${count} distinct exercises using only the equipment you listed.`
    : 'Do you have one dumbbell or two dumbbells? That determines which exercises I can include.' } as const
  const keptNamed: Exercise[] = []
  const namedExercises: Exercise[] = keptNamed
  for (const exercise of resolvedNamed) {
    if (potentialPairChoices.has(exercise.id)) return confirmDumbbellQuantity
    if (!catalog.some(item => item.id === exercise.id)) {
      if (!uniqueAvailable.includes(exercise.equipment ?? 'BODY_ONLY')) {
        // An explicit "only these movements" list keeps the equipment clarification. Within a
        // broader session, the named movement is instead dropped from the draft without silently
        // substituting, and the gap is surfaced in the plan's own assumptions.
        if (exactNames) return { kind: 'clarification', question: `${exercise.name} cannot be included because the available equipment does not include ${exercise.equipment ?? 'bodyweight'}. What compatible alternative can you use?` }
        unmetRequirements.push(`${exercise.name} is cataloged for ${exercise.equipment?.toLowerCase() ?? 'bodyweight'} and was left out. Name a movement possible with ${uniqueAvailable.join(', ').toLowerCase() || 'the available equipment'} if you want a replacement.`)
        continue
      }
      const reason = exercise.setupReviewStatus !== 'reviewed' ? 'its setup has not been reviewed' : missingSetup(exercise, message, context) ? 'the required setup is not available or specified' : restrictionExcludes(exercise, safetyText) ? 'it conflicts with your stated restriction' : 'its ability level or other setup requirements do not match this request'
      return { kind: 'clarification', question: `${exercise.name} cannot be included because ${reason}. What compatible alternative can you use?` }
    }
    keptNamed.push(exercise)
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
  if (broadLegs) {
    allCandidates.forEach((slot, index) => {
      if (index >= preferredTargets.length || slot.some(exercise =>
        exercise.primaryMuscles.some(muscle => preferredTargets[index].includes(muscle.toLowerCase())))) return
      allCandidates[index] = catalog.filter(exercise =>
        exercise.primaryMuscles.some(muscle => allTargets.includes(muscle.toLowerCase())))
      selectedTargets[index] = allTargets
    })
  }
  const wholeBodyPatterns = ['knee-dominant', 'press', 'row', 'hinge']
  const patternOptions = wholeBodyPatterns.map(pattern => catalog.filter(exercise =>
    exercise.mechanic === 'COMPOUND' && movementFamily(exercise) === pattern))
  const coveredWholeBodyPatterns = wholeBodyPatterns.slice(0, requestedSlots)
  const coverWholeBodyPatterns = fullBody && !timed && explicitTargetCount === 0 && !namedExercises.length &&
    requestedSlots >= 2 && coveredWholeBodyPatterns.every((_, index) => patternOptions[index].length > 0)
  if (coverWholeBodyPatterns) {
    coveredWholeBodyPatterns.forEach((_, index) => {
      const options = patternOptions[index]
      allCandidates[index] = options
      selectedTargets[index] = [...new Set(options.flatMap(exercise => exercise.primaryMuscles.map(muscle => muscle.toLowerCase())))]
    })
  }
  // A broad leg session keeps a knee-dominant and a hip-dominant slot when the request leaves
  // room for them, so a named main lift does not crowd out posterior-chain work. Patterns the
  // named movements already cover by their primary muscles are not reserved a second time.
  const legPatterns = ['knee-dominant', 'hinge']
  const legPatternOptions = legPatterns.map(pattern => catalog.filter(exercise =>
    exercise.mechanic === 'COMPOUND' && movementFamily(exercise) === pattern))
  const legSession = !focus && !fullBody && /(?:\blegs?\b|lower[- ]body)/i.test(message) || broadLegs
  const kneeCovered = namedExercises.some(exercise => exercise.primaryMuscles.includes('quadriceps'))
  const hingeCovered = namedExercises.some(exercise => ['hamstrings', 'glutes'].some(muscle => exercise.primaryMuscles.includes(muscle)))
  const reservedPatterns = legPatterns.filter((_, index) => (index === 0 ? !kneeCovered : !hingeCovered))
  const coverLegPatterns = !coverWholeBodyPatterns && legSession && !timed && explicitTargetCount <= 1 &&
    requestedSlots >= namedExercises.length + reservedPatterns.length &&
    reservedPatterns.every(pattern => legPatternOptions[legPatterns.indexOf(pattern)].length > 0)
  if (coverLegPatterns) {
    reservedPatterns.forEach((pattern, index) => {
      const target = namedExercises.length + index
      if (target >= requestedSlots) return
      const options = legPatternOptions[legPatterns.indexOf(pattern)]
      allCandidates[target] = options
      selectedTargets[target] = [...new Set(options.flatMap(exercise => exercise.primaryMuscles.map(muscle => muscle.toLowerCase())))]
    })
  }
  // An upper-body session keeps a pressing and a rowing slot when the request leaves room for
  // them, so accessory raises cannot displace coverage of both directions of upper-body work.
  const upperPatterns = ['press', 'row']
  const upperPatternOptions = upperPatterns.map(pattern => catalog.filter(exercise =>
    exercise.mechanic === 'COMPOUND' && movementFamily(exercise) === pattern))
  const upperSession = (!focus || focus === 'upper') && !fullBody && !legSession &&
    /\b(?:upper[- ]body|push and (?:a )?pull|both (?:a )?push and (?:a )?pull)\b/i.test(message)
  const pressCovered = namedExercises.some(exercise => /press|push[ -]?ups?\b/i.test(exercise.name) || exercise.primaryMuscles.includes('chest'))
  const rowCovered = namedExercises.some(exercise => /\brows?\b/i.test(exercise.name) || ['lats', 'middle back'].some(muscle => exercise.primaryMuscles.includes(muscle)))
  const reservedUpperPatterns = upperPatterns.filter((_, index) => (index === 0 ? !pressCovered : !rowCovered))
  const coverUpperPatterns = !coverWholeBodyPatterns && upperSession && !timed && explicitTargetCount <= 2 &&
    requestedSlots >= namedExercises.length + reservedUpperPatterns.length &&
    reservedUpperPatterns.every(pattern => upperPatternOptions[upperPatterns.indexOf(pattern)].length > 0)
  if (coverUpperPatterns) {
    reservedUpperPatterns.forEach((pattern, index) => {
      const target = namedExercises.length + index
      if (target >= requestedSlots) return
      const options = upperPatternOptions[upperPatterns.indexOf(pattern)]
      allCandidates[target] = options
      selectedTargets[target] = [...new Set(options.flatMap(exercise => exercise.primaryMuscles.map(muscle => muscle.toLowerCase())))]
    })
  }
  namedExercises.forEach((exercise, index) => { allCandidates[index] = [exercise]; selectedTargets[index] = exercise.primaryMuscles.map(muscle => muscle.toLowerCase()) })
  // A muscle-target slot goes dry when the named movements or required implements narrow the
  // pool below what that group supports. An uncovered whole-body pattern then fills the empty
  // slot instead of the session silently shrinking below the requested count.
  if (!timed && explicitTargetCount === 0 && requestedSlots >= 2 && (fullBody || legSession || upperSession || broadBack || broadLegs)) {
    let offeredFamilies = new Set(namedExercises.map(exercise => movementFamily(exercise)))
    for (let index = 0; index < allCandidates.length; index++) {
      if (allCandidates[index].length) {
        allCandidates[index].forEach(exercise => offeredFamilies.add(movementFamily(exercise)))
        continue
      }
      if (index < namedExercises.length) continue
      const pattern = wholeBodyPatterns.find(candidate => !offeredFamilies.has(candidate) &&
        patternOptions[wholeBodyPatterns.indexOf(candidate)].length > 0)
      if (!pattern) continue
      const options = patternOptions[wholeBodyPatterns.indexOf(pattern)]
      allCandidates[index] = options
      selectedTargets[index] = [...new Set(options.flatMap(exercise => exercise.primaryMuscles.map(muscle => muscle.toLowerCase())))]
      options.forEach(exercise => offeredFamilies.add(movementFamily(exercise)))
    }
  }
  const viableTargets = selectedTargets.filter((_, index) => allCandidates[index].length > 0)
  const candidates = allCandidates.filter(slot => slot.length > 0)
  const targetHasPrimary = catalog.some(exercise => viableTargets.some(target => exercise.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase()))))
  if (!candidates.length || !targetHasPrimary) {
    if (potentialPairChoices.size) return confirmDumbbellQuantity
    if (context && abilityLevel === 'BEGINNER' && uniqueAvailable.length === 2 && uniqueAvailable.includes('KETTLEBELLS') && uniqueAvailable.includes('BODY_ONLY') && /\b(?:back|lats?)\b/i.test(message)) {
      return { kind: 'clarification', question: 'What is the kettlebell’s weight, and can you hold a controlled hip hinge and row without discomfort? The catalog’s back-row option is labeled intermediate.' }
    }
    if (context && uniqueAvailable.length === 1 && uniqueAvailable[0] === 'BODY_ONLY' && /\b(?:back|lats?)\b/i.test(message) && /\boverhead press(?:ing)?\b/i.test(restrictions)) {
      return { kind: 'clarification', question: 'Do you have secure support such as a pull-up bar, and is overhead reaching comfortable? If not, what other equipment or back movements can you use?' }
    }
    if (equipmentConflict) return { kind: 'clarification', question: `The cable machine conflicts with the listed setup (${context?.equipment?.join(', ') || uniqueAvailable.join(', ')}), and I could not establish a setup-reviewed movement for ${targets.map(target => target.join('/')).join(' or ')} using only that setup. What other equipment or movement variation can you use?` }
    const equipmentRequest = explicitlySpecified.size > 0 ? [...explicitlySpecified].join(', ') : 'suitable equipment or movement options'
    return { kind: 'clarification', question: `I could not establish a suitable setup-reviewed catalog movement for this request with ${equipmentRequest}; other catalog setup requirements may be unknown. What equipment and movement variations can you use comfortably?` }
  }
  const chosen: Exercise[] = []
  const assignment: (Exercise | undefined)[] = []
  const assign = (indices: number[]): boolean => {
    if (!indices.length) return true
    const next = indices.reduce((best, index) => candidates[index].filter(e => !chosen.some(c => exerciseSlotIdentity(c.id) === exerciseSlotIdentity(e.id))).length < candidates[best].filter(e => !chosen.some(c => exerciseSlotIdentity(c.id) === exerciseSlotIdentity(e.id))).length ? index : best)
    const diversityCost = (exercise: Exercise) =>
      chosen.filter(item => movementFamily(item) === movementFamily(exercise)).length
      - Number(prescription.hiit && exercise.category !== 'STRENGTH')
      - Number((focus === 'pull' || !focus && /\b(?:back|lats?)\b/i.test(message)) && /pulldown/i.test(exercise.name))
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
  if (!assigned) return { kind: 'clarification', question: 'The available movements overlap too much to make a useful distinct session. Which muscle group or exercise variation should I prioritize?' }
  const filled = assignment.filter((exercise): exercise is Exercise => exercise !== undefined)
  if (countMatch && !isCap && filled.length < countMinimum && potentialPairChoices.size) return confirmDumbbellQuantity
  let selectedAssignments = assignment.flatMap((exercise, index) => exercise ? [{ exercise, target: viableTargets[index] }] : [])
  const scheduleSeconds = (items: typeof selectedAssignments) => preparationMinutes * 60 + items.reduce((sum, item, index) => {
    const name = item.exercise.name.replace(/[_-]+/g, ' ')
    const unilateral = /\b(?:single|one|alternating)[ -]?(?:arm|leg|side)\b/i.test(name)
    const rest = Math.max(0, sets - 1) * restSeconds
    const exerciseSeconds = intervalSeconds === null
      ? estimatedExerciseSeconds(sets, sets * reps * 3 * (unilateral ? 2 : 1), rest, unilateral ? 2 : 1)
      : sets * intervalSeconds + rest
    return sum + exerciseSeconds + (index > 0 ? 30 : 0)
  }, 0)
  const fixedVolume = /\b(?:can['’]t|cannot|won['’]t) (?:change|reduce|adjust)\b[^.!?\n]{0,80}\b(?:volume|exercise count|sets)\b/i.test(message)
  if (fixedVolume && enforceLimit && duration !== null &&
      (selectedAssignments.length < countMinimum || scheduleSeconds(selectedAssignments) > duration * 60)) {
    return fail(`The requested volume, rest and transitions do not fit within ${duration} minutes.`)
  }
  // Reduce default sets before dropping requested movements.
  while (enforceLimit && duration !== null && !setsMatch && sets > 1 && scheduleSeconds(selectedAssignments) > duration * 60) sets--
  while (enforceLimit && duration !== null && selectedAssignments.length > 1 && scheduleSeconds(selectedAssignments) > duration * 60) {
    if (selectedAssignments.length <= namedExercises.length) return fail('The named exercises do not fit within the requested time limit.')
    selectedAssignments = selectedAssignments.slice(0, -1)
  }
  if (enforceLimit && duration !== null && scheduleSeconds(selectedAssignments) > duration * 60) return fail(`The requested work, rest, transitions, and preparation do not fit within ${duration} minutes.`)
  if ((countMatch || exactNames) && !isCap && selectedAssignments.length < filled.length) unmetRequirements.push(`The time limit restricts the requested exercise count with the estimated work, rest, transitions and preparation.`)
  const estimatedMinutes = Math.ceil(scheduleSeconds(selectedAssignments) / 60)
  if ((countMatch || exactNames) && !isCap && filled.length < requestedSlots) unmetRequirements.push(`Requested ${count} exercises; found ${filled.length} distinct catalog choices with reviewed setup compatible with the known equipment and restrictions; other catalog setup requirements may be unknown.`)
  if (isCap && count > 1 && filled.length === 1 && /\bbalanced\b/i.test(message)) unmetRequirements.push('Only one distinct movement pattern fits this setup, so this is not a balanced session; add equipment or allow another variation.')
  if (/\barms?\b/i.test(message) && /\bbalanced\b/i.test(message) && !['biceps', 'triceps'].every(muscle => selectedAssignments.some(({ exercise }) => exercise.primaryMuscles.some(item => item.toLowerCase() === muscle)))) unmetRequirements.push('The selected movements do not cover both biceps and triceps, so this is not a balanced arm session.')
  if (explicitTargetCount > count || (fullBody && targets.length > count)) unmetRequirements.push(`The request names ${fullBody ? targets.length : explicitTargetCount} muscle groups but allows at most ${count} exercise${count === 1 ? '' : 's'}; some groups are uncovered.`)
  if (allCandidates.some(slot => slot.length === 0)) unmetRequirements.push('Some requested muscle groups have no compatible setup-reviewed catalog exercise in the recorded setup; other catalog options have unknown setup requirements.')
  if (selectedAssignments.some(({ exercise, target }) => !exercise.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase())))) unmetRequirements.push('Some listed exercises involve the requested area secondarily, so target coverage is limited.')
  if (duration !== null && !durationIsMaximum && (estimatedMinutes < duration * 0.8 || estimatedMinutes > duration)) unmetRequirements.push(`The estimated session does not match the requested ${duration}-minute session.`)
  const assumptions = [
    ...(unmetRequirements.length ? [`PARTIAL WORKOUT — ${unmetRequirements.join(' ')}`] : []),
    'Exercise choices are limited to catalog entries with reviewed setup requirements; other catalog options may have unknown setup requirements.',
    ...(equipmentExplanation ? [equipmentExplanation] : []),
    ...(/\bfull[- ]gym\b/i.test(`${message} ${(context?.equipment ?? []).join(' ')}`) ? ['Full gym is treated as including a bench and pairs of dumbbells.'] : []),
    ...(!/\b(?:beginner|novice|intermediate|advanced|expert|experienced)\b/i.test(message) && !context?.profile?.trainingAge
      ? ['No ability level was provided; choose only movements you can perform comfortably and with control.']
      : []),
    ...(!countMatch && !exactNames ? [`Planned ${selectedAssignments.length} ${selectedAssignments.length === 1 ? 'exercise' : 'exercises'}.`] : []),
    ...(!setsMatch ? [`Assumed ${sets} sets.`] : []),
    `${restSeconds} seconds rest between sets${prescription.rest === undefined ? ' (assumed)' : ''}.`,
    ...(prescription.hiit ? ['Increase pace during work intervals only while movement stays controlled. Use the off intervals to recover and slow down if you cannot repeat the effort.'] : []),
    ...(timed ? [`${intervalSeconds} seconds of work per interval${prescription.assumedWork ? ' (assumed)' : ''}.`] : repetitionsRange
      ? [`Assumed ${repetitionsRange.min}–${repetitionsRange.max} repetitions per set; ${reps} is the editable starting value.`]
      : !repsMatch ? [`Assumed ${reps} repetitions per set.`] : []),
    ...(/\b(?:coaching|exercise) cues\b/i.test(message) ? ['Catalog coaching cues are included with each selected movement.'] : []),
    ...(timed ? [] : duration === null ? ['No duration was specified; allow about 2 minutes per set, including rest and transitions.'] : ['Allow about 2 minutes per set, including rest and transitions; the estimate is approximate.']),
    ...(/\bwrist\b/i.test(safetyText) && /\bneutral\b/i.test(safetyText) ? ['These grip options are conditional: keep your wrists neutral and use them only if comfortable.'] : []),
    'Choose a suitable, controllable load; no load has been prescribed. Stop if a movement causes pain.',
  ]
  const slots = selectedAssignments.map(({ exercise }) => [exercise])
  for (const candidate of catalog) {
    if (selectedAssignments.some(item => item.exercise.id === candidate.id)) continue
    const owner = slots.findIndex(slot => slot.some(exercise => exerciseSlotIdentity(exercise.id) === exerciseSlotIdentity(candidate.id)))
    const eligible = selectedAssignments.flatMap(({ exercise, target }, index) => {
      if (index < namedExercises.length || (owner >= 0 && owner !== index)) return []
      if (coverWholeBodyPatterns && index < wholeBodyPatterns.length && !patternOptions[index].includes(candidate)) return []
      const primary = exercise.primaryMuscles.some(muscle => target.includes(muscle.toLowerCase()))
      const muscles = primary ? candidate.primaryMuscles : candidate.secondaryMuscles
      return slots[index].length < 8 && muscles.some(muscle => target.includes(muscle.toLowerCase())) ? [index] : []
    })
    const next = eligible.sort((a, b) => slots[a].length - slots[b].length)[0]
    if (next !== undefined) slots[next].push(candidate)
  }
  if (!namedExercises.length && focus === 'push' && slots.length === 2 &&
      uniqueAvailable.every(equipment => equipment === 'BODY_ONLY')) {
    const triceps = slots[1].filter(exercise => exercise.primaryMuscles.includes('triceps'))
    if (triceps.length) slots[1] = triceps
  }
  if (!namedExercises.length && (broadBack || focus === 'pull') && !enforceLimit) {
    const vertical = slots[0]?.filter(exercise => /pulldown/i.test(exercise.name))
    const rowIndex = focus === 'pull' ? 3 : 1
    const rows = slots[rowIndex]?.filter(exercise => movementFamily(exercise) === 'row')
    if (vertical?.length && rows?.length) {
      slots[0] = vertical
      slots[rowIndex] = rows
    }
  }
  return { kind: 'plan', plan: { countRange: { min: !countMatch ? (exactNames ? count : 1) : unmetRequirements.length ? Math.min(countMinimum, slots.length) : countMinimum, max: countMatch ? countMaximum : exactNames ? count : slots.length }, prescription, mandatoryIds: namedExercises.map(exercise => exercise.id), slots, sets, reps, restSeconds, ...(enforceLimit && duration !== null ? { durationLimitSeconds: duration * 60 } : {}), ...(repetitionsRange ? { repetitionsRange } : {}), includeCues, compoundFirst, preparation, assumptions, partial: unmetRequirements.length > 0 } }
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
  const selected = plan.slots.map((slot, i) => slot.find(exercise => exercise.name === names[i]) ?? slot[0])
  if (plan.compoundFirst) selected.sort((a, b) => Number(b.mechanic === 'COMPOUND') - Number(a.mechanic === 'COMPOUND'))
  const exercises = selected.map(exercise => {
    const guidance = {
      restSeconds: plan.restSeconds,
      ...(plan.repetitionsRange ? { repetitionsRange: plan.repetitionsRange } : {}),
      ...(exercise.floorVariationCue ? { cues: [exercise.floorVariationCue] } : plan.includeCues ? { cues: Array.from({ length: Math.min(4, exercise.instructions.length) }, (_, index) => exercise.instructions.slice(Math.floor(index * exercise.instructions.length / Math.min(4, exercise.instructions.length)), Math.floor((index + 1) * exercise.instructions.length / Math.min(4, exercise.instructions.length))).join(' ')) } : {}),
    }
    const intervalSeconds = plan.prescription.intervalSeconds
    const sets = Array.from({ length: plan.sets }, () => intervalSeconds === null
      ? { kind: 'strength' as const, repetitions: plan.reps, load: { kind: 'user_selected' as const } }
      : { kind: 'timed' as const, durationSeconds: intervalSeconds })
    return { catalogId: exercise.id, sets, guidance }
  })
  const workout: CoachWorkout = { ref: 'workout', title: plan.partial ? 'Partial workout' : 'Workout', preparation: plan.preparation, exercises }
  const estimate = estimateWorkoutSeconds(workout)
  workout.schedule = { estimatedSeconds: estimate, transitionSeconds: Math.max(0, exercises.length - 1) * 30 }
  return { version: 1, kind: 'workout_draft', workout, assumptions: [...plan.assumptions, `Estimated schedule: ${Math.ceil(estimate / 60)} minutes, including preparation, work, rest, transitions and both sides where applicable.`] }
}
export function defaultSelection(plan: Plan): string[] { return plan.slots.map(slot => slot[0].name) }

export function deterministicSelection(plan: Plan): string[] | undefined {
  const family = new Map(plan.slots.flat().map(exercise => [exercise.id, movementFamily(exercise)]))
  const score = (exercises: Exercise[]) => {
    const families = new Set(exercises.map(exercise => family.get(exercise.id)))
    const muscles = new Set(exercises.flatMap(exercise => exercise.primaryMuscles))
    const compounds = exercises.filter(exercise => exercise.mechanic === 'COMPOUND').length
    return 4 * families.size + muscles.size + (plan.prescription.intervalSeconds === null ? 3 * Math.min(compounds, 2) : 0)
  }
  let sessions: Exercise[][] = [[]]
  // Bound the search while keeping alternative combinations for later slots.
  for (const slot of plan.slots) {
    sessions = sessions.flatMap(session => slot
      .filter(exercise => !session.some(item => exerciseSlotIdentity(item.id) === exerciseSlotIdentity(exercise.id)))
      .map(exercise => [...session, exercise]))
      .map(session => ({ session, score: score(session) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 64)
      .map(candidate => candidate.session)
  }
  return [...sessions.map(session => session.map(exercise => exercise.name)), defaultSelection(plan)]
    .find(names => !validateSelection(plan, { selections: names }).errors.length)
}

export function sessionsMeetVariation(sessions: string[][], variation: ReturnType<typeof workoutVariation>) {
  if (variation === 'disjoint') return new Set(sessions.flat()).size === sessions.flat().length
  if (variation === 'distinct') {
    if (new Set(sessions.map(names => JSON.stringify([...names].sort()))).size !== sessions.length) return false
    // A vary-selection request is not met by swapping one accessory: any two sessions may
    // share at most half of their exercises.
    return sessions.every((names, first) => sessions.slice(first + 1).every(other =>
      names.filter(name => other.includes(name)).length * 2 <= Math.min(names.length, other.length)))
  }
  return true
}

export function variedCatalogSelections(plans: Plan[], variation: ReturnType<typeof workoutVariation>): string[][] | null {
  const sessions: string[][] = []
  // Bound search when the reviewed exercise pool cannot satisfy an explicit variation request.
  let remaining = 2000
  const chooseSession = (): boolean => {
    const plan = plans[sessions.length]
    if (!plan) return true
    const prior = new Set(sessions.flat())
    const selection: string[] = []
    const used = new Set<string>()
    const chooseSlot = (index: number): boolean => {
      if (index === plan.slots.length) {
        if (!sessionsMeetVariation([...sessions, selection], variation) ||
          validateSelection(plan, { selections: selection }).errors.length) return false
        sessions.push(selection)
        if (chooseSession()) return true
        sessions.pop()
        return false
      }
      for (const exercise of plan.slots[index]) {
        if (remaining-- <= 0) return false
        const identity = exerciseSlotIdentity(exercise.id)
        if (used.has(identity) || (variation === 'disjoint' && prior.has(exercise.name))) continue
        used.add(identity)
        selection.push(exercise.name)
        if (chooseSlot(index + 1)) return true
        selection.pop()
        used.delete(identity)
      }
      return false
    }
    return chooseSlot(0)
  }
  return chooseSession() ? sessions : null
}

/** Recheck the original planner constraints against an edited workout. */
export function validateWorkoutReview(request: string, draft: Extract<CoachResponse, { kind: 'workout_draft' | 'routine_draft' }>): string[] {
  const schedule = parseWorkoutSchedule(workoutRequestText(request))
  const scheduleErrors = (schedule.kind === 'weekly' || schedule.kind === 'weekdays') && (draft.kind !== 'routine_draft' || draft.workouts.length !== schedule.sessions)
    ? [`The routine must contain ${schedule.sessions} workout sessions.`] : []
  if (draft.kind === 'routine_draft') {
    const focuses = workoutSessionFocuses(schedule)
    const requests = workoutSessionRequests(request, schedule)
    if (schedule.kind === 'weekdays') {
      const routine = draft.routine
      const expectedDays = schedule.days.map(day => day.index)
      if (routine.type !== 'SEQUENTIAL' || !routine.startsOnMonday || routine.days.length !== 7 ||
        routine.days.some((day, index) => (day.kind === 'workout') !== expectedDays.includes(index))) {
        return [...scheduleErrors, 'Keep the requested weekdays and rest days in the weekly schedule.']
      }
    }
    const ordered = draft.routine.type === 'WEEKLY_COMPLETION' ? draft.routine.workoutRefs : draft.routine.days.flatMap(day => day.kind === 'workout' ? [day.workoutRef] : [])
    if (!sessionsMeetVariation(draft.workouts.map(workout => workout.exercises.map(exercise => exercise.catalogId)), workoutVariation(request)))
      scheduleErrors.push('Keep the requested variation between workout sessions.')
    return [...scheduleErrors, ...ordered.flatMap((ref, index) => {
      const workout = draft.workouts.find(workout => workout.ref === ref)
      return workout ? validateSessionReview(requests[index] ?? request, workout, focuses[index]) : ['The routine references an unknown workout.']
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
  const { request: requestText, context } = splitSuppliedContext(request)
  for (const selection of workout.exercises) {
    const exercise = exerciseCatalog.find(item => item.id === selection.catalogId)
    if (!exercise || missingSetup(exercise, requestText, context) || !result.plan.slots.some(slot => slot.some(exercise => exercise.id === selection.catalogId)))
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
  if (prescription.intervalSeconds !== null) {
    if (workout.exercises.some(exercise => exercise.sets.some(set => set.kind !== 'timed')))
      errors.push('Each interval must use a timed set.')
    if (!prescription.assumedWork && workout.exercises.some(exercise => exercise.sets.some(set => set.kind === 'timed' && set.durationSeconds !== prescription.intervalSeconds)))
      errors.push(`Each interval must keep the requested ${prescription.intervalSeconds} seconds of work.`)
  }
  const setRange = prescription.setsRange
  if (setRange) {
    if (workout.exercises.some(({ sets }) => sets.length < setRange.min || sets.length > Math.min(setRange.max, 6)))
      errors.push('Keep each exercise within the requested and supported set range.')
  } else if (prescription.sets !== undefined && workout.exercises.some(exercise => exercise.sets.length !== prescription.sets)) {
    errors.push(`Each exercise must have the requested ${prescription.sets} sets.`)
  }
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
    const work = selection.sets.reduce((sum, set) => sum + (set.kind === 'timed' ? set.durationSeconds : set.repetitions * 3 * sides), 0)
    const rest = Math.max(0, selection.sets.length - 1) * (selection.guidance?.restSeconds ?? 60)
    const exerciseSeconds = selection.sets.every(set => set.kind === 'timed')
      ? work + rest
      : estimatedExerciseSeconds(selection.sets.length, work, rest, sides)
    seconds += exerciseSeconds + (index > 0 ? 30 : 0)
  })
  return seconds
}
