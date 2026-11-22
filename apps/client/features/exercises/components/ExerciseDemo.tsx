import { Asset } from 'expo-asset'
import { exerciseDemoAsset } from '../../../assets/exercise-animations'
import type { ApiExercise } from '../../../types/api'

export function ExerciseDemo({ exercise }: { exercise: ApiExercise }) {
  const { uri } = Asset.fromModule(exerciseDemoAsset)
  return (
    <iframe
      title={`${exercise.name} movement demonstration`}
      src={`${uri}#mode=app&exercise=${encodeURIComponent(exercise.id)}`}
      sandbox="allow-scripts"
      tabIndex={-1}
      style={{ width: '100%', height: 248, display: 'block', border: 0, pointerEvents: 'none' }}
    />
  )
}
