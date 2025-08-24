import { useLocalSearchParams } from 'expo-router'
import { ScrollView } from 'react-native'
import { Text, YStack, XStack, Separator, View } from 'tamagui'
import { Calendar as CalendarIcon, Timer as TimerIcon, Dumbbell } from '@tamagui/lucide-icons'
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
  const totalSets = record.exerciseRecords.reduce((total, ex) => total + ex.reps.length, 0)
  const totalVolume = record.exerciseRecords.reduce((total, ex) => {
    return total + ex.reps.reduce((acc, reps, i) => acc + reps * (ex.weight[i] || 0), 0)
  }, 0)
  const totalDurationSeconds = record.exerciseRecords.reduce((sum, ex) => {
    const ds = ex.durationSeconds?.reduce((a, b) => a + (b || 0), 0) ?? 0
    return sum + ds
  }, 0)
  const formatDuration = (secs: number) => {
    if (!secs || secs <= 0) return null
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }
  const durationLabel = formatDuration(totalDurationSeconds) ?? '—'

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12 }}>
      <YStack px="$4" gap="$3">
        {/* Header Title */}
        <YStack gap="$1">
          <Text fontSize="$7" fontWeight="700" color="$color">
            {workoutTitle || record.notes || 'Workout Session'}
          </Text>
          <XStack items="center" gap="$2">
            <CalendarIcon size={16} color="$colorSubtle" />
            <Text color="$colorSubtle">
              {date.toLocaleDateString([], { month: 'long', day: '2-digit', year: 'numeric' })}{' '}
              {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </XStack>
          {record.notes && workoutTitle ? (
            <Text color="$color10" numberOfLines={2}>
              {record.notes}
            </Text>
          ) : null}
        </YStack>

        {/* Stats Row */}
        <XStack gap="$4" py="$2">
          <XStack flex={1} items="center" gap="$2">
            <TimerIcon size={16} color="$colorSubtle" />
            <Text color="$colorSubtle">{durationLabel} Duration</Text>
          </XStack>
          <XStack flex={1} items="center" gap="$2">
            <Dumbbell size={16} color="$colorSubtle" />
            <Text color="$colorSubtle">{totalVolume.toLocaleString()} kg</Text>
          </XStack>
          <XStack flex={1} items="center" justify="flex-end">
            <Text color="$colorSubtle">{totalSets} sets</Text>
          </XStack>
        </XStack>

        <Separator />

        {/* Exercises List */}
        <YStack>
          {record.exerciseRecords.map((ex, idx) => (
            <YStack key={`${ex.exerciseName}-${idx}`} py="$3">
              <Text fontSize="$5" fontWeight="700" color="$color" mb="$2">
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
              {ex.notes ? (
                <Text mt="$2" color="$color10">
                  Notes: {ex.notes}
                </Text>
              ) : null}
              {idx < record.exerciseRecords.length - 1 ? <Separator mt="$3" /> : null}
            </YStack>
          ))}
        </YStack>
      </YStack>
    </ScrollView>
  )
}
