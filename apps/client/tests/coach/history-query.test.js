const { runConstrainedCoachTurn } = require('../../features/coach/constrainedTurn')
const { fallbackHistoryQuery, resolveHistoryExercise } = require('../../features/coach/historyQuery')
const coverage = { queriedInterval: { start: '2025-01-01T00:00:00.000Z', end: '2026-01-01T00:00:00.000Z' }, localHistoryComplete: false, limitations: [] }
const run = (outputs, execute, message) => runConstrainedCoachTurn({ message, execute, signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 500, session: { appendUserMessage: async () => {}, generate: async () => { const value = outputs.shift(); if (value instanceof Error) throw value; return { kind: 'final', content: value } } } })
const history = { intent: 'history_question' }
const query = (type, exercise = null, days = null) => ({ type, exercise, days })
test('uses bounded available history and retains metric evidence', async () => {
  const calls = []
  const result = await run([history, query('volume')], async call => { calls.push(call); return { kind: 'success', data: { metrics: [{ id: 'm', kind: 'external_load_volume_kg', value: 42, evidenceIds: ['r'], missingDataCount: 1 }], coverage } } }, 'What is my training volume?')
  expect(calls[0].arguments.metrics).toEqual(['external_load_volume_kg'])
  expect(Date.parse(calls[0].arguments.interval.end) - Date.parse(calls[0].arguments.interval.start)).toBe(365 * 86400000)
  expect(result.metrics[0]).toMatchObject({ value: 42, evidenceIds: ['r'], missingDataCount: 1 })
  expect(result.response.limitations.join(' ')).toMatch(/older history/)
})
test('reports absent history and does not invent a zero', async () => {
  const result = await run([history, query('best')], async () => ({ kind: 'success', data: { metrics: [{ id: 'm', kind: 'best_recorded_sets', value: [], evidenceIds: [], missingDataCount: 0 }], coverage } }), 'What is my best recorded load across all exercises?')
  expect(result.response.blocks[0].text).toMatch(/no matching/i)
  expect(result.metrics).toBeUndefined()
})
test('does not claim a latest result when records are paginated', async () => {
  const result = await run([history, query('latest')], async () => ({ kind: 'success', data: { items: [{ id: 'r', workoutId: null, startedAt: null, createdAt: '2026-01-01T00:00:00Z', exercises: [] }], nextCursor: 'r', coverage } }), 'What was my latest workout?')
  expect(result.response.blocks[0]).toMatchObject({ text: expect.stringMatching(/could not determine the latest/), evidence: [{ kind: 'record', id: 'r' }] })
})
test('resolves exact normalized aliases and refuses unknown exercises', async () => {
  expect(resolveHistoryExercise('FOREARM-plank').kind).toBe('match')
  expect(resolveHistoryExercise('plank invented variation').kind).toBe('unknown')
  const result = await run([history, query('best', 'plank invented variation')], async () => { throw Error('must not query') }, 'What is my best plank invented variation?')
  expect(result.response.kind).toBe('clarification')
})
test('falls back deterministically after invalid query or model failure', async () => {
  expect(fallbackHistoryQuery('How many workouts in the last 7 days?')).toMatchObject({ type: 'sessions', days: 7 })
  for (const outputs of [[history, {}, {}], [history, Error('model failed')]]) {
    let called
    const result = await run(outputs, async call => { called = call; return { kind: 'success', data: { metrics: [{ id: 'm', kind: 'completed_sessions', value: 2, evidenceIds: ['r'], missingDataCount: 0 }], coverage } } }, 'How many workouts in the last 7 days?')
    expect(called.arguments.metrics).toEqual(['completed_sessions'])
    expect(result.repaired).toBe(true)
  }
})
test('QA returns an answer after model runtime failure and never asks a question', async () => {
  const result = await run([{ intent: 'coach_qa' }, Error('timeout')], async () => { throw Error('unused') }, 'How should I train?')
  expect(result.response.kind).toBe('answer')
  expect(result.response.blocks[0].text).not.toMatch(/\?/)
  expect(result.response.limitations.join(' ')).toMatch(/unavailable/)
})
test('reads successive pages before choosing the latest record', async () => {
  const calls = []
  const result = await run([history, query('latest')], async call => {
    calls.push(call)
    const second = Boolean(call.arguments.cursor)
    return { kind: 'success', data: { items: [{ id: second ? 'new' : 'old', workoutId: null, startedAt: null, createdAt: second ? '2026-02-01T00:00:00Z' : '2026-01-01T00:00:00Z', exercises: [] }], nextCursor: second ? null : 'old', coverage } }
  }, 'What was my latest workout?')
  expect(calls).toHaveLength(2)
  expect(result.response.blocks[0]).toMatchObject({ text: expect.stringContaining('2026-02-01'), evidence: [{ kind: 'record', id: 'new' }] })
})

