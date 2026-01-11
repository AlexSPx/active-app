import { useEffect, useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Input, Button, Separator } from 'tamagui'
import { useNavigation, router } from 'expo-router'
import { Calendar, ListChecks } from '@tamagui/lucide-icons'
import { useToastController } from '@tamagui/toast'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { RoutinePatternItem, CreateRoutineRequest, RoutineType } from '../../types/routine'
import { RoutinePatternEditor, useRoutineMutations } from '../../features/routines'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { posthog } from '../../services/posthog'
import { DatePickerField } from '../../components/ui/DatePickerField'
import { createRoutineSchema, type CreateRoutineFormData } from '../../lib/schemas/forms'

export default function NewRoutinePage() {
  const navigation = useNavigation()
  const toast = useToastController()
  const { createRoutine, loading, error, clearError } = useRoutineMutations()

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<CreateRoutineFormData>({
    resolver: zodResolver(createRoutineSchema),
    defaultValues: {
      name: '',
      description: '',
      routineType: 'SEQUENTIAL',
      pattern: [{ dayIndex: 1, dayType: 'WORKOUT', workoutId: null }],
      active: false,
      startDate: new Date(),
    },
    mode: 'onChange',
  })

  const routineType = watch('routineType')
  const pattern = watch('pattern')

  // Get validation issues from Zod schema errors + runtime checks
  const validationIssues = useMemo(() => {
    const issues: string[] = []
    // Add errors from Zod schema validation
    if (errors.name?.message) issues.push(errors.name.message)
    if (errors.pattern?.message) issues.push(errors.pattern.message)
    if (errors.description?.message) issues.push(errors.description.message)
    return issues
  }, [errors])

  useEffect(() => {
    navigation.setOptions({ title: 'Create Routine' })
    return () => clearError()
  }, [clearError, navigation])

  const handleRoutineTypeChange = useCallback(
    (newType: RoutineType) => {
      setValue('routineType', newType)
      if (newType === 'WEEKLY_COMPLETION') {
        const workoutOnly = pattern.filter((p) => p.dayType === 'WORKOUT')
        if (workoutOnly.length > 0) {
          setValue('pattern', workoutOnly.map((p, idx) => ({ ...p, dayIndex: idx + 1 })))
        }
      }
    },
    [pattern, setValue]
  )

  const onSubmit = useCallback(async (data: CreateRoutineFormData) => {
    const payload: CreateRoutineRequest = {
      name: data.name.trim(),
      description: data.description?.trim() || undefined,
      routineType: data.routineType,
      pattern: data.pattern.map((p, idx) => ({ ...p, dayIndex: idx + 1 })),
      active: data.active,
      startDate: data.startDate.toISOString(),
    }
    const created = await createRoutine(payload)
    if (created) {
      posthog.capture('routine_created', {
        routineType: data.routineType,
        workoutDays: payload.pattern.filter((p) => p.dayType === 'WORKOUT').length,
        restDays: payload.pattern.filter((p) => p.dayType === 'REST').length,
        active: !!payload.active,
      })
      router.back()
    }
  }, [createRoutine])

  return (
    <YStack flex={1} bg="$background" px="$4" py="$3" gap="$3">
      {error && <ErrorDisplay message={error} />}

      <YStack gap="$2">
        <Text fontSize="$3" color="$color10">
          Name
        </Text>
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <Input value={value} onChangeText={onChange} placeholder="Routine name" />
          )}
        />
        {errors.name && <Text color="$red10" fontSize="$2">{errors.name.message}</Text>}
      </YStack>

      <YStack gap="$2">
        <Text fontSize="$3" color="$color10">
          Description
        </Text>
        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <Input
              value={value || ''}
              onChangeText={onChange}
              placeholder="Optional description"
            />
          )}
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

      <Controller
        control={control}
        name="active"
        render={({ field: { onChange, value } }) => (
          <XStack items="center" gap="$2" mt="$1">
            <Button size="$2" onPress={() => onChange(!value)} variant="outlined">
              <Text>{value ? 'Active: Yes' : 'Active: No'}</Text>
            </Button>
            <Text color="$color10">Set as active routine</Text>
          </XStack>
        )}
      />

      <Controller
        control={control}
        name="startDate"
        render={({ field: { onChange, value } }) => (
          <DatePickerField
            label="Start Date"
            value={value}
            onChange={onChange}
          />
        )}
      />

      <Separator my="$2" />

      <YStack gap="$2" items="center" flex={1}>
        <Text fontSize="$5" fontWeight="700">
          Pattern
        </Text>
        <Controller
          control={control}
          name="pattern"
          render={({ field: { onChange, value } }) => (
            <RoutinePatternEditor
              pattern={value}
              onChange={onChange}
              hideRestOption={routineType === 'WEEKLY_COMPLETION'}
            />
          )}
        />
        {errors.pattern && <Text color="$red10" fontSize="$2">{errors.pattern.message}</Text>}
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
        <Button flex={1} bg="$primary" onPress={() => {
          // Show validation toast if form is invalid
          if (validationIssues.length > 0) {
            toast.show('Please fix the following:', {
              message: validationIssues.join('\n'),
              duration: 4000,
            })
            return
          }
          handleSubmit(onSubmit)()
        }} disabled={loading}>
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

