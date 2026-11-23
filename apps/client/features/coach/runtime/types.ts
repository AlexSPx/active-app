// Adapters must discard pending work after cancel/dispose; disposed sessions cannot be reused.
export interface CoachRuntimeSession {
  appendSystemMessage(message: string): Promise<void>
  appendUserMessage(message: string): Promise<void>
  generate(request: CoachGenerationRequest): Promise<CoachGenerationResult>
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

export interface CoachGenerationRequest {
  finalResponseSchema: object
  maxOutputTokens: number
  signal: AbortSignal
}

export type CoachGenerationResult =
  | { kind: 'final'; content: unknown }
  | { kind: 'invalid_final' }
  | {
      kind: 'failure'
      code: 'unavailable' | 'cancelled' | 'truncated' | 'runtime_error'
      message: string
    }
