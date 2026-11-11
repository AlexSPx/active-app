import type { CoachToolCall, CoachToolName, CoachToolResults } from '../tools/contracts'

// The native adapter owns this transcript so tool messages retain the runtime's format.
// Adapters must discard pending work after cancel/dispose; disposed sessions cannot be reused.
export interface CoachRuntimeSession {
  appendSystemMessage(message: string): Promise<void>
  appendUserMessage(message: string): Promise<void>
  generate(request: CoachGenerationRequest): Promise<CoachGenerationResult>
  appendToolResult<K extends CoachToolName>(result: {
    callId: string
    name: K
    result: CoachToolResults[K]
  }): Promise<void>
  cancel(): Promise<void>
  dispose(): Promise<void>
}

export interface CoachRuntime {
  load(artifact: VerifiedCoachArtifact): Promise<CoachRuntimeLoadResult>
}

// Only the artifact-verification layer should construct this value.
export interface VerifiedCoachArtifact {
  readonly path: string
  readonly sha256: string
  readonly byteSize: number
  readonly verified: true
}

export type CoachRuntimeLoadResult =
  | { kind: 'ready'; session: CoachRuntimeSession }
  | { kind: 'failure'; code: 'unavailable' | 'invalid_artifact' | 'runtime_error'; message: string }

export interface CoachToolDeclaration {
  name: CoachToolName
  description: string
  inputSchema: object
}

export interface CoachGenerationRequest {
  tools: CoachToolDeclaration[]
  finalResponseSchema: object
  maxOutputTokens: number
  signal: AbortSignal
  onVisibleText?: (text: string) => void
  onMeasurement?: (measurement: CoachGenerationMeasurement) => void
}

export type CoachGenerationMeasurement = {
  provider: 'llama.rn'
  modelSha256: string | null
  requestSha256: null
  toolsSha256: null
  schemaSha256: null
  renderedPromptTokens: number | null
  providerInputTokens: number | null
  providerOutputTokens: number | null
  outputReserve: number
  effectiveInputLimit: null
  effectiveOutputLimit: null
  contextFit: 'unknown'
  truncation: 'reported' | 'not_reported' | 'unknown'
} | {
  provider: 'desktop-transport-unspecified'
  requestSha256: string
  toolsSha256: string | null
  schemaSha256: string | null
  inputTokens: number | null
  outputTokens: number | null
  outputReserve: number
  truncation: 'reported' | 'not_reported' | 'unknown'
}

export type CoachGenerationResult =
  | { kind: 'tool_calls'; calls: CoachToolCall[] }
  | { kind: 'continue' }
  | { kind: 'final'; content: unknown }
  | { kind: 'invalid_final'; content: string }
  | {
      kind: 'failure'
      code: 'unavailable' | 'cancelled' | 'invalid_output' | 'truncated' | 'runtime_error'
      message: string
    }
