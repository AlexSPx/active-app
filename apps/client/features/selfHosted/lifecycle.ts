import { Platform } from 'react-native'
import { selectSelfHostedProfile, useAuthStore } from '../../stores/authStore'
import {
  cancelAccountOperation,
  connectAccount,
  deleteRemoteAccount,
  disconnectAccount,
} from './account'
import { clearConnection, loadConnection, saveConnection, type Connection } from './storage'
import { LOCAL_PROFILE_OWNER, profileOwnerForConnection } from '../../lib/profileScope'
import { waitForProfileDatabase } from '../../lib/db/profileDatabaseTransition'

import { publishConnection, useConnectionLifecycle } from './connectionState'
export { useConnectionLifecycle } from './connectionState'

let transitions: Promise<unknown> = Promise.resolve()
let generation = 0
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = transitions.then(action, action)
  transitions = next.catch(() => {})
  return next
}
async function select(connection: Connection | null) {
  if (Platform.OS === 'web') return
  const owner = connection ? profileOwnerForConnection(connection) : LOCAL_PROFILE_OWNER
  if (useAuthStore.getState().profileOwnerId === owner) return
  const transition = waitForProfileDatabase(owner)
  try {
    await selectSelfHostedProfile(connection)
    const error = await transition.ready
    if (error) throw error
  } finally {
    transition.cancel()
  }
}
async function restore(connection: Connection | null) {
  if (connection) await saveConnection(connection)
  else await clearConnection()
  await select(connection)
  publishConnection(connection)
}
export async function restoreConnectionLifecycle() {
  return serialize(async () =>
    publishConnection(
      await loadConnection(),
      useAuthStore.getState().profileOwnerId.startsWith('selfhosted:')
    )
  )
}
export function cancelConnection() {
  generation += 1
  cancelAccountOperation()
}
export function signInToServer(url: string) {
  const attempt = generation
  return serialize(async () => {
    const previous = await loadConnection()
    if (attempt !== generation) return null
    useConnectionLifecycle.setState({ status: 'connecting' })
    try {
      const connection = await connectAccount(url, async (next) => {
        try {
          if (attempt !== generation) throw new Error('Connection canceled')
          await select(next)
          if (attempt !== generation) throw new Error('Connection canceled')
          publishConnection(next)
        } catch (error) {
          await restore(previous)
          throw error
        }
      })
      return connection
    } finally {
      if (useConnectionLifecycle.getState().status === 'connecting') publishConnection(previous)
    }
  })
}
export function disconnectServer() {
  cancelConnection()
  return serialize(async () => {
    const previous = await loadConnection()
    let switched = false
    await disconnectAccount(
      async () => {
        try {
          await select(null)
          switched = true
        } catch (error) {
          await restore(previous)
          throw error
        }
      },
      async () => {
        if (switched) await restore(previous)
      }
    )
    publishConnection(null)
  })
}

export function deleteServerAccount() {
  return serialize(async () => {
    const previous = await loadConnection()
    let switched = false
    try {
      await deleteRemoteAccount(async () => {
        try {
          await select(null)
          switched = true
        } catch (error) {
          await restore(previous)
          throw error
        }
      })
      publishConnection(null)
    } catch (error) {
      if (switched) await restore(previous)
      throw error
    }
  })
}
