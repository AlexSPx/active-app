import { useCallback, useMemo, useState } from 'react'
import { launchFacade } from '../../launch/launchFacade'
import { useWorkoutRecords } from '../../workouts'
import { countSetsForRecord, computeVolumeForRecord } from '../../../utils/workoutUtils'
import { parseServerUtcDate, toISODate } from '../../../utils/date'
import type { HistoryListItem } from '../components/HistoryList'
import type { HistoryCalendarView } from '../components/HistoryCalendar'

export function useHistoryController() {
  const { workoutRecords, loading, error, refetch } = useWorkoutRecords()
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [filterDate, setFilterDate] = useState<Date | null>(null)
  const [view, setView] = useState<HistoryCalendarView>('month')
  const [refreshing, setRefreshing] = useState(false)

  const allRecords = useMemo(
    () =>
      workoutRecords
        .map((record): HistoryListItem => {
          const date = parseServerUtcDate(record.createdAt)
          const start = record.startTime ? parseServerUtcDate(record.startTime) : undefined
          const totalSets = countSetsForRecord(record)
          const strengthSets = record.exerciseRecords.reduce(
            (sum, exercise) => sum + (exercise.reps?.length || 0),
            0
          )
          const achievements = launchFacade.training.getWorkoutAchievements(record)
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
            exerciseNames: record.exerciseRecords.map((exercise) => exercise.exerciseName),
            prOneRm: achievements.some((achievement) => achievement.type === '1RM'),
            prVolume: achievements.some((achievement) => achievement.type === 'VOLUME'),
          }
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [workoutRecords]
  )

  const data = useMemo(
    () =>
      filterDate
        ? allRecords.filter((item) => toISODate(item.date) === toISODate(filterDate))
        : allRecords,
    [allRecords, filterDate]
  )
  const workoutDays = useMemo(
    () => new Set(allRecords.map((item) => toISODate(item.date))),
    [allRecords]
  )

  const onSelectDate = useCallback((date: Date) => {
    setSelectedDate(date)
    setMonthDate(date)
    setFilterDate(date)
  }, [])

  const onNavigatePeriod = useCallback(
    (offset: -1 | 1) => {
      const date =
        view === 'week'
          ? new Date(selectedDate)
          : new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1)
      if (view === 'week') date.setDate(date.getDate() + offset * 7)
      setSelectedDate(date)
      setMonthDate(date)
      setFilterDate(null)
    },
    [monthDate, selectedDate, view]
  )

  const onToday = useCallback(() => {
    const today = new Date()
    setSelectedDate(today)
    setMonthDate(today)
    setFilterDate(today)
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  return {
    data,
    monthDate,
    filterDate,
    view,
    workoutDays,
    loading,
    error,
    refreshing,
    onRefresh,
    onRetry: refetch,
    onSelectDate,
    onNavigatePeriod,
    onViewChange: setView,
    onToday,
    onShowAll: () => setFilterDate(null),
  }
}
