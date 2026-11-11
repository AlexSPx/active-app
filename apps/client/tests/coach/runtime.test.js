jest.mock('llama.rn', () => ({ initLlama: jest.fn() }))
const { createLlamaSession } = require('../../features/coach/runtime/llamaRuntime.native')
const request = () => ({
  tools: [{ name: 'readWorkout', description: 'Read workout', inputSchema: { type: 'object' } }],
  finalResponseSchema: { type: 'object' },
  maxOutputTokens: 100,
  signal: new AbortController().signal,
})
const context = (options) => ({
  getFormattedChat: jest
    .fn()
    .mockResolvedValue({ type: 'jinja', prompt: 'formatted', has_media: false }),
  tokenize: jest.fn().mockResolvedValue({ tokens: [1], has_media: false }),
  ...options,
})
const result = (value) => ({
  content: '',
  text: '',
  tool_calls: [],
  interrupted: false,
  truncated: false,
  stopped_limit: 0,
  context_full: false,
  ...value,
})

test('preserves native tool calls and tool result when requesting constrained final JSON', async () => {
  const completion = jest
    .fn()
    .mockResolvedValueOnce(
      result({
        tool_calls: [
          {
            type: 'function',
            id: 'c1',
            function: { name: 'readWorkout', arguments: '{"id":"w1"}' },
          },
        ],
      })
    )
    .mockResolvedValueOnce(result({ content: '{"kind":"answer"}' }))
  const native = context({ completion, stopCompletion: jest.fn(), release: jest.fn() })
  const session = createLlamaSession(native)
  await session.appendUserMessage('show workout')
  expect(await session.generate(request())).toEqual({
    kind: 'tool_calls',
    calls: [{ id: 'c1', name: 'readWorkout', arguments: { id: 'w1' } }],
  })
  await session.appendToolResult({
    callId: 'c1',
    name: 'readWorkout',
    result: { kind: 'error', code: 'not_found', message: 'missing' },
  })
  expect(await session.generate(request())).toEqual({ kind: 'final', content: { kind: 'answer' } })
  expect(native.getFormattedChat.mock.calls[1][0]).toEqual([
    { role: 'system', content: require('../../features/coach/prompts').coachInstructions },
    { role: 'user', content: 'show workout' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { type: 'function', id: 'c1', function: { name: 'readWorkout', arguments: '{"id":"w1"}' } },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'c1',
      name: 'readWorkout',
      content: '{"kind":"error","code":"not_found","message":"missing"}',
    },
  ])
  expect(completion.mock.calls[1][0].response_format).toEqual({
    type: 'json_schema',
    json_schema: { schema: { type: 'object' } },
  })
  expect(native.getFormattedChat.mock.calls[0][2].force_pure_content).toBe(false)
})

test('rejects truncated output and exposes malformed final content', async () => {
  const completion = jest
    .fn()
    .mockResolvedValueOnce(result({ stopped_limit: 1 }))
    .mockResolvedValueOnce(result({ content: '{' }))
  const session = createLlamaSession(
    context({ completion, stopCompletion: jest.fn(), release: jest.fn() })
  )
  expect((await session.generate(request())).code).toBe('truncated')
  expect(await session.generate(request())).toEqual({ kind: 'invalid_final', content: '{' })
})

test('schema-only turns use pure content formatting and eager JSON schema sampling', async () => {
  const native = context({
    completion: jest.fn().mockResolvedValue(result({ content: '{"intent":"coach_qa"}' })),
    stopCompletion: jest.fn(),
    release: jest.fn(),
  })
  const schema = { type: 'object', properties: { intent: { const: 'coach_qa' } }, required: ['intent'] }
  const session = createLlamaSession(native)
  expect(await session.generate({ ...request(), tools: [], finalResponseSchema: schema }))
    .toEqual({ kind: 'final', content: { intent: 'coach_qa' } })
  expect(native.getFormattedChat.mock.calls[0][2]).toMatchObject({
    force_pure_content: true,
    enable_thinking: false,
    response_format: { type: 'json_schema', json_schema: { schema } },
  })
  expect(native.completion.mock.calls[0][0]).toMatchObject({
    response_format: { type: 'json_schema', json_schema: { schema } },
  })
  expect(native.completion.mock.calls[0][0].grammar).toBeUndefined()
  expect(native.completion.mock.calls[0][0].grammar_lazy).toBeUndefined()
})

