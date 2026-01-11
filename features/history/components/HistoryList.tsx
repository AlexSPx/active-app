import { forwardRef } from 'react'
import { Button, Card, Separator, Text, View, XStack, YStack } from 'tamagui'
import { Timer as TimerIcon, Dumbbell, Trophy, BarChart2, History } from '@tamagui/lucide-icons'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FlashList } from '@shopify/flash-list'
import type { FlashListRef } from '@shopify/flash-list'
import { formatWeekRange, startOfWeek } from './date'

export type HistoryListItem = {
  id: string
  name: string
  date: Date
  duration: number
  totalSets: number
  totalVolume: number
  prOneRm?: boolean
  prVolume?: boolean
}

type Props = {
  data: HistoryListItem[]
  onViewableItemsChanged: any
  viewabilityConfig: any
  onPressItem?: (item: HistoryListItem) => void
  refreshing?: boolean
  onRefresh?: () => void
  listHeader?: React.ReactElement
}

const HistoryList = forwardRef<FlashListRef<any>, Props>(
  (
    {
      data,
      onViewableItemsChanged,
      viewabilityConfig,
      onPressItem,
      refreshing,
      onRefresh,
      listHeader,
    },
    ref
  ) => {
    if (data.length === 0) {
      return (
        <EmptyState
          title="No history yet"
          description="Complete your first workout to see it here."
          icon={History}
        />
      )
    }

    const formatDuration = (secs: number) => {
      const s = Math.max(0, Math.floor(secs || 0))
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const ss = s % 60
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      return `${m}:${String(ss).padStart(2, '0')}`
    }

    return (
      <FlashList
        ref={ref}
        data={data}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={listHeader}
        ItemSeparatorComponent={() => <View height={8} />}
        renderItem={({ item, index }) => {
          const isNewWeek =
            index > 0 &&
            startOfWeek(item.date).getTime() !== startOfWeek(data[index - 1].date).getTime()
          const showHeader = index === 0 || isNewWeek
          const finishHour = item.date.toLocaleTimeString([], { hour: 'numeric' })
          return (
            <YStack>
              {showHeader && (
                <XStack items="center" my="$2" gap="$2">
                  <Separator flex={1} />
                  <Text fontSize="$2" color="$color10">
                    {formatWeekRange(item.date)}
                  </Text>
                  <Separator flex={1} />
                </XStack>
              )}
              <XStack gap="$3">
                {/* Timeline column with finish hour and vertical line */}
                <YStack
                  width={56}
                  items="center"
                  position="relative"
                  style={{ alignSelf: 'stretch' }}
                >
                  <Text fontSize="$2" color="$color10" mb="$1">
                    {finishHour}
                  </Text>
                  <View position="absolute" t={18} b={-8} width={2} bg="$borderColor" />
                </YStack>
                <Button unstyled onPress={() => onPressItem?.(item)} flex={1}>
                  <Card
                    p="$3"
                    bg="$surface"
                    borderColor="$borderColor"
                    borderWidth="$0.5"
                    width="100%"
                  >
                    <YStack gap="$2">
                      <XStack justify="space-between" items="center">
                        <XStack gap="$2">
                          <Text fontSize="$5" fontWeight="700" color="$color">
                            {item.name}
                          </Text>
                          <XStack gap="$2" justify="flex-end">
                            {item.prOneRm && (
                              <XStack
                                width={24}
                                height={24}
                                bg="$primary"
                                rounded="$2"
                                items="center"
                                justify="center"
                              >
                                <Trophy size={14} color="$color" strokeWidth={2.5} />
                              </XStack>
                            )}
                            {item.prVolume && (
                              <XStack
                                width={24}
                                height={24}
                                bg="$primary"
                                rounded="$2"
                                items="center"
                                justify="center"
                              >
                                <BarChart2 size={14} color="$color" strokeWidth={2.5} />
                              </XStack>
                            )}
                          </XStack>
                        </XStack>
                      </XStack>
                      <XStack items="center">
                        <XStack flex={1} items="center" justify="center" gap="$1">
                          <TimerIcon size={14} color="$colorSubtle" />
                          <Text fontWeight="700" color="$color">
                            {formatDuration(item.duration)}
                          </Text>
                        </XStack>
                        <View width={1} height={18} bg="$borderColor" mx="$3" />
                        <XStack flex={1} items="center" justify="center" gap="$1">
                          <Dumbbell size={14} color="$colorSubtle" />
                          <Text fontWeight="700" color="$color">
                            {item.totalVolume.toLocaleString()}
                          </Text>
                          <Text color="$colorSubtle">kg</Text>
                        </XStack>
                        <View width={1} height={18} bg="$borderColor" mx="$3" />
                        <XStack flex={1} items="center" justify="center" gap="$1">
                          <Text fontWeight="700" color="$color">
                            {item.totalSets}
                          </Text>
                          <Text color="$colorSubtle">sets</Text>
                        </XStack>
                      </XStack>
                    </YStack>
                  </Card>
                </Button>
              </XStack>
            </YStack>
          )
        }}
      />
    )
  }
)

export default HistoryList
