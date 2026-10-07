import { useState, useEffect, useMemo } from 'react'
import { Button, Input, Text, XStack, YStack } from 'tamagui'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useWorkoutStore, useEditWorkoutStore } from '../../features/workouts'
import { useExerciseSearch, ExerciseList } from '../../features/exercises'
import { toggleExerciseSelection } from '../../utils/workoutUtils'
import type { Exercise } from '../../types/workout'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { useAuthStore } from '../../stores/authStore'

export default function SearchExerciseScreen() {
  const router = useRouter()
  const { ctx, workoutName } = useLocalSearchParams<{ ctx?: string; workoutName?: string }>()
  const createStore = useWorkoutStore()
  const editStore = useEditWorkoutStore()
  const store = ctx === 'edit' ? editStore : createStore
  const [original] = useState(store.selectedExercises)
  const [pending, setPending] = useState(original)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const queryClient = useQueryClient()
  const ownerId = useAuthStore((state) => state.profileOwnerId)
  const { exercises, loading, error, hasSearched, searchExercises, clearSearch } =
    useExerciseSearch()
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim()) searchExercises(search)
      else clearSearch()
    }, 300)
    return () => clearTimeout(timer)
  }, [search, searchExercises, clearSearch])
  const selectedIds = useMemo(() => new Set(pending.map((exercise) => exercise.id)), [pending])
  const results = useMemo(
    () =>
      (hasSearched ? exercises : pending)
        .filter(
          (exercise) =>
            category === 'All' || (category === 'Cardio') === (exercise.category === 'CARDIO')
        )
        .sort((a, b) => Number(selectedIds.has(b.id)) - Number(selectedIds.has(a.id))),
    [exercises, pending, hasSearched, category, selectedIds]
  )
  const select = (exercise: Exercise) =>
    setPending((current) => toggleExerciseSelection(current, exercise, original))
  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen
        options={{
          title: 'Exercises',
          headerRight: () => (
            <Button chromeless height="$touch" onPress={() => router.back()}>
              <Text color="$primary" fontSize="$caption">
                Cancel
              </Text>
            </Button>
          ),
        }}
      />
      <YStack
        flex={1}
        width="100%"
        maxW="$content"
        self="center"
        px="$page"
        pt="$section"
        gap="$field"
      >
        <YStack gap="$compact">
          <Text
            fontSize="$screenTitle"
            lineHeight="$screenTitle"
            fontWeight="$screenTitle"
            color="$color"
          >
            Add exercises
          </Text>
          <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            {workoutName ? `For ${workoutName}` : 'Choose exercises for your workout.'}
          </Text>
        </YStack>
        <YStack gap="$compact">
          <Text fontSize="$caption" fontWeight="$screenTitle" color="$color">
            Search exercises
          </Text>
          <Input
            placeholder="Search by exercise name"
            accessibilityLabel="Search exercises"
            value={search}
            onChangeText={setSearch}
            height="$action"
            rounded="$control"
            bg="$surface"
            fontSize="$body"
            borderColor="$borderColor"
          />
        </YStack>
        <XStack bg="$backgroundStrong" p="$compact" rounded="$menu" gap="$compact">
          {['All', 'Strength', 'Cardio'].map((label) => (
            <Button
              key={label}
              flex={1}
              height="$touch"
              rounded="$control"
              bg={category === label ? '$surface' : '$backgroundTransparent'}
              borderWidth="$0"
              px="$compact"
              accessibilityRole="button"
              accessibilityState={{ selected: category === label }}
              onPress={() => setCategory(label)}
            >
              <Text
                fontSize="$caption"
                fontWeight="$screenTitle"
                color={category === label ? '$primary' : '$colorSubtle'}
              >
                {label}
              </Text>
            </Button>
          ))}
        </XStack>
        <XStack justify="space-between" items="center">
          <Text fontSize="$caption" color="$colorSubtle" accessibilityLiveRegion="polite">
            {hasSearched ? `${results.length} results` : 'Selected exercises'}
          </Text>
          {pending.length > 0 && (
            <Button
              chromeless
              height="$touch"
              onPress={() => setPending([])}
              accessibilityLabel="Clear pending exercise selection"
            >
              <Text color="$primary" fontSize="$caption">
                Clear selection
              </Text>
            </Button>
          )}
        </XStack>
        <ExerciseList
          exercises={results}
          loading={loading && hasSearched}
          error={error}
          selectedExerciseIds={selectedIds}
          onExerciseSelect={select}
          onRetry={() =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.forOwner(ownerId).exercises.search(search.trim()),
            })
          }
          emptyMessage={
            hasSearched
              ? 'No exercises found. Try another name or category.'
              : 'Search by name to find exercises. Your selections stay selected across searches.'
          }
        />
      </YStack>
      <YStack borderTopWidth="$0.5" borderTopColor="$borderColor" p="$page" py="$field">
        <YStack width="100%" maxW="$content" self="center" gap="$compact">
          <Text
            fontSize="$caption"
            lineHeight="$caption"
            color="$colorSubtle"
            accessibilityLiveRegion="polite"
          >
            {pending.length} selected across all categories and searches.
          </Text>
          <Button
            height="$action"
            rounded="$button"
            bg="$primary"
            onPress={() => {
              store.setExercises(pending)
              router.back()
            }}
          >
            <Text color="$onPrimary" fontSize="$caption" fontWeight="$screenTitle">
              Done · {pending.length} selected
            </Text>
          </Button>
        </YStack>
      </YStack>
    </YStack>
  )
}
