export const LOCAL_PROFILE_OWNER = 'local:device'

export interface ProfileScope {
  ownerId: string
  generation: number
}

let activeOwnerId = LOCAL_PROFILE_OWNER
let generation = 0

export function profileOwnerForUser(userId?: string | null): string {
  return userId ? `account:${userId}` : LOCAL_PROFILE_OWNER
}

export function databaseNameForProfile(ownerId: string): string {
  return `profile-${encodeURIComponent(ownerId)}.db`
}

export function getProfileScope(): ProfileScope {
  return { ownerId: activeOwnerId, generation }
}

export function setActiveProfileOwner(ownerId: string): ProfileScope {
  if (ownerId !== activeOwnerId) {
    activeOwnerId = ownerId
    generation += 1
  }
  return getProfileScope()
}

export function isCurrentProfile(scope: ProfileScope): boolean {
  return scope.ownerId === activeOwnerId && scope.generation === generation
}
