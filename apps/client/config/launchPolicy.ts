import { Platform } from 'react-native'

export const nativeLaunchPolicy = {
  accountsEnabled: false,
  backendEnabled: false,
  syncEnabled: false,
  otaUpdatesEnabled: true,
} as const

export function isNativeOfflineLaunch(): boolean {
  return Platform.OS !== 'web'
}

export function isBackendEnabledForLaunch(): boolean {
  return !isNativeOfflineLaunch() || nativeLaunchPolicy.backendEnabled
}

export function isSyncEnabledForLaunch(): boolean {
  return (
    !isNativeOfflineLaunch() ||
    (nativeLaunchPolicy.backendEnabled && nativeLaunchPolicy.syncEnabled)
  )
}
