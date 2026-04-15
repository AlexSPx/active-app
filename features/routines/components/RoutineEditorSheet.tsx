import { useEffect, useMemo, useState, useCallback } from 'react'
import { Sheet } from '@tamagui/sheet'
import { YStack, XStack, Text, Input, Button } from 'tamagui'
import type {
  Routine,
  RoutinePatternItem,
  CreateRoutineRequest,
  UpdateRoutineRequest,
} from '../../../types/routine'
import { RoutinePatternEditor } from './RoutinePatternEditor'
import { useRoutineMutations } from '../hooks/useRoutineMutations'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'

export interface RoutineEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  routine?: Routine | null
  onSaved?: (routine: Routine) => void
}

export function RoutineEditorSheet({
  open,
  onOpenChange,
  routine,
  onSaved,
}: RoutineEditorSheetProps) {
  const isEdit = !!routine
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(false)
  const [pattern, setPattern] = useState<RoutinePatternItem[]>([])

  const { createRoutine, updateRoutine, loading, error, clearError } = useRoutineMutations()

  useEffect(() => {
    if (open) {
      if (routine) {
        setName(routine.name)
        setDescription(routine.description ?? '')
        setActive(false) // do not auto-toggle active on edit unless user chooses
        setPattern(
          routine.pattern.map((p) => ({
            dayIndex: p.dayIndex,
            dayType: p.dayType,
            workoutId: p.workoutId,
          }))
        )
      } else {
        setName('')
        setDescription('')
        setActive(false)
        setPattern([{ dayIndex: 1, dayType: 'WORKOUT', workoutId: null }])
      }
    } else {
      // clear when closing
      clearError()
    }
  }, [open, routine, clearError])

  const canSave = useMemo(() => {
    if (!name.trim()) return false
    if (pattern.length === 0) return false
    // For workout days ensure a workout is selected
    for (const p of pattern) {
      if (p.dayType === 'WORKOUT' && !p.workoutId) return false
    }
    return true
  }, [name, pattern])

  const handleSave = useCallback(async () => {
    if (!canSave) return
    if (isEdit && routine) {
      const payload: UpdateRoutineRequest = {
        name: name.trim(),
        description: description.trim() || null,
        pattern: pattern.map((p, idx) => ({ ...p, dayIndex: idx + 1 })),
        active: active || undefined,
      }
      const updated = await updateRoutine(routine.id, payload)
      if (updated) {
        onSaved?.(updated)
        onOpenChange(false)
      }
    } else {
      const payload: CreateRoutineRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        pattern: pattern.map((p, idx) => ({ ...p, dayIndex: idx + 1 })),
        active,
      }
      const created = await createRoutine(payload)
      if (created) {
        onSaved?.(created)
        onOpenChange(false)
      }
    }
  }, [
    active,
    canSave,
    createRoutine,
    description,
    isEdit,
    name,
    onOpenChange,
    onSaved,
    pattern,
    routine,
    updateRoutine,
  ])

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      modal
      dismissOnOverlayPress={!loading}
      snapPointsMode="fit"
    >
      <Sheet.Overlay animation="lazy" style={{ backgroundColor: 'transparent' }} />
      <Sheet.Handle bg="$surface" />
      <Sheet.Frame bg="$surface" borderTopLeftRadius="$6" borderTopRightRadius="$6" p="$4">
        <YStack gap="$3">
          <Text fontSize="$6" fontWeight="700">
            {isEdit ? 'Edit Routine' : 'Create Routine'}
          </Text>

          {error && <ErrorDisplay message={error} />}

          <YStack gap="$2">
            <Text fontSize="$3" color="$color10">
              Name
            </Text>
            <Input value={name} onChangeText={setName} placeholder="Routine name" />
          </YStack>

          <YStack gap="$2">
            <Text fontSize="$3" color="$color10">
              Description
            </Text>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description"
            />
          </YStack>

          <XStack items="center" gap="$2">
            <Button size="$2" onPress={() => setActive((v) => !v)} variant="outlined">
              {active ? 'Active: Yes' : 'Active: No'}
            </Button>
            <Text color="$color10">Set as active routine</Text>
          </XStack>

          <YStack gap="$2" mt="$2">
            <Text fontSize="$5" fontWeight="700">
              Pattern
            </Text>
            <RoutinePatternEditor pattern={pattern} onChange={setPattern} />
          </YStack>

          <XStack gap="$3" mt="$3">
            <Button
              flex={1}
              bg="$blue4"
              color="$blue12"
              onPress={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button flex={1} bg="$primary" onPress={handleSave} disabled={!canSave || loading}>
              {loading ? (
                <XStack items="center" gap="$2">
                  <LoadingSpinner size="small" />
                  <Text>Saving…</Text>
                </XStack>
              ) : (
                <Text>{isEdit ? 'Save Changes' : 'Create Routine'}</Text>
              )}
            </Button>
          </XStack>
        </YStack>
      </Sheet.Frame>
    </Sheet>
  )
}
