import { Platform } from 'react-native'
import { publishConnection, useConnectionLifecycle } from './connectionState'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import { fetch as nativeFetch } from 'expo/fetch'
import { z } from 'zod'
import { ApiError, createClient, type Operations } from '../../../../packages/api-client/src'
import {
  prepareAccountProfileInitialization,
  executeAccountProfileInitialization,
  prepareAccountProfileDeletion,
  executeAccountProfileDeletion,
} from '../../lib/repositories/accountProfileV1'
import {
  loadConnection,
  saveConnection,
  clearConnection,
  loadPlan,
  savePlan,
  clearPlan,
  type Connection,
} from './storage'

const text = z.string().min(1)
const metadataSchema = z.object({
  issuer: text,
  clientId: text,
  resource: text,
  authorizationEndpoint: text,
  tokenEndpoint: text,
  endSessionEndpoint: text,
  redirectUri: text,
})
const sessionSchema = z.object({ csrfToken: text, accountId: text })
const identitySchema = z.object({ subject: text })
const tokensSchema = z.object({
  access_token: text,
  refresh_token: text.optional(),
  id_token: text.optional(),
  expires_in: z.number().nonnegative().optional(),
})
const transport: typeof fetch = async (input, init) => {
  const abort = new AbortController()
  const operationSignal = currentOperationSignal ?? operationAbort.signal
  const cancel = () => {
    abort.abort()
    operationSignal.removeEventListener('abort', cancel)
    init?.signal?.removeEventListener('abort', cancel)
  }
  operationSignal.addEventListener('abort', cancel)
  init?.signal?.addEventListener('abort', cancel)
  if (operationSignal.aborted || init?.signal?.aborted) cancel()
  try {
    return await (Platform.OS === 'web' ? fetch : nativeFetch)(input, {
      ...init,
      signal: abort.signal,
    })
  } catch (error) {
    cancel()
    throw error
  }
}

async function tokenRequest(endpoint: string, body: Record<string, string>) {
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 15000)
  try {
    const response = await transport(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      credentials: 'omit',
      redirect: 'error',
      signal: abort.signal,
    })
    if (!response.ok) throw new Error('Sign-in could not be completed. Please try again.')
    const tokens = tokensSchema.parse(await response.json())
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 0) * 1000,
    }
  } finally {
    clearTimeout(timeout)
  }
}
export type RemoteProfile = Operations['profile.get']['response']
export type DeviceProfile = Pick<
  RemoteProfile,
  'firstName' | 'lastName' | 'timezone' | 'measurements' | 'registrationCompleted'
>
export type DevicePreferences = Omit<Operations['preferences.put']['body'], 'baseVersion'>

// Serialize refresh, mutations and server/account transitions across screen remounts.
let operations: Promise<unknown> = Promise.resolve()
let operationGeneration = 0
let operationAbort = new AbortController()
let currentOperationSignal: AbortSignal | null = null
let authPromptOpen = false
function assertNotCanceled(): void {
  if (currentOperationSignal?.aborted) throw new Error('Connection canceled')
}
export function cancelAccountOperation(): void {
  operationGeneration += 1
  operationAbort.abort()
  operationAbort = new AbortController()
  if (authPromptOpen) {
    try {
      WebBrowser.dismissAuthSession()
    } catch {
      /* The callback may have closed it already. */
    }
  }
}
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const signal = operationAbort.signal
  const run = async () => {
    if (signal.aborted) throw new Error('Connection canceled')
    const controller = new AbortController()
    const cancel = () => controller.abort()
    signal.addEventListener('abort', cancel)
    currentOperationSignal = controller.signal
    try {
      return await action()
    } catch (error) {
      const state = useConnectionLifecycle.getState()
      if (
        state.status !== 'connecting' &&
        state.connection &&
        ((error instanceof AccountServiceError && error.status === 401) ||
          (error instanceof ApiError && error.status === 401) ||
          (state.connection.kind === 'native' && state.connection.expiresAt <= Date.now()))
      ) {
        useConnectionLifecycle.setState({ status: 'auth-paused' })
      }
      throw error
    } finally {
      controller.abort()
      signal.removeEventListener('abort', cancel)
      currentOperationSignal = null
    }
  }
  const next = operations.then(run, run)
  operations = next.catch(() => {})
  return next
}

