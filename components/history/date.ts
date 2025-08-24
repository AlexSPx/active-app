// Shared date helper utilities for the History view

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0 (Sun) - 6 (Sat)
  // Convert to Monday-indexed (Mon=0,...,Sun=6)
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
