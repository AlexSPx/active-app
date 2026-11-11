type WorkoutSchedule =
  | { kind: 'single' }
  | { kind: 'weekly'; sessions: number; split: 'shared' | 'ppl' }
  | { kind: 'clarification'; question: string }

const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const quantity = '(\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)'

export type WorkoutFocus = 'push' | 'pull' | 'legs'

export function parseWorkoutSchedule(request: string): WorkoutSchedule {
  const ppl = /\bppl\b|\bpush[\s,/-]+pull[\s,/-]+legs?\b/i.test(request)
  const range = new RegExp(`\\b${quantity}\\s*(?:-|–|to|or)\\s*${quantity}\\s*(?:training\\s+)?days?\\b`, 'i')
  if (range.test(request))
    return { kind: 'clarification', question: 'How many training days per week should I plan for? Please choose one session count.' }
  const patterns = [
    new RegExp(`\\b${quantity}\\s*[-–]?\\s*(?:training\\s+|workout\\s+|consecutive\\s+)?days?\\b`, 'gi'),
    new RegExp(`\\b${quantity}\\s+(?:workouts?|sessions?|times?)\\s*(?:(?:a|per|each)\\s+week|/\\s*week|weekly)\\b`, 'gi'),
  ]
  const counts = patterns.flatMap(pattern => [...request.matchAll(pattern)].map(match => /^\d+$/.test(match[1]) ? Number(match[1]) : words.indexOf(match[1].toLowerCase())))
  if (!counts.length) {
    if (ppl) return { kind: 'weekly', sessions: 3, split: 'ppl' }
    if (/\b(?:multi[- ]day|weekly|week[- ]long|split)\b/i.test(request))
      return { kind: 'clarification', question: 'How many training days per week would you like?' }
    return { kind: 'single' }
  }
  if (new Set(counts).size !== 1 || /\b(?:rest days?|consecutive|calendar|every day|weeks?)\b/i.test(request.replace(/(?:\b(?:a|per|each)\s+week\b|\/\s*week\b|\bweekly\b)/gi, '')))
    return { kind: 'clarification', question: 'How many workout sessions should the routine contain each week? Count training days separately from rest days.' }
  const sessions = counts[0]
  if (sessions < 1 || sessions > 7)
    return { kind: 'clarification', question: 'Choose between 1 and 7 training days per week.' }
  if (ppl && sessions !== 3 && sessions !== 6)
    return { kind: 'clarification', question: 'Should I plan one Push/Pull/Legs cycle over 3 training days, or two cycles over 6 training days?' }
  return sessions === 1 ? { kind: 'single' } : { kind: 'weekly', sessions, split: ppl ? 'ppl' : 'shared' }
}

export function workoutSessionFocuses(schedule: WorkoutSchedule): (WorkoutFocus | undefined)[] {
  if (schedule.kind !== 'weekly') return [undefined]
  const cycle: WorkoutFocus[] = ['push', 'pull', 'legs']
  return Array.from({ length: schedule.sessions }, (_, index) => schedule.split === 'ppl' ? cycle[index % cycle.length] : undefined)
}
