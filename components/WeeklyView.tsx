import React from 'react'
import { YStack, XStack, Text, Circle } from 'tamagui'

interface DayViewProps {
  day: string
  date: number
  isToday?: boolean
  hasWorkout?: boolean
}

const DayView: React.FC<DayViewProps> = ({ day, date, isToday = false, hasWorkout = false }) => {
  return (
    <YStack items="center" gap="$2" flex={1}>
      <Text 
        fontSize="$2" 
        color={isToday ? "$primary" : "$colorSubtle"} 
        fontWeight={isToday ? 900 : 400}
        textTransform="uppercase"
        letterSpacing={0.5}
      >
        {day}
      </Text>
      
      <YStack items="center" gap="$1">
        <Circle
          size={42}
          bg={isToday ? "$primary" : hasWorkout ? "$success" : "transparent"}
          borderColor={isToday ? "$primary" : hasWorkout ? "$success" : "$borderColor"}
          borderWidth={isToday || hasWorkout ? 2 : 1}
          items="center"
          justify="center"
          pressStyle={{ scale: 0.96 }}
          hoverStyle={{ opacity: 0.8 }}
        >
          <Text 
            fontSize="$4" 
            fontWeight="600"
            color={isToday || hasWorkout ? "$onPrimary" : "$color"}
          >
            {date}
          </Text>
        </Circle>
      </YStack>
    </YStack>
  )
}

export const WeeklyView: React.FC = () => {
  // Get current date
  const today = new Date()
  const currentDate = today.getDate()
  
  // Calculate the start of the current week (Sunday)
  const startOfWeek = new Date(today)
  const dayOfWeek = today.getDay()
  startOfWeek.setDate(today.getDate() - dayOfWeek)
  
  // Calculate end of week for display
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  
  // Format week range
  const formatWeekRange = () => {
    const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'short' })
    const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short' })
    const startDay = startOfWeek.getDate()
    const endDay = endOfWeek.getDate()
    
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}`
    }
  }
  
  // Generate week days
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekData = weekDays.map((day, index) => {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + index)
    
    return {
      day,
      date: date.getDate(),
      isToday: date.getDate() === currentDate && date.getMonth() === today.getMonth(),
      hasWorkout: [0, 2, 4, 5].includes(index), // Mock data: workouts on Sun, Tue, Thu, Fri
    }
  })

  return (
    <YStack gap="$3">
      <XStack justify="space-between" items="center">
        <Text fontSize="$5" fontWeight="700" color="$color">
          This Week
        </Text>
        <Text fontSize="$3" color="$colorSubtle" fontWeight="500">
          {formatWeekRange()}
        </Text>
      </XStack>
      
      <XStack 
        bg="$surface" 
        borderColor="$borderColor" 
        borderWidth={1}
        rounded="$4" 
        p="$4"
        gap="$1"
        elevation={2}
      >
        {weekData.map((dayData, index) => (
          <DayView
            key={index}
            day={dayData.day}
            date={dayData.date}
            isToday={dayData.isToday}
            hasWorkout={dayData.hasWorkout}
          />
        ))}
      </XStack>
    </YStack>
  )
}
