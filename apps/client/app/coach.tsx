import { CoachScreen } from '../features/coach/components/CoachScreen'
import { isCoachAvailable } from '../features/coach/availability'
import { Redirect } from 'expo-router'

export default function CoachRoute() {
  return isCoachAvailable() ? <CoachScreen /> : <Redirect href="/(tabs)" />
}
