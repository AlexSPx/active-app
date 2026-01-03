import { useEffect, useMemo, useState, useCallback } from 'react'
import { YStack, XStack, Text, Input, Button, Separator } from 'tamagui'
import { useNavigation, router, useLocalSearchParams } from 'expo-router'
import { Calendar, ListChecks } from '@tamagui/lucide-icons'
import type { RoutinePatternItem, UpdateRoutineRequest, RoutineType } from '../../types/routine'
import { RoutinePatternEditor } from '../../components/routines/RoutinePatternEditor'
import { useRoutineMutations } from '../../hooks/useRoutineMutations'
import { useRoutines } from '../../hooks/useRoutines'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { DatePickerField } from '../../components/ui/DatePickerField'

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
  const [startDate, setStartDate] = useState(new Date())
  const [routineType, setRoutineType] = useState<RoutineType>('SEQUENTIAL')
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
      setRoutineType(routine.routineType ?? 'SEQUENTIAL')
      if (routine.startDate) {
        setStartDate(new Date(routine.startDate))
      }
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

  const handleRoutineTypeChange = useCallback(
    (newType: RoutineType) => {
      setRoutineType(newType)
      if (newType === 'WEEKLY_COMPLETION') {
        const workoutOnly = pattern.filter((p) => p.dayType === 'WORKOUT')
        if (workoutOnly.length > 0) {
          setPattern(workoutOnly.map((p, idx) => ({ ...p, dayIndex: idx + 1 })))
        }
      }
    },
    [pattern]
  )

  const handleSave = useCallback(async () => {
    if (!canSave || !routineId) return
    const payload: UpdateRoutineRequest = {
      name: name.trim(),
      description: description.trim() || null,
      routineType,
      pattern: pattern.map((p, idx) => ({ ...p, dayIndex: idx + 1 })),
      active: active || undefined,
      startDate: startDate.toISOString(),
    }
    const updated = await updateRoutine(routineId, payload)
    if (updated) {
      router.back()
    }
  }, [active, canSave, description, name, pattern, routineId, routineType, startDate, updateRoutine])

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

      {/* Routine Type Selector */}
      <YStack gap="$2">
        <Text fontSize="$3" color="$color10">
          Type
        </Text>
        <XStack gap="$3">
          <Button
            flex={1}
            size="$4"
            icon={Calendar}
            bg={routineType === 'SEQUENTIAL' ? '$primary' : '$backgroundHover'}
            borderWidth={routineType === 'SEQUENTIAL' ? 0 : 1}
            borderColor="$borderColor"
            onPress={() => handleRoutineTypeChange('SEQUENTIAL')}
            pressStyle={{ scale: 0.97 }}
          >
            <Text
              color={routineType === 'SEQUENTIAL' ? '$onPrimary' : '$color'}
              fontWeight={routineType === 'SEQUENTIAL' ? '600' : '500'}
            >
              Sequential
            </Text>
          </Button>
          <Button
            flex={1}
            size="$4"
            icon={ListChecks}
            bg={routineType === 'WEEKLY_COMPLETION' ? '$primary' : '$backgroundHover'}
            borderWidth={routineType === 'WEEKLY_COMPLETION' ? 0 : 1}
            borderColor="$borderColor"
            onPress={() => handleRoutineTypeChange('WEEKLY_COMPLETION')}
            pressStyle={{ scale: 0.97 }}
          >
            <Text
              color={routineType === 'WEEKLY_COMPLETION' ? '$onPrimary' : '$color'}
              fontWeight={routineType === 'WEEKLY_COMPLETION' ? '600' : '500'}
            >
              Weekly
            </Text>
          </Button>
        </XStack>
        <Text fontSize="$2" color="$color11">
          {routineType === 'SEQUENTIAL'
            ? 'Workouts follow a specific day order in a repeating cycle'
            : 'Complete all workouts within a week (Mon-Sun) in any order'}
        </Text>
      </YStack>

      <XStack items="center" gap="$2" mt="$1">
        <Button size="$2" onPress={() => setActive((v) => !v)} variant="outlined">
          {active ? 'Active: Yes' : 'Active: No'}
        </Button>
        <Text color="$color10">Set as active routine</Text>
      </XStack>

      <DatePickerField
        label="Start Date"
        value={startDate}
        onChange={setStartDate}
      />

      <Separator my="$2" />

      <YStack gap="$2" items="center" flex={1}>
        <Text fontSize="$5" fontWeight="700">
          Pattern
        </Text>
        <RoutinePatternEditor
          pattern={pattern}
          onChange={setPattern}
          hideRestOption={routineType === 'WEEKLY_COMPLETION'}
        />
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
