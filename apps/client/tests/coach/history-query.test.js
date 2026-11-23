const { runConstrainedCoachTurn } = require('../../features/coach/constrainedTurn')
const { fallbackHistoryQuery, resolveHistoryExercise } = require('../../features/coach/historyQuery')

const run = (outputs, readHistory, message, guards = {}) => runConstrainedCoachTurn({
  message,
  readHistory,
  signal: new AbortController().signal,
  isCurrentProfile: () => true,
  maxOutputTokens: 500,
  session: {
    appendUserMessage: async () => {},
    generate: async () => {
      const value = outputs.shift()
      if (value instanceof Error) throw value
      return { kind: 'final', content: value }
    },
  },
  ...guards,
})
const history = { intent: 'history_question' }
const query = (type, exercise = null, days = null) => ({ type, exercise, days })
const record = (id, date, exercises = []) => ({ id, timestamp: Date.parse(date), exercises })
const splitSquat = { exerciseId: 'split', name: 'Split Squat', repetitions: [8], weightsKg: [20], durationSeconds: null }
const readRecords = (...records) => jest.fn(async () => ({
  kind: 'success',
  records,
  limitations: ['History may be incomplete.'],
}))

test.each([
  ['volume', 'What is my training volume?', 'external_load_volume_kg', 42, 1],
  ['repetitions', 'How many reps have I logged?', 'recorded_repetitions', 9, 0],
])('uses bounded available history and retains %s evidence', async (type, message, kind, value, missingDataCount) => {
  const readHistory = readRecords(record('r', '2026-01-01', [{ ...splitSquat, repetitions: [7, 2], weightsKg: [6] }]))
  const result = await run([history, query(type)], readHistory, message)
  expect(readHistory).toHaveBeenCalledTimes(1)
  const { interval, exercise } = readHistory.mock.calls[0][0]
  expect(exercise).toBeNull()
  expect(Date.parse(interval.end) - Date.parse(interval.start)).toBe(365 * 86400000)
  expect(result.metrics[0]).toMatchObject({ kind, value, evidenceIds: ['r'], missingDataCount })
  expect(result.response.limitations).toEqual(['History may be incomplete.', expect.stringContaining('older history')])
})

test('reports absent history and does not invent a zero', async () => {
  const result = await run([history, query('best')], readRecords(), 'What is my best recorded load across all exercises?')
  expect(result.response.blocks[0].text).toMatch(/no matching/i)
  expect(result.metrics).toBeUndefined()
})

test('chooses the latest record by timestamp from an unordered read', async () => {
  const readHistory = readRecords(record('old', '2026-01-01'), record('new', '2026-02-01'))
  const result = await run([history, query('latest')], readHistory, 'What was my latest workout?')
  expect(readHistory).toHaveBeenCalledTimes(1)
  expect(result.response.blocks[0]).toMatchObject({ text: expect.stringContaining('2026-02-01'), evidence: [{ kind: 'record', id: 'new' }] })
})

test('resolves exact normalized aliases and clarifies unsupported question shapes', async () => {
  expect(resolveHistoryExercise('FOREARM-plank').kind).toBe('match')
  expect(resolveHistoryExercise('plank invented variation').kind).toBe('unknown')
  const readHistory = readRecords()
  const result = await run([history, query('best', 'plank invented variation')], readHistory, 'What is my best plank invented variation?')
  expect(result.response.kind).toBe('clarification')
  expect(readHistory).not.toHaveBeenCalled()
})

test('falls back deterministically after invalid query or model failure', async () => {
  expect(fallbackHistoryQuery('How many workouts in the last 7 days?')).toMatchObject({ type: 'sessions', days: 7 })
  for (const outputs of [[history, {}, {}], [history, Error('model failed')]]) {
    const result = await run(outputs, readRecords(record('r', '2026-01-01')), 'How many workouts in the last 7 days?')
    expect(result.metrics[0]).toMatchObject({ kind: 'completed_sessions', value: 1 })
    expect(result.repaired).toBe(true)
  }
})

