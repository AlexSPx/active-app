import { useCallback, useRef } from 'react'
import { useFeedback } from '../../../components/feedback/FeedbackProvider'
import { useAuthStore } from '../../../stores/authStore'
import { useUiStore } from '../../../stores/uiStore'
import { getProfileScope, isCurrentProfile } from '../../../lib/profileScope'
import { useRunningWorkoutStore } from '../stores/runningWorkoutStore'
import type { LocalWorkoutRecordingResult } from '../../../types/api'

type FinishWorkout = () => Promise<LocalWorkoutRecordingResult | void>

export function useWorkoutCompletion(finishWorkout: FinishWorkout) {
  const toast = useFeedback()
  const showFinishedCongrats = useUiStore((state) => state.showFinishedCongrats)
  const finishingRef = useRef(false)

  return useCallback(async () => {
    if (finishingRef.current) return false
    finishingRef.current = true

    const profileScope = getProfileScope()
    const startingAuthState = useAuthStore.getState()
    const startingWorkout = useRunningWorkoutStore.getState().runningWorkout

    const isCurrentFinishSession = (allowCompletedSessionClear = false) => {
      const authState = useAuthStore.getState()
      const currentWorkout = useRunningWorkoutStore.getState().runningWorkout
      const sameWorkoutSession = startingWorkout
        ? currentWorkout
          ? currentWorkout.id === startingWorkout.id &&
            currentWorkout.startTime === startingWorkout.startTime
          : allowCompletedSessionClear
        : !currentWorkout

      return (
        isCurrentProfile(profileScope) &&
        authState.user?.id === startingAuthState.user?.id &&
        authState.isAuthenticated === startingAuthState.isAuthenticated &&
        !authState.isProfileTransitioning &&
        sameWorkoutSession
      )
    }

    try {
      let result: Awaited<ReturnType<typeof finishWorkout>>
      try {
        result = await finishWorkout()
      } catch (error) {
        if (!isCurrentFinishSession()) return false
        throw error
      }

      if (!isCurrentFinishSession(!!result)) return false
      if (!result) {
        toast.show('Workout not saved', {
          message: 'Your session is still in progress. Tap Finish workout to retry.',
        })
        return false
      }

      showFinishedCongrats(result)
      return true
    } finally {
      finishingRef.current = false
    }
  }, [finishWorkout, showFinishedCongrats, toast.show])
}
