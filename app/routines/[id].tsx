import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { YStack, Text, ScrollView, XStack, Button, Separator, Card, View } from 'tamagui'
import { Edit3, Clock, Dumbbell, Target, ChevronRight, Calendar, Coffee, Lightbulb, ListChecks, TrendingUp, AlertTriangle, CheckCircle2, Zap, RotateCcw, Timer } from '@tamagui/lucide-icons'
import { useRoutines } from '../../features/routines'
import { useWorkouts, MuscleHeatMap } from '../../features/workouts'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { useMemo } from 'react'
import { useSettingsStore } from '../../features/settings'
import type { MuscleGroup } from '../../types/api'

type TipType = 'insight' | 'warning' | 'success' | 'info'

interface RoutineTip {
  message: string
  type: TipType
  icon: React.ReactNode
}

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { routines, loading, error } = useRoutines()
  const { workouts, loading: workoutsLoading } = useWorkouts()
  
  const { restTimerEnabled, restTimerDefaultSeconds } = useSettingsStore()

  const routine = useMemo(() => routines.find(r => r.id === id), [routines, id])

  // Basic stats - from routine data only (instant, no workout dependency)
  const basicStats = useMemo(() => {
    if (!routine) return { totalDays: 0, workoutDays: 0, restDays: 0, maxConsecutiveWorkouts: 0 }
    
    const totalDays = routine.pattern.length
    const restDays = routine.pattern.filter(p => p.dayType === 'REST').length
    const workoutDays = totalDays - restDays

    let maxConsecutiveWorkouts = 0
    let currentConsecutive = 0
    routine.pattern.forEach(p => {
      if (p.dayType === 'WORKOUT') {
        currentConsecutive++
        maxConsecutiveWorkouts = Math.max(maxConsecutiveWorkouts, currentConsecutive)
      } else {
        currentConsecutive = 0
      }
    })

    return { totalDays, workoutDays, restDays, maxConsecutiveWorkouts }
  }, [routine])

  // Map workout IDs in pattern to actual workout data
  const workoutsInRoutine = useMemo(() => {
    if (!routine) return []
    return routine.pattern.map(patternItem => {
      if (patternItem.dayType === 'REST') return { ...patternItem, workout: null }
      const workout = workouts.find(w => w.id === patternItem.workoutId)
      return { ...patternItem, workout }
    })
  }, [routine, workouts])

  // Detailed stats - requires workout data (loads async)
  const detailedStats = useMemo(() => {
    if (!routine || workoutsLoading) return null
    
    let totalExercises = 0
    let totalSets = 0
    const exerciseIds = new Set<string>()
    
    workoutsInRoutine.forEach(item => {
      if (item.workout) {
        item.workout.workoutTemplate.exercises.forEach(e => {
          exerciseIds.add(e.exerciseId)
          totalExercises++
          totalSets += e.reps?.length || e.durationSeconds?.length || 0
        })
      }
    })

    const restTime = restTimerEnabled ? restTimerDefaultSeconds / 60 : 0
    const estimatedTime = totalSets * (1.5 + restTime)

    return { 
      totalExercises, 
      totalSets, 
      estimatedTime,
      uniqueExercises: exerciseIds.size,
      avgSetsPerWorkout: basicStats.workoutDays > 0 ? Math.round(totalSets / basicStats.workoutDays * 10) / 10 : 0,
    }
  }, [routine, workoutsInRoutine, workoutsLoading, restTimerEnabled, restTimerDefaultSeconds, basicStats.workoutDays])

  // Muscle analysis - requires workout data
  const muscleAnalysis = useMemo(() => {
    if (!routine || workoutsLoading) return null
    
    const primaryFreq = new Map<string, number>()
    const secondaryFreq = new Map<string, number>()

    workoutsInRoutine.forEach(item => {
      if (item.workout) {
        item.workout.workoutTemplate.exercises.forEach(exercise => {
          exercise.primaryMuscles?.forEach(m => primaryFreq.set(m, (primaryFreq.get(m) || 0) + 1))
          exercise.secondaryMuscles?.forEach(m => secondaryFreq.set(m, (secondaryFreq.get(m) || 0) + 1))
        })
      }
    })

    return {
      primary: Array.from(primaryFreq.keys()) as MuscleGroup[],
      secondary: Array.from(secondaryFreq.keys()) as MuscleGroup[],
      primaryFreq,
      totalMuscles: primaryFreq.size + secondaryFreq.size
    }
  }, [routine, workoutsInRoutine, workoutsLoading])

  // Tips - uses available data
  const routineTips = useMemo((): RoutineTip[] => {
    if (!routine) return []
    
    const tips: RoutineTip[] = []
    const isWeekly = routine.routineType === 'WEEKLY_COMPLETION'
    
    // Consecutive workout days warning
    if (basicStats.maxConsecutiveWorkouts >= 4) {
      tips.push({
        message: `${basicStats.maxConsecutiveWorkouts} workout days in a row may lead to fatigue. Consider adding rest days.`,
        type: 'warning',
        icon: <AlertTriangle size={16} color="$secondary" />
      })
    } else if (basicStats.maxConsecutiveWorkouts <= 2 && basicStats.workoutDays >= 3) {
      tips.push({
        message: `Good rest distribution with max ${basicStats.maxConsecutiveWorkouts} consecutive workout days.`,
        type: 'success',
        icon: <CheckCircle2 size={16} color="$green10" />
      })
    }

    // Only add workout-dependent tips if data is loaded
    if (detailedStats && muscleAnalysis) {
      // Time commitment
      const hoursPerCycle = Math.round(detailedStats.estimatedTime / 60 * 10) / 10
      if (hoursPerCycle > 0) {
        tips.push({
          message: `~${hoursPerCycle}h per ${basicStats.totalDays}-day cycle. ${hoursPerCycle <= 3 ? 'Manageable schedule!' : 'Solid commitment.'}`,
          type: hoursPerCycle <= 3 ? 'success' : 'info',
          icon: <Timer size={16} color={hoursPerCycle <= 3 ? "$green10" : "$blue10"} />
        })
      }

      // Exercise variety
      if (detailedStats.uniqueExercises >= 10) {
        tips.push({
          message: `${detailedStats.uniqueExercises} unique exercises provide great variety.`,
          type: 'success',
          icon: <TrendingUp size={16} color="$green10" />
        })
      }

      // Muscle balance
      const hasPush = ['CHEST', 'SHOULDERS', 'TRICEPS'].some(m => muscleAnalysis.primaryFreq.has(m))
      const hasPull = ['LATS', 'BICEPS', 'MIDDLE_BACK'].some(m => muscleAnalysis.primaryFreq.has(m))
      const hasLegs = ['QUADRICEPS', 'HAMSTRINGS', 'GLUTES'].some(m => muscleAnalysis.primaryFreq.has(m))

      if (hasPush && hasPull && hasLegs) {
        tips.push({
          message: 'Full-body balance with push, pull, and leg movements.',
          type: 'success',
          icon: <CheckCircle2 size={16} color="$green10" />
        })
      } else if (!hasLegs && (hasPush || hasPull)) {
        tips.push({
          message: 'Consider adding leg exercises for balanced development.',
          type: 'insight',
          icon: <Lightbulb size={16} color="$primary" />
        })
      }
    }

    // Routine type tip
    tips.push({
      message: isWeekly 
        ? `Complete ${basicStats.workoutDays} workouts each week in any order.`
        : `${basicStats.totalDays}-day cycle repeats continuously.`,
      type: 'info',
      icon: isWeekly ? <ListChecks size={16} color="$blue10" /> : <RotateCcw size={16} color="$blue10" />
    })

    return tips.slice(0, 4)
  }, [routine, basicStats, detailedStats, muscleAnalysis])

  if (loading && !routine) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$3" color="$colorSubtle" fontSize="$3">Loading routine...</Text>
      </YStack>
    )
  }

  if (error || !routine) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background" p="$4">
        <ErrorDisplay message={error || 'Routine not found'} />
        <Button mt="$4" onPress={() => router.back()}>Go Back</Button>
      </YStack>
    )
  }

  const isWeeklyCompletion = routine.routineType === 'WEEKLY_COMPLETION'

  const getTipBorderColor = (type: TipType) => {
    switch (type) {
      case 'success': return '$green8'
      case 'warning': return '$red8'
      case 'insight': return '$primary'
      default: return '$blue8'
    }
  }

  const getTipBgColor = (type: TipType) => {
    switch (type) {
      case 'success': return '$green2'
      case 'warning': return '$red2'
      case 'insight': return '$backgroundAccent'
      default: return '$blue2'
    }
  }

  return (
    <>
      <Stack.Screen 
        options={{
          headerTitle: routine.name,
          headerBackTitle: 'Back',
          headerTransparent: false,
        }} 
      />
      
      <ScrollView flex={1} bg="$background" showsVerticalScrollIndicator={false}>
        <YStack p="$4" gap="$4">
          {/* Hero Section */}
          <Card bg="$surface" bordered p="$4" animation="quick" enterStyle={{ opacity: 0 }}>
            <YStack gap="$3">
              <XStack justify="space-between" items="center">
                <XStack
                  bg={isWeeklyCompletion ? '$green3' : '$blue3'}
                  px="$3"
                  py="$1.5"
                  rounded="$3"
                  items="center"
                  gap="$2"
                >
                  {isWeeklyCompletion ? <ListChecks size={14} color="$green10" /> : <Calendar size={14} color="$blue10" />}
                  <Text fontSize="$2" fontWeight="700" color={isWeeklyCompletion ? '$green10' : '$blue10'} textTransform="uppercase">
                    {isWeeklyCompletion ? 'Weekly' : 'Sequential'}
                  </Text>
                </XStack>
                <Text fontSize="$2" color="$colorSubtle">{basicStats.totalDays}-day cycle</Text>
              </XStack>

              {routine.description && (
                <Text fontSize="$3" color="$colorSubtle" lineHeight="$1">{routine.description}</Text>
              )}
            </YStack>
          </Card>

          {/* Stats Grid - Shows immediately from basic stats */}
          <XStack gap="$3">
            <Card flex={1} p="$3" bg="$surface" bordered animation="quick" enterStyle={{ opacity: 0 }}>
              <YStack items="center" gap="$1">
                <XStack width={40} height={40} bg="$green3" rounded="$4" justify="center" items="center">
                  <Dumbbell size={20} color="$green10" />
                </XStack>
                <Text fontSize="$7" fontWeight="800" color="$color">{basicStats.workoutDays}</Text>
                <Text fontSize="$1" color="$colorSubtle" textTransform="uppercase">Workouts</Text>
              </YStack>
            </Card>

            <Card flex={1} p="$3" bg="$surface" bordered animation="quick" enterStyle={{ opacity: 0 }}>
              <YStack items="center" gap="$1">
                <XStack width={40} height={40} bg="$backgroundAccent" rounded="$4" justify="center" items="center">
                  <Coffee size={20} color="$secondary" />
                </XStack>
                <Text fontSize="$7" fontWeight="800" color="$color">{basicStats.restDays}</Text>
                <Text fontSize="$1" color="$colorSubtle" textTransform="uppercase">Rest Days</Text>
              </YStack>
            </Card>

            <Card flex={1} p="$3" bg="$surface" bordered animation="quick" enterStyle={{ opacity: 0 }}>
              <YStack items="center" gap="$1">
                <XStack width={40} height={40} bg="$backgroundAccent" rounded="$4" justify="center" items="center">
                  <Target size={20} color="$primary" />
                </XStack>
                {detailedStats ? (
                  <Text fontSize="$7" fontWeight="800" color="$color">{detailedStats.uniqueExercises}</Text>
                ) : (
                  <Text fontSize="$7" fontWeight="800" color="$colorSubtle">-</Text>
                )}
                <Text fontSize="$1" color="$colorSubtle" textTransform="uppercase">Exercises</Text>
              </YStack>
            </Card>
          </XStack>

          {/* Time Estimate Banner - Shows loading state if needed */}
          <Card bg="$backgroundAccent" p="$3" bordered={false}>
            <XStack justify="space-between" items="center">
              <XStack items="center" gap="$2">
                <Clock size={18} color="$primary" />
                {detailedStats ? (
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    ~{Math.round(detailedStats.estimatedTime)} min per cycle
                  </Text>
                ) : (
                  <Text fontSize="$3" fontWeight="600" color="$colorSubtle">Calculating...</Text>
                )}
              </XStack>
              {detailedStats && (
                <Text fontSize="$2" color="$colorSubtle">{detailedStats.totalSets} total sets</Text>
              )}
            </XStack>
          </Card>

          {/* Insights Section */}
          {routineTips.length > 0 && (
            <YStack gap="$3">
              <XStack items="center" gap="$2">
                <Lightbulb size={18} color="$primary" />
                <Text fontSize="$4" fontWeight="700" color="$color">Insights</Text>
              </XStack>
              
              <YStack gap="$2">
                {routineTips.map((tip, index) => (
                  <Card 
                    key={index} 
                    p="$3" 
                    bg={getTipBgColor(tip.type)}
                    borderLeftWidth={3}
                    borderLeftColor={getTipBorderColor(tip.type)}
                    bordered={false}
                  >
                    <XStack items="flex-start" gap="$2">
                      <YStack pt="$0.5">{tip.icon}</YStack>
                      <Text fontSize="$3" color="$color" flex={1} lineHeight="$1">{tip.message}</Text>
                    </XStack>
                  </Card>
                ))}
              </YStack>
            </YStack>
          )}

          {/* Muscle Heat Map Section */}
          {muscleAnalysis && muscleAnalysis.primary.length > 0 && (
            <YStack gap="$3">
              <XStack items="center" justify="space-between">
                <XStack items="center" gap="$2">
                  <Target size={18} color="$primary" />
                  <Text fontSize="$4" fontWeight="700" color="$color">Muscle Coverage</Text>
                </XStack>
                <Text fontSize="$2" color="$colorSubtle">{muscleAnalysis.totalMuscles} groups</Text>
              </XStack>
              <Separator />
              <YStack items="center" py="$2">
                <MuscleHeatMap 
                  primaryMuscles={muscleAnalysis.primary} 
                  secondaryMuscles={muscleAnalysis.secondary}
                  scale={1}
                />
              </YStack>
            </YStack>
          )}

          {/* Workouts in Routine */}
          <YStack gap="$3">
            <XStack items="center" gap="$2">
              <Dumbbell size={18} color="$primary" />
              <Text fontSize="$4" fontWeight="700" color="$color">
                {isWeeklyCompletion ? 'Weekly Workouts' : 'Schedule'}
              </Text>
            </XStack>
            <Separator />
            
            {workoutsInRoutine.map((item, index) => (
              <Card 
                key={`day-${item.dayIndex}-${index}`} 
                p="$3" 
                bg="$surface" 
                bordered
                pressStyle={item.workout ? { scale: 0.98, bg: '$backgroundHover' } : undefined}
                animation="quick"
                onPress={item.workout ? () => router.push(`/workouts/${item.workout!.id}`) : undefined}
              >
                <XStack justify="space-between" items="center">
                  <XStack items="center" gap="$3" flex={1}>
                    <YStack 
                      width={36} 
                      height={36} 
                      bg={item.dayType === 'REST' ? '$backgroundStrong' : '$primary'}
                      rounded="$3"
                      justify="center"
                      items="center"
                    >
                      {item.dayType === 'REST' ? (
                        <Coffee size={16} color="$colorSubtle" />
                      ) : (
                        <Text fontSize="$4" fontWeight="800" color="white">{item.dayIndex}</Text>
                      )}
                    </YStack>
                    
                    <YStack flex={1} gap="$0.5">
                      {item.dayType === 'REST' ? (
                        <>
                          <Text fontSize="$4" fontWeight="600" color="$colorSubtle">Rest Day</Text>
                          <Text fontSize="$2" color="$colorMuted">Recovery & muscle growth</Text>
                        </>
                      ) : item.workout ? (
                        <>
                          <Text fontSize="$4" fontWeight="600" color="$color" numberOfLines={1}>
                            {item.workout.title}
                          </Text>
                          <Text fontSize="$2" color="$colorSubtle">
                            {item.workout.workoutTemplate.exercises.length} exercises
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text fontSize="$4" fontWeight="600" color="$secondary">Missing Workout</Text>
                          <Text fontSize="$2" color="$colorMuted">Workout was deleted</Text>
                        </>
                      )}
                    </YStack>
                  </XStack>
                  {item.workout && <ChevronRight size={18} color="$colorSubtle" />}
                </XStack>
              </Card>
            ))}
          </YStack>

          <View height={90} />
        </YStack>
      </ScrollView>

      {/* Floating Action Button */}
      <YStack 
        position="absolute" 
        b={0} 
        l={0} 
        r={0}
        p="$4"
        bg="$background"
        borderTopWidth={1}
        borderTopColor="$borderColor"
      >
        <Button 
          size="$4" 
          bg="$primary" 
          color="white" 
          icon={Edit3}
          onPress={() => router.push(`/routines/edit?id=${routine.id}`)}
          animation="quick"
          pressStyle={{ scale: 0.97 }}
        >
          <Text color="white" fontWeight="600">Edit Routine</Text>
        </Button>
      </YStack>
    </>
  )
}
