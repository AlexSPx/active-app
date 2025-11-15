export type CacheKey = string

export interface CacheMeta {
  source: 'network' | 'rehydrated' | 'optimistic'
  error?: string
  lastRefreshAttemptAt?: number
  lastSuccessfulRefreshAt?: number
  revalidateInFlight?: boolean
  hitCount?: number
  missCount?: number
}

export interface CacheEntry<T = unknown> {
  key: CacheKey
  data: T
  tags: string[]
  fetchedAt: number
  ttlMs: number
  staleAfterMs: number
  meta: CacheMeta
}

export interface InFlightFetch<T = unknown> {
  promise: Promise<CacheEntry<T>>
  startedAt: number
  abortController: AbortController
}

export interface CachedResult<T> {
  data: T | undefined
  isLoading: boolean
  isStale: boolean
  isExpired: boolean
  error?: Error
  refresh: (opts?: { force?: boolean }) => Promise<void>
}

export interface CacheConfig {
  maxEntries: number
  flushDebounceMs: number
}

export const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours
export const DEFAULT_STALE_MS = 3 * 60 * 60 * 1000 // 3 hours
