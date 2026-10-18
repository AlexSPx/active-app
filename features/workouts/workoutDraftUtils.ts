import type { WorkoutExercise } from '../../types/workout'

export function moveWorkoutExercise(
  exercises: WorkoutExercise[],
  index: number,
  direction: -1 | 1
): WorkoutExercise[] {
  const target = index + direction
  if (index < 0 || index >= exercises.length || target < 0 || target >= exercises.length)
    return exercises
  const moved = [...exercises]
  ;[moved[index], moved[target]] = [moved[target], moved[index]]
  return moved
}