test.each(['format_chat', 'tokenize_prompt', 'completion'])(
  'reports the native exception stage %s in development without logging the transcript',
  async stage => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const reject = jest.fn().mockRejectedValue(new Error('Native test failure'))
      const native = context({
        completion: jest.fn().mockResolvedValue(result({ content: '{}' })),
        stopCompletion: jest.fn(),
        release: jest.fn(),
        ...(stage === 'format_chat' ? { getFormattedChat: reject } : {}),
        ...(stage === 'tokenize_prompt' ? { tokenize: reject } : {}),
        ...(stage === 'completion' ? { completion: reject } : {}),
      })
      const session = createLlamaSession(native)
      await session.appendUserMessage('private user request')
      expect(await session.generate(request())).toMatchObject({ kind: 'failure', code: 'runtime_error' })
      expect(warning).toHaveBeenCalledWith('Coach native generation failed', {
        stage, name: 'Error', message: 'Native test failure',
      })
      expect(JSON.stringify(warning.mock.calls)).not.toContain('private user request')
    } finally {
      warning.mockRestore()
    }
  },
)

test('cancels and waits for inference before releasing the context', async () => {
  let finish
  let started
  const completionStarted = new Promise((resolve) => {
    started = resolve
  })
  const completion = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve
        started()
      })
  )
  const release = jest.fn()
  const stopCompletion = jest.fn().mockResolvedValue(undefined)
  const session = createLlamaSession(context({ completion, stopCompletion, release }))
  const generation = session.generate(request())
  await completionStarted
  const disposal = session.dispose()
  expect(release).not.toHaveBeenCalled()
  finish(result({ content: '{}' }))
  expect((await generation).code).toBe('cancelled')
  await disposal
  expect(stopCompletion).toHaveBeenCalledTimes(1)
  expect(release).toHaveBeenCalledTimes(1)
})

test('refuses a prompt that exceeds native context including reserved output', async () => {
  const completion = jest.fn()
  const session = createLlamaSession(
    context({
      completion,
      stopCompletion: jest.fn(),
      release: jest.fn(),
      tokenize: jest.fn().mockResolvedValue({ tokens: Array(4000).fill(1), has_media: false }),
    })
  )
  expect(await session.generate(request())).toMatchObject({ kind: 'failure', code: 'truncated' })
  expect(completion).not.toHaveBeenCalled()
})

test('reports observed native counts without claiming context fit or retaining prompt text', async () => {
  const measurement = jest.fn()
  const session = createLlamaSession(context({
    completion: jest.fn().mockResolvedValue(result({content:'{}', tokens_evaluated: 4, tokens_predicted: 2})),
    stopCompletion: jest.fn(), release: jest.fn(),
  }))
  await session.appendUserMessage('private evidence')
  await session.generate({...request(), onMeasurement: measurement})
  expect(measurement).toHaveBeenCalledWith(expect.objectContaining({renderedPromptTokens:1, providerInputTokens:4, providerOutputTokens:2, contextFit:'unknown', effectiveInputLimit:null}))
  expect(JSON.stringify(measurement.mock.calls)).not.toContain('private evidence')
})

test('cancellation during formatting never starts native completion', async () => {
  let resume, started
  const entered = new Promise((resolve) => {
    started = resolve
  })
  const formatted = new Promise((resolve) => {
    resume = resolve
  })
  const completion = jest.fn()
  const native = context({
    getFormattedChat: jest.fn(() => {
      started()
      return formatted
    }),
    completion,
    stopCompletion: jest.fn(),
    release: jest.fn(),
  })
  const session = createLlamaSession(native)
  const abort = new AbortController()
  const pending = session.generate({ ...request(), signal: abort.signal })
  await entered
  abort.abort()
  resume({ type: 'jinja', prompt: 'p', has_media: false })
  expect(await pending).toMatchObject({ kind: 'failure', code: 'cancelled' })
  expect(completion).not.toHaveBeenCalled()
})

