import { Platform } from 'react-native'
import { selectSelfHostedProfile, useAuthStore } from '../../stores/authStore'
import {
  cancelAccountOperation,
  connectAccount,
  deleteRemoteAccount,
  disconnectAccount,
} from './account'
import {
  clearConnection,
  loadConnection,
  saveConnection,
  type Connection,
  type ConnectionScope,
} from './storage'
import { LOCAL_PROFILE_OWNER, profileOwnerForConnection } from '../../lib/profileScope'
import { waitForProfileDatabase } from '../../lib/db/profileDatabaseTransition'
import { getDatabase } from '../../lib/db/connection'
import { prepareFirstWorkout, seedAttachedProfile, type SourceSnapshot } from './firstWorkout'
import * as SQLite from 'expo-sqlite'
import { databaseNameForProfile } from '../../lib/profileScope'
import * as Crypto from 'expo-crypto'

import { publishConnection, useConnectionLifecycle } from './connectionState'
export { useConnectionLifecycle } from './connectionState'

let transitions: Promise<unknown> = Promise.resolve()
let generation = 0
let readinessAbort = new AbortController()
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = transitions.then(action, action)
  transitions = next.catch(() => {})
  return next
}
async function select(connection: ConnectionScope | null, signal?: AbortSignal) {
  if (Platform.OS === 'web') return
  const owner = connection ? profileOwnerForConnection(connection) : LOCAL_PROFILE_OWNER
  if (useAuthStore.getState().profileOwnerId === owner) return
  const transition = waitForProfileDatabase(owner)
  let timeout: ReturnType<typeof setTimeout> | undefined
  let cancel: (() => void) | undefined
  try {
    await selectSelfHostedProfile(connection)
    const interrupted = new Promise<Error>((resolve) => {
      cancel = () => resolve(new Error('Connection canceled'))
      if (signal?.aborted) cancel()
      else signal?.addEventListener('abort', cancel)
      timeout = setTimeout(
        () => resolve(new Error('Timed out opening the selected profile database')),
        15000
      )
    })
    const error = await Promise.race([transition.ready, interrupted])
    if (error) throw error
  } finally {
    clearTimeout(timeout)
    if (cancel) signal?.removeEventListener('abort', cancel)
    transition.cancel()
  }
}
async function restore(connection: Connection | null, scope: ConnectionScope | null = connection) {
  if (connection) await saveConnection(connection)
  else await clearConnection()
  await select(scope)
  publishConnection(
    connection &&
      scope &&
      profileOwnerForConnection(connection) === profileOwnerForConnection(scope)
      ? connection
      : null,
    !!scope
  )
}
function selectedScope(connection: Connection | null): ConnectionScope | null {
  const owner = useAuthStore.getState().profileOwnerId
  if (connection && profileOwnerForConnection(connection) === owner) return connection
  const parts = owner.split(':')
  return parts.length === 3 && parts[0] === 'selfhosted'
    ? { instanceId: decodeURIComponent(parts[1]), accountId: decodeURIComponent(parts[2]) }
    : null
}
export async function restoreConnectionLifecycle() {
  return serialize(async () => {
    const owner = useAuthStore.getState().profileOwnerId
    const connection = await loadConnection()
    publishConnection(
      connection && (connection.kind === 'web' || profileOwnerForConnection(connection) === owner)
        ? connection
        : null,
      owner.startsWith('selfhosted:')
    )
  })
}
export function cancelConnection() {
  generation += 1
  readinessAbort.abort()
  readinessAbort = new AbortController()
  cancelAccountOperation()
}
export function signInToServer(url: string, snapshot?: SourceSnapshot) {
  const attempt = generation
  const signal = readinessAbort.signal
  return serialize(async () => {
    const previous = await loadConnection()
    const owner = useAuthStore.getState().profileOwnerId
    const previousScope = selectedScope(previous)
    if (attempt !== generation) return null
    useConnectionLifecycle.setState({ status: 'connecting' })
    try {
      const connection = await connectAccount(url, async (next) => {
        try {
          if (attempt !== generation) throw new Error('Connection canceled')
          if (snapshot) {
            if (useAuthStore.getState().profileOwnerId !== LOCAL_PROFILE_OWNER)
              throw new Error('Return to your device profile before attaching a workout')
            const savedSnapshot = await prepareFirstWorkout(
              await getDatabase(),
              next,
              snapshot,
              Crypto.randomUUID(),
              Crypto.randomUUID()
            )
            const owner = profileOwnerForConnection(next)
            const target = await SQLite.openDatabaseAsync(databaseNameForProfile(owner), {
              useNewConnection: true,
            })
            try {
              await seedAttachedProfile(target, owner, savedSnapshot)
            } finally {
              await target.closeAsync()
            }
          }
          if (attempt !== generation) throw new Error('Connection canceled')
          await select(next, signal)
          if (attempt !== generation) throw new Error('Connection canceled')
          publishConnection(next)
        } catch (error) {
          await restore(previous, previousScope)
          throw error
        }
      })
      return connection
    } finally {
      if (useConnectionLifecycle.getState().status === 'connecting')
        publishConnection(
          previous && previousScope && profileOwnerForConnection(previous) === owner
            ? previous
            : null,
          !!previousScope
        )
    }
  })
}
export function disconnectServer() {
  cancelConnection()
  return serialize(async () => {
    const previous = await loadConnection()
    const previousScope = selectedScope(previous)
    let switched = false
    await disconnectAccount(
      async () => {
        try {
          await select(null)
          switched = true
        } catch (error) {
          await restore(previous, previousScope)
          throw error
        }
      },
      async () => {
        if (switched) await restore(previous, previousScope)
      }
    )
    publishConnection(null)
  })
}

export function deleteServerAccount() {
  return serialize(async () => {
    const previous = await loadConnection()
    const previousScope = selectedScope(previous)
    let switched = false
    try {
      await deleteRemoteAccount(async () => {
        try {
          await select(null)
          switched = true
        } catch (error) {
          await restore(previous, previousScope)
          throw error
        }
      })
      publishConnection(null)
    } catch (error) {
      if (switched) await restore(previous, previousScope)
      throw error
    }
  })
}
