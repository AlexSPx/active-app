const { boundedCoachSession } = require('../../features/coach/session')

test('bounds the transcript using user messages and JSON replies', async () => {
  const reply = { kind: 'final', content: { text: 'ok' } }
  const native = {
    appendUserMessage: jest.fn(),
    generate: jest.fn(async () => reply),
    cancel: async () => {},
    dispose: async () => {},
  }
  const bounded = boundedCoachSession(native, 100)
  const request = { finalResponseSchema: { type: 'object' }, maxOutputTokens: 100, signal: new AbortController().signal }
  await bounded.session.appendUserMessage('hello')
  expect(native.appendUserMessage).toHaveBeenCalledWith('hello')
  expect(bounded.isFull()).toBe(false)
  expect(await bounded.session.generate(request)).toBe(reply)
  expect(bounded.isFull()).toBe(true)
  expect(await bounded.session.generate(request)).toMatchObject({ kind: 'failure', code: 'truncated' })
  expect(native.generate).toHaveBeenCalledTimes(1)
  expect(native.generate).toHaveBeenCalledWith(request)
})
