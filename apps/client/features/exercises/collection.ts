import { exerciseCatalog } from '../../lib/data/exercises'
import type { ApiExercise } from '../../types/api'

export const muscleGroups = [
  { label: 'All muscles', muscles: [] },
  { label: 'Chest', muscles: ['chest'] },
  { label: 'Back', muscles: ['lats', 'middle back', 'lower back', 'traps'] },
  { label: 'Shoulders', muscles: ['shoulders', 'neck'] },
  { label: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { label: 'Legs', muscles: ['quadriceps', 'hamstrings', 'calves', 'adductors', 'abductors'] },
  { label: 'Glutes', muscles: ['glutes'] },
  { label: 'Core', muscles: ['abdominals'] },
]

export function exerciseLabel(value: string | null) {
  if (value === null) return 'Unknown'
  if (value === 'BODY_ONLY') return 'Bodyweight'
  if (value === 'EZ_CURL_BAR' || value === 'E_Z_CURL_BAR') return 'EZ curl bar'
  const words = value.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const collection = [...exerciseCatalog].sort((a, b) => a.name.localeCompare(b.name))
export const equipmentOptions = [
  ...new Set(collection.flatMap((item) => (item.equipment ? [item.equipment] : []))),
].sort((a, b) => exerciseLabel(a).localeCompare(exerciseLabel(b)))

export function filterCollection({
  search,
  muscles,
  equipment,
}: {
  search: string
  muscles: readonly string[]
  equipment: string | null
}): ApiExercise[] {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return collection.filter((exercise) => {
    if (equipment && exercise.equipment !== equipment) return false
    if (muscles.length && !exercise.primaryMuscles.some((muscle) => muscles.includes(muscle)))
      return false
    const searchable = [
      exercise.name,
      ...exercise.primaryMuscles,
      ...exercise.secondaryMuscles,
      exercise.equipment ? exerciseLabel(exercise.equipment) : '',
      exerciseLabel(exercise.category),
    ]
      .join(' ')
      .toLowerCase()
    return terms.every((term) => searchable.includes(term))
  })
}
