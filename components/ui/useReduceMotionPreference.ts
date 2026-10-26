import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

export function useReduceMotionPreference(): boolean {
  const startupPreference = useReducedMotion()
  const [reduceMotion, setReduceMotion] = useState(startupPreference)

  useEffect(() => {
    let mounted = true
    let changedSinceRequest = false
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      changedSinceRequest = true
      setReduceMotion(enabled)
    })

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted && !changedSinceRequest) setReduceMotion(enabled)
      })
      .catch(() => {
        if (mounted && !changedSinceRequest) setReduceMotion(startupPreference)
      })

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [startupPreference])

  return reduceMotion
}
