import { useEffect, useMemo, useState, useCallback } from 'react'
import { YStack, XStack, Text, Input, Button, Separator } from 'tamagui'
import { useNavigation, router } from 'expo-router'
import type { RoutinePatternItem, CreateRoutineRequest, Routine } from '../../types/routine'
import { RoutinePatternEditor } from '../../components/routines/RoutinePatternEditor'
import { useRoutineMutations } from '../../hooks/useRoutineMutations'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { posthog } from '../../services/posthog'

export default function NewRoutinePage() {
  const navigation = useNavigation()
  const { createRoutine, loading, error, clearError } = useRoutineMutations()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(false)
  const [pattern, setPattern] = useState<RoutinePatternItem[]>([
    { dayIndex: 1, dayType: 'WORKOUT', workoutId: null },
  ])

  useEffect(() => {
    navigation.setOptions({ title: 'Create Routine' })
    return () => clearError()
  }, [clearError, navigation])

  const canSave = useMemo(() => {
    if (!name.trim()) return false
    if (pattern.length === 0) return false
    for (const p of pattern) {
      if (p.dayType === 'WORKOUT' && !p.workoutId) return false
    }
    return true
  }, [name, pattern])

  const handleSave = useCallback(async () => {
    if (!canSave) return
    const payload: CreateRoutineRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      pattern: pattern.map((p, idx) => ({ ...p, dayIndex: idx + 1 })),
      active,
    }
    const created = await createRoutine(payload)
    if (created) {
      posthog.capture('routine_created', {
        workoutDays: payload.pattern.filter((p) => p.dayType === 'WORKOUT').length,
        restDays: payload.pattern.filter((p) => p.dayType === 'REST').length,
        active: !!payload.active,
      })
      // Go back to routines tab; focus listener there will refetch
      router.back()
    }
  }, [active, canSave, createRoutine, description, name, pattern])

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
          <Text>{active ? 'Active: Yes' : 'Active: No'}</Text>
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
          <Text>Cancel</Text>
        </Button>
        <Button flex={1} bg="$primary" onPress={handleSave} disabled={!canSave || loading}>
          {loading ? (
            <XStack items="center" gap="$2">
              <LoadingSpinner size="small" />
              <Text>Saving…</Text>
            </XStack>
          ) : (
            <Text>Create Routine</Text>
          )}
        </Button>
      </XStack>
    </YStack>
  )
}
