jest.mock('../../lib/sync', () => ({ syncEngine: {} }))
const { DatabaseSync } = require('node:sqlite')
const { CoachConversationRepository, formatCoachMetric } = require('../../features/coach/conversations')

test('valid latest-set metrics survive conversation persistence and malformed values are rejected', async () => {
  const sql = new DatabaseSync(':memory:')
  sql.exec('CREATE TABLE coach_conversations (id TEXT PRIMARY KEY, updated_at TEXT, items_json TEXT)')
  const db = {
    runAsync: async (query, ...args) => sql.prepare(query).run(...args),
    getFirstAsync: async (query, ...args) => sql.prepare(query).get(...args) ?? null,
  }
  const metric = { id: 'latest-sets:r1', kind: 'latest_recorded_sets', value: [{ repetitions: 8, weightKg: 40, recordId: 'r1' }], evidenceIds: ['r1'], missingDataCount: 0, definition: 'Recorded sets.' }
  const formatted = formatCoachMetric(metric)
  expect(formatted.text).toMatch(/40.*8/)
  expect(formatCoachMetric({ ...metric, evidenceIds: [null] })).toBeNull()
  const repository = new CoachConversationRepository(db)
  await repository.save('c1', [{ kind: 'response', response: { version: 1, kind: 'answer', blocks: [{ kind: 'metric', metricId: metric.id }], limitations: [] }, reviewId: 'review', request: 'Latest sets', details: { metrics: new Map([[formatted.id, formatted.text]]), names: new Map(), evidence: new Map() } }])
  const loaded = await repository.load('c1')
  expect(loaded[0].details.metrics.get(metric.id)).toBe(formatted.text)
  sql.close()
})

test('two responses preserve their own formatted values across SQLite reload', async () => {
  const sql = new DatabaseSync(':memory:')
  sql.exec('CREATE TABLE coach_conversations (id TEXT PRIMARY KEY, updated_at TEXT, items_json TEXT)')
  const db = { runAsync: async (query, ...args) => sql.prepare(query).run(...args), getFirstAsync: async (query, ...args) => sql.prepare(query).get(...args) ?? null }
  const repository = new CoachConversationRepository(db)
  const metric = weightKg => ({ id: 'latest-sets:r1', kind: 'latest_recorded_sets', value: [{ exerciseName: 'Squat', repetitions: 8, weightKg, recordId: 'r1' }], evidenceIds: ['r1'], missingDataCount: 0 })
  const item = value => ({ kind: 'response', response: { version: 1, kind: 'answer', blocks: [{ kind: 'metric', metricId: value.id }], limitations: [] }, reviewId: 'review', details: { metrics: new Map([[value.id, value.text]]), names: new Map(), evidence: new Map() } })
  const first = formatCoachMetric(metric(0)), second = formatCoachMetric(metric(40))
  await repository.save('c1', [item(first), item(second)])
  const loaded = await repository.load('c1')
  expect(loaded.map(row => row.details.metrics.get(first.id))).toEqual([first.text, second.text])
  expect(first.text).toContain('Squat: 0 kg, 8 reps')
  expect(second.text).toContain('Squat: 40 kg, 8 reps')
  sql.close()
})

test('acute user context survives SQLite reload before a new workout turn', async () => {
  const { runConstrainedCoachTurn } = require('../../features/coach/constrainedTurn')
  const sql = new DatabaseSync(':memory:')
  sql.exec('CREATE TABLE coach_conversations (id TEXT PRIMARY KEY, updated_at TEXT, items_json TEXT)')
  const db = { runAsync: async (query, ...args) => sql.prepare(query).run(...args), getFirstAsync: async (query, ...args) => sql.prepare(query).get(...args) ?? null }
  const repository = new CoachConversationRepository(db)
  await repository.save('c1', [{ kind: 'user', text: 'My chest hurts now' }])
  const loaded = await repository.load('c1')
  const generate = jest.fn()
  const result = await runConstrainedCoachTurn({ message: 'Create a new workout, full gym', priorUserMessages: loaded.filter(item => item.kind === 'user').map(item => item.text), session: { appendUserMessage: async () => {}, generate }, execute: jest.fn(), signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 500 })
  expect(result.response.kind).toBe('cannot_fulfill')
  expect(generate).not.toHaveBeenCalled()
  sql.close()
})
