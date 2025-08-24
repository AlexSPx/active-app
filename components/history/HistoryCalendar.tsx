import { Button, Text, View, XStack, YStack } from 'tamagui'
import { ChevronLeft, ChevronRight } from '@tamagui/lucide-icons'
import {
  addMonths,
  DayCell,
  endOfWeek,
  formatMonthYear,
  generateCalendar,
  sameDay,
  startOfWeek,
  toISODate,
} from './date'

type Props = {
  monthDate: Date
  selectedDate: Date
  collapsed: boolean
  onMonthChange: (d: Date) => void
  onToggleCollapsed: () => void
  onSelectDate: (d: Date) => void
  workoutDays: Set<string>
  weekStart: Date
  weekEnd: Date
  selectedWeekIndex: number
  scrollToWeek: (d: Date) => void
}

export function HistoryCalendar({
  monthDate,
  selectedDate,
  collapsed,
  onMonthChange,
  onToggleCollapsed,
  onSelectDate,
  workoutDays,
  weekStart,
  weekEnd,
  selectedWeekIndex,
  scrollToWeek,
}: Props) {
  const calendarDays: DayCell[] = generateCalendar(monthDate, selectedDate)

  return (
    <YStack px="$4" mb="$1" pt="$4" pb="$2" boxShadow="$md" gap="$1">
      <XStack justify="space-between" items="center">
        <Button unstyled onPress={() => onMonthChange(addMonths(monthDate, -1))}>
          <ChevronLeft color="$color" />
        </Button>
        <Text fontSize="$4" fontWeight="700" color="$color">
          {formatMonthYear(monthDate)}
        </Text>
        <XStack items="center" gap="$2">
          <Button unstyled onPress={() => onMonthChange(addMonths(monthDate, 1))}>
            <ChevronRight color="$color" />
          </Button>
          <Button size="$2" variant="outlined" onPress={onToggleCollapsed}>
            <Text fontSize="$2">{collapsed ? 'Week' : 'Month'}</Text>
          </Button>
        </XStack>
      </XStack>
      <XStack justify="space-between" px="$1" gap="$0.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <XStack key={`${i}-${d}`} flex={1} items="center" justify="center">
            <Text fontSize="$2" color="$colorSubtle">
              {d}
            </Text>
          </XStack>
        ))}
      </XStack>
      <YStack gap="$1">
        {(collapsed
          ? [selectedWeekIndex]
          : Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, i) => i)
        ).map((rowIdx) => {
          const rowDays = calendarDays.slice(rowIdx * 7, rowIdx * 7 + 7)
          const rowStart = rowDays[0]?.date
          const isSelectedWeek = rowStart >= weekStart && rowStart <= weekEnd
          return (
            <XStack
              key={rowIdx}
              justify="space-between"
              position="relative"
              rounded="$4"
              px="$0.5"
              py="$0.5"
              gap="$0.5"
            >
              {isSelectedWeek && (
                <View
                  position="absolute"
                  t={0}
                  l={0}
                  r={0}
                  b={0}
                  bg="$primary"
                  opacity={0.35}
                  rounded="$4"
                  pointerEvents="none"
                />
              )}
              {rowDays.map((day) => {
                const isDisabled = !day.inCurrentMonth
                const isToday = day.isToday
                const hasWorkouts = workoutDays.has(toISODate(day.date))
                return (
                  <XStack
                    key={`${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}`}
                    flex={1}
                    items="center"
                    justify="center"
                  >
                    <Button
                      unstyled
                      onPress={() => {
                        onSelectDate(day.date)
                        onMonthChange(new Date(day.date))
                        scrollToWeek(day.date)
                      }}
                      width="100%"
                      height={40}
                      items="center"
                      justify="center"
                    >
                      <View
                        width={34}
                        height={34}
                        rounded="$4"
                        items="center"
                        justify="center"
                        bg="transparent"
                      >
                        {(isToday || hasWorkouts) && (
                          <View
                            position="absolute"
                            t={0}
                            l={0}
                            r={0}
                            b={0}
                            rounded="$4"
                            bg="$primary"
                            opacity={isToday ? 1 : 0.18}
                            pointerEvents="none"
                          />
                        )}
                        <Text
                          fontSize="$2"
                          color={isToday ? '$onPrimary' : isDisabled ? '$color10' : '$color'}
                        >
                          {day.date.getDate()}
                        </Text>
                      </View>
                    </Button>
                  </XStack>
                )
              })}
            </XStack>
          )
        })}
      </YStack>
    </YStack>
  )
}

export default HistoryCalendar
