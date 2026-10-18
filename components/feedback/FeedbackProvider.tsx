import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type FeedbackOptions = {
  message?: string
  duration?: number
}
type Feedback = FeedbackOptions & { title: string }
type FeedbackController = {
  show: (title: string, options?: FeedbackOptions) => void
  hide: () => void
}

const FeedbackContext = createContext<FeedbackController | null>(null)

export function useFeedback() {
  const controller = useContext(FeedbackContext)
  if (!controller) throw new Error('useFeedback requires FeedbackProvider')
  return controller
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const insets = useSafeAreaInsets()
  const hide = useCallback(() => setFeedback(null), [])
  const show = useCallback((title: string, options?: FeedbackOptions) => {
    setFeedback({ ...options, title })
  }, [])
  const controller = useMemo(() => ({ show, hide }), [show, hide])

  useEffect(() => {
    if (!feedback) return
    AccessibilityInfo.announceForAccessibility(
      [feedback.title, feedback.message].filter(Boolean).join('. ')
    )
    const timeout = setTimeout(hide, feedback.duration ?? 6000)
    return () => clearTimeout(timeout)
  }, [feedback, hide])

  return (
    <FeedbackContext.Provider value={controller}>
      {children}
      {feedback && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[feedback.title, feedback.message, 'Dismiss notification']
              .filter(Boolean)
              .join('. ')}
            onPress={hide}
            className="rounded-card border border-divider bg-surface px-4 py-3"
          >
            <Text className="font-dm-semibold text-foreground">{feedback.title}</Text>
            {!!feedback.message && (
              <Text className="mt-1 font-dm-regular text-muted">{feedback.message}</Text>
            )}
          </Pressable>
        </View>
      )}
    </FeedbackContext.Provider>
  )
}
