import { useMemo, useRef, useState } from 'react'
import { YStack, Text, View, Button, XStack, Dialog } from 'tamagui'
import { Sheet } from '@tamagui/sheet'
import type { FlashListRef } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useWorkoutRecords, useWorkoutMutations } from '../../../features/workouts'
import { countSetsForRecord, computeVolumeForRecord } from '../../../utils/workoutUtils'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import type { ViewToken } from 'react-native'
import { Platform } from 'react-native'
import { AlertTriangle, Trash2 } from '@tamagui/lucide-icons'
import {
  HistoryCalendar,
  HistoryList,
  endOfWeek,
  generateCalendar,
  sameDay,
  startOfWeek,
  toISODate,
} from '../../../features/history'
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
  
  const { deleteWorkoutRecord, loading: deleting } = useWorkoutMutations()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const handleDeleteRecord = (item: any) => {
    // The id we pass to HistoryList is just `record.id` or fallback, but the API needs the `recordId` matching the DB. 
    // Wait, the item.id returned from `converted` is exactly `record.id`.
    setPendingDeleteId(item.id)
    setConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const ok = await deleteWorkoutRecord(pendingDeleteId)
    if (ok) await refetchFn()
    setConfirmOpen(false)
    setPendingDeleteId(null)
  }

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

  const DeleteConfirmContent = (
    <YStack gap="$3" items="center">
      <XStack items="center" gap="$2">
        <AlertTriangle size="$1" color="$secondary" />
        <Text fontSize="$6" fontWeight="700">
          Delete record
        </Text>
      </XStack>
      <Text color="$color10">Are you sure? This will permanently delete this workout record and all associated exercise sets.</Text>
      <YStack mt="$2" gap="$3" width="100%">
        <Button
          bg="$red4"
          color="$red11"
          size="$5"
          iconAfter={Trash2}
          disabled={deleting}
          onPress={confirmDelete}
        >
          {deleting ? 'Deleting…' : 'Delete record'}
        </Button>
        <Button bg="$blue4" color="$blue12" size="$5" onPress={() => setConfirmOpen(false)}>
          <Text>Cancel</Text>
        </Button>
      </YStack>
    </YStack>
  )

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
          onLongPressItem={handleDeleteRecord}
        />
      </YStack>

      {/* Use Dialog on web (Sheet has rendering issues), Sheet on native */}
      {Platform.OS === 'web' ? (
        <Dialog modal open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Dialog.Portal>
            <Dialog.Overlay
              key="overlay"
              animation="slow"
              opacity={0.5}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
            <Dialog.Content
              bordered
              elevate
              key="content"
              animation={['quick', { opacity: { overshootClamping: true } }]}
              enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
              exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
              bg="$surface"
              p="$4"
            >
              {DeleteConfirmContent}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ) : (
        <Sheet
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          modal
          dismissOnOverlayPress={!deleting}
          snapPointsMode="fit"
        >
          <Sheet.Overlay animation="slow" style={{ backgroundColor: 'transparent' }} />
          <Sheet.Handle bg="$surface" />
          <Sheet.Frame bg="$surface" borderTopLeftRadius="$6" borderTopRightRadius="$6" p="$4">
            {DeleteConfirmContent}
          </Sheet.Frame>
        </Sheet>
      )}
    </YStack>
  )
}
