const { boundedCoachSession } = require('../../features/coach/session')

test('bounds the transcript without rewriting native tool results', async () => {
  const received = []
  const native = {
    appendUserMessage: async (value) => received.push(value),
    appendToolResult: async (value) => received.push(value),
    generate: jest.fn(async () => ({ kind: 'final', content: { text: 'ok' } })),
    cancel: async () => {},
    dispose: async () => {},
  }
  const bounded = boundedCoachSession(native, 120)
  const tool = {
    callId: 'call',
    name: 'readWorkout',
    result: { kind: 'error', code: 'not_found', message: 'none' },
  }
  await bounded.session.appendUserMessage('hello')
  await bounded.session.appendToolResult(tool)
  expect(received[1]).toBe(tool)
  expect(bounded.isFull()).toBe(true)
  expect(await bounded.session.generate({})).toMatchObject({ kind: 'failure', code: 'truncated' })
  expect(native.generate).not.toHaveBeenCalled()
})
