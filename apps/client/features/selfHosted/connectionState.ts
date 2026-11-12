import { create } from 'zustand'
import type { Connection } from './storage'

type Status = 'local-only' | 'connecting' | 'connected' | 'auth-paused'
export const useConnectionLifecycle = create<{ connection: Connection | null; status: Status }>(
  () => ({
    connection: null,
    status: 'local-only',
  })
)
export function publishConnection(connection: Connection | null, hasSelection = false) {
  const status: Status = !connection
    ? hasSelection
      ? 'auth-paused'
      : 'local-only'
    : connection.kind === 'native' && connection.expiresAt <= Date.now()
      ? 'auth-paused'
      : 'connected'
  useConnectionLifecycle.setState({ connection, status })
}
