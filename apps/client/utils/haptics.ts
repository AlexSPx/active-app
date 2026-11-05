import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

const isWeb = Platform.OS === 'web'

export const haptics = {
  light: () => {
    if (isWeb) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  },
  medium: () => {
    if (isWeb) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
  },
  heavy: () => {
    if (isWeb) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
  },
  success: () => {
    if (isWeb) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  },
  error: () => {
    if (isWeb) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
  },
  warning: () => {
    if (isWeb) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  },
  selection: () => {
    if (isWeb) return
    Haptics.selectionAsync().catch(() => {})
  },
}