test('passes the formatted grammar and parser to completion without triggering binding reformatting', async () => {
  const formatted = {
    type: 'jinja',
    prompt: 'formatted',
    has_media: false,
    chat_format: 7,
    grammar: 'grammar',
    grammar_lazy: true,
    grammar_triggers: [{ type: 1, value: 'x', token: 1 }],
    preserved_tokens: ['x'],
    additional_stops: ['stop'],
    generation_prompt: 'assistant',
    thinking_start_tag: '<think>',
    thinking_end_tag: '</think>',
    chat_parser: 'parser',
  }
  let reformat = false
  const native = context({
    getFormattedChat: jest.fn(async () => formatted),
    completion: jest.fn(async (params) => {
      if (params.messages) reformat = true
      return result({ content: '{}' })
    }),
    stopCompletion: jest.fn(),
    release: jest.fn(),
  })
  expect(await createLlamaSession(native).generate(request())).toMatchObject({ kind: 'final' })
  expect(reformat).toBe(false)
  expect(native.completion.mock.calls[0][0]).toMatchObject({
    prompt: 'formatted',
    chat_format: 7,
    grammar: 'grammar',
    grammar_lazy: true,
    grammar_triggers: formatted.grammar_triggers,
    preserved_tokens: ['x'],
    stop: ['stop'],
    generation_prompt: 'assistant',
    thinking_start_tag: '<think>',
    thinking_end_tag: '</think>',
    chat_parser: 'parser',
  })
})

test('invalid artifact does not claim a native context', async () => {
  let runtime
  jest.isolateModules(() => { runtime = require('../../features/coach/runtime/llamaRuntime.native') })
  const { initLlama } = require('llama.rn')
  initLlama.mockReset()
  expect(await runtime.llamaCoachRuntime.load({ verified: false, path: '', sha256: '', byteSize: 0 }))
    .toMatchObject({ kind: 'failure', code: 'invalid_artifact' })
  expect(initLlama).not.toHaveBeenCalled()
  const release = runtime.tryClaimDiagnosticContext()
  expect(typeof release).toBe('function')
  release()
})

test('waits for release before starting another context', async () => {
  const { initLlama } = require('llama.rn')
  const { llamaCoachRuntime } = require('../../features/coach/runtime/llamaRuntime.native')
  let finishRelease
  const release = jest.fn(
    () =>
      new Promise((resolve) => {
        finishRelease = resolve
      })
  )
  initLlama
    .mockReset()
    .mockResolvedValueOnce(context({ release }))
    .mockResolvedValueOnce(context({ release: async () => {} }))
  const artifact = { verified: true, path: 'model', sha256: 'a'.repeat(64), byteSize: 1 }
  const first = await llamaCoachRuntime.load(artifact)
  const disposing = first.session.dispose()
  const second = llamaCoachRuntime.load(artifact)
  await Promise.resolve()
  expect(initLlama).toHaveBeenCalledTimes(1)
  finishRelease()
  await disposing
  const loaded = await second
  expect(initLlama).toHaveBeenCalledTimes(2)
  await loaded.session.dispose()
})

test('repeated production disposal releases only its own claim', async () => {
  const { initLlama } = require('llama.rn')
  const { llamaCoachRuntime, tryClaimDiagnosticContext } = require('../../features/coach/runtime/llamaRuntime.native')
  let finishRelease
  const releaseA = jest.fn(() => new Promise((resolve) => { finishRelease = resolve }))
  const releaseB = jest.fn().mockResolvedValue(undefined)
  initLlama.mockReset().mockResolvedValueOnce(context({ release: releaseA })).mockResolvedValueOnce(context({ release: releaseB }))
  const artifact = { verified: true, path: 'model', sha256: 'a'.repeat(64), byteSize: 1 }
  const a = await llamaCoachRuntime.load(artifact)
  const first = a.session.dispose()
  expect(a.session.dispose()).toBe(first)
  expect(tryClaimDiagnosticContext()).toBeUndefined()
  finishRelease()
  await first
  expect(a.session.dispose()).toBe(first)
  await a.session.dispose()
  const b = await llamaCoachRuntime.load(artifact)
  expect(tryClaimDiagnosticContext()).toBeUndefined()
  expect(releaseA).toHaveBeenCalledTimes(1)
  await b.session.dispose()
  const diagnostic = tryClaimDiagnosticContext()
  expect(typeof diagnostic).toBe('function')
  diagnostic()
  expect(releaseB).toHaveBeenCalledTimes(1)
})

