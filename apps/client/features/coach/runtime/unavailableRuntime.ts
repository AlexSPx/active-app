import type { CoachRuntime } from './types'

export const unavailableCoachRuntime: CoachRuntime = {
  async load() {
    return {
      kind: 'failure',
      code: 'unavailable',
      message: 'Local coach inference is not available on this platform.',
    }
  },
}
