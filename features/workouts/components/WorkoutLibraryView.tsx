import { View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
import { CadenceOverlay } from '../../../components/ui/CadenceOverlay'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import { Plus } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { WorkoutList } from './WorkoutList'
import type { useWorkoutLibrary } from '../hooks/useWorkoutLibrary'

export function WorkoutLibraryView({
  workouts,
  loading,
  error,
  refetch,
  refreshing,
  refresh,
  startWorkout,
  running,
  deleting,
  deleteError,
  confirmOpen,
  focusId,
  cancelDelete,
  confirmDelete,
  handleDeleteWorkout,
  handleEditWorkout,
  navigateToNewWorkout,
  openWorkout,
}: ReturnType<typeof useWorkoutLibrary>) {
  const colors = useCadenceColors()
  if (loading && !workouts.length) {
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background p-page">
        <LoadingSpinner />
        <UiText textRole="bodyMuted">Loading workouts…</UiText>
      </View>
    )
  }
  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background p-page">
        <ErrorDisplay message={error} />
        <Button onPress={refetch}>Try Again</Button>
      </View>
    )
  }
  return (
    <View className="flex-1 bg-background">
      <WorkoutList
        workouts={workouts}
        onStartWorkout={startWorkout}
        isWorkoutRunning={running}
        onEditWorkout={handleEditWorkout}
        focusId={focusId}
        listHeader={
          <View className="mb-field flex-row items-center justify-between gap-field py-field">
            <View className="min-w-0 flex-1 gap-compact">
              <UiText textRole="bodyEmphasis" accessibilityRole="header">
                Your workouts
              </UiText>
              <UiText textRole="meta">{workouts.length} saved</UiText>
            </View>
            <Button
              variant="ghost"
              accessibilityLabel="Create workout"
              onPress={navigateToNewWorkout}
              className="flex-row gap-compact"
            >
              <Plus size={16} color={colors.accent} aria-hidden />
              <UiText textRole="captionEmphasis">Create</UiText>
            </Button>
          </View>
        }
        onDeleteWorkout={handleDeleteWorkout}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onWorkoutPress={openWorkout}
      />
      <CadenceOverlay
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) cancelDelete()
        }}
        title="Delete workout"
        dismissible={!deleting}
      >
        <UiText textRole="bodyMuted">
          Are you sure? This will permanently delete this workout.
        </UiText>
        {!!deleteError && <ErrorDisplay title="Cannot delete workout" message={deleteError} />}
        <Button variant="surface" disabled={deleting} loading={deleting} onPress={confirmDelete}>
          <UiText textRole="bodyDestructive">{deleting ? 'Deleting…' : 'Delete workout'}</UiText>
        </Button>
        <Button variant="secondary" disabled={deleting} onPress={cancelDelete}>
          Cancel
        </Button>
      </CadenceOverlay>
    </View>
  )
}
