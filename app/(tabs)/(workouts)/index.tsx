import { WorkoutLibraryView } from '../../../features/workouts/components/WorkoutLibraryView'
import { useWorkoutLibrary } from '../../../features/workouts/hooks/useWorkoutLibrary'

export default function WorkoutsInnerTab() {
  return <WorkoutLibraryView {...useWorkoutLibrary()} />
}
