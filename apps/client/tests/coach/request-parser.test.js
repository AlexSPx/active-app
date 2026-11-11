const { parseCoachRequest } = require('../../features/coach/requestParser')
const { requestContractSchema } = require('../../features/coach/requestCoverage')

test('preserves original UTF-16 spans, quantities, negation and session context', () => {
  const text = '🏋️ Please plan session A with 3 sets of 8 reps; session B: avoid jumps, maybe 20 minutes.'
  const result = parseCoachRequest(text)
  expect(result.state).toBe('parsed')
  expect(requestContractSchema.safeParse(result.request).success).toBe(true)
  expect(result.request.parts.map(p => p.provenance.text).join('')).toBe(text)
  expect(result.request.constraints[0].description).toContain('session B: avoid jumps')
  expect(result.observations.filter(o => o.kind === 'quantity').map(o => o.provenance.text)).toEqual(['3 sets', '8 reps', '20 minutes'])
  expect(result.observations.some(o => o.kind === 'negation' && o.provenance.text === 'avoid')).toBe(true)
  expect(result.observations.some(o => o.kind === 'uncertainty' && o.provenance.text === 'maybe')).toBe(true)
  expect(result.request.completeness).toBe('unreviewed')
})

test('retains ambiguous associations and prohibited operations in literal contract text', () => {
  const result = parseCoachRequest('Show my last two sessions and create a routine, but do not save it. Is it one plan or two?')
  expect(result.state).toBe('parsed')
  expect(result.request.parts.map(p => p.description).join(' ')).toContain('last two sessions and create a routine')
  expect(result.request.constraints[0].description).toContain('do not save it')
  expect(result.uncertainties.join(' ')).toContain('associations')
  expect(requestContractSchema.safeParse(result.request).success).toBe(true)
})

test('abstains explicitly for unrecognized language and blank input', () => {
  const result = parseCoachRequest('Направи тренировка')
  expect(result.state).toBe('abstained')
  expect(result.request.parts[0].provenance.text).toBe('Направи тренировка')
  expect(requestContractSchema.safeParse(result.request).success).toBe(true)
  expect(parseCoachRequest('  ').request).toBeNull()
})
