import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn'
import { coachInstructions } from '../prompts'
import type {
  CoachGenerationRequest,
  CoachGenerationResult,
  CoachRuntime,
  CoachRuntimeSession,
} from './types'

// Platform safety bounds, not measurements of device performance.
const NATIVE_DEADLINE_MS = 120_000
const STALL_MESSAGE = 'Local coach timed out. Restart the app before using it again.'
let contextReleaseFailed = false

function bounded<T>(operation: Promise<T>, onTimeout: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      contextReleaseFailed = true
      onTimeout()
      reject(new Error(STALL_MESSAGE))
    }, NATIVE_DEADLINE_MS)
    Promise.resolve(operation).then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) }
    )
  })
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function createLlamaSession(
  context: Pick<
    LlamaContext,
    'completion' | 'stopCompletion' | 'release' | 'getFormattedChat' | 'tokenize'
  >
): CoachRuntimeSession {
  const messages: ChatMessage[] = [{ role: 'system', content: coachInstructions }]
  let pending: Promise<CoachGenerationResult> | undefined
  let disposed = false
  let disposal: Promise<void> | undefined
  let stopping = false
  let stopRequest: Promise<void> | undefined
  const cancelled = (): CoachGenerationResult => ({
    kind: 'failure',
    code: 'cancelled',
    message: 'Generation cancelled.',
  })

  async function cancel() {
    if (!pending) return
    stopping = true
    stopRequest ??= context.stopCompletion()
    await bounded(stopRequest, () => { disposed = true })
  }

  return {
    async appendSystemMessage(message) {
      if (disposed || pending || messages.length !== 1)
        throw new Error('System message must precede conversation.')
      messages[0] = { role: 'system', content: message }
    },
    async appendUserMessage(message) {
      if (disposed || pending)
        throw new Error('Session is not ready for a user message.')
      messages.push({ role: 'user', content: message })
    },
    async generate(request: CoachGenerationRequest) {
      if (disposed || pending)
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
        try {
          const response_format = {
            type: 'json_schema' as const,
            json_schema: { schema: request.finalResponseSchema },
          }
          const now = Date.now()
          const formatted = await context.getFormattedChat([...messages], null, {
            jinja: true,
            response_format,
            enable_thinking: false,
            force_pure_content: true,
            now,
          })
          if (formatted.type !== 'jinja' || formatted.has_media || !formatted.prompt)
            return {
              kind: 'failure',
              code: 'unavailable',
              message: 'Prompt token accounting is unavailable.',
            }
          if (stopping || request.signal.aborted) return cancelled()
          const counted = await context.tokenize(formatted.prompt)
          // Allow space for binding-added special tokens; device behavior still needs verification.
          if (counted.has_media || counted.tokens.length + 8 + request.maxOutputTokens > 4096)
            return {
              kind: 'failure',
              code: 'truncated',
              message: 'Prompt and output exceed the context budget.',
            }
          if (stopping || request.signal.aborted) return cancelled()
          // The rendered prompt already contains the assistant prefix. Passing it separately would prefill the JSON grammar.
          const result = await context.completion({
            prompt: formatted.prompt,
            response_format,
            n_predict: request.maxOutputTokens,
            temperature: 0.2,
            enable_thinking: false,
          })
          if (stopping || request.signal.aborted || result.interrupted) return cancelled()
          if (result.truncated || result.stopped_limit || result.context_full)
            return {
              kind: 'failure',
              code: 'truncated',
              message: 'Generation exceeded its context or output budget.',
            }
          const raw = result.text || result.content
          let content: unknown
          try {
            content = JSON.parse(raw)
          } catch {
            messages.push({ role: 'assistant', content: raw })
            return { kind: 'invalid_final' }
          }
          messages.push({ role: 'assistant', content: raw })
          return { kind: 'final', content }
        } catch {
          return stopping || request.signal.aborted
            ? cancelled()
            : { kind: 'failure', code: 'runtime_error', message: 'Local inference failed.' }
        } finally {
          request.signal.removeEventListener('abort', onAbort)
        }
      }
      const running = run()
      pending = running
      void running.then(() => { if (pending === running) pending = undefined })
      try {
        return await bounded(running, () => { stopping = true; disposed = true })
      } catch {
        return { kind: 'failure', code: 'runtime_error', message: STALL_MESSAGE }
      }
    },
    cancel,
    dispose() {
      if (disposal) return disposal
      disposed = true
      const cleanup = (async () => {
        if (pending) {
          stopping = true
          stopRequest ??= context.stopCompletion()
          try { await stopRequest } catch {}
          await pending
        } else if (stopRequest) {
          try { await stopRequest } catch {}
        }
        await context.release()
        messages.length = 0
      })()
      disposal = bounded(cleanup, () => { stopping = true })
      return disposal
    },
  }
}

let contextAvailable: Promise<void> = Promise.resolve()
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
    const previous = contextAvailable
    let unlock = () => {}
    contextAvailable = new Promise<void>((resolve) => {
      unlock = resolve
    })
    let timedOut = false
    const operation = (async () => {
      await previous
      if (contextReleaseFailed || timedOut) {
        unlock()
        return { kind: 'failure' as const, code: 'runtime_error' as const, message: STALL_MESSAGE }
      }
      try {
        const context = await initLlama({ model: artifact.path, n_ctx: 4096, n_gpu_layers: 0 })
        if (timedOut) {
          try { await context.release() } catch { contextReleaseFailed = true }
          unlock()
          return { kind: 'failure' as const, code: 'runtime_error' as const, message: STALL_MESSAGE }
        }
        const session = createLlamaSession(context)
        const dispose = session.dispose
        let disposal: Promise<void> | undefined
        session.dispose = () => {
          disposal ??= dispose().catch((error) => {
            contextReleaseFailed = true
            throw error
          }).finally(unlock)
          return disposal
        }
        return { kind: 'ready' as const, session }
      } catch {
        try {
          // All llama contexts must use this shared claim before global cleanup is safe.
          await releaseAllLlama()
        } catch {
          contextReleaseFailed = true
        } finally {
          unlock()
        }
        return {
          kind: 'failure' as const,
          code: 'runtime_error' as const,
          message: contextReleaseFailed ? STALL_MESSAGE : 'Could not load the model on this device.',
        }
      }
    })()
    try {
      return await bounded(operation, () => { timedOut = true })
    } catch {
      return { kind: 'failure', code: 'runtime_error', message: STALL_MESSAGE }
    }
  },
}