test('repeated failed production disposal keeps its claim', async () => {
  let runtime
  jest.isolateModules(() => { runtime = require('../../features/coach/runtime/llamaRuntime.native') })
  const { initLlama } = require('llama.rn')
  const release = jest.fn().mockRejectedValue(new Error('release failed'))
  initLlama.mockReset().mockResolvedValue(context({ release }))
  const artifact = { verified: true, path: 'model', sha256: 'a'.repeat(64), byteSize: 1 }
  const loaded = await runtime.llamaCoachRuntime.load(artifact)
  const disposal = loaded.session.dispose()
  expect(loaded.session.dispose()).toBe(disposal)
  await expect(disposal).rejects.toThrow('release failed')
  await expect(loaded.session.dispose()).rejects.toThrow('release failed')
  expect(release).toHaveBeenCalledTimes(1)
  expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
})

test('production cancellation followed by ambiguous initialization failure retains the claim', async () => {
  const { initLlama } = require('llama.rn')
  let runtime
  jest.isolateModules(() => { runtime = require('../../features/coach/runtime/llamaRuntime.native') })
  const { llamaCoachRuntime, tryClaimDiagnosticContext } = runtime
  let finish, started
  const entered = new Promise((resolve) => { started = resolve })
  const release = jest.fn().mockResolvedValue(undefined)
  initLlama.mockReset()
    .mockResolvedValueOnce(context({
      completion: jest.fn(() => new Promise((resolve) => { finish = resolve; started() })),
      stopCompletion: jest.fn().mockResolvedValue(undefined), release,
    }))
    .mockRejectedValueOnce(new Error('load failed'))
    .mockResolvedValueOnce(context({ release: jest.fn().mockResolvedValue(undefined) }))
  const artifact = { verified: true, path: 'model', sha256: 'a'.repeat(64), byteSize: 1 }
  const a = await llamaCoachRuntime.load(artifact)
  const generation = a.session.generate(request())
  await entered
  const disposal = a.session.dispose()
  const queued = llamaCoachRuntime.load(artifact)
  expect(tryClaimDiagnosticContext()).toBeUndefined()
  finish(result({ content: '{}' }))
  expect((await generation).code).toBe('cancelled')
  await disposal
  expect(await queued).toMatchObject({ kind: 'failure', code: 'runtime_error' })
  let nextFinished = false
  void llamaCoachRuntime.load(artifact).then(() => { nextFinished = true })
  await Promise.resolve()
  await Promise.resolve()
  expect(tryClaimDiagnosticContext()).toBeUndefined()
  expect(nextFinished).toBe(false)
  expect(initLlama).toHaveBeenCalledTimes(2)
  expect(release).toHaveBeenCalledTimes(1)
})

test('passes the actual final response union to the native formatter', async () => {
  const schema = require('../../features/coach/contracts').coachResponseJsonSchema()
  const native = context({
    completion: jest.fn().mockResolvedValue(result({ content: '{"version":1,"kind":"cannot_fulfill","reason":"Unavailable"}' })),
    stopCompletion: jest.fn(),
    release: jest.fn(),
  })
  const session = createLlamaSession(native)
  await session.appendUserMessage('Help')
  await session.generate({ ...request(), finalResponseSchema: schema })
  expect(schema.oneOf.length).toBeGreaterThan(1)
  expect(native.getFormattedChat.mock.calls[0][2].response_format.json_schema.schema).toEqual(schema)
  expect(native.completion.mock.calls[0][0].response_format.json_schema.schema).toEqual(schema)
})
