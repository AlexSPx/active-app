import { forwardRef } from 'react'
import { Button, Card, Text, View, XStack, YStack } from 'tamagui'
import { ArrowRight } from '@tamagui/lucide-icons'
import { FlashList } from '@shopify/flash-list'
import type { FlashListRef } from '@shopify/flash-list'
import { formatWeekRange, startOfWeek } from './date'
import { formatSeconds } from '../../../utils/workoutUtils'

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
  data: HistoryListItem[]
  onCreateWorkout: () => void
  onPressItem: (item: HistoryListItem) => void
  refreshing?: boolean
  onRefresh?: () => void
}

const HistoryList = forwardRef<FlashListRef<HistoryListItem>, Props>(
  ({ data, onCreateWorkout, onPressItem, refreshing, onRefresh }, ref) => (
    <FlashList
      ref={ref}
      data={data}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListHeaderComponent={
        <YStack pt="$section" gap="$compact">
          <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600" color="$color">
            Your history
          </Text>
          <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            {data.length} completed {data.length === 1 ? 'session' : 'sessions'}
          </Text>
        </YStack>
      }
      ListEmptyComponent={
        <YStack py="$section" gap="$field">
          <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600" color="$color">
            No history yet
          </Text>
          <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
            Complete your first workout to see your recorded sets here.
          </Text>
          <Button
            unstyled
            minH="$action"
            bg="$primary"
            rounded="$button"
            items="center"
            justify="center"
            onPress={onCreateWorkout}
          >
            <Text fontSize="$body" lineHeight="$body" fontWeight="600" color="$onPrimary">
              Choose a workout
            </Text>
          </Button>
        </YStack>
      }
      ListFooterComponent={<View py="$field" />}
      ItemSeparatorComponent={() => <View py="$2" />}
      renderItem={({ item, index }) => {
        const showHeader =
          index === 0 ||
          startOfWeek(item.date).getTime() !== startOfWeek(data[index - 1].date).getTime()
        return (
          <YStack>
            {showHeader && (
              <Text
                mt="$section"
                mb="$field"
                fontSize="$caption"
                lineHeight="$caption"
                fontWeight="600"
                color="$colorSubtle"
              >
                {formatWeekRange(item.date)}
              </Text>
            )}
            <Card
              p="$card"
              rounded="$card"
              bg="$surface"
              borderWidth="$0.5"
              borderColor="$borderColor"
              gap="$compact"
              accessible
              accessibilityRole="button"
              accessibilityLabel={`View ${item.name}, ${item.date.toLocaleDateString()}`}
              onPress={() => onPressItem(item)}
              pressStyle={{ bg: '$surfacePress' }}
            >
              <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                {item.date.toLocaleDateString([], {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                · {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <XStack gap="$field" minH="$touch" items="flex-start">
                <Text
                  flex={1}
                  fontSize="$cardTitle"
                  lineHeight="$cardTitle"
                  fontWeight="600"
                  color="$color"
                >
                  {item.name}
                </Text>
                <ArrowRight size="$iconSmall" color="$primary" />
              </XStack>
              <XStack flexWrap="wrap" gap="$field" mt="$compact">
                <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                  {formatSeconds(item.duration)}
                </Text>
                {item.strengthSets > 0 && (
                  <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                    {item.strengthSets} sets
                  </Text>
                )}
                {item.intervals > 0 && (
                  <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                    {item.intervals} intervals
                  </Text>
                )}
                {item.strengthSets > 0 && (
                  <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                    {item.totalVolume.toLocaleString()} kg volume
                  </Text>
                )}
              </XStack>
              <Text mt="$compact" fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                {item.exerciseNames.join(' · ')}
              </Text>
              {(item.prOneRm || item.prVolume) && (
                <Text
                  self="flex-start"
                  mt="$compact"
                  px="$2"
                  py="$compact"
                  rounded="$badge"
                  bg="$backgroundAccent"
                  color="$primary"
                  fontSize="$caption"
                  lineHeight="$caption"
                  fontWeight="600"
                >
                  Personal record
                </Text>
              )}
            </Card>
          </YStack>
        )
      }}
    />
  )
)

export default HistoryList
