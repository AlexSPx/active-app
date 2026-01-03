import { useEffect, useMemo, useState, useCallback } from 'react'
import { YStack, XStack, Text, Input, Button, Separator } from 'tamagui'
import { useNavigation, router } from 'expo-router'
import { Calendar, ListChecks } from '@tamagui/lucide-icons'
import type { RoutinePatternItem, CreateRoutineRequest, Routine, RoutineType } from '../../types/routine'
import { RoutinePatternEditor } from '../../components/routines/RoutinePatternEditor'
import { useRoutineMutations } from '../../hooks/useRoutineMutations'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { posthog } from '../../services/posthog'
import { DatePickerField } from '../../components/ui/DatePickerField'

export default function NewRoutinePage() {
  const navigation = useNavigation()
  const { createRoutine, loading, error, clearError } = useRoutineMutations()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(false)
  const [startDate, setStartDate] = useState(new Date())
  const [routineType, setRoutineType] = useState<RoutineType>('SEQUENTIAL')
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
    if (!canSave) return
    const payload: CreateRoutineRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      routineType,
      pattern: pattern.map((p, idx) => ({ ...p, dayIndex: idx + 1 })),
      active,
      startDate: startDate.toISOString(),
    }
    const created = await createRoutine(payload)
    if (created) {
      posthog.capture('routine_created', {
        routineType,
        workoutDays: payload.pattern.filter((p) => p.dayType === 'WORKOUT').length,
        restDays: payload.pattern.filter((p) => p.dayType === 'REST').length,
        active: !!payload.active,
      })
      // Go back to routines tab; focus listener there will refetch
      router.back()
    }
  }, [active, canSave, createRoutine, description, name, pattern, routineType, startDate])

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
          <Text>{active ? 'Active: Yes' : 'Active: No'}</Text>
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
