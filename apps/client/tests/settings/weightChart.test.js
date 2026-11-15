const { weightChartBounds } = require('../../features/settings/weightChart')

test.each([
  [[76, 74.8], 'kg'],
  [[167.6, 165], 'lb'],
])('keeps a small change visible while including both measurements', (values, unit) => {
  const { min, span } = weightChartBounds(values, unit)
  const difference = Math.max(...values) - Math.min(...values)
  expect(min).toBeLessThan(Math.min(...values))
  expect(min + span).toBeGreaterThan(Math.max(...values))
  expect(difference / span).toBeGreaterThan(0.4)
})

test.each([
  [[75], 'kg'],
  [[165, 165], 'lb'],
  [[], 'kg'],
])('provides a nonzero, valid range for a single, flat, or empty history', (values, unit) => {
  const { min, span } = weightChartBounds(values, unit)
  expect(min).toBeGreaterThanOrEqual(0)
  expect(span).toBeGreaterThan(0)
  values.forEach((value) => {
    expect(value).toBeGreaterThanOrEqual(min)
    expect(value).toBeLessThanOrEqual(min + span)
  })
})
