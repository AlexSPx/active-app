// Lightweight logging utility for cache operations.
// Enable by setting EXPO_PUBLIC_CACHE_LOGS=true or relying on __DEV__.

// Attempt to read env flag; fallback to __DEV__ if available.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isDev =
  typeof (globalThis as any).__DEV__ !== 'undefined' ? (globalThis as any).__DEV__ : false
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const envFlag =
  typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_CACHE_LOGS === 'true' : false

export const CACHE_LOG_ENABLED = envFlag || isDev

export function cacheLog(event: string, details?: any) {
  if (!CACHE_LOG_ENABLED) return
  if (details === undefined) {
    // eslint-disable-next-line no-console
    console.log(`[cache] ${event}`)
  } else {
    // eslint-disable-next-line no-console
    console.log(`[cache] ${event}`, details)
  }
}
