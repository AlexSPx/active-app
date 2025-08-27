import { useMemo, useRef, useState } from 'react'
import { YStack, Text, View } from 'tamagui'
import type { FlashListRef } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useWorkoutRecords } from '../../../hooks/useWorkoutRecords'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import type { WorkoutRecord } from '../../../types/api'
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
      const totalSets = record.exerciseRecords.reduce((total, ex) => total + ex.reps.length, 0)
      const totalVolume = record.exerciseRecords.reduce((total, ex) => {
        return total + ex.reps.reduce((acc, reps, i) => acc + reps * (ex.weight[i] || 0), 0)
      }, 0)

      // duration seconds based on LocalDateTime difference if startTime provided
      let durationSeconds = 0
      try {
        if (record.startTime) {
          // Parse startTime as local date-time (no timezone)
          const [dPart, tPart] = record.startTime.split('T')
          const [y, m, d] = dPart.split('-').map((v) => parseInt(v, 10))
          const [hhRaw, mmRaw, ssMsRaw] = tPart.split(':')
          const hh = parseInt(hhRaw, 10) || 0
          const mm = parseInt(mmRaw, 10) || 0
          const [ssRaw, msRaw] = (ssMsRaw || '0').split('.')
          const ss = parseInt(ssRaw, 10) || 0
          const ms = parseInt(msRaw || '0', 10) || 0
          const start = new Date(y, (m || 1) - 1, d || 1, hh, mm, ss, ms)

          // createdAt may be UTC without timezone or local; try both
          const hasTz = /Z$/i.test(record.createdAt) || /[+-]\d{2}:?\d{2}$/.test(record.createdAt)
          const createdUtc = new Date(hasTz ? record.createdAt : `${record.createdAt}Z`)

          // Also try parsing as local if no timezone provided
          let createdLocal = createdUtc
          if (!hasTz) {
            const [cd, ct] = record.createdAt.split('T')
            const [cy, cm, cdn] = cd.split('-').map((v) => parseInt(v, 10))
            const [chhRaw, cmmRaw, cssMsRaw] = ct.split(':')
            const chh = parseInt(chhRaw, 10) || 0
            const cmm = parseInt(cmmRaw, 10) || 0
            const [cssRaw, cmsRaw] = (cssMsRaw || '0').split('.')
            const css = parseInt(cssRaw, 10) || 0
            const cms = parseInt(cmsRaw || '0', 10) || 0
            createdLocal = new Date(cy, (cm || 1) - 1, cdn || 1, chh, cmm, css, cms)
          }

          const diffs = [
            createdUtc.getTime() - start.getTime(),
            createdLocal.getTime() - start.getTime(),
          ]
          const positives = diffs.filter((d) => d >= 0)
          const chosen = positives.length > 0 ? Math.min(...positives) : Math.max(...diffs)
          durationSeconds = Math.max(0, Math.floor(chosen / 1000))
        }
      } catch {}
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
        date: new Date(record.createdAt),
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
        <HistoryList
          ref={listRef}
          data={allWorkoutsSorted}
          onViewableItemsChanged={onViewableItemsChangedRef.current}
          viewabilityConfig={viewabilityConfigRef.current}
          refreshing={refreshing}
          onRefresh={onRefresh}
          listHeader={
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
          }
          onPressItem={(item) =>
            router.push({ pathname: '/(tabs)/(history)/record/[id]', params: { id: item.id } })
          }
        />
      </YStack>
    </YStack>
  )
}
