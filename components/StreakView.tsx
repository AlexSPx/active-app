import { Check, Dumbbell } from '@tamagui/lucide-icons'
import { XStack, YStack, Text } from 'tamagui'
import { StreakUpdateResponse } from '../types/api'
import { useActiveRoutine } from '../hooks/useActiveRoutine'

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

// A component to display the weekly streak progress
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

export function StreakView({ streak }: StreakViewProps) {
  const { activeRoutine } = useActiveRoutine()

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
    const pattern = [...activeRoutine.pattern].sort((a, b) => a.dayIndex - b.dayIndex)
    const len = pattern.length

    if (len === 7) {
      // Weekly schedule provided: map dayIndex safely to Monday-first 0..6
      for (const item of pattern) {
        // Try to detect if dayIndex is 0-based or 1-based; support overflow gracefully
        let idx = item.dayIndex
        if (idx >= 1 && idx <= 7) idx = idx - 1
        idx = ((idx % 7) + 7) % 7
        if (item.dayType === 'WORKOUT') routineDays[idx] = true
      }
    } else {
      // Repeating pattern: repeat across the 7-day view starting from Monday
      for (let i = 0; i < 7; i++) {
        const it = pattern[i % len]
        if (it.dayType === 'WORKOUT') routineDays[i] = true
      }
    }
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
            {streak.currentStreak} day streak
          </Text>
          <Text color="$color10">Keep it up!</Text>
        </YStack>
      </XStack>
      <WeeklyStreakView streakDays={streakDays} routineDays={routineDays} />
    </YStack>
  )
}
