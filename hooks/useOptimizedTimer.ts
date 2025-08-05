import { useState, useEffect, useRef, useCallback } from 'react'

interface UseOptimizedTimerOptions {
  interval?: number // milliseconds, default 1000
  enabled?: boolean
}

export function useOptimizedTimer(callback: () => void, options: UseOptimizedTimerOptions = {}) {
  const { interval = 1000, enabled = true } = options
  const callbackRef = useRef(callback)
  const requestRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  // Keep callback reference fresh
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const tick = useCallback(
    (timestamp: number) => {
      if (timestamp - lastTimeRef.current >= interval) {
        callbackRef.current()
        lastTimeRef.current = timestamp
      }

      if (enabled) {
        requestRef.current = requestAnimationFrame(tick)
      }
    },
    [interval, enabled]
  )

  useEffect(() => {
    if (enabled) {
      lastTimeRef.current = performance.now()
      requestRef.current = requestAnimationFrame(tick)
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current)
      }
    }
  }, [enabled, tick])

  const start = useCallback(() => {
    if (!requestRef.current) {
      lastTimeRef.current = performance.now()
      requestRef.current = requestAnimationFrame(tick)
    }
  }, [tick])

  const stop = useCallback(() => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current)
      requestRef.current = null
    }
  }, [])

  return { start, stop }
}

// Hook for elapsed time formatting
export function useElapsedTimeFormatter() {
  return useCallback((startTime: number): string => {
    const elapsed = Date.now() - startTime
    const minutes = Math.floor(elapsed / 60000)
    const seconds = Math.floor((elapsed % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [])
}
