import { useMemo, useRef, useState } from 'react'
import { YStack, Text, View } from 'tamagui'
import type { FlashListRef } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useWorkoutRecords } from '../../../features/workouts'
import { countSetsForRecord, computeVolumeForRecord } from '../../../utils/workoutUtils'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import type { ViewToken } from 'react-native'
import {
  HistoryCalendar,
  HistoryList,
  endOfWeek,
  generateCalendar,
  sameDay,
  startOfWeek,
  toISODate,
} from '../../../components/history'
import { parseServerUtcDate } from '../../../utils/date'

// Conversion performed inside component to include workout titles

export default function HistoryPage() {
  const router = useRouter()
  const {
    workoutRecords: records,
    loading: loadingState,
    error: errorState,
    refetch: refetchFn,
  } = useWorkoutRecords()
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = async () => {
    try {
      setRefreshing(true)
      await refetchFn()
    } finally {
      setRefreshing(false)
    }
  }

  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [monthDate, setMonthDate] = useState<Date>(new Date())
  const [collapsed, setCollapsed] = useState<boolean>(true)

  const calendarDays = useMemo(
    () => generateCalendar(monthDate, selectedDate),
    [monthDate, selectedDate]
  )
  const selectedWeekIndex = useMemo(() => {
    const idx = calendarDays.findIndex((d) => sameDay(d.date, selectedDate))
    return idx >= 0 ? Math.floor(idx / 7) : 0
  }, [calendarDays, selectedDate])

  const converted = useMemo(() => {
    return records.map((record) => {
      const totalSets = countSetsForRecord(record)
      const totalVolume = computeVolumeForRecord(record)

      // createdAt and startTime come from server as UTC(+00:00); parse as UTC and
      // convert to local Date for display. For duration, use the timestamp delta.
      const createdAtDate = parseServerUtcDate(record.createdAt)
      const startDate = record.startTime ? parseServerUtcDate(record.startTime) : undefined
      const durationSeconds = startDate
        ? Math.max(0, Math.floor((createdAtDate.getTime() - startDate.getTime()) / 1000))
        : 0
      // PR flags: 1RM and/or Total Volume
      const prOneRm = record.exerciseRecords.some(
        (ex) => !!ex.achievedOneRmValue && ex.achievedOneRmValue > 0
      )
      const prVolume = record.exerciseRecords.some(
        (ex) => !!ex.achievedTotalVolumeValue && ex.achievedTotalVolumeValue > 0
      )

      return {
        id: record.id || `${record.workoutId}-${record.createdAt}`,
        name: record.workoutTitle,
        date: createdAtDate,
        duration: durationSeconds || 0,
        totalSets,
        totalVolume,
        prOneRm,
        prVolume,
      }
    })
  }, [records])
  const allWorkoutsSorted = useMemo(
    () => converted.slice().sort((a, b) => b.date.getTime() - a.date.getTime()),
    [converted]
  )
  // Fast lookup for days that have at least one workout
  const workoutDays = useMemo(() => {
    const set = new Set<string>()
    for (const w of converted) set.add(toISODate(w.date))
    return set
  }, [converted])

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const weekEnd = useMemo(() => endOfWeek(selectedDate), [selectedDate])

  // Note: we no longer filter the list to the week; we render all and use headers per week

  // Sync calendar selection with the list scroll (use top-most visible item)
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 50 })
  const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable && v.item)
    const item = first?.item as { date?: Date } | undefined
    if (item?.date instanceof Date) {
      const d = item.date
      setSelectedDate(d)
      setMonthDate(new Date(d))
    }
  })

  // Scroll to the week of a tapped day
  const listRef = useRef<FlashListRef<any> | null>(null)
  const scrollToWeek = (date: Date) => {
    const s = startOfWeek(date)
    const e = endOfWeek(date)
    const index = allWorkoutsSorted.findIndex((w) => w.date >= s && w.date <= e)
    if (index >= 0) {
      try {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 })
      } catch (e) {
        // ignore if not yet measured
      }
    }
  }

  if (loadingState) {
    return (
      <View flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$4" color="$color11">
          Loading history…
        </Text>
      </View>
    )
  }

  if (errorState) {
    return (
      <View flex={1} bg="$background" p="$4">
        <ErrorDisplay title="Failed to load history" message={errorState} onRetry={refetchFn} />
      </View>
    )
  }

  return (
    <YStack flex={1} bg="$background">
      <YStack flex={1} px="$4" pt="$0">
        {/* Calendar pinned at the top (outside the list) */}
        <HistoryCalendar
          monthDate={monthDate}
          selectedDate={selectedDate}
          collapsed={collapsed}
          onMonthChange={setMonthDate}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          onSelectDate={setSelectedDate}
          workoutDays={workoutDays}
          weekStart={weekStart}
          weekEnd={weekEnd}
          selectedWeekIndex={selectedWeekIndex}
          scrollToWeek={scrollToWeek}
        />

        <HistoryList
          ref={listRef}
          data={allWorkoutsSorted}
          onViewableItemsChanged={onViewableItemsChangedRef.current}
          viewabilityConfig={viewabilityConfigRef.current}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPressItem={(item) =>
            router.push({ pathname: '/(tabs)/(history)/record/[id]', params: { id: item.id } })
          }
        />
      </YStack>
    </YStack>
  )
}
