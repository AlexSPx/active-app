import { useMemo, useRef, useState } from 'react'
import { FlatList, Keyboard, Pressable, ScrollView, View, type ViewInstance } from 'react-native'
import { Button, IconButton, TextField, UiText } from '../../../components/ui/Controls'
import { Check, ChevronDown, ChevronRight, Search, X } from '../../../components/ui/icons'
import { CadenceOverlay } from '../../../components/ui/CadenceOverlay'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { useTabContentInset } from '../../../navigation/TabContentInset'
import type { ApiExercise } from '../../../types/api'
import {
  collection,
  equipmentOptions,
  exerciseLabel,
  filterCollection,
  muscleGroups,
} from '../collection'
import { MuscleAtlas } from './MuscleAtlas'

export function ExerciseCollectionScreen() {
  const colors = useCadenceColors()
  const bottomInset = useTabContentInset()
  const [search, setSearch] = useState('')
  const [muscles, setMuscles] = useState(muscleGroups[0])
  const [equipment, setEquipment] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selected, setSelected] = useState<ApiExercise | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const filterRef = useRef<ViewInstance>(null)
  const exerciseRef = useRef<ViewInstance | null>(null)
  const rowRefs = useRef(new Map<string, ViewInstance>())
  const listRef = useRef<FlatList<ApiExercise>>(null)
  const results = useMemo(
    () => filterCollection({ search, muscles: muscles.muscles, equipment }),
    [search, muscles, equipment]
  )
  const filtering = !!search.trim() || muscles.muscles.length > 0 || equipment !== null
  const reset = () => {
    setSearch('')
    setMuscles(muscleGroups[0])
    setEquipment(null)
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        ref={listRef}
        className="w-full max-w-3xl flex-1 self-center"
        data={results}
        keyExtractor={(exercise) => exercise.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset }}
        ListHeaderComponent={
          <View className="gap-field pb-compact pt-field">
            <View className="flex-row items-center gap-field rounded-card bg-surface p-card">
              <View className="min-w-0 flex-1 gap-field">
                <UiText textRole="compactScreenTitle" accessibilityRole="header">
                  Explore by muscle.
                </UiText>
                <UiText textRole="bodyMuted">
                  {muscles.muscles.length
                    ? `${muscles.label} movements`
                    : `Browse ${collection.length} exercises.`}
                </UiText>
              </View>
              <MuscleAtlas muscles={muscles.muscles} />
            </View>

            <View className="justify-center">
              <TextField
                value={search}
                onChangeText={setSearch}
                accessibilityLabel="Search exercise collection"
                placeholder="Search exercises, muscles, equipment"
                returnKeyType="search"
                autoCorrect={false}
                onSubmitEditing={() => Keyboard.dismiss()}
                className="pl-10 pr-11"
                backgroundTone="background"
              />
              <View pointerEvents="none" className="absolute left-3">
                <Search size={18} color={colors.muted} aria-hidden />
              </View>
              {!!search && (
                <IconButton
                  variant="ghost"
                  className="absolute right-0"
                  accessibilityLabel="Clear search"
                  onPress={() => setSearch('')}
                >
                  <X size={17} color={colors.muted} />
                </IconButton>
              )}
            </View>

            <ScrollView
              horizontal
              accessibilityRole="radiogroup"
              accessibilityLabel="Filter by primary muscle"
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 8 }}
            >
              {muscleGroups.map((group) => {
                const active = group.label === muscles.label
                return (
                  <Pressable
                    key={group.label}
                    accessibilityRole="radio"
                    accessibilityLabel={group.label}
                    accessibilityState={{ checked: active }}
                    onPress={() => setMuscles(group)}
                    className={`min-h-touch items-center justify-center rounded-full px-card active:opacity-80 focus:border-2 focus:border-accent ${active ? 'bg-accent' : 'bg-raised'}`}
                  >
                    <UiText textRole={active ? 'buttonOnAccent' : 'bodyEmphasis'}>
                      {group.label}
                    </UiText>
                  </Pressable>
                )
              })}
            </ScrollView>

            <View className="flex-row flex-wrap items-center justify-between gap-compact pt-compact">
              <View className="flex-1 flex-row flex-wrap items-baseline gap-2">
                <UiText textRole="bodyEmphasis" accessibilityRole="header">
                  {filtering ? 'Matching exercises' : 'All exercises'}
                </UiText>
                <UiText textRole="caption" accessibilityLiveRegion="polite">
                  {results.length}
                </UiText>
              </View>
              <Button
                ref={filterRef}
                variant="ghost"
                density="compact"
                onPress={() => {
                  Keyboard.dismiss()
                  setFilterOpen(true)
                }}
                accessibilityLabel={`Filter equipment: ${equipment ? exerciseLabel(equipment) : 'All equipment'}`}
                className="flex-row gap-compact"
              >
                <UiText textRole="captionEmphasis">
                  {equipment ? exerciseLabel(equipment) : 'Equipment'}
                </UiText>
                <ChevronDown size={14} color={colors.accent} aria-hidden />
              </Button>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            ref={(node) => {
              if (node) rowRefs.current.set(item.id, node)
              else rowRefs.current.delete(item.id)
            }}
            accessibilityRole="button"
            className="min-h-touch border-b border-divider px-card py-card active:bg-surface focus:border-2 focus:border-accent"
            accessibilityLabel={`View ${item.name}`}
            onPress={() => {
              exerciseRef.current = rowRefs.current.get(item.id) ?? null
              Keyboard.dismiss()
              setSelected(item)
              setDetailOpen(true)
            }}
          >
            <View className="w-full flex-row items-center gap-field">
              <View className="min-w-0 flex-1 gap-compact">
                <UiText textRole="bodyEmphasis">{item.name}</UiText>
                <UiText textRole="caption">
                  {item.primaryMuscles.map(exerciseLabel).join(', ') ||
                    exerciseLabel(item.category)}
                  {item.equipment ? ` / ${exerciseLabel(item.equipment)}` : ''}
                </UiText>
              </View>
              <ChevronRight size={18} color={colors.muted} aria-hidden />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="gap-field py-section">
            <UiText textRole="cardTitle">No matching movements.</UiText>
            <UiText textRole="bodyMuted">
              Try a different name, or clear your filters to explore the collection.
            </UiText>
            <Button variant="secondary" className="self-start" onPress={reset}>
              Clear search and filters
            </Button>
          </View>
        }
      />

      <CadenceOverlay
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Equipment"
        snapPoints={[70]}
        returnFocusRef={filterRef}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {[
            { value: null, label: 'All equipment' },
            ...equipmentOptions.map((value) => ({ value, label: exerciseLabel(value) })),
          ].map((option) => (
            <Button
              key={option.value ?? 'all'}
              variant="ghost"
              density="card"
              className="mb-compact"
              accessibilityRole="radio"
              accessibilityState={{ checked: equipment === option.value }}
              onPress={() => {
                setEquipment(option.value)
                setFilterOpen(false)
              }}
            >
              <View className="w-full flex-row items-center justify-between gap-field">
                <UiText textRole="bodyEmphasis">{option.label}</UiText>
                {equipment === option.value && (
                  <Check size={20} color={colors.accent} aria-hidden />
                )}
              </View>
            </Button>
          ))}
        </ScrollView>
      </CadenceOverlay>

      <CadenceOverlay
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onClosed={() => setSelected(null)}
        title="Exercise details"
        snapPoints={[88]}
        returnFocusRef={exerciseRef}
      >
        {selected && (
          <>
            <View className="flex-row items-start gap-field">
              <UiText textRole="screenTitle" className="flex-1" accessibilityRole="header">
                {selected.name}
              </UiText>
              <IconButton
                variant="secondary"
                accessibilityLabel="Close exercise details"
                onPress={() => setDetailOpen(false)}
              >
                <X size={20} />
              </IconButton>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 24, paddingBottom: 16 }}
            >
              <View className="flex-row flex-wrap gap-2">
                {[
                  exerciseLabel(selected.level),
                  exerciseLabel(selected.category),
                  ...(selected.equipment ? [exerciseLabel(selected.equipment)] : []),
                ].map((label) => (
                  <View key={label} className="rounded-full bg-raised px-field py-compact">
                    <UiText textRole="caption">{label}</UiText>
                  </View>
                ))}
              </View>
              <View className="flex-row items-center gap-field rounded-card bg-raised p-card">
                <View className="min-w-0 flex-1 gap-field">
                  <View className="gap-compact">
                    <UiText textRole="captionEmphasis">Primary muscles</UiText>
                    <UiText>
                      {selected.primaryMuscles.map(exerciseLabel).join(', ') || 'None listed'}
                    </UiText>
                  </View>
                  {selected.secondaryMuscles.length > 0 && (
                    <View className="gap-compact">
                      <UiText textRole="caption">Also works</UiText>
                      <UiText textRole="bodyMuted">
                        {selected.secondaryMuscles.map(exerciseLabel).join(', ')}
                      </UiText>
                    </View>
                  )}
                </View>
                <MuscleAtlas muscles={selected.primaryMuscles} />
              </View>
              <View className="gap-card">
                <UiText textRole="cardTitle" accessibilityRole="header">
                  How to do it
                </UiText>
                {selected.instructions.length ? (
                  selected.instructions.map((instruction, index) => (
                    <View key={`${selected.id}-${index}`} className="flex-row gap-field">
                      <View className="h-7 w-7 items-center justify-center rounded-full bg-raised">
                        <UiText textRole="captionEmphasis">{index + 1}</UiText>
                      </View>
                      <UiText className="flex-1">{instruction}</UiText>
                    </View>
                  ))
                ) : (
                  <UiText textRole="bodyMuted">
                    Instructions aren’t available for this movement yet.
                  </UiText>
                )}
              </View>
            </ScrollView>
          </>
        )}
      </CadenceOverlay>
    </View>
  )
}
