import { create } from 'zustand'
import type { WorkoutExercise } from '../types/workout'

type EditWorkoutState = {
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
  removeSetFromExercise: (exerciseId: string, setIndex: number) => void
  reset: () => void
}

export const useEditWorkoutStore = create<EditWorkoutState>((set) => ({
  selectedExercises: [],
  setExercises: (exercises) => set({ selectedExercises: exercises }),
  addExercise: (e) =>
    set((state) => ({
      selectedExercises: [...state.selectedExercises, e],
    })),
  removeExercise: (id) =>
    set((state) => ({
      selectedExercises: state.selectedExercises.filter((e) => e.id !== id),
    })),
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
  removeSetFromExercise: (exerciseId, setIndex) =>
    set((state) => ({
      selectedExercises: state.selectedExercises.map((ex) =>
        ex.id === exerciseId ? { ...ex, sets: ex.sets.filter((_, i) => i !== setIndex) } : ex
      ),
    })),
  reset: () => set({ selectedExercises: [] }),
}))
