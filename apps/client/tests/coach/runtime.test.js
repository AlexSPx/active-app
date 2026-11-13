jest.mock('llama.rn', () => ({ initLlama: jest.fn(), releaseAllLlama: jest.fn().mockResolvedValue(undefined) }))
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
  expect(await runtime.llamaCoachRuntime.load(artifact)).toMatchObject({ kind: 'failure', code: 'runtime_error' })
  expect(initLlama).toHaveBeenCalledTimes(1)
})

test('queued loads fail after native release rejects without starting another context', async () => {
  let runtime
  jest.isolateModules(() => { runtime = require('../../features/coach/runtime/llamaRuntime.native') })
  const { initLlama } = require('llama.rn')
  let rejectRelease
  initLlama.mockReset().mockResolvedValue(context({ release: () => new Promise((_, reject) => { rejectRelease = reject }) }))
  const artifact = { verified: true, path: 'model', sha256: 'a'.repeat(64), byteSize: 1 }
  const first = await runtime.llamaCoachRuntime.load(artifact)
  const disposal = first.session.dispose()
  const queued = runtime.llamaCoachRuntime.load(artifact)
  rejectRelease(new Error('native release failed'))
  await expect(disposal).rejects.toThrow('native release failed')
  expect(await queued).toMatchObject({ kind: 'failure', code: 'runtime_error' })
  expect(initLlama).toHaveBeenCalledTimes(1)
  expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
})

test('diagnostic claim blocks loading and repeated release cannot free a later claim', async () => {
  let runtime
  jest.isolateModules(() => { runtime = require('../../features/coach/runtime/llamaRuntime.native') })
  const { initLlama } = require('llama.rn')
  initLlama.mockReset().mockResolvedValue(context({ release: jest.fn().mockResolvedValue(undefined) }))
  const artifact = { verified: true, path: 'model', sha256: 'a'.repeat(64), byteSize: 1 }
  const releaseDiagnostic = runtime.tryClaimDiagnosticContext()
  const pending = runtime.llamaCoachRuntime.load(artifact)
  await Promise.resolve()
  expect(initLlama).not.toHaveBeenCalled()
  releaseDiagnostic()
  const loaded = await pending
  releaseDiagnostic()
  expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
  await loaded.session.dispose()
  const next = runtime.tryClaimDiagnosticContext()
  expect(typeof next).toBe('function')
  next()
})

test('failed initialization cleanup blocks queued contexts and fails closed if cleanup rejects', async () => {
  let runtime
  jest.isolateModules(() => { runtime = require('../../features/coach/runtime/llamaRuntime.native') })
  const { initLlama, releaseAllLlama } = require('llama.rn')
  let rejectCleanup
  initLlama.mockReset().mockRejectedValue(new Error('load failed'))
  releaseAllLlama.mockReset().mockImplementationOnce(() => new Promise((_, reject) => { rejectCleanup = reject }))
  const artifact = { verified: true, path: 'model', sha256: 'a'.repeat(64), byteSize: 1 }
  const first = runtime.llamaCoachRuntime.load(artifact)
  await Promise.resolve()
  await Promise.resolve()
  const queued = runtime.llamaCoachRuntime.load(artifact)
  expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
  expect(initLlama).toHaveBeenCalledTimes(1)
  rejectCleanup(new Error('cleanup failed'))
  expect(await first).toMatchObject({ kind: 'failure', code: 'runtime_error' })
  expect(await queued).toMatchObject({ kind: 'failure', code: 'runtime_error' })
  expect(initLlama).toHaveBeenCalledTimes(1)
  expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
  releaseAllLlama.mockReset().mockResolvedValue(undefined)
})

