import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { useState } from 'react'
import { BarChart2, ClipboardList, Dumbbell, Plus } from '@tamagui/lucide-icons'
import { useRouter } from 'expo-router'
import { WeeklyView } from '../../components/WeeklyView'
import { TodayView } from '../../components/TodayView'
import { ProgressionWidget } from '../../components/ProgressionWidget'
import { WidgetManager } from '../../components/WidgetManager'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { useRoutines, useActiveRoutine } from '../../features/routines'
import { useWorkouts } from '../../features/workouts'
import { useWidgetStore } from '../../stores/widgetStore'

export default function HomeScreen() {
  const router = useRouter()
  const [showWidgetManager, setShowWidgetManager] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const {
    activeRoutine,
    loading: activeRoutineLoading,
    error: activeRoutineError,
    refetch: refetchActiveRoutine,
  } = useActiveRoutine()
  const {
    routines,
    loading: routinesLoading,
    error: routinesError,
    refetch: refetchRoutines,
  } = useRoutines()
  const {
    workouts,
    loading: workoutsLoading,
    error: workoutsError,
    refetch: refetchWorkouts,
  } = useWorkouts()

  const { widgets, removeWidget } = useWidgetStore()
  const sortedWidgets = [...widgets].sort((a, b) => a.position - b.position)
  const setupLoading = activeRoutineLoading || routinesLoading || workoutsLoading
  const setupError = activeRoutineError || routinesError || workoutsError
  const hasWorkouts = workouts.length > 0
  const canShowPlan = !setupLoading && !setupError && hasWorkouts && !!activeRoutine

  const setupState = !hasWorkouts
    ? {
        title: 'Create your first workout',
        description: 'Start with a workout template, then build a routine around it.',
        icon: Dumbbell,
        actionLabel: 'Create workout',
        onAction: () => router.push('/workouts/new'),
      }
    : routines.length === 0
      ? {
          title: 'Set up your routine',
          description: 'Your workouts are ready. Create a routine to plan your training.',
          icon: ClipboardList,
          actionLabel: 'Create routine',
          onAction: () => router.push('/routines/new'),
        }
      : {
          title: 'Choose an active routine',
          description: 'Select a routine to see your plan for today and this week.',
          icon: ClipboardList,
          actionLabel: 'Manage routines',
          onAction: () => router.push('/(tabs)/(workouts)/routines'),
        }

  return (
    <ScrollView flex={1} bg="$background" showsVerticalScrollIndicator={false}>
      {/* Content starts below native header */}

      {setupLoading ? (
        <YStack p="$4" pt="$0" items="center">
          <LoadingSpinner text="Loading your plan..." />
        </YStack>
      ) : setupError ? (
        <ErrorDisplay
          title="Failed to load your plan"
          message={setupError}
          onRetry={() => {
            void Promise.all([refetchActiveRoutine(), refetchRoutines(), refetchWorkouts()])
          }}
        />
      ) : canShowPlan ? (
        <>
          <YStack p="$4" pt="$0">
            <TodayView selectedDate={selectedDate} />
          </YStack>
          <YStack p="$4" pt="$0">
            <WeeklyView selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          </YStack>
        </>
      ) : (
        <EmptyState {...setupState} />
      )}

      {hasWorkouts && (
        <YStack pt="$0" pb="$4">
          {sortedWidgets.length > 0 ? (
            <YStack px="$4">
              <XStack items="center" justify="space-between" mb="$3">
                <Text fontSize="$5" fontWeight="600">
                  Progress Tracking
                </Text>
                <Button
                  size="$3"
                  variant="outlined"
                  onPress={() => setShowWidgetManager(true)}
                  bg="$backgroundAccent"
                  borderColor="$borderAccent"
                  pressStyle={{ bg: '$backgroundAccentPress' }}
                >
                  <Plus size={16} color="$primary" />
                  <Text color="$primary" fontWeight="500">
                    Add Widget
                  </Text>
                </Button>
              </XStack>
              <YStack>
                {sortedWidgets.map((widget) => (
                  <ProgressionWidget key={widget.id} config={widget} onRemove={removeWidget} />
                ))}
              </YStack>
            </YStack>
          ) : (
            <>
              <Text px="$4" fontSize="$5" fontWeight="600" mb="$3">
                Progress Tracking
              </Text>
              <EmptyState
                title="No widgets yet"
                description="Add a widget to track an exercise metric over time."
                icon={BarChart2}
                actionLabel="Add widget"
                onAction={() => setShowWidgetManager(true)}
              />
            </>
          )}
        </YStack>
      )}

      {/* Widget Manager Modal */}
      <WidgetManager isVisible={showWidgetManager} onClose={() => setShowWidgetManager(false)} />
    </ScrollView>
  )
}
