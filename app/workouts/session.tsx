import { useState } from 'react'
import { KeyboardAvoidingView, Platform, type LayoutChangeEvent } from 'react-native'
import { Button, Text, YStack } from 'tamagui'
import { Stack } from 'expo-router'
import { useHeaderHeight } from '@react-navigation/elements'
import { useFeedback } from '../../components/feedback/FeedbackProvider'
import { FlashList } from '@shopify/flash-list'

import {
  WorkoutSessionExercise,
  WorkoutSessionHeader,
  WorkoutActions,
  useWorkoutSession,
  RestTimerOverlay,
} from '../../features/workout-session'
import { getCurrentDate } from '../../utils/date'
import { useAppNavigation } from '../../navigation/useAppNavigation'
import type { Exercise } from '../../types/workout-session'
import { useUiStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { getProfileScope, isCurrentProfile } from '../../lib/profileScope'
import { useCadenceColors } from '../../components/ui/useCadenceColors'

export default function WorkoutSessionScreen() {
  const { goBack } = useAppNavigation()
  const colors = useCadenceColors()
  const headerHeight = useHeaderHeight()
  const [footerHeight, setFooterHeight] = useState(0)
  const {
    // State
    exercises,
    workoutName,
    workoutTag,
    workoutDuration,
    // Actions
    updateSet,
    toggleSetComplete,
    addSet,
    removeSet,
    startRestTimer,
    extendRestTimer,
    skipRestTimer,
    finishWorkout,
    cancelWorkout,
    // Timer state
    activeTimer,
    restTime,
    remainingRest,
  } = useWorkoutSession()

  const showFinishedCongrats = useUiStore((s) => s.showFinishedCongrats)
  const toast = useFeedback()

  const finishWorkoutWithFeedback = async () => {
    const profileScope = getProfileScope()
    const startingAuthState = useAuthStore.getState()
    const isCurrentFinishSession = () => {
      const authState = useAuthStore.getState()
      return (
        isCurrentProfile(profileScope) &&
        authState.user?.id === startingAuthState.user?.id &&
        authState.isAuthenticated === startingAuthState.isAuthenticated &&
        !authState.isProfileTransitioning
      )
    }

    let resp: Awaited<ReturnType<typeof finishWorkout>>
    try {
      resp = await finishWorkout()
    } catch (error) {
      if (!isCurrentFinishSession()) return false
      throw error
    }

    if (!isCurrentFinishSession()) return false
    if (!resp) {
      toast.show('Workout not saved', {
        message: 'Your session is still in progress. Tap Finish workout to retry.',
      })
      return false
    }

    showFinishedCongrats(resp)
    return true
  }

  const renderExercise = ({ item: exercise, index }: { item: Exercise; index: number }) => (
    <WorkoutSessionExercise
      exercise={exercise}
      index={index}
      onUpdateSet={updateSet}
      onToggleSetComplete={toggleSetComplete}
      onAddSet={addSet}
      onRemoveSet={removeSet}
      onStartRestTimer={startRestTimer}
    />
  )

  const ListHeaderComponent = () => (
    <WorkoutSessionHeader
      workoutName={workoutName}
      duration={workoutDuration}
      date={getCurrentDate()}
    />
  )

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <YStack flex={1} px="$4" bg="$background">
        <Stack.Screen
          options={{
            title: '',
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: () => (
              <Button
                unstyled
                minH="$touch"
                accessibilityLabel="Leave workout session"
                onPress={goBack}
              >
                <Text fontSize="$caption" fontWeight="600" color={colors.accent}>
                  Leave
                </Text>
              </Button>
            ),
          }}
        />
        <FlashList
          style={{ flex: 1 }}
          data={exercises}
          renderItem={renderExercise}
          keyExtractor={(item) => item.sessionId}
          ItemSeparatorComponent={() => <YStack height={16} />}
          ListHeaderComponent={ListHeaderComponent}
          ListHeaderComponentStyle={{ marginBottom: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        />
        <YStack
          borderTopWidth={1}
          borderColor="$borderColor"
          bg="$background"
          onLayout={(event: LayoutChangeEvent) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          <WorkoutActions
            onFinishWorkout={finishWorkoutWithFeedback}
            onCancelWorkout={cancelWorkout}
            onGoBack={goBack}
          />
        </YStack>
        <RestTimerOverlay
          active={!!activeTimer}
          remaining={remainingRest}
          total={restTime}
          onExtend={extendRestTimer}
          onSkip={skipRestTimer}
          bottomOffset={footerHeight}
        />
      </YStack>
    </KeyboardAvoidingView>
  )
}
