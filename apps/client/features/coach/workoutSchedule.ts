type WorkoutSchedule =
  | { kind: 'single' }
  | {
      kind: 'weekdays'
      sessions: number
      days: { index: number; focus: WorkoutFocus | undefined }[]
    }
  | { kind: 'weekly'; sessions: number; split: 'shared' | 'ppl' }
  | { kind: 'clarification'; question: string }

const words = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]
const quantity = '(\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)'

export type WorkoutFocus = 'push' | 'pull' | 'legs' | 'upper'
export const weekdayLabels = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export function singleWorkoutFocus(request: string): WorkoutFocus | undefined {
  const focus = /\b(push|pull)(?:[- ]day)? (?:workouts?|sessions?|training)\b/i
    .exec(request)?.[1]
    ?.toLowerCase()
  return focus === 'push' || focus === 'pull' ? focus : undefined
}

const weekdayPattern = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?'
const dayFocus = '(push|pull|legs?|upper[- ]body|lower[- ]body|(?:full|whole)[- ]body)'
const focusBeforeDay = new RegExp(
  String.raw`\b${dayFocus}(?:\s+(?:workout|training|day))?\s+(?:on\s+)?${weekdayPattern}\b`,
  'gi'
)
const dayBeforeFocus = new RegExp(
  String.raw`\b${weekdayPattern}(?:\s*(?:[:–—-]|is|for)\s*|\s+)${dayFocus}\b`,
  'gi'
)
const namedDays = new RegExp(String.raw`\b${weekdayPattern}\b`, 'gi')
const weekdayList = String.raw`${weekdayPattern}(?:(?:,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)${weekdayPattern})*`
const restBeforeDay = new RegExp(
  String.raw`\b(?:rest|off|no training|no workouts?|do not train|don't train|skip|except|excluding|not)(?:\s+days?)?(?:\s+(?:on|are|is|will be))?\s+(${weekdayList})\b`,
  'gi'
)
const restAfterDay = new RegExp(
  String.raw`\b(${weekdayPattern}(?:\s+(?:and|or)\s+${weekdayPattern})*)\s*(?:[:–—-]\s*|(?:is|are|as)\s+)?(?:a\s+)?(?:rest|off|no training|no workouts?)\b`,
  'gi'
)
const directWeekdayRequest = new RegExp(
  String.raw`^(?:(?:i (?:want|would like) to|help me|please)\s+)?(?:train|work ?out|exercise)\s+(?:on\s+)?${weekdayPattern}\b`,
  'i'
)

function weekdayFocus(label: string): WorkoutFocus | undefined {
  if (/^upper/i.test(label)) return 'upper'
  if (/^(?:lower|legs?)/i.test(label)) return 'legs'
  if (/^push$/i.test(label)) return 'push'
  if (/^pull$/i.test(label)) return 'pull'
  return undefined
}

