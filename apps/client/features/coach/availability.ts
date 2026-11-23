import Constants from 'expo-constants'

export function isCoachAvailable(): boolean {
  const availability = Constants.expoConfig?.extra?.coachAvailability
  return availability === 'promoted' || (availability === 'development' && __DEV__)
}
