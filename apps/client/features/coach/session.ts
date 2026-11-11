import { coachInstructions } from './prompts'
import type { CoachRuntimeSession } from './runtime/types'

// A byte ceiling bounds transcript growth; exact tokenizer and template accounting requires native support.
export function boundedCoachSession(session: CoachRuntimeSession, maxBytes = 12000) {
  let bytes = 0
  const size = (value: unknown) => unescape(encodeURIComponent(JSON.stringify(value))).length + 32
  const add = (value: unknown) => {
    bytes += size(value)
  }
  const wrapped: CoachRuntimeSession = {
    async appendSystemMessage(message) {
      await session.appendSystemMessage(message)
    },
    async appendUserMessage(message) {
      if (message === coachInstructions) {
        await session.appendSystemMessage(message)
        return
      }
      add(message)
      await session.appendUserMessage(message)
    },
    async appendToolResult(result) {
      add(result)
      await session.appendToolResult(result)
    },
    async generate(request) {
      if (bytes > maxBytes)
        return {
          kind: 'failure',
          code: 'truncated',
          message: 'Conversation is full. Start a new conversation.',
        }
      const result = await session.generate(request)
      add(result)
      return result
    },
    cancel: () => session.cancel(),
    dispose: () => session.dispose(),
  }
  return { session: wrapped, isFull: () => bytes > maxBytes }
}
