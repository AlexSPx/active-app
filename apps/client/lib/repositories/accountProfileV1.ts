import type { createClient, Operations } from '../../../../packages/api-client/src'
import { requests } from '../../../../packages/api-client/src/request-contract.cjs'

type Client = ReturnType<typeof createClient>
type Profile = Operations['profile.get']['response']
type Preferences = Operations['preferences.put']['body']
type Mutation<K extends 'profile.update' | 'preferences.put' | 'profile.delete'> = {
  path: Operations[K]['path']
  query: Operations[K]['query']
  body: Operations[K]['body']
  idempotencyKey: string
}
type Initialization = {
  accountId: string
  profile: Mutation<'profile.update'>
  preferences: Mutation<'preferences.put'> | null
}
export type ProfileInitializationPlan = Initialization &
  ({ stage: 'profile' } | { stage: 'preferences' } | { stage: 'complete' })
export type ProfileDeletionPlan = { accountId: string; request: Mutation<'profile.delete'> }

function requireKey(key: string): string {
  if (!key) throw new Error('Idempotency-Key is required for mutations')
  return key
}

/** Prepare and persist this plan before executing any stage. Requests and keys must remain unchanged. */
export function prepareAccountProfileInitialization(input: {
  accountId: string
  profile: Profile
  device: Pick<
    Profile,
    'firstName' | 'lastName' | 'timezone' | 'measurements' | 'registrationCompleted'
  >
  preferences:
    | { kind: 'absent'; device: Omit<Preferences, 'baseVersion'>; key: string }
    | { kind: 'present' }
  profileKey: string
}): ProfileInitializationPlan {
  const { profile, device } = input
  if (
    !input.accountId ||
    profile.id !== input.accountId ||
    profile.profileVersion !== 1 ||
    profile.registrationCompleted ||
    profile.firstName !== 'User' ||
    profile.lastName !== 'User' ||
    profile.timezone !== null ||
    profile.measurements !== null
  ) {
    throw new Error('Account profile is not a newly provisioned profile')
  }
  const profileBody: Operations['profile.update']['body'] = {
    baseVersion: profile.profileVersion,
    firstName: device.firstName,
    lastName: device.lastName,
    timezone: device.timezone,
    measurements: device.measurements,
    registrationCompleted: device.registrationCompleted,
  }
  const profileRequest: Mutation<'profile.update'> = {
    path: {},
    query: {},
    idempotencyKey: requireKey(input.profileKey),
    body: requests['profile.update'].body.parse(profileBody) as typeof profileBody,
  }
  let preferences: Mutation<'preferences.put'> | null = null
  if (input.preferences.kind === 'absent') {
    const body: Preferences = { baseVersion: 0, ...input.preferences.device }
    preferences = {
      path: {},
      query: {},
      idempotencyKey: requireKey(input.preferences.key),
      body: requests['preferences.put'].body.parse(body) as Preferences,
    }
  }
  return { stage: 'profile', accountId: input.accountId, profile: profileRequest, preferences }
}

/** Execute one stage for the authenticated account. Persist the returned plan before the next stage.
 * On failure or response loss, replay the last persisted plan with the same account and server.
 */
export async function executeAccountProfileInitialization(input: {
  call: Client
  accountId: string
  plan: ProfileInitializationPlan
}): Promise<ProfileInitializationPlan> {
  const { plan } = input
  if (!input.accountId || plan.accountId !== input.accountId)
    throw new Error('Account changed during initialization')
  if (plan.stage === 'profile') {
    const updated = await input.call('profile.update', plan.profile)
    if (updated.id !== plan.accountId) throw new Error('Account changed during initialization')
    return { ...plan, stage: plan.preferences ? 'preferences' : 'complete' }
  }
  if (plan.stage === 'preferences') {
    if (!plan.preferences) throw new Error('Missing preferences request')
    await input.call('preferences.put', plan.preferences)
    return { ...plan, stage: 'complete' }
  }
  return plan
}

/** Validate the current profile once and persist the returned plan before deletion. */
export function prepareAccountProfileDeletion(input: {
  accountId: string
  profile: Profile
  profileVersion: number
  key: string
}): ProfileDeletionPlan {
  if (
    !input.accountId ||
    input.profile.id !== input.accountId ||
    input.profile.profileVersion !== input.profileVersion
  ) {
    throw new Error('Account or profile version changed before deletion')
  }
  const query = { baseVersion: input.profileVersion }
  requests['profile.delete'].query.parse(query)
  return {
    accountId: input.accountId,
    request: { path: {}, query, body: null, idempotencyKey: requireKey(input.key) },
  }
}

/** Replay the persisted deletion plan directly after response loss, using the same account and server.
 * Session cleanup is the caller's responsibility.
 */
export async function executeAccountProfileDeletion(input: {
  call: Client
  accountId: string
  plan: ProfileDeletionPlan
}): Promise<void> {
  if (!input.accountId || input.plan.accountId !== input.accountId)
    throw new Error('Account changed before deletion')
  const result = await input.call('profile.delete', input.plan.request)
  if (result.deletedUserId !== input.plan.accountId)
    throw new Error('Deleted account did not match')
}
