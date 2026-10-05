import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { useState } from 'react'
import { ChevronRight, Plus } from '@tamagui/lucide-icons'
import { useRouter } from 'expo-router'
import { WeeklyView } from '../../components/WeeklyView'
import { TodayView } from '../../components/TodayView'
import { ProgressionWidget } from '../../components/ProgressionWidget'
import { WidgetManager } from '../../components/WidgetManager'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { useRoutines, useActiveRoutine } from '../../features/routines'
import { useWorkouts } from '../../features/workouts'
import { useWidgetStore } from '../../stores/widgetStore'

export default function HomeScreen() {
  const router = useRouter()
  const [widgetMode, setWidgetMode] = useState<'add' | 'manage' | null>(null)
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

  const { widgets } = useWidgetStore()
  const sortedWidgets = [...widgets].sort((a, b) => a.position - b.position)
  const setupLoading = activeRoutineLoading || routinesLoading || workoutsLoading
  const setupError = activeRoutineError || routinesError || workoutsError
  const hasWorkouts = workouts.length > 0
  const canShowPlan = !setupLoading && !setupError && hasWorkouts && !!activeRoutine

  const setupState = !hasWorkouts
    ? {
        title: 'Create your first workout',
        description: 'Choose exercises and set your sets and reps.',
        actionLabel: 'Create workout',
        onAction: () => router.push('/workouts/new'),
      }
    : routines.length === 0
      ? {
          title: 'Set up your routine',
          description: 'Your workouts are ready. Create a routine to plan your training.',
          actionLabel: 'Create routine',
          onAction: () => router.push('/routines/new'),
        }
      : {
          title: 'Choose an active routine',
          description: 'Select a routine to see your plan for today and this week.',
          actionLabel: 'Manage routines',
          onAction: () => router.push('/(tabs)/(workouts)/routines'),
        }

  const weekHelperText = !hasWorkouts
    ? 'Create a workout, then add it to a routine.'
    : routines.length === 0
      ? 'Create a routine to see your training plan here.'
      : 'Activate a routine to see its schedule here.'

  return (
    <ScrollView
      flex={1}
      bg="$background"
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <YStack width="100%" maxW="$content" self="center" px="$page" pt="$3">
        {setupLoading ? (
          <LoadingSpinner text="Loading your plan..." />
        ) : setupError ? (
          <ErrorDisplay
            title="Failed to load your plan"
            message={setupError}
            onRetry={() => {
              void Promise.all([refetchActiveRoutine(), refetchRoutines(), refetchWorkouts()])
            }}
          />
        ) : (
          <YStack gap="$section">
            <WeeklyView
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              inactive={canShowPlan ? undefined : true}
            />
            {canShowPlan ? (
              activeRoutine.routineType !== 'WEEKLY_COMPLETION' && (
                <TodayView selectedDate={selectedDate} />
              )
            ) : (
              <YStack gap="$3" pb="$section" borderBottomWidth={1} borderColor="$borderColor">
                <Text fontSize="$2" color="$colorSubtle">
                  {weekHelperText}
                </Text>
                <YStack gap="$2">
                  <Text
                    fontSize="$sectionTitle"
                    lineHeight="$sectionTitle"
                    fontWeight="600"
                    color="$color"
                  >
                    {setupState.title}
                  </Text>
                  <Text fontSize="$3" color="$colorSubtle" lineHeight="$body">
                    {setupState.description}
                  </Text>
                </YStack>
                <Button
                  unstyled
                  flexDirection="row"
                  self="flex-start"
                  minH="$touch"
                  py="$2"
                  items="center"
                  gap="$2"
                  onPress={setupState.onAction}
                  pressStyle={{ opacity: 0.6 }}
                >
                  <Text color="$primary" fontWeight="600">
                    {setupState.actionLabel}
                  </Text>
                  <ChevronRight size="$icon" color="$primary" aria-hidden />
                </Button>
              </YStack>
            )}
          </YStack>
        )}

        <YStack pt="$section" pb="$section" gap="$field">
          <XStack items="center" justify="space-between" gap="$compact" flexWrap="wrap">
            <Text fontSize="$header" lineHeight="$header" fontWeight="600" color="$color">
              Your widgets
            </Text>
            <XStack gap="$compact">
              {sortedWidgets.length > 0 && (
                <Button
                  chromeless
                  minH="$touch"
                  rounded="$day"
                  onPress={() => setWidgetMode('manage')}
                >
                  <Text color="$primary" fontSize="$caption" fontWeight="600">
                    Manage
                  </Text>
                </Button>
              )}
              <Button chromeless minH="$touch" rounded="$day" onPress={() => setWidgetMode('add')}>
                <Plus size="$iconSmall" color="$primary" aria-hidden />
                <Text color="$primary" fontSize="$caption" fontWeight="600">
                  Add
                </Text>
              </Button>
            </XStack>
          </XStack>
          {sortedWidgets.length > 0 ? (
            sortedWidgets.map((widget) => <ProgressionWidget key={widget.id} config={widget} />)
          ) : (
            <YStack gap="$compact">
              <Text fontSize="$exerciseTitle" lineHeight="$exerciseTitle" fontWeight="600">
                No widgets yet
              </Text>
              <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                Choose an exercise and metric to track your progress here.
              </Text>
            </YStack>
          )}
          <Button
            height="$action"
            rounded="$button"
            bg="$surface"
            borderColor="$borderColor"
            borderWidth={1}
            onPress={() => setWidgetMode('add')}
          >
            <Plus size="$iconSmall" color="$primary" aria-hidden />
            <Text color="$primary" fontSize="$caption" fontWeight="600">
              Add widget
            </Text>
          </Button>
        </YStack>
      </YStack>
      <WidgetManager
        isVisible={widgetMode !== null}
        mode={widgetMode ?? 'add'}
        onModeChange={setWidgetMode}
        onClose={() => setWidgetMode(null)}
      />
    </ScrollView>
  )
}
