import { useCacheStore } from '../../stores/cacheStore'
import { cacheLog } from './log'

export function invalidateTags(tags: string[]) {
  useCacheStore.getState().invalidateTags(tags)
  cacheLog('api:invalidateTags', { tags })
}

export function invalidateKeys(keys: string[]) {
  useCacheStore.getState().invalidateKeys(keys)
  cacheLog('api:invalidateKeys', { keys })
}

export function clearCache() {
  useCacheStore.getState().clearAll()
  cacheLog('api:clearCache')
}
