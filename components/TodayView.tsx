import React from 'react'
import { YStack, XStack, Text, Card, Button, Progress } from 'tamagui'
import { Calendar, Clock, Target, Zap } from '@tamagui/lucide-icons'
import { useRouter } from 'expo-router'

export const TodayView: React.FC = () => {
  const currentDate = new Date()
  const todayFormatted = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  // Determine if today is a workout day or rest day (mock logic)
  const isWorkoutDay = currentDate.getDay() % 2 === 0 // Even days are workout days
  
  // Mock data for today's stats
  const todayWorkout = {
    workoutName: "Push day 1",
    numberOfExercises: 6,
    duration: 45
  }

  return (
    <YStack gap="$3">
      <XStack justify="space-between" items="center">
        <Text fontSize="$5" fontWeight="700" color="$color">
          Today
        </Text>
        <XStack items="center" gap="$2">
          <Calendar size={16} color="$colorSubtle" />
          <Text fontSize="$3" color="$colorSubtle" fontWeight="500">
            {todayFormatted}
          </Text>
        </XStack>
      </XStack>
      
      <Card
        bg="$surface"
        borderColor="$borderColor"
        borderWidth={1}
        rounded="$4"
        p="$4"
        elevation={2}
        animation="quick"
        pressStyle={{ scale: 0.995 }}
        hoverStyle={{ elevation: 4 }}
      >
        <YStack gap="$4">
          {/* Today's Activity Type */}
          <YStack gap="$3">
            <XStack justify="space-between" items="center">
              <Text fontSize="$3" color="$colorSubtle" fontWeight="600" textTransform="uppercase" letterSpacing={0.5}>
                {isWorkoutDay ? "Today's Workout" : "Rest Day"}
              </Text>
              <Text fontSize="$2" color={isWorkoutDay ? "$primary" : "$green8"} fontWeight="600" textTransform="uppercase">
                {isWorkoutDay ? "Active" : "Recovery"}
              </Text>
            </XStack>
            
            {isWorkoutDay ? (

                <TodayStat
                  workoutName={todayWorkout.workoutName}
                  duration={todayWorkout.duration}
                  exercises={todayWorkout.numberOfExercises}
                />
            ) : (
              <RestDayView />
            )}
          </YStack>

        </YStack>
      </Card>
    </YStack>
  )
}

const RestDayView = () => {
  return (
    <YStack gap="$3">
      <XStack items="center" gap="$3">
        <XStack
          width={36}
          height={36}
          bg="$green8"
          rounded="$3"
          items="center"
          justify="center"
        >
          <Zap size={18} color="white" />
        </XStack>
        <YStack flex={1}>
          <Text fontSize="$4" fontWeight="600" color="$color">
            Take a well-deserved break
          </Text>
          <Text fontSize="$2" color="$colorSubtle">
            Recovery is just as important as training
          </Text>
        </YStack>
      </XStack>
    </YStack>
  )
}

interface TodayStatsProps {
  workoutName: string,
  duration: number,
  exercises: number
}

const TodayStat: React.FC<TodayStatsProps> = ({ workoutName, duration, exercises }) => {
  return (
    <XStack borderWidth="$1" rounded="$5" borderColor="$primary">
      <XStack
        m="$3"
        items="center"
        gap="$3" 
        flex={1}
        pressStyle={{ scale: 0.96, opacity: 0.8 }}
        animation="quick"
        cursor="pointer"
      >
        <XStack
          width={36}
          height={36}
          bg="$primary"
          rounded="$3"
          items="center"
          justify="center"
          animation="quick"
          pressStyle={{ scale: 0.9 }}
        >
          <Clock size={18} color="white" />
        </XStack>
        <YStack flex={1}>
          <Text fontSize="$5" fontWeight="700" color="$color">
            {workoutName}
          </Text>
          <Text fontSize="$2" color="$colorSubtle" fontWeight="500">
            {duration} min | {exercises} exercises
          </Text>
        </YStack>
      </XStack>
    </XStack>
  )
}