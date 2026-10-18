import { Pressable, useWindowDimensions, View } from 'react-native'
import { IconButton, SegmentedSelection, UiText } from '../../../components/ui/Controls'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { ChevronLeft, ChevronRight } from '../../../components/ui/icons'
import { formatMonthYear, generateCalendar, sameDay, startOfWeek, toISODate } from './date'

export type HistoryCalendarView = 'month' | 'week'

export type HistoryCalendarProps = {
  monthDate: Date
  selectedDate: Date | null
  view: HistoryCalendarView
  workoutDays: Set<string>
  onNavigatePeriod: (offset: -1 | 1) => void
  onViewChange: (view: HistoryCalendarView) => void
  onSelectDate: (date: Date) => void
}

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function HistoryCalendar({
  monthDate,
  selectedDate,
  view,
  workoutDays,
  onNavigatePeriod,
  onViewChange,
  onSelectDate,
}: HistoryCalendarProps) {
  const colors = useCadenceColors()
  const { fontScale, width } = useWindowDimensions()
  const days = generateCalendar(monthDate, selectedDate)
  const selectedWeek = startOfWeek(selectedDate ?? monthDate)
  const visibleDays =
    view === 'week' ? days.filter((day) => sameDay(startOfWeek(day.date), selectedWeek)) : days
  const period = formatMonthYear(monthDate)
  const periodName = view === 'week' ? 'week' : 'month'
  const headingOnOwnRow = width < 400 || fontScale > 1.15
  const calendarViewWidth = fontScale > 1.15 ? 'w-44' : 'w-40'

  return (
    <View className="gap-field border-b border-divider pb-section">
      <View className="flex-row flex-wrap items-center justify-between gap-compact px-page">
        <UiText
          textRole="cardTitle"
          className={headingOnOwnRow ? 'w-full' : 'min-w-0 flex-1'}
          accessibilityRole="header"
        >
          {period}
        </UiText>
        <View className="flex-row items-center gap-compact">
          <IconButton
            variant="ghost"
            shape="control"
            accessibilityLabel={`Previous ${periodName}`}
            onPress={() => onNavigatePeriod(-1)}
            className="px-0"
          >
            <ChevronLeft size={18} color={colors.accent} />
          </IconButton>
          <IconButton
            variant="ghost"
            shape="control"
            accessibilityLabel={`Next ${periodName}`}
            onPress={() => onNavigatePeriod(1)}
            className="px-0"
          >
            <ChevronRight size={18} color={colors.accent} />
          </IconButton>
          <SegmentedSelection
            value={view}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
            ]}
            onValueChange={onViewChange}
            accessibilityLabel="Calendar view"
            className={`${calendarViewWidth} shrink-0`}
          />
        </View>
      </View>

      <View className={width < 348 ? 'px-1' : 'px-page'}>
        <View className="flex-row">
          {weekDays.map((day) => (
            <UiText key={day} textRole="meta" className="flex-1 py-compact text-center">
              {day}
            </UiText>
          ))}
        </View>
        <View>
          {Array.from({ length: visibleDays.length / 7 }, (_, row) => {
            const rowDays = visibleDays.slice(row * 7, row * 7 + 7)
            return (
              <View key={toISODate(rowDays[0].date)} className="flex-row">
                {rowDays.map((day) => {
                  const hasWorkouts = workoutDays.has(toISODate(day.date))
                  const label = day.date.toLocaleDateString([], {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                  const selected = day.isSelected
                  const today = day.isToday
                  return (
                    <Pressable
                      key={toISODate(day.date)}
                      className="min-h-touch min-w-touch flex-1 p-0.5 active:opacity-75"
                      accessibilityRole="button"
                      accessibilityLabel={`${label}${today ? ', today' : ''}${hasWorkouts ? ', completed session' : ''}`}
                      accessibilityState={{ selected }}
                      onPress={() => onSelectDate(day.date)}
                    >
                      <View
                        className={`min-h-10 flex-1 items-center justify-center rounded-xl ${
                          selected
                            ? 'bg-accent'
                            : today
                              ? 'border border-accent bg-surface'
                              : 'bg-surface'
                        }`}
                      >
                        <UiText
                          textRole={
                            selected ? 'captionOnAccent' : today ? 'captionEmphasis' : 'caption'
                          }
                          className={!day.inCurrentMonth && view === 'month' ? 'opacity-60' : ''}
                        >
                          {day.date.getDate()}
                        </UiText>
                        <View
                          className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                            hasWorkouts
                              ? selected
                                ? 'bg-on-accent'
                                : 'bg-accent'
                              : 'bg-transparent'
                          }`}
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                        />
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )
          })}
        </View>
      </View>
      <View accessibilityRole="text" className="flex-row items-center gap-compact px-page">
        <View className="h-1.5 w-1.5 rounded-full bg-accent" />
        <UiText textRole="meta">Completed session · outlined date is today</UiText>
      </View>
    </View>
  )
}

export default HistoryCalendar
