import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

const STORAGE_KEY = 'manual-offline-v1'

export type NetworkPolicyErrorCode =
  | 'MANUAL_OFFLINE'
  | 'NETWORK_POLICY_CHANGED'
  | 'NETWORK_PREFERENCE_ERROR'

export class NetworkPolicyError extends Error {
  readonly code: NetworkPolicyErrorCode

  constructor(code: NetworkPolicyErrorCode, message: string) {
    super(message)
    this.name = 'NetworkPolicyError'
    this.code = code
  }
}

interface NetworkState {
  manualOffline: boolean
  isReady: boolean
  restoreError: string | null
  setManualOffline: (offline: boolean) => Promise<void>
  retryRestore: () => Promise<void>
}

let generation = 0
let restoreAttempt = 0
let readyPromise: Promise<void>
let resolveReady!: () => void
let preferenceWrites: Promise<void> = Promise.resolve()
const listeners = new Set<() => void>()

function resetReadyPromise() {
  readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
}

resetReadyPromise()

function updatePolicy(
  state: Pick<NetworkState, 'manualOffline' | 'isReady' | 'restoreError'>
): void {
  generation += 1
  useNetworkStore.setState(state)
  listeners.forEach((listener) => listener())
  if (state.isReady) resolveReady()
}

async function restorePreference(): Promise<void> {
  const attempt = ++restoreAttempt
  try {
    await preferenceWrites
    const stored = await AsyncStorage.getItem(STORAGE_KEY)
    if (attempt !== restoreAttempt) return
    if (stored !== null && stored !== 'true' && stored !== 'false') {
      throw new Error('Invalid offline preference')
    }
    updatePolicy({ manualOffline: stored === 'true', isReady: true, restoreError: null })
  } catch (error) {
    if (attempt !== restoreAttempt) return
    updatePolicy({
      manualOffline: true,
      isReady: true,
      restoreError: 'Could not restore offline preference',
    })
  }
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  // Fail closed until the device-global preference has been restored.
  manualOffline: true,
  isReady: false,
  restoreError: null,
  setManualOffline: async (offline) => {
    const attempt = ++restoreAttempt
    if (offline) updatePolicy({ manualOffline: true, isReady: true, restoreError: null })
    try {
      const write = preferenceWrites.then(() => AsyncStorage.setItem(STORAGE_KEY, String(offline)))
      preferenceWrites = write.catch(() => {})
      await write
      if (attempt !== restoreAttempt) return
      updatePolicy({ manualOffline: offline, isReady: true, restoreError: null })
    } catch (error) {
      if (attempt !== restoreAttempt) return
      updatePolicy({
        manualOffline: true,
        isReady: true,
        restoreError: 'Could not save offline preference',
      })
      throw error
    }
  },
  retryRestore: async () => {
    if (!get().restoreError) return
    resetReadyPromise()
    set({ manualOffline: true, isReady: false, restoreError: null })
    await restorePreference()
  },
}))

export const networkPolicy = {
  ready: () => readyPromise,
  get generation() {
    return generation
  },
  get isOffline() {
    return useNetworkStore.getState().manualOffline
  },
  assertOnline(expectedGeneration?: number): number {
    const state = useNetworkStore.getState()
    if (expectedGeneration !== undefined && expectedGeneration !== generation) {
      throw new NetworkPolicyError(
        'NETWORK_POLICY_CHANGED',
        'Network policy changed during the request'
      )
    }
    if (state.restoreError) {
      throw new NetworkPolicyError(
        'NETWORK_PREFERENCE_ERROR',
        'Offline preference could not be restored'
      )
    }
    if (!state.isReady || state.manualOffline) {
      throw new NetworkPolicyError('MANUAL_OFFLINE', 'Manual offline mode is enabled')
    }
    return generation
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

void restorePreference()
