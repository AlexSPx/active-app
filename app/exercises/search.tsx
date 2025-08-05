import { useState, useEffect, useMemo } from 'react'
import { YStack, Text, Input, Button, ScrollView } from 'tamagui'
import { useRouter } from 'expo-router'
import { useWorkoutStore } from 'stores/createWorkoutStore'
import { useExerciseSearch } from 'hooks/useExerciseSearch'
import { ExerciseList } from 'components/exercise/ExerciseList'
import type { Exercise } from 'types/workout'

export default function SearchExerciseScreen() {
  const router = useRouter()
  const { selectedExercises, addExercise, removeExercise } = useWorkoutStore()
  const { exercises, loading, error, hasSearched, searchExercises, clearSearch } =
    useExerciseSearch()

  const [search, setSearch] = useState('')

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (search.trim()) {
        searchExercises(search)
      } else {
        clearSearch()
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [search, searchExercises, clearSearch])

  const handleDone = () => {
    router.back()
  }

  const handleExerciseSelect = (exercise: Exercise) => {
    const isSelected = selectedExercises.some((ex) => ex.id === exercise.id)

    console.log('Exercise selected:', exercise.name, 'isSelected:', isSelected)

    if (isSelected) {
      removeExercise(exercise.id)
    } else {
      // Convert Exercise to WorkoutExercise with default empty sets
      const workoutExercise = {
        ...exercise,
        sets: [{ reps: 0, weight: 0 }],
      }
      addExercise(workoutExercise)
    }
  }

  // Sort exercises to show selected ones first
  const sortedExercises = useMemo(() => {
    return [...exercises].sort((a, b) => {
      const aSelected = selectedExercises.some((ex) => ex.id === a.id)
      const bSelected = selectedExercises.some((ex) => ex.id === b.id)
      return aSelected === bSelected ? 0 : aSelected ? -1 : 1
    })
  }, [exercises, selectedExercises])

  const handleRetry = () => {
    if (search.trim()) {
      searchExercises(search)
    }
  }

  const selectedIds = useMemo(
    () => new Set(selectedExercises.map((ex) => ex.id)),
    [selectedExercises]
  )

  return (
    <YStack bg="$background" flex={1}>
      {/* Header - Fixed */}
      <YStack
        p="$4"
        gap="$3"
        bg="$background"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
      >
        <Text fontSize="$7" fontWeight="800" color="$color">
          Add Exercises
        </Text>

        <Input
          placeholder="Search exercises..."
          value={search}
          onChangeText={setSearch}
          size="$4"
        />
      </YStack>

      {/* Scrollable Exercise List */}
      <ScrollView flex={1} bg="$background">
        <YStack p="$4" pt="$3">
          {!hasSearched && !search.trim() && (
            <YStack py="$8" items="center">
              <Text fontSize="$4" color="$color10">
                Start typing to search for exercises
              </Text>
            </YStack>
          )}

          {hasSearched && (
            <ExerciseList
              exercises={sortedExercises}
              loading={loading}
              error={error}
              onExerciseSelect={handleExerciseSelect}
              onRetry={handleRetry}
              selectedExerciseIds={selectedIds}
            />
          )}
        </YStack>
      </ScrollView>

      {/* Fixed Bottom Button */}
      {selectedExercises.length > 0 && (
        <YStack p="$4" pt="$3" bg="$background" borderTopWidth={1} borderTopColor="$borderColor">
          <Button bg="$primary" size="$5" onPress={handleDone}>
            <Text fontSize="$5" fontWeight="600" color="$onPrimary">
              Done ({selectedExercises.length} selected)
            </Text>
          </Button>
        </YStack>
      )}
    </YStack>
  )
}