export function serverUrl(value: string): string {
  const url = new URL(value.trim())
  if (
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    ) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Use an HTTPS server origin, such as https://active.example.com')
  }
  if (Platform.OS === 'web' && url.origin !== location.origin)
    throw new Error('Open Active on the same origin as your server to use a browser session')
  return url.origin
}

async function requestJson(baseUrl: string, path: string, init?: RequestInit): Promise<unknown> {
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 15000)
  try {
    const response = await transport(`${baseUrl}${path}`, {
      ...init,
      signal: abort.signal,
      redirect: 'error',
      credentials: Platform.OS === 'web' ? 'same-origin' : 'omit',
    })
    if (!response.ok)
      throw new AccountServiceError(
        response.status,
        response.status === 401
          ? 'Sign in again to continue. Your device data is safe.'
          : 'The account service is unavailable. You can retry without changing device data.'
      )
    return response.status === 204 ? null : await response.json()
  } finally {
    clearTimeout(timeout)
  }
}
class AccountServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

async function discovery(baseUrl: string) {
  return createClient(
    baseUrl,
    { kind: 'none' },
    transport
  )('discovery', { path: {}, query: {}, body: null })
}
async function assertInstance(connection: Connection) {
  const current = await discovery(connection.baseUrl)
  if (current.instanceId !== connection.instanceId)
    throw new Error(
      'This address now belongs to a different server. Pending changes were not sent.'
    )
}

function client(connection: Connection) {
  return createClient(
    connection.baseUrl,
    connection.kind === 'native'
      ? { kind: 'bearer', token: connection.accessToken }
      : { kind: 'session', csrfToken: connection.csrfToken },
    transport
  )
}

