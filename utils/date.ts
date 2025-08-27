// Centralized date utilities used across the app

// Calendar helpers
export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0 (Sun) - 6 (Sat)
  const mondayIndexed = (day + 6) % 7
  d.setDate(d.getDate() - mondayIndexed)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfWeek(date: Date): Date {
  const s = startOfWeek(date)
  const e = new Date(s)
  e.setDate(s.getDate() + 6)
  e.setHours(23, 59, 59, 999)
  return e
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  d.setHours(23, 59, 59, 999)
  return d
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatMonthYear(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function formatWeekRange(date: Date) {
  const s = startOfWeek(date)
  const e = endOfWeek(date)
  const sameMonth = s.getMonth() === e.getMonth()
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit' }
  const sLabel = s.toLocaleDateString('en-US', options)
  const eLabel = sameMonth
    ? e.getDate().toString().padStart(2, '0')
    : e.toLocaleDateString('en-US', options)
  const year = e.getFullYear()
  return `${sLabel} - ${eLabel} ${year}`
}

export function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export type DayCell = {
  date: Date
  inCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
}

export function generateCalendar(dateInMonth: Date, selected: Date): DayCell[] {
  const firstOfMonth = startOfMonth(dateInMonth)
  const lastOfMonth = endOfMonth(dateInMonth)
  const firstGridDay = startOfWeek(firstOfMonth)
  const lastGridDay = endOfWeek(lastOfMonth)

  const days: DayCell[] = []
  const today = new Date()
  for (let d = new Date(firstGridDay); d <= lastGridDay; d.setDate(d.getDate() + 1)) {
    days.push({
      date: new Date(d),
      inCurrentMonth: d.getMonth() === dateInMonth.getMonth(),
      isToday: sameDay(d, today),
      isSelected: sameDay(d, selected),
    })
  }
  return days
}

// Generic app date formatting
export const formatDate = (dateString: string, format: 'short' | 'long' = 'short') => {
  const date = new Date(dateString)

  if (format === 'long') {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export const getCurrentDate = () => {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Parse a server datetime that is in UTC (+00:00). If the string lacks a timezone
// suffix, treat it as UTC rather than local. Returns a Date representing that
// instant so toLocale* renders in the user's current timezone.
export function parseServerUtcDate(input: string | Date): Date {
  if (input instanceof Date) return new Date(input)
  const str = String(input)
  if (/Z$/i.test(str) || /[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str)
  const [dPart, tPart = '00:00:00'] = str.split('T')
  const [y, m, d] = dPart.split('-').map((v) => parseInt(v, 10))
  const [hhRaw = '0', mmRaw = '0', ssMsRaw = '0'] = tPart.split(':')
  const hh = parseInt(hhRaw, 10) || 0
  const mm = parseInt(mmRaw, 10) || 0
  const [ssRaw = '0', msRaw = '0'] = ssMsRaw.split('.')
  const ss = parseInt(ssRaw, 10) || 0
  const ms = parseInt(msRaw, 10) || 0
  const utcMillis = Date.UTC(y || 0, (m || 1) - 1, d || 1, hh, mm, ss, ms)
  return new Date(utcMillis)
}
