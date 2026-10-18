import { View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
import { CadenceOverlay } from '../../../components/ui/CadenceOverlay'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import { Plus } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { RoutineList } from './RoutineList'
import type { useRoutineLibrary } from '../hooks/useRoutineLibrary'

type Props = ReturnType<typeof useRoutineLibrary>
export function RoutineLibraryView(props: Props) {
  const colors = useCadenceColors()
  if (props.loading && !props.routines.length)
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background">
        <LoadingSpinner />
        <UiText textRole="bodyMuted">Loading routines...</UiText>
      </View>
    )
  if (props.error)
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background p-page">
        <ErrorDisplay message={props.error} />
        <Button onPress={() => void props.retry()}>Try Again</Button>
      </View>
    )
  return (
    <View className="flex-1 bg-background">
      <RoutineList
        routines={props.routines}
        workoutTitleById={props.workoutTitleById}
        activeRoutineId={props.activeRoutineId}
        onActivate={props.activate}
        onEditRoutine={props.edit}
        onDeleteRoutine={props.requestDelete}
        onPressRoutine={props.detail}
        onStartFromToday={props.startToday}
        disableActions={props.busy}
        refreshing={props.refreshing}
        onRefresh={() => void props.refresh()}
        listHeader={
          <View className="mb-card gap-field">
            <View className="flex-row items-center justify-between gap-field">
              <View className="gap-compact">
                <UiText textRole="bodyEmphasis" accessibilityRole="header">
                  Your routines
                </UiText>
                <UiText textRole="caption">
                  {props.routines.length} saved{' '}
                  {props.routines.length === 1 ? 'routine' : 'routines'}
                </UiText>
              </View>
              <Button variant="ghost" accessibilityLabel="Create routine" onPress={props.create}>
                <View className="flex-row items-center gap-compact">
                  <Plus size={16} color={colors.muted} aria-hidden />
                  <UiText textRole="caption">Create</UiText>
                </View>
              </Button>
            </View>
            {!!props.mutationError && !props.confirmOpen && (
              <ErrorDisplay message={props.mutationError} />
            )}
          </View>
        }
      />
      <CadenceOverlay
        open={props.confirmOpen}
        onOpenChange={props.setConfirmOpen}
        title="Delete routine"
        dismissible={!props.busy}
      >
        <View className="gap-field">
          <UiText textRole="bodyMuted">
            Are you sure? This will permanently delete this routine.
          </UiText>
          {!!props.mutationError && (
            <ErrorDisplay title="Cannot delete routine" message={props.mutationError} />
          )}
          <Button
            variant="surface"
            disabled={props.busy}
            loading={props.busy}
            onPress={() => void props.confirmDelete()}
          >
            <UiText textRole="bodyDestructive">
              {props.busy ? 'Deleting…' : 'Delete routine'}
            </UiText>
          </Button>
          <Button
            variant="secondary"
            disabled={props.busy}
            onPress={() => props.setConfirmOpen(false)}
          >
            Cancel
          </Button>
        </View>
      </CadenceOverlay>
    </View>
  )
}