async function active(): Promise<Connection> {
  let connection = await loadConnection()
  if (!connection) throw new Error('Connect a server first')
  await assertInstance(connection)
  if (connection.kind === 'native' && connection.expiresAt <= Date.now() + 30000) {
    if (!connection.refreshToken) throw new Error('Sign in again to continue. Device data is safe.')
    const tokens = await tokenRequest(connection.tokenEndpoint, {
      grant_type: 'refresh_token',
      client_id: connection.clientId,
      refresh_token: connection.refreshToken,
      resource: connection.resource,
    })
    const identity = identitySchema.parse(
      await requestJson(connection.baseUrl, '/auth/native/identity', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
    )
    if (identity.subject !== connection.subject) throw new Error('The refreshed account changed')
    assertNotCanceled()
    connection = {
      ...connection,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? connection.refreshToken,
      expiresAt: tokens.expiresAt,
    }
    await saveConnection(connection)
    if (useConnectionLifecycle.getState().status !== 'connecting') publishConnection(connection)
  }
  return connection
}

export function connectAccount(
  value: string,
  onConnection?: (connection: Connection) => Promise<void>
): Promise<Connection | null> {
  const generation = operationGeneration
  return serialize(async () => {
    const checkCanceled = () => {
      if (generation !== operationGeneration) throw new Error('Connection canceled')
    }
    checkCanceled()
    const previous = await loadConnection()
    const baseUrl = serverUrl(value)
    const instance = await discovery(baseUrl)
    const metadata = metadataSchema.parse(await requestJson(baseUrl, '/auth/config'))
    checkCanceled()
    if (
      metadata.issuer !== instance.issuer ||
      metadata.authorizationEndpoint !== instance.authorizationEndpoint ||
      metadata.tokenEndpoint !== instance.tokenEndpoint ||
      metadata.endSessionEndpoint !== instance.endSessionEndpoint
    )
      throw new Error('Server identity metadata changed')
    for (const endpoint of [
      metadata.issuer,
      metadata.authorizationEndpoint,
      metadata.tokenEndpoint,
      metadata.endSessionEndpoint,
    ]) {
      const url = new URL(endpoint)
      if (
        !(
          url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        ) ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error('The server provided an unsafe authentication endpoint')
    }
    if (Platform.OS === 'web') {
      let session
      try {
        session = sessionSchema.parse(await requestJson(baseUrl, '/auth/session'))
      } catch (error) {
        if (!(error instanceof AccountServiceError) || error.status !== 401) throw error
        location.assign(`${baseUrl}/auth/login`)
        return null
      }
      const connection: Connection = {
        kind: 'web',
        ...metadata,
        baseUrl,
        instanceId: instance.instanceId,
        accountId: session.accountId,
        csrfToken: session.csrfToken,
      }
      checkCanceled()
      await saveConnection(connection)
      await onConnection?.(connection)
      return connection
    }
    if (metadata.redirectUri !== 'activenext://auth/callback')
      throw new Error('The server must register the Active native callback')
    const nonce = Crypto.randomUUID()
    const auth = new AuthSession.AuthRequest({
      clientId: metadata.clientId,
      redirectUri: metadata.redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      usePKCE: true,
      extraParams: { nonce, resource: metadata.resource },
    })
    const provider = {
      authorizationEndpoint: metadata.authorizationEndpoint,
      tokenEndpoint: metadata.tokenEndpoint,
    }
    authPromptOpen = true
    let result: Awaited<ReturnType<typeof auth.promptAsync>>
    try {
      result = await auth.promptAsync(provider)
    } finally {
      authPromptOpen = false
    }
    checkCanceled()
    if (result.type === 'cancel' || result.type === 'dismiss') return null
    if (
      result.type !== 'success' ||
      result.params.state !== auth.state ||
      result.params.iss !== metadata.issuer ||
      !result.params.code ||
      !auth.codeVerifier
    )
      throw new Error('Sign-in could not be verified')
    const tokens = await tokenRequest(metadata.tokenEndpoint, {
      grant_type: 'authorization_code',
      client_id: metadata.clientId,
      code: result.params.code,
      redirect_uri: metadata.redirectUri,
      code_verifier: auth.codeVerifier,
      resource: metadata.resource,
    })
    checkCanceled()
    if (!tokens.idToken) throw new Error('The identity provider did not supply an ID token')
    const identity = identitySchema.parse(
      await requestJson(baseUrl, '/auth/native/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: tokens.idToken, accessToken: tokens.accessToken, nonce }),
      })
    )
    // A pending DELETE must go straight to receipt replay, even after reauthentication.
    const sameIdentity =
      previous?.kind === 'native' &&
      previous.instanceId === instance.instanceId &&
      previous.subject === identity.subject
    const pendingDelete = sameIdentity && (await loadPlan(previous, 'delete'))
    const accountId = pendingDelete
      ? previous.accountId
      : (
          await createClient(
            baseUrl,
            { kind: 'bearer', token: tokens.accessToken },
            transport
          )('profile.get', { path: {}, query: {}, body: null })
        ).id
    if (sameIdentity && previous.accountId !== accountId)
      throw new Error('The connected account changed')
    const connection: Connection = {
      kind: 'native',
      ...metadata,
      baseUrl,
      instanceId: instance.instanceId,
      accountId,
      subject: identity.subject,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      idToken: tokens.idToken,
      expiresAt: tokens.expiresAt,
    }
    await assertInstance(connection)
    checkCanceled()
    await saveConnection(connection)
    await onConnection?.(connection)
    return connection
  })
}

export function readAccount(): Promise<RemoteProfile> {
  return serialize(async () => {
    const connection = await active()
    const profile = await client(connection)('profile.get', { path: {}, query: {}, body: null })
    assertNotCanceled()
    if (profile.id !== connection.accountId) throw new Error('The connected account changed')
    return profile
  })
}

export function initializeFromDevice(device: DeviceProfile, preferences: DevicePreferences) {
  return serialize(async () => {
    const connection = await active()
    const call = client(connection)
    if (await loadPlan(connection, 'delete')) throw new Error('Resolve the pending deletion first')
    let saved = await loadPlan(connection, 'initialize')
    if (!saved) {
      const profile = await call('profile.get', { path: {}, query: {}, body: null })
      let absent = false
      try {
        await call('preferences.get', { path: {}, query: {}, body: null })
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) absent = true
        else throw error
      }
      saved = {
        kind: 'initialize',
        plan: prepareAccountProfileInitialization({
          accountId: connection.accountId,
          profile,
          device,
          profileKey: Crypto.randomUUID(),
          preferences: absent
            ? { kind: 'absent', device: preferences, key: Crypto.randomUUID() }
            : { kind: 'present' },
        }),
      }
      await savePlan(connection, saved)
    }
    if (saved.kind !== 'initialize') throw new Error('Invalid initialization plan')
    while (saved.plan.stage !== 'complete') {
      saved = {
        kind: 'initialize',
        plan: await executeAccountProfileInitialization({
          call,
          accountId: connection.accountId,
          plan: saved.plan,
        }),
      }
      await savePlan(connection, saved)
    }
    await clearPlan(connection, 'initialize')
  })
}

