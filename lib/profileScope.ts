export const LOCAL_PROFILE_OWNER = 'local:device'

export interface ProfileScope {
  ownerId: string
  generation: number
}

let activeOwnerId = LOCAL_PROFILE_OWNER
let generation = 0
let profileVersion: number | null = null
const profileVersionListeners = new Set<(scope: ProfileScope, version: number) => void>()

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
    profileVersion = null
  }
  return getProfileScope()
}

export function getCurrentProfileVersion(): number | null {
  return profileVersion
}

export function setCurrentProfileVersion(scope: ProfileScope, version: number): boolean {
  if (!isCurrentProfile(scope)) return false
  profileVersion = version
  profileVersionListeners.forEach((listener) => listener(scope, version))
  return true
}

export function mergeCurrentProfileVersion(scope: ProfileScope, version: number): boolean {
  if (!isCurrentProfile(scope)) return false
  if (profileVersion === null || version > profileVersion) {
    profileVersion = version
    profileVersionListeners.forEach((listener) => listener(scope, version))
  }
  return true
}

export function onProfileVersion(listener: (scope: ProfileScope, version: number) => void) {
  profileVersionListeners.add(listener)
  return () => profileVersionListeners.delete(listener)
}

export function isCurrentProfile(scope: ProfileScope): boolean {
  return scope.ownerId === activeOwnerId && scope.generation === generation
}
