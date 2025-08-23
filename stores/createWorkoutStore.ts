import { create } from 'zustand'
import type { WorkoutExercise } from '../types/workout'

type WorkoutState = {
  selectedExercises: WorkoutExercise[]
  setExercises: (exercises: WorkoutExercise[]) => void
  addExercise: (e: WorkoutExercise) => void
  removeExercise: (id: string) => void
  clearExercises: () => void
  updateExerciseSets: (
    exerciseId: string,
    sets: { reps: number | null; weight: number | null }[]
  ) => void
  addSetToExercise: (exerciseId: string) => void
  removeSetFromExercise: (exerciseId: string, setIndex: number) => void
}

export const useWorkoutStore = create<WorkoutState>((set) => ({
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
        ex.id === exerciseId ? { ...ex, sets: [...ex.sets, { reps: null, weight: null }] } : ex
      ),
    })),
  removeSetFromExercise: (exerciseId, setIndex) =>
    set((state) => ({
      selectedExercises: state.selectedExercises.map((ex) =>
        ex.id === exerciseId ? { ...ex, sets: ex.sets.filter((_, i) => i !== setIndex) } : ex
      ),
    })),
}))