test.each([
  ['What was my heaviest Pull-ups load?', 'best', 'best_recorded_sets'],
  ['How many Pull-ups sessions have I logged?', 'sessions', 'completed_sessions'],
])('corrects a mismatched measure for %s', async (message, type, metricKind) => {
  const calls = []
  const record = { id: 'r', workoutId: null, startedAt: null, createdAt: '2026-01-01T00:00:00Z', exercises: [{ exerciseId: 'pull-id', name: 'Pull Up', repetitions: [5], weightsKg: [12], durationSeconds: null }] }
  const result = await run([history, query('presence', 'Pull-ups'), query(type, 'Pull-ups')], async call => {
    calls.push(call)
    if (call.name === 'readRecords') return { kind: 'success', data: { items: [record], nextCursor: null, coverage } }
    return { kind: 'success', data: { metrics: [{ id: 'm', kind: metricKind, value: metricKind === 'best_recorded_sets' ? [{ weightKg: 12, repetitions: 5, recordId: 'r' }] : 1, evidenceIds: ['r'], missingDataCount: 0 }], coverage } }
  }, message)
  expect(calls.at(-1).arguments).toMatchObject({ exerciseId: 'pull-id', metrics: [metricKind] })
  expect(result.response.blocks[0]).toEqual({ kind: 'metric', metricId: 'm' })
})
test('latest exercise reports recorded load and reps with evidence', async () => {
  const record = { id: 'r', workoutId: null, startedAt: null, createdAt: '2026-01-01T00:00:00Z', exercises: [{ exerciseId: 'split', name: 'Split Squat', repetitions: [8], weightsKg: [20], durationSeconds: null }] }
  const result = await run([history, query('latest', null), query('latest', 'Split Squat')], async () => ({ kind: 'success', data: { items: [record], nextCursor: null, coverage } }), 'Show my most recent Split Squat weight and reps')
  expect(result.metrics[0]).toMatchObject({ kind: 'latest_recorded_sets', value: [{ weightKg: 20, repetitions: 8, recordId: 'r' }], evidenceIds: ['r'] })
  expect(result.response.blocks[1]).toMatchObject({ kind: 'metric' })
})
test('does not turn an unresolved named exercise into an absence', async () => {
  const record = { id: 'r', workoutId: null, startedAt: null, createdAt: '2026-01-01T00:00:00Z', exercises: [{ exerciseId: null, name: 'Split Squat', repetitions: [8], weightsKg: [20], durationSeconds: null }] }
  const result = await run([history, query('presence', 'Split Squat')], async () => ({ kind: 'success', data: { items: [record], nextCursor: null, coverage } }), 'Have I ever done Split Squat?')
  expect(result.response.blocks[0].text).toMatch(/unresolved|ambiguous/i)
})

test('latest recorded sets include their load and repetitions', async () => {
  const record = { id: 'r', workoutId: null, startedAt: null, createdAt: '2026-01-01T00:00:00Z', exercises: [{ exerciseId: 'split', name: 'Split Squat', repetitions: [8], weightsKg: [20], durationSeconds: null }] }
  const result = await run([history, query('latest', 'Split Squat')], async () => ({ kind: 'success', data: { items: [record], nextCursor: null, coverage } }), 'What were my latest recorded Split Squat sets?')
  expect(result.metrics[0]).toMatchObject({ kind: 'latest_recorded_sets', value: [{ weightKg: 20, repetitions: 8, recordId: 'r' }] })
})

test('ISO-date clarification retains the named exercise and requested relative interval', async () => {
  const { applyWorkoutFollowUp } = require('../../features/coach/constrainedTurn')
  const original = 'What was my latest Pull-ups load in 2024-01-01?'
  const first = await run([history], async () => { throw Error('unexpected read') }, original)
  expect(first.response.kind).toBe('clarification')
  const message = applyWorkoutFollowUp('30 days', [{ kind: 'user', text: original }, { kind: 'response', response: first.response, request: original }])
  const calls = []
  const record = { id: 'r', workoutId: null, startedAt: null, createdAt: '2026-01-01T00:00:00Z', exercises: [{ exerciseId: 'pull-id', name: 'Pull Up', repetitions: [5], weightsKg: [12], durationSeconds: null }] }
  await run([history, query('latest', 'Pull-ups', 30)], async call => {
    calls.push(call)
    return { kind: 'success', data: { items: [record], nextCursor: null, coverage } }
  }, message)
  expect(calls.length).toBeGreaterThan(0)
  expect(Date.parse(calls[0].arguments.interval.end) - Date.parse(calls[0].arguments.interval.start)).toBe(30 * 86400000)
  expect(message).toMatch(/Pull-ups.*past 30 days/)
})
