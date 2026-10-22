import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { UiText } from './ui/Controls'
import { AlertTriangle, ChevronLeft, ChevronRight, Dumbbell } from './ui/icons'
import { useCadenceColors } from './ui/useCadenceColors'
import type {
  TrainingHomeWeekDay,
  TrainingHomeWeekPlan,
} from '../features/training/hooks/useTrainingHomeController'

type WeeklyViewProps = {
  plan: Exclude<TrainingHomeWeekPlan, { kind: 'flexible' }>
  onSelectDate: (date: Date) => void
}

function describeDay(day: TrainingHomeWeekDay): string {
  switch (day.kind) {
    case 'scheduled':
      return `scheduled workout: ${day.workout.title}`
    case 'unavailable':
      return 'scheduled workout unavailable'
    case 'rest':
      return 'rest day'
    case 'before-routine':
      return 'routine has not started'
    case 'unplanned':
      return 'no workout scheduled'
    case 'setup':
      return 'no routine set up'
    default: {
      const exhaustive: never = day
      return exhaustive
    }
  }
}

export function WeeklyView({ plan, onSelectDate }: WeeklyViewProps) {
  const [weekWidth, setWeekWidth] = useState(0)
  const [visibleWeek, setVisibleWeek] = useState(0)
  const colors = useCadenceColors()

  return (
    <View className="gap-field">
      <View className="flex-row flex-wrap items-baseline justify-between gap-field">
        <UiText textRole="body" accessibilityRole="header">
          Your training rhythm
        </UiText>
      </View>

      <View className="flex-row items-center gap-compact">
        {plan.kind === 'cycle' && (
          <View
            className="w-3"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {visibleWeek > 0 && <ChevronLeft size={12} color={colors.muted} aria-hidden />}
          </View>
        )}
        <ScrollView
          className="flex-1"
          horizontal
          pagingEnabled
          scrollEnabled={plan.kind === 'cycle'}
          showsHorizontalScrollIndicator={false}
          onLayout={(event) => setWeekWidth(event.nativeEvent.layout.width)}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const { contentOffset, layoutMeasurement } = event.nativeEvent
            if (layoutMeasurement.width > 0) {
              setVisibleWeek(Math.round(contentOffset.x / layoutMeasurement.width))
            }
          }}
        >
          {Array.from({ length: plan.days.length / 7 }, (_, weekIndex) => (
            <View
              key={weekIndex}
              style={{ width: weekWidth }}
              className={`flex-row gap-compact ${plan.kind === 'setup' ? 'opacity-60' : ''}`}
            >
              {plan.days.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day) => {
                const selected = plan.kind === 'cycle' && day.isSelected
                const canSelect = plan.kind === 'cycle'
                const dayLabel = day.date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })
                const background = selected
                  ? 'border-accent bg-accent'
                  : day.isToday
                    ? 'border-divider'
                    : 'border-transparent'

                return (
                  <Pressable
                    key={day.date.toISOString()}
                    className={`min-h-20 min-w-0 flex-1 items-center justify-center gap-compact rounded-full border px-1 py-compact ${background}`}
                    accessibilityRole={canSelect ? 'button' : undefined}
                    accessibilityLabel={`${dayLabel}, ${describeDay(day)}`}
                    accessibilityState={{ selected, disabled: !canSelect }}
                    disabled={!canSelect}
                    onPress={canSelect ? () => onSelectDate(day.date) : undefined}
                  >
                    <UiText textRole={selected ? 'captionOnAccent' : 'caption'}>
                      {day.weekday}
                    </UiText>
                    <UiText textRole={selected ? 'bodyOnAccent' : 'bodyEmphasis'}>
                      {day.date.getDate()}
                    </UiText>
                    {day.kind === 'scheduled' ? (
                      <Dumbbell
                        size={13}
                        color={selected ? colors.onAccent : colors.accent}
                        aria-hidden
                      />
                    ) : day.kind === 'unavailable' ? (
                      <AlertTriangle
                        size={13}
                        color={selected ? colors.onAccent : colors.muted}
                        aria-hidden
                      />
                    ) : (
                      <View className="h-3 w-3" />
                    )}
                  </Pressable>
                )
              })}
            </View>
          ))}
        </ScrollView>
        {plan.kind === 'cycle' && (
          <View
            className="w-3"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {visibleWeek === 0 && <ChevronRight size={12} color={colors.muted} aria-hidden />}
          </View>
        )}
      </View>
    </View>
  )
}
