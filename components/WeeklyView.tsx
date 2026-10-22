import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { UiText } from './ui/Controls'
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, Dumbbell } from './ui/icons'
import { useCadenceColors } from './ui/useCadenceColors'
import type {
  TrainingHomeWeekDay,
  TrainingHomeWeekPlan,
} from '../features/training/hooks/useTrainingHomeController'

type WeeklyViewProps = {
  plan: TrainingHomeWeekPlan
  onSelectDate: (date: Date) => void
  onOpenWorkout: (workoutId: string) => void
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

export function WeeklyView({ plan, onSelectDate, onOpenWorkout }: WeeklyViewProps) {
  const [weekWidth, setWeekWidth] = useState(0)
  const colors = useCadenceColors()
  const flexible = plan.kind === 'flexible'

  return (
    <View className="gap-field">
      <View className="flex-row flex-wrap items-baseline justify-between gap-field">
        <UiText textRole="body" accessibilityRole="header">
          Your training rhythm
        </UiText>
        {flexible && plan.completedCount !== null && (
          <UiText textRole="bodyMuted">
            {plan.completedCount} of {plan.workouts.length} complete
          </UiText>
        )}
      </View>

      {flexible ? (
        <View className="gap-field">
          <UiText textRole="caption">Any order · Monday–Sunday</UiText>
          <View>
            {plan.workouts.map(({ id, workout, completed }) => {
              const title = workout?.title ?? 'Unavailable workout'
              return (
                <Pressable
                  key={id}
                  className="min-h-touch flex-row items-center gap-field border-b border-divider py-compact active:opacity-75"
                  accessibilityRole="button"
                  accessibilityLabel={`View workout ${title}${completed ? ', completed' : ''}`}
                  accessibilityState={{ disabled: !workout }}
                  disabled={!workout}
                  onPress={() => onOpenWorkout(id)}
                >
                  {completed && <Check size={18} color={colors.accent} aria-hidden />}
                  <UiText textRole="bodyEmphasis" className="min-w-0 flex-1" numberOfLines={2}>
                    {title}
                  </UiText>
                  {plan.completedCount !== null && (
                    <UiText textRole="caption">{completed ? 'Completed' : 'Remaining'}</UiText>
                  )}
                  <ArrowRight size={18} color={colors.accent} aria-hidden />
                </Pressable>
              )
            })}
          </View>
          {plan.completedCount !== null &&
            plan.workouts.length > 0 &&
            plan.completedCount === plan.workouts.length && (
              <UiText textRole="caption">All scheduled workouts are complete.</UiText>
            )}
        </View>
      ) : (
        <View className="gap-compact">
          <ScrollView
            horizontal
            pagingEnabled
            scrollEnabled={plan.kind === 'cycle'}
            showsHorizontalScrollIndicator={false}
            onLayout={(event) => setWeekWidth(event.nativeEvent.layout.width)}
          >
            {Array.from({ length: plan.days.length / 7 }, (_, weekIndex) => (
              <View
                key={weekIndex}
                style={{ width: weekWidth }}
                className={`flex-row gap-compact ${plan.kind === 'setup' ? 'opacity-60' : ''}`}
              >
                {plan.kind === 'cycle' && weekIndex > 0 && (
                  <View
                    className="justify-center"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <ChevronLeft size={12} color={colors.muted} aria-hidden />
                  </View>
                )}
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
                {plan.kind === 'cycle' && weekIndex === 0 && (
                  <View
                    className="justify-center"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <ChevronRight size={12} color={colors.muted} aria-hidden />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}
