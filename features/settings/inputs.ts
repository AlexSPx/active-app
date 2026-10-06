export type MeasurementUnit = 'kg' | 'lb' | 'cm' | 'in'
const metricFactor = { kg: 1, lb: 1 / 2.2046226218, cm: 1, in: 2.54 }

export function measurementText(value: number | null | undefined, unit: MeasurementUnit) {
  return value == null ? '' : String(Math.round((value / metricFactor[unit]) * 10) / 10)
}

// Blank is optional; undefined means invalid and must never be saved.
export function parseMeasurement(text: string, unit: MeasurementUnit) {
  if (!text.trim()) return null
  if (!/^\d+(?:[.,]\d*)?$/.test(text.trim())) return undefined
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value * metricFactor[unit] : undefined
}

export function parseRestDuration(minutes: string, seconds: string) {
  if (!/^\d+$/.test(minutes) || !/^\d+$/.test(seconds)) return null
  const m = Number(minutes),
    s = Number(seconds)
  return m <= 59 && s <= 59 && m * 60 + s > 0 ? m * 60 + s : null
}
