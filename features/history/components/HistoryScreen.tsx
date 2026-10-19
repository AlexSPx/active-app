import { View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
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
  onToday,
  onShowAll,
  onOpenRecord,
}: ControllerState & { onOpenRecord: (item: HistoryListItem) => void }) {
  const calendarHeader = (
    <View className="gap-field">
      <View className="flex-row items-center justify-between gap-field px-page py-compact">
        <UiText textRole="bodyMuted" className="min-w-0 flex-1">
          Every session adds up.
        </UiText>
        <Button
          variant="ghost"
          density="compact"
          accessibilityLabel="Go to today"
          onPress={onToday}
        >
          Today
        </Button>
      </View>
      <HistoryCalendar
        monthDate={monthDate}
        selectedDate={filterDate}
        view={view}
        workoutDays={workoutDays}
        onNavigatePeriod={onNavigatePeriod}
        onViewChange={onViewChange}
        onSelectDate={onSelectDate}
      />
    </View>
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
