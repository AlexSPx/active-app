/** Returns an offset and span for the two-section weigh-in chart. */
export function weightChartBounds(values: number[], unit: 'kg' | 'lb') {
  if (!values.length) return { min: 0, span: unit === 'kg' ? 1 : 2 }
  const low = Math.min(...values)
  const high = Math.max(...values)
  const increment = unit === 'kg' ? 0.5 : 1
  const padding = Math.max((high - low) * 0.1, increment / 2)
  const min = Math.max(0, Math.floor((low - padding) / increment) * increment)
  const step = Math.max(increment, Math.ceil((high + padding - min) / (2 * increment)) * increment)
  return { min, span: step * 2 }
}
