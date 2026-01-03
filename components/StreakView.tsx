import { Check, Dumbbell } from '@tamagui/lucide-icons'
import { XStack, YStack, Text, Progress } from 'tamagui'
import { StreakUpdateResponse } from '../types/api'
import { useActiveRoutine } from '../hooks/useActiveRoutine'
import { routinePatternIndex } from '../utils/date'

type StreakViewProps = {
  streak: StreakUpdateResponse
}

type DayCircleProps = {
  label: string
  isWorkout: boolean
  isStreak: boolean
  isToday: boolean
}

// Small day indicator driven by simple booleans
function DayCircle({ label, isWorkout, isStreak, isToday }: DayCircleProps) {
  const getIcon = () =>
    isWorkout ? <Dumbbell size={16} color={isStreak ? '$color' : '$color8'} /> : null

  return (
    <YStack gap="$1" items="center">
      <Text fontSize="$2" color={isStreak ? '$color' : '$color10'}>
        {label}
      </Text>
      <XStack
        width={32}
        height={32}
        rounded={99}
        borderWidth={2}
        borderStyle={isWorkout ? 'solid' : 'dashed'}
        borderColor={isStreak ? '$green9' : '$color4'}
        // Fill workout days when streaked
        bg={isWorkout && isStreak ? '$green9' : 'transparent'}
        items="center"
        justify="center"
      >
        {getIcon()}
      </XStack>
    </YStack>
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
  const jsDay = new Date().getDay() // 0 = Sun ... 6 = Sat
  const todayIndex = (jsDay + 6) % 7

  return (
    <XStack gap="$3" justify="space-between" width="100%">
      {dayNames.map((day, index) => (
        <DayCircle
          key={index}
          label={day}
          isWorkout={!!routineDays[index]}
          isStreak={!!streakDays[index]}
          isToday={index === todayIndex}
        />
      ))}
    </XStack>
  )
}

// Progress view for WEEKLY_COMPLETION routines
function WeeklyCompletionProgress({
  completed,
  total,
}: {
  completed: number
  total: number
}) {
  const progress = total > 0 ? (completed / total) * 100 : 0
  const isComplete = completed >= total

  return (
    <YStack gap="$3" width="100%">
      <XStack justify="space-between" items="center">
        <Text fontSize="$3" color="$colorSubtle" fontWeight="500">
          This week's progress
        </Text>
        <Text
          fontSize="$4"
          fontWeight="700"
          color={isComplete ? '$green10' : '$primary'}
        >
          {completed}/{total} workouts
        </Text>
      </XStack>
      <Progress value={progress} size="$2">
        <Progress.Indicator
          animation="bouncy"
          bg={isComplete ? '$green9' : '$primary'}
        />
      </Progress>
      {isComplete && (
        <XStack items="center" gap="$2" justify="center">
          <Check size={16} color="$green10" />
          <Text fontSize="$3" color="$green10" fontWeight="600">
            Week complete! Streak +1
          </Text>
        </XStack>
      )}
    </YStack>
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
    <YStack
      gap="$4"
      p="$4"
      rounded="$6"
      bg="$background"
      borderWidth={1}
      borderColor="$borderColor"
      width="100%"
    >
      <XStack gap="$4" items="center" width="100%" justify="flex-start">
        <Text fontSize={32}>🔥</Text>
        <YStack>
          <Text fontSize="$5" fontWeight="700">
            {streak.currentStreak} {isWeeklyCompletion ? 'week' : 'day'} streak
          </Text>
          <Text color="$color10">{getStatusMessage()}</Text>
        </YStack>
      </XStack>
      
      {isWeeklyCompletion && weeklyRequired > 0 ? (
        <WeeklyCompletionProgress completed={weeklyCompleted} total={weeklyRequired} />
      ) : (
        <WeeklyStreakView streakDays={streakDays} routineDays={routineDays} />
      )}
    </YStack>
  )
}

