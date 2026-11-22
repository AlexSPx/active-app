import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { z } from 'zod'
import { requests } from '../../../../packages/api-client/src/request-contract.cjs'
import type {
  ProfileDeletionPlan,
  ProfileInitializationPlan,
} from '../../lib/repositories/accountProfileV1'

const text = z.string().min(1)
const scopeSchema = z.object({ instanceId: text, accountId: text })
const metadata = {
  baseUrl: text,
  instanceId: text,
  accountId: text,
  issuer: text,
  clientId: text,
  resource: text,
  authorizationEndpoint: text,
  tokenEndpoint: text,
  endSessionEndpoint: text.nullable(),
  redirectUri: text,
}
const connectionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('native'),
      ...metadata,
      subject: text,
      accessToken: text,
      refreshToken: text.nullable(),
      idToken: text.nullable(),
      expiresAt: z.number().finite(),
    })
    .strict(),
  z.object({ kind: z.literal('web'), ...metadata, csrfToken: text }).strict(),
])
export type Connection = z.infer<typeof connectionSchema>
export type ConnectionScope = z.infer<typeof scopeSchema>
export type Plan =
  | { kind: 'initialize'; plan: ProfileInitializationPlan }
  | { kind: 'delete'; plan: ProfileDeletionPlan }

const empty = z.object({}).strict()
const mutation = (operation: 'profile.update' | 'preferences.put' | 'profile.delete') =>
  z
    .object({
      path: empty,
      query: z.unknown(),
      body: z.unknown(),
      idempotencyKey: text,
    })
    .strict()
    .refine(
      (value) =>
        requests[operation].path.safeParse(value.path).success &&
        requests[operation].query.safeParse(value.query).success &&
        requests[operation].body.safeParse(value.body).success
    )
const initialization = z
  .object({
    accountId: text,
    stage: z.enum(['profile', 'preferences', 'complete']),
    profile: mutation('profile.update'),
    preferences: mutation('preferences.put').nullable(),
  })
  .strict()
  .refine((value) => value.stage !== 'preferences' || value.preferences !== null)
const deletion = z.object({ accountId: text, request: mutation('profile.delete') }).strict()
const planSchema = z.custom<Plan>(
  (value) =>
    z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('initialize'), plan: initialization }).strict(),
        z.object({ kind: z.literal('delete'), plan: deletion }).strict(),
      ])
      .safeParse(value).success
)

// Encode every UTF-16 code unit to keep SecureStore keys valid and unambiguous.
const encode = (value: string) =>
  Array.from({ length: value.length }, (_, i) =>
    value.charCodeAt(i).toString(16).padStart(4, '0')
  ).join('')
const scopedKey = (scope: ConnectionScope, suffix: string) =>
  `selfHosted.${encode(scope.instanceId)}.${encode(scope.accountId)}.${suffix}`
const activeKey = 'selfHosted.active'
let webConnection: Connection | null = null
const webKey = 'selfHosted.web'

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export async function loadConnection(): Promise<Connection | null> {
  if (Platform.OS === 'web') {
    const parsed = connectionSchema.safeParse(parseJson(sessionStorage.getItem(webKey) ?? 'null'))
    webConnection = parsed.success && parsed.data.kind === 'web' ? parsed.data : null
    return webConnection
  }
  const rawScope = await SecureStore.getItemAsync(activeKey)
  const scope = scopeSchema.safeParse(rawScope && parseJson(rawScope))
  if (!scope.success) return null
  const raw = await SecureStore.getItemAsync(scopedKey(scope.data, 'connection'))
  const parsed = connectionSchema.safeParse(raw && parseJson(raw))
  if (
    !parsed.success ||
    parsed.data.kind !== 'native' ||
    parsed.data.instanceId !== scope.data.instanceId ||
    parsed.data.accountId !== scope.data.accountId
  )
    return null
  return parsed.data
}

export async function saveConnection(connection: Connection): Promise<void> {
  const valid = connectionSchema.parse(connection)
  if (Platform.OS === 'web') {
    if (valid.kind !== 'web') throw new Error('Tokens are native-only')
    webConnection = valid
    // CSRF is not an authentication credential; the actual session stays in an HttpOnly cookie.
    // Keeping it for this tab lets a prepared DELETE replay after a lost response and reload.
    sessionStorage.setItem(webKey, JSON.stringify(valid))
    return
  }
  if (valid.kind !== 'native') throw new Error('Web connection requires web platform')
  const scope = scopeSchema.parse(valid)
  const key = scopedKey(scope, 'connection')
  const previous = await SecureStore.getItemAsync(key)
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(valid))
    await SecureStore.setItemAsync(activeKey, JSON.stringify(scope))
  } catch (error) {
    if (previous === null) await SecureStore.deleteItemAsync(key)
    else await SecureStore.setItemAsync(key, previous)
    throw error
  }
}

export async function clearConnection(): Promise<void> {
  if (Platform.OS === 'web') {
    webConnection = null
    sessionStorage.removeItem(webKey)
    return
  }
  const raw = await SecureStore.getItemAsync(activeKey)
  const scope = scopeSchema.safeParse(raw && parseJson(raw))
  if (scope.success) await SecureStore.deleteItemAsync(scopedKey(scope.data, 'connection'))
  await SecureStore.deleteItemAsync(activeKey)
}

export async function loadPlan(scope: ConnectionScope, kind: Plan['kind']): Promise<Plan | null> {
  const validScope = scopeSchema.parse(scope)
  const key = scopedKey(validScope, kind)
  const raw =
    Platform.OS === 'web' ? sessionStorage.getItem(key) : await SecureStore.getItemAsync(key)
  const envelope = z
    .object({ scope: scopeSchema, plan: planSchema })
    .strict()
    .safeParse(raw && parseJson(raw))
  if (
    !envelope.success ||
    envelope.data.scope.instanceId !== validScope.instanceId ||
    envelope.data.scope.accountId !== validScope.accountId ||
    envelope.data.plan.kind !== kind ||
    envelope.data.plan.plan.accountId !== validScope.accountId
  )
    return null
  return envelope.data.plan
}

export async function savePlan(scope: ConnectionScope, plan: Plan): Promise<void> {
  const validScope = scopeSchema.parse(scope)
  const valid = planSchema.parse(plan)
  if (valid.plan.accountId !== validScope.accountId)
    throw new Error('Plan account does not match scope')
  const key = scopedKey(validScope, valid.kind)
  if (Platform.OS === 'web')
    sessionStorage.setItem(key, JSON.stringify({ scope: validScope, plan: valid }))
  else await SecureStore.setItemAsync(key, JSON.stringify({ scope: validScope, plan: valid }))
}

export async function clearPlan(scope: ConnectionScope, kind: Plan['kind']): Promise<void> {
  const key = scopedKey(scopeSchema.parse(scope), kind)
  if (Platform.OS === 'web') sessionStorage.removeItem(key)
  else await SecureStore.deleteItemAsync(key)
}