test('production cancellation followed by initialization failure permits retry', async () => {
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
  const retry = await llamaCoachRuntime.load(artifact)
  expect(retry.kind).toBe('ready')
  expect(initLlama).toHaveBeenCalledTimes(3)
  await retry.session.dispose()
  const diagnostic = tryClaimDiagnosticContext()
  expect(typeof diagnostic).toBe('function')
  diagnostic()
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

describe('native operation deadlines', () => {
  const artifact = { verified: true, path: 'model', sha256: 'a'.repeat(64), byteSize: 1 }
  const deferred = () => {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
  }
  const fresh = () => {
    let runtime
    jest.isolateModules(() => { runtime = require('../../features/coach/runtime/llamaRuntime.native') })
    return runtime
  }
  const advance = async () => { await jest.advanceTimersByTimeAsync(120_000) }
  beforeEach(() => { jest.useFakeTimers(); require('llama.rn').releaseAllLlama.mockReset().mockResolvedValue(undefined) })
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers() })

  test.each(['resolve', 'reject'])('stalled initialization drains queued loads and handles late %s', async (settle) => {
    const runtime = fresh()
    const init = deferred()
    const release = jest.fn().mockResolvedValue(undefined)
    const { initLlama, releaseAllLlama } = require('llama.rn')
    initLlama.mockReset().mockReturnValue(init.promise)
    const first = runtime.llamaCoachRuntime.load(artifact)
    const queued = runtime.llamaCoachRuntime.load(artifact)
    await advance()
    expect(await first).toMatchObject({ kind: 'failure', code: 'runtime_error', message: expect.stringMatching(/Restart/) })
    expect(await queued).toMatchObject({ kind: 'failure', code: 'runtime_error' })
    expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
    expect(releaseAllLlama).not.toHaveBeenCalled()
    if (settle === 'resolve') init.resolve(context({ release }))
    else init.reject(new Error('late failure'))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(settle === 'resolve' ? release : releaseAllLlama).toHaveBeenCalledTimes(1)
    expect(await runtime.llamaCoachRuntime.load(artifact)).toMatchObject({ kind: 'failure', code: 'runtime_error' })
    expect(initLlama).toHaveBeenCalledTimes(1)
    expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
  })

  test('stalled failed-init cleanup and diagnostic contention settle without another init', async () => {
    const runtime = fresh()
    const { initLlama, releaseAllLlama } = require('llama.rn')
    const cleanup = deferred()
    initLlama.mockReset().mockRejectedValue(new Error('init'))
    releaseAllLlama.mockReturnValue(cleanup.promise)
    const first = runtime.llamaCoachRuntime.load(artifact)
    await Promise.resolve(); await Promise.resolve()
    const queued = runtime.llamaCoachRuntime.load(artifact)
    await advance()
    expect(await first).toMatchObject({ kind: 'failure', message: expect.stringMatching(/Restart/) })
    expect(await queued).toMatchObject({ kind: 'failure' })
    cleanup.reject(new Error('late cleanup failure'))
    await Promise.resolve(); await Promise.resolve()
    expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
    expect(initLlama).toHaveBeenCalledTimes(1)

    const other = fresh()
    const unlock = other.tryClaimDiagnosticContext()
    const waiting = other.llamaCoachRuntime.load(artifact)
    await advance()
    expect(await waiting).toMatchObject({ kind: 'failure', message: expect.stringMatching(/Restart/) })
    unlock()
    await Promise.resolve(); await Promise.resolve()
    expect(other.tryClaimDiagnosticContext()).toBeUndefined()
    expect(initLlama).toHaveBeenCalledTimes(1)
  })

  test.each(['getFormattedChat', 'tokenize', 'completion'])('stalled %s suppresses late output and prevents a new context', async stage => {
    const runtime = fresh()
    const stalled = deferred()
    const release = jest.fn().mockResolvedValue(undefined)
    const native = context({ completion: jest.fn().mockResolvedValue(result({ content: '{}' })), stopCompletion: jest.fn().mockResolvedValue(undefined), release, [stage]: jest.fn(() => stalled.promise) })
    const { initLlama } = require('llama.rn')
    initLlama.mockReset().mockResolvedValue(native)
    const loaded = await runtime.llamaCoachRuntime.load(artifact)
    const measurement = jest.fn()
    const generation = loaded.session.generate({ ...request(), onMeasurement: measurement })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    const queued = runtime.llamaCoachRuntime.load(artifact)
    await advance()
    expect(await generation).toMatchObject({ kind: 'failure', message: expect.stringMatching(/Restart/) })
    expect(await queued).toMatchObject({ kind: 'failure' })
    const disposal = loaded.session.dispose()
    expect(loaded.session.dispose()).toBe(disposal)
    const rejection = expect(disposal).rejects.toThrow(/Restart/)
    await advance()
    await rejection
    expect(release).not.toHaveBeenCalled()
    stalled.resolve(stage === 'getFormattedChat' ? { type: 'jinja', prompt: 'p', has_media: false } : stage === 'tokenize' ? { tokens: [1], has_media: false } : result({ content: '{"stale":true}' }))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(release).toHaveBeenCalledTimes(1)
    expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
    expect(initLlama).toHaveBeenCalledTimes(1)
    expect(measurement).not.toHaveBeenCalled()
  })

  test('explicit cancel times out while its native stop remains tracked', async () => {
    const runtime = fresh()
    const stop = deferred()
    const completion = deferred()
    const native = context({ completion: jest.fn(() => completion.promise), stopCompletion: jest.fn(() => stop.promise), release: jest.fn().mockResolvedValue(undefined) })
    const { initLlama } = require('llama.rn')
    initLlama.mockReset().mockResolvedValue(native)
    const loaded = await runtime.llamaCoachRuntime.load(artifact)
    const generation = loaded.session.generate(request())
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    const cancel = loaded.session.cancel()
    const rejection = expect(cancel).rejects.toThrow(/Restart/)
    await advance()
    await rejection
    expect(await generation).toMatchObject({ kind: 'failure' })
    const disposal = loaded.session.dispose()
    stop.resolve(); completion.resolve(result({ content: '{}' }))
    await disposal
    expect(native.release).toHaveBeenCalledTimes(1)
    expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
  })

  test.each(['stop', 'release'])('stalled %s bounds disposal without overlapping contexts', async stage => {
    const runtime = fresh()
    const stalled = deferred()
    const completion = deferred()
    const native = context({ completion: jest.fn(() => completion.promise), stopCompletion: jest.fn().mockImplementation(() => stage === 'stop' ? stalled.promise : Promise.resolve()), release: jest.fn().mockImplementation(() => stage === 'release' ? stalled.promise : Promise.resolve()) })
    const { initLlama } = require('llama.rn')
    initLlama.mockReset().mockResolvedValue(native)
    const loaded = await runtime.llamaCoachRuntime.load(artifact)
    let generation
    if (stage === 'stop') {
      generation = loaded.session.generate(request())
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    }
    const disposal = loaded.session.dispose()
    const rejection = expect(disposal).rejects.toThrow(/Restart/)
    const queued = runtime.llamaCoachRuntime.load(artifact)
    await advance()
    await rejection
    expect(await queued).toMatchObject({ kind: 'failure' })
    if (generation) expect(await generation).toMatchObject({ kind: 'failure' })
    expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
    if (stage === 'stop') { completion.resolve(result({ content: '{}' })); stalled.resolve() } else stalled.resolve()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(initLlama).toHaveBeenCalledTimes(1)
    expect(runtime.tryClaimDiagnosticContext()).toBeUndefined()
  })
})
