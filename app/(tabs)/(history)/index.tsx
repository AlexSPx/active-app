import { useMemo, useRef, useState } from 'react'
import { YStack, Text, View, Button } from 'tamagui'
import type { FlashListRef } from '@shopify/flash-list'
import { Stack, useRouter } from 'expo-router'
import { useWorkoutRecords } from '../../../features/workouts'
import { countSetsForRecord, computeVolumeForRecord } from '../../../utils/workoutUtils'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import {
  HistoryCalendar,
  HistoryList,
  HistoryListItem,
  endOfWeek,
  startOfWeek,
  toISODate,
} from '../../../features/history'
import { parseServerUtcDate } from '../../../utils/date'

export default function HistoryPage() {
  const router = useRouter()
  const { workoutRecords: records, loading, error, refetch } = useWorkoutRecords()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [monthDate, setMonthDate] = useState(new Date())
  const [collapsed, setCollapsed] = useState(true)
  const [calendarMessage, setCalendarMessage] = useState('')
  const listRef = useRef<FlashListRef<HistoryListItem> | null>(null)

  const data = useMemo(
    () =>
      records
        .map((record) => {
          const date = parseServerUtcDate(record.createdAt)
          const start = record.startTime ? parseServerUtcDate(record.startTime) : undefined
          const totalSets = countSetsForRecord(record)
          const strengthSets = record.exerciseRecords.reduce(
            (sum, ex) => sum + (ex.reps?.length || 0),
            0
          )
          return {
            id: record.id || `${record.workoutId}-${record.createdAt}`,
            name: record.workoutTitle,
            date,
            duration: start
              ? Math.max(0, Math.floor((date.getTime() - start.getTime()) / 1000))
              : 0,
            totalSets,
            strengthSets,
            intervals: totalSets - strengthSets,
            totalVolume: computeVolumeForRecord(record),
            exerciseNames: record.exerciseRecords.map((ex) => ex.exerciseName),
            prOneRm: record.exerciseRecords.some((ex) => (ex.achievedOneRmValue ?? 0) > 0),
            prVolume: record.exerciseRecords.some((ex) => (ex.achievedTotalVolumeValue ?? 0) > 0),
          }
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [records]
  )
  const workoutDays = useMemo(() => new Set(data.map((item) => toISODate(item.date))), [data])

  const selectDate = (date: Date) => {
    setSelectedDate(date)
    setMonthDate(date)
    const start = startOfWeek(date)
    const end = endOfWeek(date)
    const index = data.findIndex((item) => item.date >= start && item.date <= end)
    setCalendarMessage(index < 0 && data.length > 0 ? 'No recorded sessions for this week.' : '')
    if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 })
  }
  const refresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <YStack flex={1} bg="$background" px="$page" width="100%" maxW="$content" self="center">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              unstyled
              minH="$touch"
              px="$field"
              rounded="$day"
              items="center"
              justify="center"
              onPress={() => selectDate(new Date())}
            >
              <Text fontSize="$caption" lineHeight="$caption" color="$primary" fontWeight="600">
                Today
              </Text>
            </Button>
          ),
        }}
      />
      {loading ? (
        <YStack flex={1} items="center" justify="center" gap="$field">
          <LoadingSpinner />
          <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
            Loading history…
          </Text>
        </YStack>
      ) : error ? (
        <View py="$section">
          <ErrorDisplay title="Failed to load history" message={error} onRetry={refetch} />
        </View>
      ) : (
        <>
          <HistoryCalendar
            monthDate={monthDate}
            selectedDate={selectedDate}
            collapsed={collapsed}
            onMonthChange={setMonthDate}
            onToggleCollapsed={() => setCollapsed((value) => !value)}
            onSelectDate={selectDate}
            workoutDays={workoutDays}
          />
          {!!calendarMessage && (
            <Text
              accessibilityRole="text"
              fontSize="$caption"
              lineHeight="$caption"
              color="$colorSubtle"
              mt="$compact"
            >
              {calendarMessage}
            </Text>
          )}
          <HistoryList
            ref={listRef}
            data={data}
            onCreateWorkout={() => router.push('/workouts')}
            refreshing={refreshing}
            onRefresh={refresh}
            onPressItem={(item) =>
              router.push({ pathname: '/(tabs)/(history)/record/[id]', params: { id: item.id } })
            }
          />
        </>
      )}
    </YStack>
  )
}
