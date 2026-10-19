import { FlashList } from '@shopify/flash-list'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { useTabContentInset } from '../../../navigation/TabContentInset'
import { Button, UiBadge, UiText } from '../../../components/ui/Controls'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ChevronRight } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { formatSeconds } from '../../../utils/workoutUtils'
import { formatWeekRange, startOfWeek } from './date'

export type HistoryListItem = {
  id: string
  name: string
  date: Date
  duration: number
  totalSets: number
  totalVolume: number
  strengthSets: number
  intervals: number
  exerciseNames: string[]
  prOneRm?: boolean
  prVolume?: boolean
}

type Props = {
  screenHeader: ReactNode
  data: HistoryListItem[]
  filterDate: Date | null
  loading: boolean
  error: string | null
  refreshing: boolean
  onRefresh: () => void
  onRetry: () => Promise<void>
  onShowAll: () => void
  onPressItem: (item: HistoryListItem) => void
}

function ErrorMessage({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) {
  return (
    <View className="gap-compact rounded-control border border-divider bg-raised p-field">
      <UiText accessibilityRole="alert" textRole="bodyMuted">
        Could not load history: {error}
      </UiText>
      <Button
        variant="secondary"
        accessibilityLabel="Try again"
        onPress={() => void onRetry()}
        className="self-start"
      >
        Try again
      </Button>
    </View>
  )
}

function HistoryRecordCard({ item, onPress }: { item: HistoryListItem; onPress: () => void }) {
  const colors = useCadenceColors()
  const dateLabel = item.date.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const timeLabel = item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const metrics = [
    `${formatSeconds(item.duration)} elapsed`,
    ...(item.strengthSets > 0
      ? [`${item.strengthSets} ${item.strengthSets === 1 ? 'set' : 'sets'}`]
      : []),
    ...(item.intervals > 0
      ? [`${item.intervals} ${item.intervals === 1 ? 'interval' : 'intervals'}`]
      : []),
    ...(item.strengthSets > 0 ? [`${item.totalVolume.toLocaleString()} kg volume`] : []),
  ]

  return (
    <Pressable
      className="min-h-touch flex-row items-center gap-field rounded-card border border-divider bg-surface px-card py-compact active:bg-raised"
      accessibilityRole="button"
      accessibilityLabel={`View ${item.name}, ${dateLabel} at ${timeLabel}`}
      onPress={onPress}
    >
      <View className="min-w-14 items-center justify-center rounded-control bg-raised px-compact py-compact">
        <UiText textRole="meta">{item.date.toLocaleDateString([], { month: 'short' })}</UiText>
        <UiText textRole="bodyEmphasis">{item.date.getDate()}</UiText>
      </View>
      <View className="min-w-0 flex-1 gap-compact">
        <UiText textRole="bodyEmphasis">{item.name}</UiText>
        <UiText textRole="meta">{timeLabel}</UiText>
        <UiText textRole="caption">{metrics.join(' · ')}</UiText>
        {!!item.exerciseNames.length && (
          <UiText textRole="caption">{item.exerciseNames.join(' · ')}</UiText>
        )}
        {(item.prOneRm || item.prVolume) && <UiBadge variant="pill">Personal record</UiBadge>}
      </View>
      <ChevronRight size={16} color={colors.accent} />
    </Pressable>
  )
}

export default function HistoryList({
  screenHeader,
  data,
  filterDate,
  loading,
  error,
  refreshing,
  onRefresh,
  onRetry,
  onShowAll,
  onPressItem,
}: Props) {
  const bottomInset = useTabContentInset()
  const dateTitle = filterDate?.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const listHeader = (
    <View className="w-full max-w-3xl self-center gap-field">
      {screenHeader}
      <View className="gap-field px-page pb-field pt-section">
        <View className="flex-row items-start justify-between gap-field">
          <View className="min-w-0 flex-1 gap-compact">
            <UiText textRole="bodyEmphasis" accessibilityRole="header">
              {dateTitle ?? 'Your sessions'}
            </UiText>
            <UiText textRole="meta">
              {data.length} completed {data.length === 1 ? 'session' : 'sessions'}
            </UiText>
          </View>
          {filterDate && (
            <Button
              variant="ghost"
              density="compact"
              accessibilityLabel="Show all sessions"
              onPress={onShowAll}
            >
              Show all
            </Button>
          )}
        </View>
        {!!error && data.length > 0 && <ErrorMessage error={error} onRetry={onRetry} />}
      </View>
    </View>
  )

  let emptyState: ReactNode
  if (error) {
    emptyState = (
      <View className="flex-1 items-start justify-center gap-field py-section">
        <UiText textRole="cardTitle" accessibilityRole="header">
          History is unavailable
        </UiText>
        <ErrorMessage error={error} onRetry={onRetry} />
      </View>
    )
  } else if (loading) {
    emptyState = (
      <View className="flex-1 items-center justify-center gap-field py-section">
        <LoadingSpinner />
        <UiText textRole="bodyMuted">Loading history…</UiText>
      </View>
    )
  } else if (filterDate) {
    emptyState = (
      <View className="flex-1 items-start justify-center gap-field py-section">
        <UiText textRole="cardTitle" accessibilityRole="header">
          No sessions on this day
        </UiText>
        <UiText textRole="bodyMuted">Choose another date or show your full history.</UiText>
        <Button variant="secondary" accessibilityLabel="Show all days" onPress={onShowAll}>
          Show all days
        </Button>
      </View>
    )
  } else {
    emptyState = (
      <View className="flex-1 items-start justify-center gap-field py-section">
        <UiText textRole="cardTitle" accessibilityRole="header">
          No records yet
        </UiText>
        <UiText textRole="bodyMuted">Complete a session to see it in your history.</UiText>
      </View>
    )
  }

  return (
    <FlashList
      data={data}
      renderItem={({ item, index }) => {
        const showWeek =
          index === 0 ||
          startOfWeek(item.date).getTime() !== startOfWeek(data[index - 1].date).getTime()
        return (
          <View>
            {showWeek && (
              <UiText
                textRole="captionEmphasis"
                accessibilityRole="header"
                className="mx-page mb-field mt-section"
              >
                {formatWeekRange(item.date)}
              </UiText>
            )}
            <View className="px-page">
              <HistoryRecordCard item={item} onPress={() => onPressItem(item)} />
            </View>
          </View>
        )
      }}
      keyExtractor={(item) => item.id}
      style={{ flex: 1 }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 0,
        paddingBottom: bottomInset,
        flexGrow: data.length === 0 ? 1 : undefined,
      }}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={<View className="flex-1 px-page">{emptyState}</View>}
      ItemSeparatorComponent={() => <View className="h-compact" />}
      ListFooterComponent={data.length > 0 ? <View className="h-field" /> : null}
      refreshing={refreshing}
      onRefresh={onRefresh}
      showsVerticalScrollIndicator={false}
    />
  )
}
