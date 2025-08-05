import { YStack, Text, Button, View } from 'tamagui'
import { FlashList } from '@shopify/flash-list'
import { RefreshControl } from 'react-native'
import { WorkoutHistoryHeader } from '../../components/history/WorkoutHistoryHeader'
import { WorkoutStats } from '../../components/history/WorkoutStats'
import { WorkoutCard } from '../../components/history/WorkoutCard'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { useWorkoutRecords } from '../../hooks/useWorkoutRecords'
import type { WorkoutSession } from '../../types/history'
import type { WorkoutRecord } from '../../types/api'

// Convert API WorkoutRecord to WorkoutSession for display
function convertWorkoutRecordToSession(record: WorkoutRecord): WorkoutSession {
  const totalSets = record.exerciseRecords.reduce(
    (total, exercise) => total + exercise.reps.length,
    0
  )

  // Calculate total volume (weight * reps for all sets)
  const totalVolume = record.exerciseRecords.reduce((total, exercise) => {
    return (
      total +
      exercise.reps.reduce((exerciseTotal, reps, index) => {
        const weight = exercise.weight[index] || 0
        return exerciseTotal + reps * weight
      }, 0)
    )
  }, 0)

  return {
    id: record.id || record.workoutId + '-' + record.createdAt,
    name: record.notes || 'Workout Session', // Use notes as name or default
    date: new Date(record.createdAt).toISOString().split('T')[0], // Convert to YYYY-MM-DD
    duration: 45, // Default duration, could be calculated if we track start/end times
    totalVolume,
    totalSets,
    exercises: record.exerciseRecords.map((exercise) => ({
      name: exercise.exerciseName,
      muscleGroup: 'Unknown', // We don't have muscle group info from API
      sets: exercise.reps.map((reps, index) => ({
        reps,
        weight: exercise.weight[index] || 0,
      })),
    })),
    notes: record.notes || undefined,
  }
}

export default function WorkoutHistoryScreen() {
  const { workoutRecords, loading, error, refetch } = useWorkoutRecords()

  // Convert API records to display format
  const workoutHistory: WorkoutSession[] = workoutRecords.map(convertWorkoutRecordToSession)

  const renderWorkout = ({ item: workout }: { item: WorkoutSession }) => (
    <WorkoutCard workout={workout} />
  )

  const ListHeaderComponent = () => (
    <YStack gap="$4">
      <WorkoutHistoryHeader workoutCount={workoutHistory.length} />
      <WorkoutStats workouts={workoutHistory} />
    </YStack>
  )

  const ListFooterComponent = () => (
    <View pt="$4" pb="$8">
      <Button fontSize="$4" variant="outlined" borderColor="$primary" color="$primary">
        <Text color="$primary">Load More Workouts</Text>
      </Button>
    </View>
  )

  if (loading && workoutHistory.length === 0) {
    return (
      <View flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$4" color="$color11">
          Loading workout history...
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View flex={1} bg="$background" p="$4">
        <ErrorDisplay title="Failed to load workout history" message={error} onRetry={refetch} />
      </View>
    )
  }

  return (
    <View flex={1} bg="$background" p="$4">
      <FlashList
        data={workoutHistory}
        renderItem={renderWorkout}
        keyExtractor={(item) => item.id}
        estimatedItemSize={120}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={ListHeaderComponent}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        ListFooterComponent={workoutHistory.length > 0 ? ListFooterComponent : undefined}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
        ListEmptyComponent={() => (
          <View flex={1} justify="center" items="center" pt="$8">
            <YStack gap="$2">
              <Text fontSize="$6" color="$color11">
                No workout history yet
              </Text>
              <Text fontSize="$4" color="$color10">
                Complete your first workout to see it here
              </Text>
            </YStack>
          </View>
        )}
      />
    </View>
  )
}
