import { useEffect, useMemo, useState, useCallback } from 'react'
import { YStack, XStack, Text, Input, Button, Separator } from 'tamagui'
import { useNavigation, router, useLocalSearchParams } from 'expo-router'
import type { RoutinePatternItem, UpdateRoutineRequest } from '../../types/routine'
import { RoutinePatternEditor } from '../../components/routines/RoutinePatternEditor'
import { useRoutineMutations } from '../../hooks/useRoutineMutations'
import { useRoutines } from '../../hooks/useRoutines'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'

export default function EditRoutinePage() {
  const navigation = useNavigation()
  const params = useLocalSearchParams<{ id: string }>()
  const routineId = params.id

  const { routines, loading: loadingRoutines } = useRoutines()
  const { updateRoutine, loading, error, clearError } = useRoutineMutations()

  const routine = useMemo(() => routines.find((r) => r.id === routineId), [routines, routineId])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(false)
  const [pattern, setPattern] = useState<RoutinePatternItem[]>([
    { dayIndex: 1, dayType: 'WORKOUT', workoutId: null },
  ])

  useEffect(() => {
    navigation.setOptions({ title: 'Edit Routine' })
    return () => clearError()
  }, [clearError, navigation])

  useEffect(() => {
    if (routine) {
      setName(routine.name)
      setDescription(routine.description ?? '')
      setActive(false) // User must explicitly toggle if they want to change active status
      setPattern(
        routine.pattern.map((p) => ({
          dayIndex: p.dayIndex,
          dayType: p.dayType,
          workoutId: p.workoutId,
        }))
      )
    }
  }, [routine])

  const canSave = useMemo(() => {
    if (!name.trim()) return false
    if (pattern.length === 0) return false
    for (const p of pattern) {
      if (p.dayType === 'WORKOUT' && !p.workoutId) return false
    }
    return true
  }, [name, pattern])

  const handleSave = useCallback(async () => {
    if (!canSave || !routineId) return
    const payload: UpdateRoutineRequest = {
      name: name.trim(),
      description: description.trim() || null,
      pattern: pattern.map((p, idx) => ({ ...p, dayIndex: idx + 1 })),
      active: active || undefined,
    }
    const updated = await updateRoutine(routineId, payload)
    if (updated) {
      router.back()
    }
  }, [active, canSave, description, name, pattern, routineId, updateRoutine])

  if (loadingRoutines) {
    return (
      <YStack flex={1} bg="$background" items="center" justify="center">
        <LoadingSpinner />
      </YStack>
    )
  }

  if (!routine) {
    return (
      <YStack flex={1} bg="$background" items="center" justify="center" px="$4">
        <ErrorDisplay message="Routine not found" />
        <Button mt="$4" onPress={() => router.back()}>
          Go back
        </Button>
      </YStack>
    )
  }

  return (
    <YStack flex={1} bg="$background" px="$4" py="$3" gap="$3">
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

      <XStack items="center" gap="$2" mt="$1">
        <Button size="$2" onPress={() => setActive((v) => !v)} variant="outlined">
          {active ? 'Active: Yes' : 'Active: No'}
        </Button>
        <Text color="$color10">Set as active routine</Text>
      </XStack>

      <Separator my="$2" />

      <YStack gap="$2" items="center" flex={1}>
        <Text fontSize="$5" fontWeight="700">
          Pattern
        </Text>
        <RoutinePatternEditor pattern={pattern} onChange={setPattern} />
      </YStack>

      <XStack gap="$3" mt="auto" pb="$3">
        <Button
          flex={1}
          bg="$blue4"
          color="$blue12"
          onPress={() => router.back()}
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
            <Text>Save Changes</Text>
          )}
        </Button>
      </XStack>
    </YStack>
  )
}
