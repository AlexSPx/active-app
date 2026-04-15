import React, { useState } from 'react'
import { YStack, XStack, Text, Button, Input, ScrollView, View, Sheet } from 'tamagui'
import { Search, X, Plus } from '@tamagui/lucide-icons'
import { useWidgetStore, type ProgressionMetric } from '../stores/widgetStore'
import { useExerciseSearch } from '../features/exercises'

interface WidgetManagerProps {
  isVisible: boolean
  onClose: () => void
}

const METRICS: { key: ProgressionMetric; label: string }[] = [
  { key: 'oneRm', label: '1RM' },
  { key: 'volume', label: 'Volume' },
  { key: 'maxWeight', label: 'Max Weight' },
]

export function WidgetManager({ isVisible, onClose }: WidgetManagerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMetric, setSelectedMetric] = useState<ProgressionMetric>('oneRm')
  const [selectedExercise, setSelectedExercise] = useState<{ id: string; name: string } | null>(
    null
  )

  const { exercises, loading: isSearching, searchExercises, clearSearch } = useExerciseSearch()
  const { addWidget } = useWidgetStore()

  const handleAddWidget = () => {
    if (!selectedExercise) return
    addWidget(selectedExercise.id, selectedExercise.name, selectedMetric)
    // Reset
    setSelectedExercise(null)
    setSearchQuery('')
    setSelectedMetric('oneRm')
    onClose()
  }

  const handleExerciseSelect = (exercise: { id: string; name: string }) => {
    setSelectedExercise(exercise)
    clearSearch()
    setSearchQuery('')
  }

  return (
    <Sheet
      forceRemoveScrollEnabled
      modal
      open={isVisible}
      onOpenChange={(open) => !open && onClose()}
    >
      <Sheet.Overlay animation="quick" style={{ backgroundColor: 'transparent' }} />
      <Sheet.Handle />
      <Sheet.Frame bg="$background" borderTopLeftRadius={20} borderTopRightRadius={20} p="$4">
        <YStack gap="$4" flex={1}>
          {/* Header */}
          <XStack items="center" justify="space-between">
            <Text fontSize="$6" fontWeight="600">
              Add Progress Widget
            </Text>
            <Button size="$3" onPress={onClose} p="$2">
              <X size={20} />
            </Button>
          </XStack>

          {/* Exercise Search */}
          <YStack gap="$2">
            <Text fontSize="$4" fontWeight="500">
              Select Exercise
            </Text>

            <XStack
              items="center"
              bg="$background"
              borderColor="$borderColor"
              borderWidth={1}
              rounded="$4"
              px="$3"
              py="$2"
              gap="$2"
            >
              <Search size={16} />
              <Input
                flex={1}
                value={searchQuery}
                onChangeText={(val) => {
                  setSearchQuery(val)
                  if (val && val.trim().length > 0) {
                    searchExercises(val)
                  } else {
                    clearSearch()
                  }
                }}
                placeholder="Search exercises..."
              />
            </XStack>

            {/* Exercise Results */}
            {searchQuery.length > 0 && (
              <YStack height={200}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <YStack gap="$1">
                    {isSearching ? (
                      <View items="center" p="$4">
                        <Text fontSize="$2" color="$color11">
                          Searching...
                        </Text>
                      </View>
                    ) : exercises.length > 0 ? (
                      exercises.slice(0, 10).map((exercise) => (
                        <Button
                          key={exercise.id}
                          variant="outlined"
                          onPress={() =>
                            handleExerciseSelect({ id: exercise.id, name: exercise.name })
                          }
                        >
                          <Text>{exercise.name}</Text>
                        </Button>
                      ))
                    ) : (
                      <View items="center" p="$3">
                        <Text fontSize="$2" color="$color11">
                          No exercises found
                        </Text>
                      </View>
                    )}
                  </YStack>
                </ScrollView>
              </YStack>
            )}

            {/* Selected Exercise */}
            {selectedExercise && (
              <XStack
                items="center"
                bg="$backgroundAccent"
                borderColor="$borderAccent"
                borderWidth={1}
                rounded="$4"
                px="$3"
                py="$2"
                gap="$2"
              >
                <Text fontSize="$3" flex={1} fontWeight="500">
                  Selected: {selectedExercise.name}
                </Text>
                <Button size="$2" onPress={() => setSelectedExercise(null)} p="$1">
                  <X size={14} />
                </Button>
              </XStack>
            )}
          </YStack>

          {/* Metric Selection */}
          <YStack gap="$2">
            <Text fontSize="$4" fontWeight="500">
              Progress Metric
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              {METRICS.map((metric) => (
                <Button
                  key={metric.key}
                  onPress={() => setSelectedMetric(metric.key)}
                  bg={selectedMetric === metric.key ? '$backgroundAccent' : 'transparent'}
                  borderColor={selectedMetric === metric.key ? '$borderAccent' : '$borderColor'}
                  size="$3"
                >
                  <Text
                    color={selectedMetric === metric.key ? '$primary' : '$color11'}
                    fontWeight={selectedMetric === metric.key ? '600' : '400'}
                  >
                    {metric.label}
                  </Text>
                </Button>
              ))}
            </XStack>
            <Text fontSize="$2" color="$color11" mt="$1">
              {selectedMetric === 'oneRm' && 'Track estimated 1-rep max progress'}
              {selectedMetric === 'volume' && 'Track total (weight * reps) progress'}
              {selectedMetric === 'maxWeight' && 'Track maximum weight lifted progress'}
            </Text>
          </YStack>

          {/* Add Button */}
          <View pt="$4">
            <Button
              size="$4"
              bg="$primary"
              onPress={handleAddWidget}
              disabled={!selectedExercise}
              opacity={selectedExercise ? 1 : 0.5}
            >
              <Plus size={20} />
              <Text color="$onPrimary" fontWeight="600" ml="$2">
                Add Widget
              </Text>
            </Button>
          </View>
        </YStack>
      </Sheet.Frame>
    </Sheet>
  )
}

export default WidgetManager
