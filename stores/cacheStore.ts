import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CacheEntry, CacheKey, InFlightFetch } from '../utils/cache/types'
import { cacheLog } from '../utils/cache/log'

type EntryMap = Record<CacheKey, CacheEntry<any>>
type TagIndex = Record<string, Record<CacheKey, true>>

interface CacheStateInternal {
  entries: EntryMap
  tagIndex: TagIndex
  // inFlight map is not persisted
  inFlight: Record<CacheKey, InFlightFetch<any>>
  // actions
  getEntry: <T = unknown>(key: CacheKey) => CacheEntry<T> | undefined
  setEntry: <T = unknown>(entry: CacheEntry<T>) => void
  invalidateTags: (tags: string[]) => void
  invalidateKeys: (keys: CacheKey[]) => void
  clearAll: () => void
  setInFlight: (key: CacheKey, inflight: InFlightFetch<any> | undefined) => void
}

function addToTagIndex(tagIndex: TagIndex, entry: CacheEntry<any>) {
  for (const tag of entry.tags) {
    if (!tagIndex[tag]) tagIndex[tag] = {}
    tagIndex[tag][entry.key] = true
  }
}

function removeFromTagIndex(tagIndex: TagIndex, key: CacheKey) {
  for (const tag of Object.keys(tagIndex)) {
    if (tagIndex[tag][key]) {
      delete tagIndex[tag][key]
      if (Object.keys(tagIndex[tag]).length === 0) delete tagIndex[tag]
    }
  }
}

export const useCacheStore = create<CacheStateInternal>()(
  persist(
    (set, get) => ({
      entries: {},
      tagIndex: {},
      inFlight: {},

      getEntry: (key) => get().entries[key],

      setEntry: (entry) =>
        set((state) => {
          const prev = state.entries[entry.key]
          // update entries
          const entries = { ...state.entries, [entry.key]: entry }
          // update tag index: remove previous key from old tags
          const tagIndex = { ...state.tagIndex }
          if (prev) {
            // remove from tags no longer present
            for (const tag of Object.keys(tagIndex)) {
              if (tagIndex[tag][entry.key] && !entry.tags.includes(tag)) {
                delete tagIndex[tag][entry.key]
                if (Object.keys(tagIndex[tag]).length === 0) delete tagIndex[tag]
              }
            }
          }
          // add to current tags
          addToTagIndex(tagIndex, entry)
          cacheLog('setEntry', {
            key: entry.key,
            tags: entry.tags,
            ttlMs: entry.ttlMs,
            staleAfterMs: entry.staleAfterMs,
            fetchedAt: entry.fetchedAt,
          })
          return { entries, tagIndex }
        }),

      invalidateTags: (tags) =>
        set((state) => {
          if (!tags?.length) return {}
          const entries = { ...state.entries }
          const tagIndex = { ...state.tagIndex }
          const invalidatedKeys: CacheKey[] = []
          for (const tag of tags) {
            const keys = Object.keys(tagIndex[tag] || {})
            for (const key of keys) {
              // Remove entry; consumers will refetch on demand
              delete entries[key]
              removeFromTagIndex(tagIndex, key)
              invalidatedKeys.push(key)
            }
            delete tagIndex[tag]
          }
          if (invalidatedKeys.length) {
            cacheLog('invalidateTags', { tags, invalidatedKeys })
          }
          return { entries, tagIndex }
        }),

      invalidateKeys: (keys) =>
        set((state) => {
          if (!keys?.length) return {}
          const entries = { ...state.entries }
          const tagIndex = { ...state.tagIndex }
          const invalidatedKeys: CacheKey[] = []
          for (const key of keys) {
            if (entries[key]) {
              delete entries[key]
              removeFromTagIndex(tagIndex, key)
              invalidatedKeys.push(key)
            }
          }
          if (invalidatedKeys.length) {
            cacheLog('invalidateKeys', { keys: invalidatedKeys })
          }
          return { entries, tagIndex }
        }),

      clearAll: () => {
        const prevCount = Object.keys(get().entries).length
        cacheLog('clearAll', { entryCount: prevCount })
        set({ entries: {}, tagIndex: {} })
      },

      setInFlight: (key, inflight) =>
        set((state) => {
          const inFlight = { ...state.inFlight }
          if (!inflight) delete inFlight[key]
          else inFlight[key] = inflight
          return { inFlight }
        }),
    }),
    {
      name: 'cache-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only entries and tagIndex
      partialize: (s) => ({ entries: s.entries, tagIndex: s.tagIndex }),
    }
  )
)

export function classifyEntry(entry: CacheEntry<any>) {
  const age = Date.now() - entry.fetchedAt
  return {
    isExpired: age > entry.ttlMs,
    isStale: age > entry.staleAfterMs,
  }
}
