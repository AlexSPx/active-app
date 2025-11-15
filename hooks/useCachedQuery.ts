import { useEffect, useMemo, useState } from 'react'
import { cachedFetch } from '../utils/cache/cachedFetch'
import { buildCacheKey } from '../utils/cache/buildKey'
import { useCacheStore, classifyEntry } from '../stores/cacheStore'
import { cacheLog } from '../utils/cache/log'
import type { CacheEntry } from '../utils/cache/types'

interface UseCachedQueryOptions<T> {
  keyParts: any[]
  tags: string[]
  fetcher: () => Promise<T>
  ttlMs: number
  staleAfterMs: number
  enabled?: boolean
}

export function useCachedQuery<T>(opts: UseCachedQueryOptions<T>) {
  const { keyParts, tags, fetcher, ttlMs, staleAfterMs, enabled = true } = opts
  const key = useMemo(() => buildCacheKey(keyParts), [JSON.stringify(keyParts)])
  const entry = useCacheStore((s) => s.getEntry<T>(key))
  const [loading, setLoading] = useState(!entry && enabled)
  const [error, setError] = useState<Error | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!enabled) {
        cacheLog('query:skip-disabled', { key })
        return
      }
      const current = useCacheStore.getState().getEntry<T>(key)
      if (current) {
        const status = classifyEntry(current)
        if (!status.isExpired && !status.isStale) {
          // Fresh entry: skip network and loading state churn
          cacheLog('query:skip-fresh', { key })
          return
        }
      }
      cacheLog('query:run', { key })
      if (!cancelled) setLoading(true)
      if (!cancelled) setError(undefined)
      try {
        await cachedFetch<T>({ keyParts, tags, fetcher, ttlMs, staleAfterMs })
      } catch (err: any) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Fetch error'))
      } finally {
        if (!cancelled) setLoading(false)
        cacheLog('query:end', { key })
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [key, enabled, entry])

  // Treat missing entry as both stale & expired so screens relying on these flags will refetch after invalidation.
  const classification = entry ? classifyEntry(entry) : { isExpired: true, isStale: true }

  // Force network refresh: invalidate the existing entry then fetch anew.
  const refresh = async () => {
    cacheLog('refresh:start', { key })
    // Remove the cached entry so cachedFetch performs a network request regardless of freshness.
    useCacheStore.getState().invalidateKeys([key])
    setLoading(true)
    try {
      await cachedFetch<T>({ keyParts, tags, fetcher, ttlMs, staleAfterMs })
    } finally {
      setLoading(false)
      cacheLog('refresh:done', { key })
    }
  }

  return {
    data: entry?.data as T | undefined,
    isLoading: loading,
    isStale: classification.isStale,
    isExpired: classification.isExpired,
    error,
    refresh,
  }
}
