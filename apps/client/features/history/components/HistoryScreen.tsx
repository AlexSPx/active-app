import { View } from 'react-native'
import { HistoryCalendar } from './HistoryCalendar'
import HistoryList, { type HistoryListItem } from './HistoryList'
import type { useHistoryController } from '../hooks/useHistoryController'

type ControllerState = ReturnType<typeof useHistoryController>

export function HistoryScreen({
  data,
  monthDate,
  filterDate,
  view,
  workoutDays,
  loading,
  error,
  refreshing,
  onRefresh,
  onRetry,
  onSelectDate,
  onNavigatePeriod,
  onViewChange,
  onShowAll,
  onOpenRecord,
}: ControllerState & { onOpenRecord: (item: HistoryListItem) => void }) {
  const calendarHeader = (
    <HistoryCalendar
      monthDate={monthDate}
      selectedDate={filterDate}
      view={view}
      workoutDays={workoutDays}
      onNavigatePeriod={onNavigatePeriod}
      onViewChange={onViewChange}
      onSelectDate={onSelectDate}
    />
  )

  return (
    <View className="flex-1 bg-background">
      <View className="w-full max-w-3xl flex-1 self-center">
        <HistoryList
          screenHeader={calendarHeader}
          data={data}
          filterDate={filterDate}
          loading={loading}
          error={error}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          onRetry={onRetry}
          onShowAll={onShowAll}
          onPressItem={onOpenRecord}
        />
      </View>
    </View>
  )
}
