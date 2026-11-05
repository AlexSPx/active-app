import { View } from 'react-native'
import { Check, Dumbbell } from './ui/icons'
import { UiText } from './ui/Controls'
import { StreakUpdateResponse } from '../types/api'
import { useActiveRoutine } from '../features/routines'
import { routinePatternIndex } from '../utils/date'
import { useCadenceColors } from './ui/useCadenceColors'

type StreakViewProps = {
  streak: StreakUpdateResponse
}

type DayCircleProps = {
  label: string
  isWorkout: boolean
  isStreak: boolean
  colors: ReturnType<typeof useCadenceColors>
}

// Small day indicator driven by simple booleans
function DayCircle({ label, isWorkout, isStreak, colors }: DayCircleProps) {
  const hasStreakWorkout = isWorkout && isStreak

  return (
    <View className="items-center gap-compact">
      <UiText textRole="caption" className={isStreak ? 'text-foreground' : ''}>
        {label}
      </UiText>
      <View
        className={`h-8 w-8 items-center justify-center rounded-full border-2 ${isWorkout ? 'border-solid' : 'border-dashed'} ${isStreak ? 'border-accent' : 'border-divider'} ${hasStreakWorkout ? 'bg-accent' : 'bg-transparent'}`}
      >
        {isWorkout ? (
          <Dumbbell size={16} color={hasStreakWorkout ? colors.onAccent : colors.muted} />
        ) : null}
      </View>
    </View>
  )
}

// A component to display the weekly streak progress for SEQUENTIAL routines
function WeeklyStreakView({
  streakDays,
  routineDays,
}: {
  streakDays: boolean[]
  routineDays: boolean[]
}) {
  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const colors = useCadenceColors()

  return (
    <View className="w-full flex-row justify-between gap-field">
      {dayNames.map((day, index) => (
        <DayCircle
          key={index}
          label={day}
          isWorkout={!!routineDays[index]}
          isStreak={!!streakDays[index]}
          colors={colors}
        />
      ))}
    </View>
  )
}

// Progress view for WEEKLY_COMPLETION routines
function WeeklyCompletionProgress({ completed, total }: { completed: number; total: number }) {
  const colors = useCadenceColors()
  const progress = total > 0 ? (completed / total) * 100 : 0
  const isComplete = completed >= total

  return (
    <View className="w-full gap-field">
      <View className="flex-row items-center justify-between gap-field">
        <UiText textRole="bodyMuted">This week's progress</UiText>
        <UiText
          textRole="body"
          className={
            isComplete ? 'font-dm-semibold text-accent' : 'font-dm-semibold text-foreground'
          }
          style={{ fontSize: 16, lineHeight: 20, fontWeight: '700' }}
        >
          {completed}/{total} workouts
        </UiText>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-full bg-raised">
        <View
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </View>
      {isComplete && (
        <View className="flex-row items-center justify-center gap-compact">
          <Check size={16} color={colors.accent} />
          <UiText textRole="bodyEmphasis" className="font-dm-semibold text-accent">
            Week complete! Streak +1
          </UiText>
        </View>
      )}
    </View>
  )
}

export function StreakView({ streak }: StreakViewProps) {
  const { activeRoutine } = useActiveRoutine()

  // Determine routine type
  const routineType = activeRoutine?.routineType ?? 'SEQUENTIAL'
  const isWeeklyCompletion = routineType === 'WEEKLY_COMPLETION'

  // For WEEKLY_COMPLETION: use the new fields from streak response
  const weeklyCompleted = streak.weeklyCompletedWorkoutIds?.length ?? 0
  const weeklyRequired = streak.weeklyWorkoutsRequired ?? 0

  // Compute colored boxes from currentStreak: color today and the previous N-1 boxes (up to 7)
  const streakDays = Array(7).fill(false) as boolean[]
  const jsDay = new Date().getDay() // 0 = Sun ... 6 = Sat
  // Convert to Monday-first index (0 = Mon ... 6 = Sun)
  const todayIndex = (jsDay + 6) % 7
  const n = Math.min(Math.max(0, streak.currentStreak), 7)
  for (let i = 0; i < n; i++) {
    const idx = (todayIndex - i + 7) % 7
    streakDays[idx] = true
  }

  const routineDays = Array(7).fill(false)
  if (activeRoutine && Array.isArray(activeRoutine.pattern) && activeRoutine.pattern.length > 0) {
    const len = activeRoutine.pattern.length
    // We need to map each day of the current week (Mon-Sun) to the pattern
    // The current week starts on Monday.
    // Let's get the Monday of the current week.
    const today = new Date()
    const currentDayOfWeek = today.getDay() // 0=Sun, 1=Mon...
    const diffToMon = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1
    const mondayDate = new Date(today)
    mondayDate.setDate(today.getDate() - diffToMon)

    for (let i = 0; i < 7; i++) {
      const d = new Date(mondayDate)
      d.setDate(mondayDate.getDate() + i)

      // Use the shared helper to find the pattern item for this date
      // This handles both 7-day patterns and repeating patterns correctly
      // based on the routine's start date.
      const idx = routinePatternIndex(activeRoutine.startDate, len, d)
      const item = activeRoutine.pattern[idx]

      if (item && item.dayType === 'WORKOUT') {
        routineDays[i] = true
      }
    }
  }

  // Determine status message based on streak status
  const getStatusMessage = () => {
    if (streak.status === 'WEEKLY_PROGRESS') {
      return 'Making progress!'
    }
    return 'Keep it up!'
  }

  return (
    <View className="w-full gap-card rounded-card border border-divider bg-background p-card">
      <View className="w-full flex-row items-center gap-card">
        <UiText textRole="body" style={{ fontSize: 32, lineHeight: 38 }}>
          🔥
        </UiText>
        <View className="gap-compact">
          <UiText textRole="cardTitle">
            {streak.currentStreak} {isWeeklyCompletion ? 'week' : 'day'} streak
          </UiText>
          <UiText textRole="bodyMuted">{getStatusMessage()}</UiText>
        </View>
      </View>

      {isWeeklyCompletion && weeklyRequired > 0 ? (
        <WeeklyCompletionProgress completed={weeklyCompleted} total={weeklyRequired} />
      ) : (
        <WeeklyStreakView streakDays={streakDays} routineDays={routineDays} />
      )}
    </View>
  )
}