test('QA returns an answer after model runtime failure and never asks a question', async () => {
  const readHistory = readRecords()
  const result = await run([{ intent: 'coach_qa' }, Error('timeout')], readHistory, 'How should I train?')
  expect(result.response.kind).toBe('answer')
  expect(result.response.blocks[0].text).not.toMatch(/\?/)
  expect(result.response.limitations.join(' ')).toMatch(/unavailable/)
  expect(readHistory).not.toHaveBeenCalled()
})

test.each([
  ['What was my heaviest Pull-ups load?', 'best', 'best_recorded_sets', [{ exerciseId: 'pull-id', weightKg: 12, repetitions: 5, recordId: 'r' }]],
  ['How many Pull-ups sessions have I logged?', 'sessions', 'completed_sessions', 1],
])('corrects a mismatched measure for %s', async (message, type, metricKind, value) => {
  const exercise = { ...splitSquat, exerciseId: 'pull-id', name: 'Pull Up', repetitions: [5], weightsKg: [12] }
  const readHistory = readRecords(record('r', '2026-01-01', [exercise]))
  const result = await run([history, query('presence', 'Pull-ups'), query(type, 'Pull-ups')], readHistory, message)
  expect(readHistory).toHaveBeenCalledTimes(1)
  expect(readHistory.mock.calls[0][0].exercise.match(exercise)).toBe('match')
  expect(result.metrics[0]).toMatchObject({ kind: metricKind, value })
  expect(result.response.blocks[0]).toEqual({ kind: 'metric', metricId: metricKind })
})

test.each([
  [[history, query('latest', null), query('latest', 'Split Squat')], 'Show my most recent Split Squat weight and reps'],
  [[history, query('latest', 'Split Squat')], 'What were my latest recorded Split Squat sets?'],
])('latest exercise reports recorded load and reps with evidence', async (outputs, message) => {
  const result = await run(outputs, readRecords(record('r', '2026-01-01', [splitSquat])), message)
  expect(result.metrics[0]).toMatchObject({ kind: 'latest_recorded_sets', value: [{ weightKg: 20, repetitions: 8, recordId: 'r' }], evidenceIds: ['r'] })
  expect(result.response.blocks[1]).toMatchObject({ kind: 'metric' })
})

test('latest record without paired load and repetitions retains its evidence', async () => {
  const result = await run(
    [history, query('latest', 'Split Squat')],
    readRecords(record('r', '2026-01-01', [{ ...splitSquat, weightsKg: [] }])),
    'Show my latest Split Squat weight and reps'
  )
  expect(result.response.blocks[0].evidence).toEqual([{ kind: 'record', id: 'r' }])
  expect(result.response.limitations).toContain('The requested load and repetitions are not both available for this record.')
  expect(result.metrics).toBeUndefined()
})

test('presence reports a matching record without a metric', async () => {
  const result = await run([history, query('presence', 'Split Squat')], readRecords(record('r', '2026-01-01', [splitSquat])), 'Have I ever done Split Squat?')
  expect(result.response.blocks).toEqual([{ kind: 'text', text: 'I found a matching training record.', evidence: [{ kind: 'record', id: 'r' }] }])
  expect(result.metrics).toBeUndefined()
})

test.each(['cancelled', 'stale_profile'])('discards a pending history result when %s', async code => {
  const controller = new AbortController()
  let current = true
  const read = readRecords(record('r', '2026-01-01', [splitSquat]))
  const readHistory = async args => {
    const result = await read(args)
    if (code === 'cancelled') controller.abort()
    else current = false
    return result
  }
  const result = await run([history, query('latest')], readHistory, 'What was my latest workout?', {
    signal: controller.signal,
    isCurrentProfile: () => current,
  })
  expect(result).toMatchObject({ kind: 'failure', code })
})
