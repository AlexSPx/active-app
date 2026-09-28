import { create } from 'zustand'
import type { WorkoutExercise } from '../../../types/workout'

type WorkoutState = {
  selectedExercises: WorkoutExercise[]
  setExercises: (exercises: WorkoutExercise[]) => void
  addExercise: (e: WorkoutExercise) => void
  removeExercise: (id: string) => void
  clearExercises: () => void
  updateExerciseSets: (
    exerciseId: string,
    sets: { reps: number | null; weight: number | null; durationSeconds?: number | null }[]
  ) => void
  addSetToExercise: (exerciseId: string) => void
  removeSetFromExercise: (exerciseId: string, setIndex: number) => () => void
  reset: () => void
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  selectedExercises: [],
  setExercises: (exercises) => set({ selectedExercises: exercises }),
  addExercise: (e) => {
    console.log('Adding exercise:', e.name)
    set((state) => ({
      selectedExercises: [...state.selectedExercises, e],
    }))
  },
  removeExercise: (id) => {
    console.log('Removing exercise:', id)
    set((state) => ({
      selectedExercises: state.selectedExercises.filter((e) => e.id !== id),
    }))
  },
  clearExercises: () => set({ selectedExercises: [] }),
  updateExerciseSets: (exerciseId, sets) =>
    set((state) => ({
      selectedExercises: state.selectedExercises.map((ex) =>
        ex.id === exerciseId ? { ...ex, sets } : ex
      ),
    })),
  addSetToExercise: (exerciseId) =>
    set((state) => ({
      selectedExercises: state.selectedExercises.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,
              sets: [
                ...ex.sets,
                ex.category === 'CARDIO'
                  ? { reps: null, weight: null, durationSeconds: 0 }
                  : { reps: null, weight: null },
              ],
            }
          : ex
      ),
    })),
  removeSetFromExercise: (exerciseId, setIndex) => {
    const removedSet = get().selectedExercises.find((ex) => ex.id === exerciseId)?.sets[setIndex]
    set((state) => ({
      selectedExercises: state.selectedExercises.map((ex) =>
        ex.id === exerciseId ? { ...ex, sets: ex.sets.filter((_, i) => i !== setIndex) } : ex
      ),
    }))
    return () => {
      if (!removedSet) return
      set((state) => ({
        selectedExercises: state.selectedExercises.map((ex) => {
          if (ex.id !== exerciseId) return ex
          const sets = ex.sets
          const index = Math.min(setIndex, sets.length)
          return { ...ex, sets: [...sets.slice(0, index), { ...removedSet }, ...sets.slice(index)] }
        }),
      }))
    }
  },
  reset: () => set({ selectedExercises: [] }),
}))
