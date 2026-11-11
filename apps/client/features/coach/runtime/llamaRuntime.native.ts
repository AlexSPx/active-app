import {
  initLlama,
  type LlamaContext,
  type RNLlamaOAICompatibleMessage,
  type ToolCall,
} from 'llama.rn'
import type { JinjaFormattedChatResult } from 'llama.rn/lib/typescript/types'
import { coachInstructions } from '../prompts'
import { coachToolCallSchema } from '../tools/contracts'
import type {
  CoachGenerationRequest,
  CoachGenerationMeasurement,
  CoachGenerationResult,
  CoachRuntime,
  CoachRuntimeSession,
} from './types'

type ChatMessage = RNLlamaOAICompatibleMessage & {
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export function createLlamaSession(
  context: Pick<
    LlamaContext,
    'completion' | 'stopCompletion' | 'release' | 'getFormattedChat' | 'tokenize'
  >,
  modelSha256: string | null = null
): CoachRuntimeSession {
  const messages: ChatMessage[] = [{ role: 'system', content: coachInstructions }]
  let pending: Promise<CoachGenerationResult> | undefined
  let disposed = false
  let disposal: Promise<void> | undefined
  let stopping = false
  let stopRequest: Promise<void> | undefined
  let pendingCalls = new Map<string, string>()
  const cancelled = (): CoachGenerationResult => ({
    kind: 'failure',
    code: 'cancelled',
    message: 'Generation cancelled.',
  })

  async function cancel() {
    if (!pending) return
    stopping = true
    stopRequest ??= context.stopCompletion()
    await stopRequest
  }

  return {
    async appendSystemMessage(message) {
      if (disposed || pending || messages.length !== 1)
        throw new Error('System message must precede conversation.')
      messages[0] = { role: 'system', content: message }
    },
    async appendUserMessage(message) {
      if (disposed || pending || pendingCalls.size)
        throw new Error('Session is not ready for a user message.')
      messages.push({ role: 'user', content: message })
    },
    async appendToolResult({ callId, name, result }) {
      if (disposed || pending || pendingCalls.get(callId) !== name)
        throw new Error('Unexpected tool result.')
      messages.push({ role: 'tool', tool_call_id: callId, name, content: JSON.stringify(result) })
      pendingCalls.delete(callId)
    },
    async generate(request: CoachGenerationRequest) {
      if (disposed || pending || pendingCalls.size)
        return {
          kind: 'failure',
          code: 'runtime_error',
          message: 'Session is not ready for generation.',
        }
      if (request.signal.aborted) return cancelled()
      stopping = false
      stopRequest = undefined
      const onAbort = () => {
        void cancel().catch(() => {})
      }
      request.signal.addEventListener('abort', onAbort, { once: true })
      const run = async (): Promise<CoachGenerationResult> => {
        let stage = 'format_chat'
        const measurement: CoachGenerationMeasurement = {
          provider: 'llama.rn', modelSha256, requestSha256: null, toolsSha256: null, schemaSha256: null, renderedPromptTokens: null,
          providerInputTokens: null, providerOutputTokens: null, outputReserve: request.maxOutputTokens,
          effectiveInputLimit: null, effectiveOutputLimit: null, contextFit: 'unknown', truncation: 'unknown',
        }
        try {
          const tools = request.tools.map((tool) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          }))
          const response_format = {
            type: 'json_schema' as const,
            json_schema: { schema: request.finalResponseSchema },
          }
          const now = Date.now()
          const formatted = await context.getFormattedChat([...messages], null, {
            jinja: true,
            ...(tools.length ? { tool_choice: 'auto' as const, tools } : {}),
            response_format,
            enable_thinking: false,
            // Schema-only turns need JSON content, without tool/reasoning parser routing.
            force_pure_content: tools.length === 0,
            now,
          })
          if (formatted.type !== 'jinja' || formatted.has_media || !formatted.prompt)
            return {
              kind: 'failure',
              code: 'unavailable',
              message: 'Prompt token accounting is unavailable.',
            }
          if (stopping || request.signal.aborted) return cancelled()
          stage = 'tokenize_prompt'
          const counted = await context.tokenize(formatted.prompt)
          if (!counted.has_media) measurement.renderedPromptTokens = counted.tokens.length
          // Allow space for binding-added special tokens; device behavior still needs verification.
          if (counted.has_media || counted.tokens.length + 8 + request.maxOutputTokens > 4096)
            return {
              kind: 'failure',
              code: 'truncated',
              message: 'Prompt and output exceed the context budget.',
            }
          if (stopping || request.signal.aborted) return cancelled()
          // The binding returns this shape for Jinja, but its base type has a non-discriminating type field.
          const chat = formatted as JinjaFormattedChatResult
          stage = 'completion'
          const result = await context.completion({
            prompt: formatted.prompt,
            chat_format: chat.chat_format,
            grammar: chat.grammar,
            grammar_lazy: chat.grammar_lazy,
            grammar_triggers: chat.grammar_triggers,
            preserved_tokens: chat.preserved_tokens,
            stop: chat.additional_stops,
            generation_prompt: chat.generation_prompt,
            thinking_forced_open: chat.thinking_forced_open,
            chat_parser: chat.chat_parser,
            ...{
              thinking_start_tag: chat.thinking_start_tag,
              thinking_end_tag: chat.thinking_end_tag,
            },
            response_format,
            n_predict: request.maxOutputTokens,
            temperature: 0.2,
            enable_thinking: false,
          })
          stage = 'decode_completion'
          if (Number.isSafeInteger(result.tokens_evaluated) && result.tokens_evaluated >= 0)
            measurement.providerInputTokens = result.tokens_evaluated
          if (Number.isSafeInteger(result.tokens_predicted) && result.tokens_predicted >= 0)
            measurement.providerOutputTokens = result.tokens_predicted
          if (typeof result.truncated === 'boolean' && typeof result.context_full === 'boolean' && typeof result.stopped_limit === 'number')
            measurement.truncation = result.truncated || result.stopped_limit || result.context_full ? 'reported' : 'not_reported'
          if (stopping || request.signal.aborted || result.interrupted) return cancelled()
          if (result.truncated || result.stopped_limit || result.context_full)
            return {
              kind: 'failure',
              code: 'truncated',
              message: 'Generation exceeded its context or output budget.',
            }
          if (result.tool_calls !== undefined && !Array.isArray(result.tool_calls))
            return { kind: 'failure', code: 'invalid_output', message: 'Invalid tool calls.' }
          if (result.tool_calls?.length) {
            const rawCalls = result.tool_calls.map((call, index) => ({
              ...call,
              id: call.id || `call_${index}`,
            }))
            const calls = rawCalls.map((call) => {
              let args: unknown
              try {
                args = JSON.parse(call.function.arguments)
              } catch {
                return null
              }
              const parsed = coachToolCallSchema.safeParse({
                id: call.id,
                name: call.function.name,
                arguments: args,
              })
              return parsed.success ? parsed.data : null
            })
            if (
              calls.some((call) => call === null || !request.tools.some((tool) => tool.name === call.name)) ||
              new Set(rawCalls.map((call) => call.id)).size !== rawCalls.length
            )
              return { kind: 'failure', code: 'invalid_output', message: 'Invalid tool calls.' }
            const validCalls = calls.filter((call) => call !== null)
            messages.push({
              role: 'assistant',
              content: result.content || '',
              tool_calls: rawCalls,
            })
            pendingCalls = new Map(validCalls.map((call) => [call.id, call.name]))
            return { kind: 'tool_calls', calls: validCalls }
          }
          const raw = result.content || result.text
          let content: unknown
          try {
            content = JSON.parse(raw)
          } catch {
            if (typeof __DEV__ !== 'undefined' && __DEV__)
              console.warn('Coach native final JSON failed', {
                contentLength: result.content?.length ?? 0,
                textLength: result.text?.length ?? 0,
                hasReasoning: Boolean(result.reasoning_content),
                startsWithJson: /^\s*[{[]/.test(raw),
                hasCodeFence: raw.includes('```'),
              })
            messages.push({ role: 'assistant', content: raw })
            return { kind: 'invalid_final', content: raw }
          }
          messages.push({ role: 'assistant', content: raw })
          return { kind: 'final', content }
        } catch (error) {
          if (!stopping && !request.signal.aborted && typeof __DEV__ !== 'undefined' && __DEV__)
            console.warn('Coach native generation failed', {
              stage,
              name: error instanceof Error ? error.name : 'NativeError',
              message: error instanceof Error ? error.message : String(error),
            })
          return stopping || request.signal.aborted
            ? cancelled()
            : { kind: 'failure', code: 'runtime_error', message: 'Local inference failed.' }
        } finally {
          request.signal.removeEventListener('abort', onAbort)
          try { request.onMeasurement?.(measurement) } catch {}
        }
      }
      pending = run()
      try {
        return await pending
      } finally {
        pending = undefined
      }
    },
    cancel,
    dispose() {
      if (disposal) return disposal
      disposed = true
      disposal = (async () => {
        if (pending) {
          try {
            await cancel()
          } catch {}
          await pending
        } else if (stopRequest) {
          try { await stopRequest } catch {}
        }
        await context.release()
        messages.length = 0
        pendingCalls.clear()
      })()
      return disposal
    },
  }
}

let contextAvailable: Promise<void> = Promise.resolve()
let contextClaims = 0

export function tryClaimDiagnosticContext(): (() => void) | undefined {
  if (contextClaims) return undefined
  contextClaims++
  let unlock = () => {}
  contextAvailable = new Promise<void>((resolve) => { unlock = resolve })
  return () => { contextClaims--; unlock() }
}

export const llamaCoachRuntime: CoachRuntime = {
  async load(artifact) {
    if (
      !artifact.verified ||
      !artifact.path ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      artifact.byteSize <= 0
    )
      return {
        kind: 'failure',
        code: 'invalid_artifact',
        message: 'Model artifact is not verified.',
      }
    contextClaims++
    const previous = contextAvailable
    let unlock = () => {}
    contextAvailable = new Promise<void>((resolve) => {
      unlock = () => { contextClaims--; resolve() }
    })
    await previous
    try {
      const context = await initLlama({ model: artifact.path, n_ctx: 4096, n_gpu_layers: 0 })
      const session = createLlamaSession(context, artifact.sha256)
      const dispose = session.dispose
      let disposal: Promise<void> | undefined
      session.dispose = () => {
        disposal ??= dispose().then(unlock)
        return disposal
      }
      return { kind: 'ready', session }
    } catch {
      return {
        kind: 'failure',
        code: 'runtime_error',
        message: 'Could not load the model on this device.',
      }
    }
  },
}
