import React, { useCallback, useEffect, useState } from 'react'
import { Keyboard, ScrollView, View } from 'react-native'
import { ArrowDown, ArrowUp, Check, Plus, Search, X } from 'lucide-react-native'
import { CadenceOverlay } from './ui/CadenceOverlay'
import { Button, IconButton, TextField, UiText } from './ui/Controls'
import { useCadenceColors } from './ui/useCadenceColors'
import { useWidgetStore, getMetricLabel, type ProgressionMetric } from '../stores/widgetStore'
import { useExerciseSearch } from '../features/exercises'
import { useWorkouts } from '../features/workouts'
import { ProgressionWidget } from './ProgressionWidget'

interface WidgetManagerProps {
  isVisible: boolean
  mode: 'add' | 'manage'
  onModeChange: (mode: 'add' | 'manage') => void
  onClose: () => void
}

const METRICS: { key: ProgressionMetric; help: string }[] = [
  { key: 'maxWeight', help: 'Heaviest weight used in each session.' },
  { key: 'oneRm', help: 'Estimated one-rep maximum from your recorded sets.' },
  { key: 'volume', help: 'Total weight × reps in each session.' },
]

export function WidgetManager({ isVisible, mode, onModeChange, onClose }: WidgetManagerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMetric, setSelectedMetric] = useState<ProgressionMetric>('maxWeight')
  const [selectedExercise, setSelectedExercise] = useState<{ id: string; name: string } | null>(
    null
  )
  const {
    exercises,
    loading: isSearching,
    error,
    searchExercises,
    clearSearch,
  } = useExerciseSearch()
  const { workouts } = useWorkouts()
  const { widgets, addWidget, removeWidget, reorderWidgets } = useWidgetStore()
  const colors = useCadenceColors()
  const resetDraft = useCallback(() => {
    setSelectedExercise(null)
    setSearchQuery('')
    setSelectedMetric('maxWeight')
    clearSearch()
  }, [clearSearch])
  const sortedWidgets = [...widgets].sort((a, b) => a.position - b.position)
  const savedExercises = [
    ...new Map(
      workouts
        .flatMap((workout) => workout.workoutTemplate.exercises)
        .filter((exercise) => exercise.category !== 'CARDIO')
        .map((exercise) => [
          exercise.exerciseId,
          { id: exercise.exerciseId, name: exercise.exerciseTitle },
        ])
    ).values(),
  ]
  const results = searchQuery.trim() ? exercises : savedExercises
  const duplicate =
    selectedExercise &&
    widgets.some(
      (widget) => widget.exerciseId === selectedExercise.id && widget.metric === selectedMetric
    )

  useEffect(() => {
    resetDraft()
  }, [isVisible, mode, resetDraft])

  const closeManager = () => {
    Keyboard.dismiss()
    resetDraft()
    onClose()
  }

  const moveWidget = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= sortedWidgets.length) return
    const ids = sortedWidgets.map((widget) => widget.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderWidgets(ids)
  }

  return (
    <CadenceOverlay
      title={mode === 'add' ? 'Add widget' : 'Your widgets'}
      open={isVisible}
      onOpenChange={(open) => {
        if (!open) closeManager()
      }}
      snapPoints={[90]}
    >
      <View className="flex-1 gap-field">
        <View className="flex-row items-center justify-end gap-field">
          {mode === 'manage' && (
            <Button
              variant="ghost"
              className="flex-row gap-compact"
              onPress={() => onModeChange('add')}
            >
              <Plus size={18} color={colors.accent} aria-hidden />
              <UiText textRole="captionEmphasis">Add</UiText>
            </Button>
          )}
          <IconButton
            variant="ghost"
            shape="control"
            className="w-touch px-0"
            accessibilityLabel="Close widget manager"
            onPress={closeManager}
          >
            <X size={20} color={colors.muted} aria-hidden />
          </IconButton>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-field pb-card"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {mode === 'manage' ? (
            <View className="gap-field">
              <UiText textRole="caption">
                Choose the order your widgets appear on Home. Removing a widget keeps your workout
                history.
              </UiText>
              {sortedWidgets.length === 0 && (
                <UiText textRole="bodyMuted">
                  No widgets yet. Add an exercise to start tracking.
                </UiText>
              )}
              {sortedWidgets.map((widget, index) => (
                <View
                  key={widget.id}
                  className="gap-field rounded-card border border-divider bg-surface p-card"
                >
                  <View className="flex-row justify-between gap-field">
                    <View className="min-w-0 flex-1">
                      <UiText textRole="cardTitle">{widget.exerciseName}</UiText>
                      <UiText textRole="caption">{getMetricLabel(widget.metric)}</UiText>
                    </View>
                    <UiText textRole="caption">{index + 1}</UiText>
                  </View>
                  <View className="flex-row flex-wrap items-center gap-compact">
                    <IconButton
                      variant="secondary"
                      shape="control"
                      className="w-touch px-0"
                      disabled={index === 0}
                      accessibilityLabel={`Move ${widget.exerciseName} ${getMetricLabel(widget.metric)} up`}
                      onPress={() => moveWidget(index, -1)}
                    >
                      <ArrowUp size={18} color={colors.foreground} aria-hidden />
                    </IconButton>
                    <IconButton
                      variant="secondary"
                      shape="control"
                      className="w-touch px-0"
                      disabled={index === sortedWidgets.length - 1}
                      accessibilityLabel={`Move ${widget.exerciseName} ${getMetricLabel(widget.metric)} down`}
                      onPress={() => moveWidget(index, 1)}
                    >
                      <ArrowDown size={18} color={colors.foreground} aria-hidden />
                    </IconButton>
                    <Button
                      variant="ghost"
                      className="min-w-24 flex-1"
                      accessibilityLabel={`Remove ${widget.exerciseName} ${getMetricLabel(widget.metric)} widget`}
                      onPress={() => removeWidget(widget.id)}
                    >
                      <UiText textRole="captionDestructive">Remove</UiText>
                    </Button>
                  </View>
                </View>
              ))}
              {sortedWidgets.length > 0 && (
                <View className="gap-compact border-t border-divider pt-field">
                  <UiText textRole="caption">Preview order</UiText>
                  <UiText textRole="caption">
                    {sortedWidgets
                      .map((widget) => `${widget.exerciseName} / ${getMetricLabel(widget.metric)}`)
                      .join(' → ')}
                  </UiText>
                </View>
              )}
            </View>
          ) : (
            <View className="gap-field">
              <UiText textRole="captionEmphasis">Exercise</UiText>
              <View className="flex-row items-center gap-compact rounded-control border border-divider bg-surface px-field">
                <Search size={18} color={colors.muted} aria-hidden />
                <TextField
                  className="h-auto min-h-touch flex-1 border-0 bg-transparent px-0 py-compact"
                  value={searchQuery}
                  accessibilityLabel="Search exercises"
                  placeholder="Search exercises"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  onChangeText={(value) => {
                    setSearchQuery(value)
                    if (value.trim()) void searchExercises(value)
                    else clearSearch()
                  }}
                />
              </View>

              <ScrollView
                className="max-h-52"
                contentContainerClassName="gap-compact"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {isSearching ? (
                  <UiText textRole="bodyMuted">Searching...</UiText>
                ) : error && searchQuery.trim() ? (
                  <View className="gap-compact">
                    <UiText textRole="captionDestructive" accessibilityRole="alert" selectable>
                      {error}
                    </UiText>
                    <UiText textRole="caption">
                      Clear the search to choose an exercise from your saved workouts.
                    </UiText>
                  </View>
                ) : results.length > 0 ? (
                  results.slice(0, 10).map((exercise) => {
                    const selected = selectedExercise?.id === exercise.id
                    return (
                      <Button
                        key={exercise.id}
                        variant={selected ? 'selected' : 'ghost'}
                        shape="control"
                        className="min-h-touch flex-row justify-between gap-compact px-field py-compact"
                        accessibilityLabel={exercise.name}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          Keyboard.dismiss()
                          setSelectedExercise({ id: exercise.id, name: exercise.name })
                        }}
                      >
                        <UiText
                          textRole={selected ? 'bodyEmphasis' : 'body'}
                          className="min-w-0 flex-1"
                        >
                          {exercise.name}
                        </UiText>
                        {selected && <Check size={18} color={colors.accent} aria-hidden />}
                      </Button>
                    )
                  })
                ) : (
                  <UiText textRole="caption">
                    {searchQuery.trim()
                      ? 'No exercises found.'
                      : 'Search for an exercise to add your first widget.'}
                  </UiText>
                )}
              </ScrollView>

              {selectedExercise && (
                <View className="flex-row items-center gap-compact">
                  <UiText textRole="captionEmphasis" className="min-w-0 flex-1">
                    Selected: {selectedExercise.name}
                  </UiText>
                  <IconButton
                    variant="ghost"
                    shape="control"
                    className="w-touch px-0"
                    accessibilityLabel="Clear selected exercise"
                    onPress={() => setSelectedExercise(null)}
                  >
                    <X size={18} color={colors.muted} aria-hidden />
                  </IconButton>
                </View>
              )}

              <UiText textRole="captionEmphasis">Metric</UiText>
              <View
                className="flex-row flex-wrap gap-compact"
                accessibilityRole="radiogroup"
                accessibilityLabel="Metric"
              >
                {METRICS.map((metric) => {
                  const selected = selectedMetric === metric.key
                  return (
                    <Button
                      key={metric.key}
                      variant={selected ? 'selected' : 'surface'}
                      shape="control"
                      className="min-w-24 flex-1 px-compact py-compact"
                      accessibilityRole="radio"
                      accessibilityLabel={getMetricLabel(metric.key)}
                      accessibilityState={{ checked: selected, selected }}
                      onPress={() => setSelectedMetric(metric.key)}
                    >
                      <UiText textRole="caption" className="text-center">
                        {getMetricLabel(metric.key)}
                      </UiText>
                    </Button>
                  )
                })}
              </View>
              <UiText textRole="caption">
                {METRICS.find((metric) => metric.key === selectedMetric)?.help}
              </UiText>
              <UiText textRole="caption">Widget preview</UiText>
              {selectedExercise ? (
                <ProgressionWidget
                  key={selectedExercise.id}
                  config={{
                    exerciseId: selectedExercise.id,
                    exerciseName: selectedExercise.name,
                    metric: selectedMetric,
                  }}
                  preview
                />
              ) : (
                <UiText textRole="caption">Select an exercise to preview its progress.</UiText>
              )}
            </View>
          )}
        </ScrollView>

        <Button
          variant="primary"
          className="w-full flex-row gap-compact py-field"
          disabled={mode === 'add' && (!selectedExercise || !!duplicate)}
          accessibilityLabel={
            mode === 'manage' ? 'Done' : duplicate ? 'Widget already added' : 'Add widget'
          }
          onPress={() => {
            if (mode === 'add') {
              if (!selectedExercise || duplicate) return
              addWidget(selectedExercise.id, selectedExercise.name, selectedMetric)
            }
            closeManager()
          }}
        >
          {mode === 'add' && <Plus size={18} color={colors.onAccent} aria-hidden />}
          <UiText textRole="buttonOnAccent">
            {mode === 'manage' ? 'Done' : duplicate ? 'Widget already added' : 'Add widget'}
          </UiText>
        </Button>
        {mode === 'add' && (
          <UiText textRole="caption" className="text-center">
            Appears below your weekly board.
          </UiText>
        )}
      </View>
    </CadenceOverlay>
  )
}

export default WidgetManager
