import { useLocalSearchParams, Stack } from 'expo-router'
import { ScrollView } from 'react-native'
import { Text, YStack, XStack, Separator, Card, View, Button } from 'tamagui'
import { useMemo } from 'react'
import { useWorkoutRecords } from '../../../../hooks/useWorkoutRecords'
import { useWorkouts } from '../../../../hooks/useWorkouts'
import { LoadingSpinner } from '../../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../../components/ui/ErrorDisplay'

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const {
    workoutRecords,
    loading: recordsLoading,
    error: recordsError,
    refetch: refetchRecords,
  } = useWorkoutRecords()
  const {
    workouts,
    loading: workoutsLoading,
    error: workoutsError,
    refetch: refetchWorkouts,
  } = useWorkouts()

  const record = useMemo(
    () => workoutRecords.find((r) => (r.id ?? `${r.workoutId}-${r.createdAt}`) === id),
    [workoutRecords, id]
  )

  const loading = recordsLoading || workoutsLoading
  const error = recordsError || workoutsError
  const refetch = async () => {
    await Promise.all([refetchRecords(), refetchWorkouts()])
  }

  // Compute title unconditionally to keep hooks order stable across renders
  const workoutTitle = useMemo(() => {
    if (!record) return undefined
    const w = workouts.find((w) => w.id === record.workoutId)
    return w?.title
  }, [workouts, record?.workoutId])

  if (loading) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$4" color="$color11">
          Loading record…
        </Text>
      </YStack>
    )
  }

  if (error) {
    return (
      <View flex={1} bg="$background" p="$4">
        <ErrorDisplay title="Failed to load record" message={error} onRetry={refetch} />
      </View>
    )
  }

  if (!record) {
    return (
      <YStack flex={1} items="center" justify="center" bg="$background" p="$4" gap="$2">
        <Text color="$color11" fontSize="$6" fontWeight="700">
          Record not found
        </Text>
        <Text color="$color10">It may have been deleted or not yet synced.</Text>
      </YStack>
    )
  }

  const date = new Date(record.createdAt)

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <YStack gap="$3">
        <Card p="$3" bg="$surface" borderColor="$borderColor" borderWidth="$0.5">
          <YStack gap="$2">
            <Text fontSize="$6" fontWeight="700" color="$color">
              {workoutTitle || record.notes || 'Workout Session'}
            </Text>
            <Text color="$colorSubtle">
              {date.toLocaleDateString([], { month: 'long', day: '2-digit', year: 'numeric' })}{' '}
              {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </YStack>
        </Card>

        <YStack gap="$2">
          {record.exerciseRecords.map((ex, idx) => (
            <Card
              key={`${ex.exerciseName}-${idx}`}
              p="$3"
              bg="$surface"
              borderColor="$borderColor"
              borderWidth="$0.5"
            >
              <YStack gap="$2">
                <Text fontSize="$5" fontWeight="700" color="$color">
                  {ex.exerciseName}
                </Text>
                <YStack gap="$1">
                  {ex.reps.map((r, i) => (
                    <XStack key={i} justify="space-between">
                      <Text color="$colorSubtle">Set {i + 1}</Text>
                      <Text color="$color">
                        {r} reps @ {(ex.weight[i] ?? 0).toLocaleString()} kg
                      </Text>
                    </XStack>
                  ))}
                </YStack>
                {ex.notes ? <Text color="$color10">Notes: {ex.notes}</Text> : null}
              </YStack>
            </Card>
          ))}
        </YStack>
      </YStack>
    </ScrollView>
  )
}
