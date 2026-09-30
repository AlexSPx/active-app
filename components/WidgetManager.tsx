import React, { useEffect, useState } from 'react'
import { YStack, XStack, Text, Button, Input, ScrollView, Sheet } from 'tamagui'
import { Search, X, Plus, Check, ArrowUp, ArrowDown } from '@tamagui/lucide-icons'
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
    if (!isVisible || mode !== 'add') return
    setSelectedExercise(null)
    setSearchQuery('')
    setSelectedMetric('maxWeight')
    clearSearch()
  }, [isVisible, mode, clearSearch])

  const moveWidget = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= sortedWidgets.length) return
    const ids = sortedWidgets.map((widget) => widget.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderWidgets(ids)
  }

  return (
    <Sheet
      modal
      open={isVisible}
      onOpenChange={(open) => !open && onClose()}
      snapPointsMode="percent"
      snapPoints={[90]}
      dismissOnSnapToBottom
    >
      <Sheet.Overlay bg="$color" opacity={0.2} />
      <Sheet.Handle bg="$colorMuted" />
      <Sheet.Frame
        bg="$background"
        borderTopLeftRadius="$sheet"
        borderTopRightRadius="$sheet"
        p="$page"
        gap="$field"
      >
        <XStack items="center" justify="space-between" gap="$field">
          <Text flex={1} fontSize="$sectionTitle" lineHeight="$sectionTitle" fontWeight="600">
            {mode === 'add' ? 'Add widget' : 'Your widgets'}
          </Text>
          {mode === 'manage' && (
            <Button chromeless minH="$touch" onPress={() => onModeChange('add')}>
              <Plus size="$iconSmall" color="$primary" />
              <Text color="$primary" fontSize="$caption">
                Add
              </Text>
            </Button>
          )}
          <Button
            chromeless
            width="$touch"
            height="$touch"
            p="$0"
            rounded="$control"
            accessibilityLabel="Close widget manager"
            onPress={onClose}
          >
            <X size="$icon" color="$colorSubtle" />
          </Button>
        </XStack>
        <Sheet.ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <YStack gap="$field" pb="$card">
            {mode === 'manage' ? (
              <>
                <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                  Choose the order your widgets appear on Home. Removing a widget keeps your workout
                  history.
                </Text>
                {sortedWidgets.length === 0 && (
                  <Text color="$colorSubtle">
                    No widgets yet. Add an exercise to start tracking.
                  </Text>
                )}
                {sortedWidgets.map((widget, index) => (
                  <YStack
                    key={widget.id}
                    p="$card"
                    gap="$field"
                    bg="$surface"
                    borderWidth={1}
                    borderColor="$borderColor"
                    rounded="$menu"
                  >
                    <XStack justify="space-between" gap="$field">
                      <YStack flex={1}>
                        <Text fontSize="$exerciseTitle" fontWeight="600">
                          {widget.exerciseName}
                        </Text>
                        <Text fontSize="$caption" color="$colorSubtle">
                          {getMetricLabel(widget.metric)}
                        </Text>
                      </YStack>
                      <Text fontSize="$caption" color="$colorSubtle">
                        {index + 1}
                      </Text>
                    </XStack>
                    <XStack gap="$compact" items="center">
                      <Button
                        width="$touch"
                        height="$touch"
                        p="$0"
                        rounded="$day"
                        disabled={index === 0}
                        opacity={index === 0 ? 0.4 : 1}
                        bg="$backgroundHover"
                        accessibilityLabel={`Move ${widget.exerciseName} ${getMetricLabel(widget.metric)} up`}
                        onPress={() => moveWidget(index, -1)}
                      >
                        <ArrowUp size="$iconSmall" />
                      </Button>
                      <Button
                        width="$touch"
                        height="$touch"
                        p="$0"
                        rounded="$day"
                        disabled={index === sortedWidgets.length - 1}
                        opacity={index === sortedWidgets.length - 1 ? 0.4 : 1}
                        bg="$backgroundHover"
                        accessibilityLabel={`Move ${widget.exerciseName} ${getMetricLabel(widget.metric)} down`}
                        onPress={() => moveWidget(index, 1)}
                      >
                        <ArrowDown size="$iconSmall" />
                      </Button>
                      <Button
                        chromeless
                        flex={1}
                        minH="$touch"
                        accessibilityLabel={`Remove ${widget.exerciseName} ${getMetricLabel(widget.metric)} widget`}
                        onPress={() => removeWidget(widget.id)}
                      >
                        <Text fontSize="$caption" color="$destructive">
                          Remove
                        </Text>
                      </Button>
                    </XStack>
                  </YStack>
                ))}
                {sortedWidgets.length > 0 && (
                  <YStack pt="$field" borderTopWidth={1} borderColor="$borderColor" gap="$compact">
                    <Text fontSize="$caption" color="$colorSubtle">
                      Preview order
                    </Text>
                    <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                      {sortedWidgets
                        .map(
                          (widget) => `${widget.exerciseName} / ${getMetricLabel(widget.metric)}`
                        )
                        .join(' → ')}
                    </Text>
                  </YStack>
                )}
              </>
            ) : (
              <>
                <Text fontSize="$caption" fontWeight="600">
                  Exercise
                </Text>
                <XStack
                  items="center"
                  bg="$surface"
                  borderWidth={1}
                  borderColor="$borderColor"
                  rounded="$control"
                  px="$field"
                  gap="$compact"
                >
                  <Search size="$iconSmall" color="$colorSubtle" aria-hidden />
                  <Input
                    flex={1}
                    minH="$touch"
                    borderWidth={0}
                    bg="$backgroundTransparent"
                    fontSize="$body"
                    value={searchQuery}
                    accessibilityLabel="Search exercises"
                    placeholder="Search exercises"
                    onChangeText={(value) => {
                      setSearchQuery(value)
                      if (value.trim()) void searchExercises(value)
                      else clearSearch()
                    }}
                  />
                </XStack>
                <ScrollView maxH="$13" keyboardShouldPersistTaps="handled">
                  <YStack gap="$compact">
                    {isSearching ? (
                      <Text color="$colorSubtle">Searching...</Text>
                    ) : error && searchQuery.trim() ? (
                      <YStack gap="$compact">
                        <Text color="$destructive" fontSize="$caption">
                          {error}
                        </Text>
                        <Text color="$colorSubtle" fontSize="$caption">
                          Clear the search to choose an exercise from your saved workouts.
                        </Text>
                      </YStack>
                    ) : results.length > 0 ? (
                      results.slice(0, 10).map((exercise) => (
                        <Button
                          key={exercise.id}
                          unstyled
                          minH="$touch"
                          p="$field"
                          rounded="$control"
                          flexDirection="row"
                          items="center"
                          gap="$compact"
                          bg={
                            selectedExercise?.id === exercise.id
                              ? '$backgroundAccent'
                              : '$backgroundTransparent'
                          }
                          accessibilityRole="button"
                          accessibilityState={{ selected: selectedExercise?.id === exercise.id }}
                          onPress={() =>
                            setSelectedExercise({ id: exercise.id, name: exercise.name })
                          }
                        >
                          <Text
                            flex={1}
                            fontSize="$body"
                            color={selectedExercise?.id === exercise.id ? '$primary' : '$color'}
                          >
                            {exercise.name}
                          </Text>
                          {selectedExercise?.id === exercise.id && (
                            <Check size="$iconSmall" color="$primary" aria-hidden />
                          )}
                        </Button>
                      ))
                    ) : (
                      <Text color="$colorSubtle" fontSize="$caption">
                        {searchQuery.trim()
                          ? 'No exercises found.'
                          : 'Search for an exercise to add your first widget.'}
                      </Text>
                    )}
                  </YStack>
                </ScrollView>
                {selectedExercise && (
                  <XStack items="center" gap="$compact">
                    <Text flex={1} fontSize="$caption" color="$primary">
                      Selected: {selectedExercise.name}
                    </Text>
                    <Button
                      chromeless
                      width="$touch"
                      height="$touch"
                      p="$0"
                      accessibilityLabel="Clear selected exercise"
                      onPress={() => setSelectedExercise(null)}
                    >
                      <X size="$iconSmall" />
                    </Button>
                  </XStack>
                )}
                <Text fontSize="$caption" fontWeight="600">
                  Metric
                </Text>
                <XStack gap="$compact" flexWrap="wrap">
                  {METRICS.map((metric) => (
                    <Button
                      key={metric.key}
                      flex={1}
                      minH="$touch"
                      rounded="$control"
                      px="$compact"
                      bg={selectedMetric === metric.key ? '$backgroundAccent' : '$surface'}
                      borderWidth={1}
                      borderColor={selectedMetric === metric.key ? '$primary' : '$borderColor'}
                      accessibilityState={{ selected: selectedMetric === metric.key }}
                      onPress={() => setSelectedMetric(metric.key)}
                    >
                      <Text
                        text="center"
                        fontSize="$caption"
                        color={selectedMetric === metric.key ? '$primary' : '$color'}
                      >
                        {getMetricLabel(metric.key)}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                  {METRICS.find((metric) => metric.key === selectedMetric)?.help}
                </Text>
                <Text fontSize="$caption" color="$colorSubtle">
                  Widget preview
                </Text>
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
                  <Text fontSize="$caption" color="$colorSubtle">
                    Select an exercise to preview its progress.
                  </Text>
                )}
              </>
            )}
          </YStack>
        </Sheet.ScrollView>
        <Button
          height="$action"
          rounded="$button"
          bg="$primary"
          disabled={mode === 'add' && (!selectedExercise || !!duplicate)}
          opacity={mode === 'add' && (!selectedExercise || duplicate) ? 0.5 : 1}
          onPress={() => {
            if (mode === 'add') {
              if (!selectedExercise || duplicate) return
              addWidget(selectedExercise.id, selectedExercise.name, selectedMetric)
            }
            onClose()
          }}
        >
          {mode === 'add' && <Plus size="$iconSmall" color="$onPrimary" aria-hidden />}
          <Text color="$onPrimary" fontSize="$caption" fontWeight="700">
            {mode === 'manage' ? 'Done' : duplicate ? 'Widget already added' : 'Add widget'}
          </Text>
        </Button>
        {mode === 'add' && (
          <Text text="center" fontSize="$caption" color="$colorSubtle">
            Appears below your weekly board.
          </Text>
        )}
      </Sheet.Frame>
    </Sheet>
  )
}

export default WidgetManager
