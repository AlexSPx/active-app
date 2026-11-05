import { useState, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Button, SegmentedSelection, TextField, UiText } from '../../components/ui/Controls'
import { Search } from '../../components/ui/icons'
import { useCadenceColors } from '../../components/ui/useCadenceColors'
import { useWorkoutStore, useEditWorkoutStore } from '../../features/workouts'
import { useExerciseSearch, ExerciseList } from '../../features/exercises'
import { toggleExerciseSelection } from '../../utils/workoutUtils'
import type { Exercise } from '../../types/workout'
import { useQueryClient } from '@tanstack/react-query'
import { useProfileQueryKeys } from '../../lib/hooks/useProfileQueryKeys'
import { BackHeaderButton } from '../../navigation/BackHeaderButton'

type CategoryFilter = 'All' | 'Strength' | 'Cardio'

const categoryOptions: { value: CategoryFilter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Strength', label: 'Strength' },
  { value: 'Cardio', label: 'Cardio' },
]

export default function SearchExerciseScreen() {
  const router = useRouter()
  const colors = useCadenceColors()
  const { ctx, workoutName } = useLocalSearchParams<{ ctx?: string; workoutName?: string }>()
  const createStore = useWorkoutStore()
  const editStore = useEditWorkoutStore()
  const store = ctx === 'edit' ? editStore : createStore
  const [original] = useState(store.selectedExercises)
  const [pending, setPending] = useState(original)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('All')
  const queryClient = useQueryClient()
  const ownerKeys = useProfileQueryKeys()
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
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: '',
          headerBackTitle: 'Workout',
          headerBackVisible: false,
          headerLeft: () => <BackHeaderButton label="Workout" fallback="/(tabs)/(workouts)" />,
          headerRight: () => (
            <Button variant="ghost" density="compact" onPress={() => router.back()}>
              <UiText textRole="captionEmphasis">Cancel</UiText>
            </Button>
          ),
        }}
      />

      <View className="w-full max-w-3xl flex-1 self-center gap-field px-page pt-section">
        <View className="gap-compact">
          <UiText textRole="screenTitle" accessibilityRole="header">
            Add exercises.
          </UiText>
          <UiText textRole="bodyMuted">
            {workoutName ? `For ${workoutName}` : 'Choose exercises for your workout.'}
          </UiText>
        </View>

        <View className="justify-center">
          <TextField
            placeholder="Search exercises"
            accessibilityLabel="Search exercises"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            className="pl-12"
          />
          <View className="absolute left-compact">
            <Search size={18} color={colors.muted} aria-hidden />
          </View>
        </View>

        <SegmentedSelection<CategoryFilter>
          value={category}
          options={categoryOptions}
          accessibilityLabel="Filter exercises by category"
          onValueChange={setCategory}
        />

        <View className="flex-row items-center justify-between gap-field">
          <UiText textRole="caption" accessibilityLiveRegion="polite">
            {hasSearched ? `${results.length} results` : `${pending.length} selected`}
          </UiText>
          {pending.length > 0 && (
            <Button
              variant="ghost"
              density="compact"
              accessibilityLabel="Clear pending exercise selection"
              onPress={() => setPending([])}
            >
              <UiText textRole="captionEmphasis">Clear selection</UiText>
            </Button>
          )}
        </View>

        <ExerciseList
          exercises={results}
          loading={loading && hasSearched}
          error={error}
          selectedExerciseIds={selectedIds}
          onExerciseSelect={select}
          onRetry={() =>
            queryClient.invalidateQueries({ queryKey: ownerKeys.exercises.search(search.trim()) })
          }
          emptyMessage={
            hasSearched
              ? 'No exercises found. Try another name or category.'
              : 'Search by name to find exercises. Your selections stay selected across searches.'
          }
        />
      </View>

      <View className="border-t border-divider px-page py-field">
        <View className="w-full max-w-3xl self-center gap-compact">
          <UiText textRole="caption" accessibilityLiveRegion="polite">
            {pending.length} selected across all categories and searches.
          </UiText>
          <Button
            accessibilityLabel={`Done, ${pending.length} selected`}
            onPress={() => {
              store.setExercises(pending)
              router.back()
            }}
          >
            <UiText textRole="buttonOnAccent">Done · {pending.length} selected</UiText>
          </Button>
        </View>
      </View>
    </View>
  )
}