export function parseWorkoutSchedule(request: string): WorkoutSchedule {
  const ppl = /\bppl\b|\bpush[\s,/-]+pull[\s,/-]+legs?\b/i.test(request)
  const range = new RegExp(
    `\\b${quantity}\\s*(?:-|–|to|or)\\s*${quantity}\\s*(?:training\\s+)?days?\\b`,
    'i'
  )
  if (range.test(request))
    return {
      kind: 'clarification',
      question:
        'How many training days per week should I plan for? Please choose one session count.',
    }
  const patterns = [
    new RegExp(
      `\\b${quantity}\\s*[-–]?\\s*(?:training\\s+|workout\\s+|consecutive\\s+)?days?\\b`,
      'gi'
    ),
    new RegExp(
      `\\b${quantity}\\s*[-–]?\\s*(?:workouts?|sessions?|times?)\\s*(?:(?:a|per|each)\\s+week|/\\s*week|weekly)\\b`,
      'gi'
    ),
  ]
  const counts = patterns.flatMap((pattern) =>
    [...request.matchAll(pattern)].map((match) =>
      /^\d+$/.test(match[1]) ? Number(match[1]) : words.indexOf(match[1].toLowerCase())
    )
  )
  if (
    /\b(?:routine|split|weekly (?:workouts?|training|plan|schedule))\b/i.test(request) ||
    (directWeekdayRequest.test(request.trim()) && [...request.matchAll(namedDays)].length > 1)
  ) {
    const weekdayIndex = (day: string) =>
      weekdayLabels.findIndex((label) => label.toLowerCase() === day.toLowerCase())
    const restDays = new Set(
      [...request.matchAll(restBeforeDay), ...request.matchAll(restAfterDay)]
        .flatMap(([, days]) => [...days.matchAll(namedDays)].map(([, day]) => weekdayIndex(day)))
    )
    const trainingText = request.replace(restBeforeDay, '').replace(restAfterDay, '')
    const named = [
      ...new Set([...trainingText.matchAll(namedDays)].map(([, day]) => weekdayIndex(day))),
    ]
    if (named.some((day) => restDays.has(day)))
      return {
        kind: 'clarification',
        question:
          'A weekday is listed for both training and rest. Which days should have workouts?',
      }
    const days = named.sort((a, b) => a - b)
    if (!days.length && restDays.size)
      return { kind: 'clarification', question: 'Which weekdays should have workouts?' }
    if (days.length) {
      if (counts.some((count) => count !== days.length)) {
        const labels = days.map(day => weekdayLabels[day])
        const requested = [...new Set(counts)].join(' or ')
        return {
          kind: 'clarification',
          question:
            `You asked for ${requested} ${counts.some(c => c === 1) && days.length === 1 ? 'session' : 'sessions'} per week, but the named training day${days.length === 1 ? '' : 's'} (${labels.join(' and ')}) ${days.length === 1 ? 'gives' : 'give'} at most ${days.length}. ` +
            `Is ${days.length} ${days.length === 1 ? 'session' : 'sessions'} per week on ${days.length === 1 ? 'that day' : 'those days'} acceptable, or should one day host two sessions?`,
        }
      }
      const focuses = new Map<number, WorkoutFocus | undefined>()
      const entries = [
        ...[...request.matchAll(focusBeforeDay)].map(([, label, day]) => ({
          index: weekdayIndex(day),
          focus: weekdayFocus(label),
        })),
        ...[...request.matchAll(dayBeforeFocus)].map(([, day, label]) => ({
          index: weekdayIndex(day),
          focus: weekdayFocus(label),
        })),
      ]
      for (const { index, focus } of entries) {
        if (focuses.has(index) && focuses.get(index) !== focus)
          return {
            kind: 'clarification',
            question: `Which training focus should I use for ${weekdayLabels[index]}?`,
          }
        focuses.set(index, focus)
      }
      if ((entries.length || ppl) && days.some((day) => !focuses.has(day)))
        return {
          kind: 'clarification',
          question: 'What training focus should I use for each listed weekday?',
        }
      return {
        kind: 'weekdays',
        sessions: days.length,
        days: days.map((index) => ({ index, focus: focuses.get(index) })),
      }
    }
  }
  if (!counts.length) {
    if (ppl) return { kind: 'weekly', sessions: 3, split: 'ppl' }
    if (/\b(?:multi[- ]day|weekly|week[- ]long|split)\b/i.test(request))
      return { kind: 'clarification', question: 'How many training days per week would you like?' }
    return { kind: 'single' }
  }
  if (
    new Set(counts).size !== 1 ||
    /\b(?:rest days?|consecutive|calendar|every day|weeks?)\b/i.test(
      request.replace(/(?:\b(?:a|per|each|every)\s+week\b|\b(?:during|throughout|within)\s+the\s+week\b|\/\s*week\b|\bweekly\b)/gi, '')
    )
  )
    return {
      kind: 'clarification',
      question:
        'How many workout sessions should the routine contain each week? Count training days separately from rest days.',
    }
  const sessions = counts[0]
  if (sessions < 1 || sessions > 7)
    return { kind: 'clarification', question: 'Choose between 1 and 7 training days per week.' }
  if (ppl && sessions !== 3 && sessions !== 6)
    return {
      kind: 'clarification',
      question:
        'Should I plan one Push/Pull/Legs cycle over 3 training days, or two cycles over 6 training days?',
    }
  return sessions === 1
    ? { kind: 'single' }
    : { kind: 'weekly', sessions, split: ppl ? 'ppl' : 'shared' }
}

export function workoutSessionFocuses(schedule: WorkoutSchedule): (WorkoutFocus | undefined)[] {
  if (schedule.kind === 'weekdays') return schedule.days.map((day) => day.focus)
  if (schedule.kind !== 'weekly') return [undefined]
  const cycle: WorkoutFocus[] = ['push', 'pull', 'legs']
  return Array.from({ length: schedule.sessions }, (_, index) =>
    schedule.split === 'ppl' ? cycle[index % cycle.length] : undefined
  )
}

export function workoutSessionRequests(message: string, schedule: WorkoutSchedule): string[] {
  if (schedule.kind !== 'weekdays') return workoutSessionFocuses(schedule).map(() => message)
  // Remove day-specific focus words only. Request-wide duration, equipment and context still apply.
  const contextAt = message.lastIndexOf('\nUser-supplied context: ')
  const request = contextAt < 0 ? message : message.slice(0, contextAt)
  const context = contextAt < 0 ? '' : message.slice(contextAt)
  const common =
    request
      .replace(focusBeforeDay, '')
      .replace(dayBeforeFocus, '')
      .replace(restBeforeDay, '')
      .replace(restAfterDay, '') + context
  return schedule.days.map(({ index }) => {
    const label = weekdayLabels[index].toLowerCase()
    const explicitlyFullBody =
      [...request.matchAll(focusBeforeDay)].some(
        ([, focus, day]) => /^(?:full|whole)/i.test(focus) && day.toLowerCase() === label
      ) ||
      [...request.matchAll(dayBeforeFocus)].some(
        ([, day, focus]) => /^(?:full|whole)/i.test(focus) && day.toLowerCase() === label
      )
    return explicitlyFullBody ? 'Full body. ' + common : common
  })
}

export function workoutVariation(request: string): 'distinct' | 'disjoint' | null {
  if (
    /\b(?:no repeat(?:ed|ing)? exercises?|without repeat(?:ed|ing)? exercises?|different exercises? (?:each|every) day)\b/i.test(
      request
    )
  )
    return 'disjoint'
  if (
    /\b(?:different|varied|alternating) (?:workouts?|sessions?|templates?)\b|\b(?:vary|alternate) (?:the )?(?:workouts?|sessions?|exercises?)\b/i.test(
      request
    )
  )
    return 'distinct'
  return null
}
