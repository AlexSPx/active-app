import { useTabContentInset } from '../../navigation/TabContentInset'
import { ScrollView, View } from 'react-native'
import { Button, UiText } from '../../components/ui/Controls'
import { ArrowRight, Plus } from '../../components/ui/icons'
import { useCadenceColors } from '../../components/ui/useCadenceColors'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { TodayView } from '../../components/TodayView'
import { FlexibleRoutineView } from '../../features/training/components/FlexibleRoutineView'
import { WeeklyView } from '../../components/WeeklyView'
import { TrainingWidgets } from '../../features/training/components/TrainingWidgets'
import { useTrainingHomeController } from '../../features/training/hooks/useTrainingHomeController'

export default function HomeScreen() {
  const bottomInset = useTabContentInset()
  const home = useTrainingHomeController()
  const colors = useCadenceColors()

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: bottomInset }}
    >
      <View className="mx-auto w-full max-w-3xl gap-section px-page pb-section">
        <UiText textRole="meta" className="pt-page">
          {home.todayLabel}
        </UiText>

        {home.state.kind === 'loading' ? (
          <View className="items-center py-section">
            <LoadingSpinner text="Loading your plan..." />
          </View>
        ) : home.state.kind === 'error' ? (
          <ErrorDisplay
            title="Failed to load your plan"
            message={home.state.message}
            onRetry={() => void home.retry()}
          />
        ) : home.state.kind === 'setup' ? (
          <View className="gap-section">
            <WeeklyView plan={home.state.weekPlan} onSelectDate={home.selectDate} />
            <View className="gap-field rounded-card bg-raised p-card">
              <View className="gap-compact">
                <UiText textRole="cardTitle" accessibilityRole="header">
                  {home.state.setup.title}
                </UiText>
                <UiText textRole="bodyMuted">{home.state.setup.description}</UiText>
              </View>
              <Button onPress={home.state.setup.onAction} className="flex-row gap-compact">
                {home.state.setup.kind === 'choose-routine' ? (
                  <ArrowRight size={18} color={colors.onAccent} aria-hidden />
                ) : (
                  <Plus size={18} color={colors.onAccent} aria-hidden />
                )}
                <UiText textRole="buttonOnAccent" className="shrink">
                  {home.state.setup.actionLabel}
                </UiText>
              </Button>
            </View>
          </View>
        ) : (
          <View className="gap-section">
            {home.state.weekPlan.kind === 'flexible' ? (
              <FlexibleRoutineView
                plan={home.state.weekPlan}
                onOpenWorkout={home.openWorkout}
                onOpenRecord={home.openCompletedRecord}
                onManageRoutine={home.manageRoutines}
                isWorkoutRunning={home.isWorkoutRunning}
                onResume={home.resumeWorkout}
                recordsError={home.recordsError}
                onRetryRecords={home.retryRecords}
              />
            ) : (
              <WeeklyView plan={home.state.weekPlan} onSelectDate={home.selectDate} />
            )}
            {home.state.weekPlan.kind === 'cycle' && home.state.selectedSession && (
              <TodayView
                session={home.state.selectedSession}
                isWorkoutRunning={home.isWorkoutRunning}
                onStartWorkout={home.startWorkout}
                onOpenWorkout={home.openWorkout}
                onBrowseWorkouts={home.browseWorkouts}
                onManageRoutines={home.manageRoutines}
              />
            )}
          </View>
        )}

        <TrainingWidgets />
      </View>
    </ScrollView>
  )
}
