import { Button, Text, View, XStack, YStack } from 'tamagui'
import { ChevronLeft, ChevronRight } from '@tamagui/lucide-icons'
import { formatMonthYear, generateCalendar, sameDay, startOfWeek, toISODate } from './date'

export type HistoryCalendarProps = {
  monthDate: Date
  selectedDate: Date
  collapsed: boolean
  onMonthChange: (date: Date) => void
  onToggleCollapsed: () => void
  onSelectDate: (date: Date) => void
  workoutDays: Set<string>
}

export function HistoryCalendar({
  monthDate,
  selectedDate,
  collapsed,
  onMonthChange,
  onToggleCollapsed,
  onSelectDate,
  workoutDays,
}: HistoryCalendarProps) {
  const days = generateCalendar(monthDate, selectedDate)
  const selectedWeek = startOfWeek(selectedDate)
  const visibleDays = collapsed
    ? days.filter((day) => sameDay(startOfWeek(day.date), selectedWeek))
    : days
  const changeMonth = (offset: number) => {
    // Use the first day so January 31 cannot skip February.
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1)
    onMonthChange(date)
    onSelectDate(date)
  }

  return (
    <YStack py="$field" gap="$compact" borderBottomWidth="$0.5" borderColor="$borderColor">
      <XStack justify="space-between" items="center" gap="$compact">
        <Text
          fontSize="$exerciseTitle"
          lineHeight="$exerciseTitle"
          fontWeight="600"
          color="$color"
          flex={1}
        >
          {formatMonthYear(monthDate)}
        </Text>
        <XStack items="center">
          <Button
            unstyled
            width="$touch"
            height="$touch"
            rounded="$control"
            items="center"
            justify="center"
            accessibilityLabel="Previous month"
            onPress={() => changeMonth(-1)}
          >
            <ChevronLeft size="$iconSmall" color="$colorSubtle" />
          </Button>
          <Button
            unstyled
            width="$touch"
            height="$touch"
            rounded="$control"
            items="center"
            justify="center"
            accessibilityLabel="Next month"
            onPress={() => changeMonth(1)}
          >
            <ChevronRight size="$iconSmall" color="$colorSubtle" />
          </Button>
          <Button
            unstyled
            minH="$touch"
            px="$field"
            bg="$backgroundStrong"
            rounded="$day"
            items="center"
            justify="center"
            accessibilityLabel={collapsed ? 'Expand month calendar' : 'Collapse to selected week'}
            accessibilityState={{ expanded: !collapsed }}
            onPress={onToggleCollapsed}
          >
            <Text fontSize="$caption" lineHeight="$caption" color="$color" fontWeight="600">
              {collapsed ? 'Month' : 'Week'}
            </Text>
          </Button>
        </XStack>
      </XStack>
      <XStack gap="$compact">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <Text
            key={day}
            flex={1}
            text="center"
            fontSize="$caption"
            lineHeight="$caption"
            color="$colorSubtle"
          >
            {day}
          </Text>
        ))}
      </XStack>
      <YStack gap="$compact">
        {Array.from({ length: visibleDays.length / 7 }, (_, row) => (
          <XStack key={row} gap="$compact">
            {visibleDays.slice(row * 7, row * 7 + 7).map((day) => {
              const hasWorkouts = workoutDays.has(toISODate(day.date))
              return (
                <Button
                  key={toISODate(day.date)}
                  unstyled
                  flex={1}
                  minW="$0"
                  minH="$touch"
                  py="$compact"
                  gap="$compact"
                  rounded="$day"
                  items="center"
                  justify="center"
                  borderWidth="$0.5"
                  borderColor={day.isSelected ? '$primary' : '$backgroundTransparent'}
                  bg={
                    day.isSelected
                      ? '$backgroundAccent'
                      : day.inCurrentMonth
                        ? '$backgroundStrong'
                        : '$backgroundTransparent'
                  }
                  accessibilityLabel={`${day.date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${day.isToday ? ', today' : ''}${hasWorkouts ? ', completed session' : ''}`}
                  accessibilityState={{ selected: day.isSelected }}
                  onPress={() => onSelectDate(day.date)}
                >
                  <Text
                    fontSize="$caption"
                    lineHeight="$caption"
                    color={
                      day.isSelected ? '$primary' : day.inCurrentMonth ? '$color' : '$colorSubtle'
                    }
                    fontWeight={day.isSelected ? '600' : '400'}
                    textDecorationLine={day.isToday ? 'underline' : 'none'}
                  >
                    {day.date.getDate()}
                  </Text>
                  <View
                    width="$0.5"
                    height="$0.5"
                    rounded="$block"
                    bg={hasWorkouts ? '$primary' : '$backgroundTransparent'}
                  />
                </Button>
              )
            })}
          </XStack>
        ))}
      </YStack>
      <XStack items="center" gap="$compact" mt="$compact">
        <View width="$0.5" height="$0.5" rounded="$block" bg="$primary" />
        <Text flex={1} fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
          Completed session · underlined date is today
        </Text>
      </XStack>
    </YStack>
  )
}

export default HistoryCalendar
