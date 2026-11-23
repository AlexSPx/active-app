import type { CoachModelManifest } from './modelManifest'

const unavailable = {
  kind: 'failure',
  code: 'unavailable',
  message: 'Model files are unavailable on this platform.',
} as const
export async function getVerifiedModel(
  _model: CoachModelManifest,
  _signal?: AbortSignal,
  _onProgress?: (bytes: number, total: number) => void
) {
  return unavailable
}
export async function downloadCoachModel(
  _model: CoachModelManifest,
  _options?: {
    signal?: AbortSignal
    onProgress?: (phase: 'download' | 'verify', bytes: number, total: number) => void
  }
) {
  return unavailable
}
export function deleteCoachModel(_model: CoachModelManifest): void {}