export function deleteRemoteAccount(beforeClear?: () => Promise<void>) {
  return serialize(async () => {
    const connection = await active()
    const call = client(connection)
    let saved = await loadPlan(connection, 'delete')
    if (!saved) {
      const profile = await call('profile.get', { path: {}, query: {}, body: null })
      saved = {
        kind: 'delete',
        plan: prepareAccountProfileDeletion({
          accountId: connection.accountId,
          profile,
          profileVersion: profile.profileVersion,
          key: Crypto.randomUUID(),
        }),
      }
      await savePlan(connection, saved)
    }
    if (saved.kind !== 'delete') throw new Error('Invalid deletion plan')
    await executeAccountProfileDeletion({ call, accountId: connection.accountId, plan: saved.plan })
    assertNotCanceled()
    await beforeClear?.()
    await clearConnection()
    await clearPlan(connection, 'initialize')
    await clearPlan(connection, 'delete')
  })
}

export function disconnectAccount(
  beforeClear?: () => Promise<void>,
  onFailure?: () => Promise<void>
) {
  cancelAccountOperation()
  return serialize(async () => {
    try {
      const connection = await loadConnection()
      if (connection && (await loadPlan(connection, 'delete')))
        throw new Error(
          'Retry the pending deletion before disconnecting so its acknowledgement can be recovered'
        )
      await beforeClear?.()
      if (connection?.kind === 'web') {
        await assertInstance(connection)
        await requestJson(connection.baseUrl, '/auth/logout', {
          method: 'POST',
          headers: { 'X-CSRF-Token': connection.csrfToken },
        })
      }
      await clearConnection()
      if (connection?.kind === 'native' && connection.idToken && connection.endSessionEndpoint) {
        // Request provider logout without deleting the upstream identity.
        // Local disconnect still succeeds during an outage.
        const abort = new AbortController()
        const timeout = setTimeout(() => abort.abort(), 10000)
        try {
          await transport(connection.endSessionEndpoint, {
            method: 'POST',
            credentials: 'omit',
            redirect: 'error',
            signal: abort.signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              id_token_hint: connection.idToken,
              client_id: connection.clientId,
            }).toString(),
          })
        } catch {
          /* Explicit local disconnect must work offline. */
        } finally {
          clearTimeout(timeout)
        }
      }
    } catch (error) {
      await onFailure?.()
      throw error
    }
  })
}

WebBrowser.maybeCompleteAuthSession()
