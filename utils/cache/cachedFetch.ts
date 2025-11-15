import { buildCacheKey } from './buildKey'
import { useCacheStore, classifyEntry } from '../../stores/cacheStore'
import type { CacheEntry } from './types'
import { cacheLog } from './log'

type Fetcher<T> = () => Promise<T>

interface CachedFetchOptions<T> {
  keyParts: any[]
  tags: string[]
  fetcher: Fetcher<T>
  ttlMs: number
  staleAfterMs: number
}

export async function cachedFetch<T>(opts: CachedFetchOptions<T>): Promise<CacheEntry<T>> {
  const { keyParts, tags, fetcher, ttlMs, staleAfterMs } = opts
  const key = buildCacheKey(keyParts)
  const store = useCacheStore.getState()

  const existing = store.getEntry<T>(key)
  const inflight = store.inFlight[key]

  if (inflight) {
    return inflight.promise as Promise<CacheEntry<T>>
  }

  if (existing) {
    const status = classifyEntry(existing)
    if (!status.isExpired && !status.isStale) {
      existing.meta.hitCount = (existing.meta.hitCount || 0) + 1
      cacheLog('hit:fresh', { key })
      return existing
    }
    if (status.isStale && !status.isExpired) {
      // Return stale and refresh in background
      existing.meta.hitCount = (existing.meta.hitCount || 0) + 1
      cacheLog('hit:stale-return', { key })
      backgroundRefresh(key, tags, fetcher, ttlMs, staleAfterMs)
      return existing
    }
    // expired -> proceed to blocking fetch
    cacheLog('hit:expired', { key })
  }

  return await startNetworkFetch(key, tags, fetcher, ttlMs, staleAfterMs)
}

async function startNetworkFetch<T>(
  key: string,
  tags: string[],
  fetcher: Fetcher<T>,
  ttlMs: number,
  staleAfterMs: number
): Promise<CacheEntry<T>> {
  const abortController = new AbortController()
  const startedAt = Date.now()
  cacheLog('fetch:start', { key, tags })
  const promise = fetcher()
    .then((data) => {
      const entry: CacheEntry<T> = {
        key,
        data,
        tags,
        fetchedAt: Date.now(),
        ttlMs,
        staleAfterMs,
        meta: {
          source: 'network',
          hitCount: 0,
          missCount: 1,
          lastSuccessfulRefreshAt: Date.now(),
        },
      }
      useCacheStore.getState().setEntry(entry)
      cacheLog('fetch:success', { key })
      return entry
    })
    .catch((err) => {
      const existing = useCacheStore.getState().getEntry<T>(key)
      if (abortController.signal.aborted) throw err
      if (existing) {
        existing.meta.error = err?.message || 'Network error'
        existing.meta.missCount = (existing.meta.missCount || 0) + 1
        existing.meta.lastRefreshAttemptAt = Date.now()
        useCacheStore.getState().setEntry(existing)
        cacheLog('fetch:error-stale-served', { key, error: err?.message })
        return existing
      }
      cacheLog('fetch:error', { key, error: err?.message })
      throw err
    })
    .finally(() => {
      useCacheStore.getState().setInFlight(key, undefined)
      cacheLog('fetch:inflight-clear', { key })
    }) as Promise<CacheEntry<T>>

  useCacheStore.getState().setInFlight(key, { promise, startedAt, abortController })
  return promise
}

function backgroundRefresh<T>(
  key: string,
  tags: string[],
  fetcher: Fetcher<T>,
  ttlMs: number,
  staleAfterMs: number
) {
  // Do not refresh if already in-flight
  const inflight = useCacheStore.getState().inFlight[key]
  if (inflight) return
  // Start background fetch but ignore result for control flow; store updates will notify subscribers
  cacheLog('backgroundRefresh:start', { key })
  startNetworkFetch<T>(key, tags, fetcher, ttlMs, staleAfterMs).catch(() => {})
}
