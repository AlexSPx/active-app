const { runConstrainedCoachTurn } = require('../../features/coach/constrainedTurn')
const { resolveHistoryExercise } = require('../../features/coach/historyQuery')

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

test('understands the bounded count even when model output is unusable', async () => {
  for (const outputs of [[history, {}, {}], [history, Error('model failed')]]) {
    const result = await run(outputs, readRecords(record('r', '2026-01-01')), 'How many workouts in the last 7 days?')
    expect(result.metrics[0]).toMatchObject({ kind: 'completed_sessions', value: 1 })
    expect(result.repaired).toBe(false)
  }
})

test('QA reports a model runtime failure without reading history', async () => {
  const readHistory = readRecords()
  const result = await run([{ intent: 'coach_qa' }, Error('timeout')], readHistory, 'How should I train?')
  expect(result).toEqual({
    kind: 'failure',
    code: 'runtime_error',
    message: 'The coach could not complete this request.',
  })
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

test.each([
  ['How many training sessions did I log in the past 30 days?', 'completed_sessions', 1, null],
  ['What is my total lifted weight in the past 30 days?', 'external_load_volume_kg', 160, null],
  ['How many Split Squat sessions have I logged in the past 30 days?', 'completed_sessions', 1, 'Split Squat'],
])('retains the history measure, scope, and interval for %s', async (message, kind, value, name) => {
  const readHistory = readRecords(record('r', '2026-11-20T09:00:00Z', [splitSquat]))
  const result = await run([{ intent: 'coach_qa' }, {}, {}], readHistory, message, {
    now: () => new Date('2026-11-23T20:00:00Z'),
  })
  const { interval, exercise } = readHistory.mock.calls[0][0]
  expect(interval).toEqual({ start: '2026-10-24T20:00:00.000Z', end: '2026-11-23T20:00:00.000Z' })
  expect(name ? exercise.match(splitSquat) : exercise).toBe(name ? 'match' : null)
  expect(result.metrics).toEqual([
    expect.objectContaining({ kind, value, evidenceIds: ['r'], missingDataCount: 0 }),
  ])
})

test('offers the recorded exercise name without returning a metric for the wrong identity', async () => {
  const { CoachHistoryRepository } = require('../../lib/repositories/CoachHistoryRepository')
  const exerciseName = 'Garage Bench Press Wide Grip'
  const repo = new CoachHistoryRepository({
    getAllAsync: async () => [{
      id: 'bench',
      start_time: null,
      created_at: '2026-11-23T07:00:00Z',
      exercise_records: JSON.stringify([{ exerciseId: 'custom-bench', exerciseName, reps: [8], weight: [50] }]),
    }],
  })
  const result = await run([history, query('latest', 'Garage Bench Press')], args => repo.readHistory(args),
    'Show my latest recorded Garage Bench Press sets', {
      now: () => new Date('2026-11-23T20:00:00Z'),
    })
  expect(result.response.blocks).toEqual([{ kind: 'text', evidence: [], text: expect.stringContaining(exerciseName) }])
  expect(result.metrics).toBeUndefined()
})

test('explains that aggregate set counts are unavailable without returning a session count', async () => {
  const readHistory = readRecords(record('r', '2026-11-20T09:00:00Z', [splitSquat]))
  const result = await run([history], readHistory, 'How many sets did I log in the past 30 days?')
  expect(result.response).toMatchObject({ kind: 'cannot_fulfill', reason: expect.stringMatching(/count.*sets/i) })
  expect(result.metrics).toBeUndefined()
  expect(readHistory).not.toHaveBeenCalled()
})

test('asks for a relative period instead of substituting one for a calendar year', async () => {
  const readHistory = readRecords()
  const result = await run([history], readHistory, 'How many sessions did I log in 2025?')
  expect(result.response).toMatchObject({ kind: 'clarification', question: expect.stringContaining('calendar dates') })
  expect(readHistory).not.toHaveBeenCalled()
})
