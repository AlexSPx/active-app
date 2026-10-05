import { useEffect, useCallback, useState } from 'react'
import {
  YStack,
  XStack,
  Text,
  Input,
  TextArea,
  Button,
  Separator,
  Switch,
  ScrollView,
} from 'tamagui'
import { useNavigation, router } from 'expo-router'
import { Calendar, ListChecks } from '@tamagui/lucide-icons'
import { useToastController } from '@tamagui/toast'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { CreateRoutineRequest, RoutinePatternItem, RoutineType } from '../../types/routine'
import { RoutinePatternEditor, useRoutineMutations } from '../../features/routines'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { posthog } from '../../services/posthog'
import { DatePickerField } from '../../components/ui/DatePickerField'
import { createRoutineSchema, type CreateRoutineFormData } from '../../lib/schemas/forms'

export default function NewRoutinePage() {
  const navigation = useNavigation()
  const toast = useToastController()
  const { createRoutine, loading, error } = useRoutineMutations()
  const [step, setStep] = useState<1 | 2>(1)
  const [showPatternValidation, setShowPatternValidation] = useState(false)

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
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

  useEffect(() => {
    navigation.setOptions({ title: 'Create Routine' })
  }, [navigation])

  const handleRoutineTypeChange = useCallback(
    (newType: RoutineType) => {
      setValue('routineType', newType)
      if (newType === 'WEEKLY_COMPLETION') {
        const workoutOnly = pattern.filter((p) => p.dayType === 'WORKOUT')
        if (workoutOnly.length > 0) {
          setValue(
            'pattern',
            workoutOnly.map((p, idx) => ({ ...p, dayIndex: idx + 1 }))
          )
        }
      }
    },
    [pattern, setValue]
  )

  const getValidationIssues = useCallback((currentErrors: typeof errors) => {
    const issues: string[] = []
    if (currentErrors.name?.message) issues.push(currentErrors.name.message)
    if (currentErrors.description?.message) issues.push(currentErrors.description.message)
    if (currentErrors.pattern?.message) issues.push(currentErrors.pattern.message)
    return issues
  }, [])

  const showValidationToast = useCallback(
    async (fields?: (keyof CreateRoutineFormData)[]) => {
      const isFormValid = await trigger(fields)
      if (isFormValid) return false

      const currentIssues = getValidationIssues(control._formState.errors as typeof errors)
      if (currentIssues.length > 0) {
        toast.show('Please fix the following:', {
          message: currentIssues.join('\n'),
          duration: 4000,
        })
      }
      return true
    },
    [trigger, getValidationIssues, control, errors, toast]
  )

  const onSubmit = useCallback(
    async (data: CreateRoutineFormData) => {
      const payload: CreateRoutineRequest = {
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        routineType: data.routineType,
        pattern: data.pattern.map((p, idx) => ({
          dayIndex: idx + 1,
          dayType: p.dayType,
          workoutId: p.workoutId ?? null,
        })),
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
    },
    [createRoutine]
  )

  const onContinue = useCallback(async () => {
    const hasErrors = await showValidationToast([
      'name',
      'description',
      'routineType',
      'active',
      'startDate',
    ])
    if (!hasErrors) {
      setStep(2)
    }
  }, [showValidationToast])

  const onSave = useCallback(async () => {
    setShowPatternValidation(true)
    if (await showValidationToast()) return
    handleSubmit(onSubmit)()
  }, [showValidationToast, handleSubmit, onSubmit])

  return (
    <YStack flex={1} bg="$background" px="$4" py="$3" gap="$3">
      {error && <ErrorDisplay message={error} />}

      <YStack gap="$3">
        <XStack items="center" gap="$2">
          <YStack flex={1} items="center" gap="$1">
            <YStack
              width={32}
              height={32}
              rounded="$12"
              items="center"
              justify="center"
              bg={step === 2 ? '$primary' : '$backgroundAccent'}
              borderWidth={step === 1 ? 1 : 0}
              borderColor="$primary"
            >
              <Text color={step === 2 ? '$onPrimary' : '$primary'} fontWeight="700">
                {step === 2 ? '✓' : '1'}
              </Text>
            </YStack>
            <Text
              fontSize="$1"
              textTransform="uppercase"
              letterSpacing={1}
              color={step === 1 ? '$primary' : '$color11'}
            >
              Details
            </Text>
          </YStack>

          <Separator flex={1} borderColor={step === 2 ? '$primary' : '$borderColor'} />

          <YStack flex={1} items="center" gap="$1">
            <YStack
              width={32}
              height={32}
              rounded="$12"
              items="center"
              justify="center"
              bg={step === 2 ? '$backgroundAccent' : '$backgroundHover'}
              borderWidth={step === 2 ? 1 : 0}
              borderColor="$primary"
            >
              <Text color={step === 2 ? '$primary' : '$color10'} fontWeight="700">
                2
              </Text>
            </YStack>
            <Text
              fontSize="$1"
              textTransform="uppercase"
              letterSpacing={1}
              color={step === 2 ? '$primary' : '$color10'}
            >
              Pattern
            </Text>
          </YStack>
        </XStack>
      </YStack>

      {step === 1 ? (
        <ScrollView flex={1} showsVerticalScrollIndicator={false}>
          <YStack gap="$4" pb="$4">
            <YStack gap="$1">
              <Text fontSize="$7" fontWeight="700">
                Routine details
              </Text>
              <Text color="$color11">Give your routine a name and set up how it runs.</Text>
            </YStack>

            <YStack gap="$2">
              <Text
                fontSize="$2"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={1}
                color="$color10"
              >
                Name
              </Text>
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, value } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    placeholder="e.g. Push / Pull / Legs"
                  />
                )}
              />
              {errors.name && (
                <Text color="$red10" fontSize="$2">
                  {errors.name.message}
                </Text>
              )}
            </YStack>

            <YStack gap="$2">
              <Text
                fontSize="$2"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={1}
                color="$color10"
              >
                Description
              </Text>
              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, value } }) => (
                  <TextArea
                    value={value || ''}
                    onChangeText={onChange}
                    placeholder="Optional — what's this routine for?"
                    height={90}
                  />
                )}
              />
              {errors.description && (
                <Text color="$red10" fontSize="$2">
                  {errors.description.message}
                </Text>
              )}
            </YStack>

            <YStack gap="$2">
              <Text
                fontSize="$2"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={1}
                color="$color10"
              >
                Type
              </Text>
              <XStack gap="$2">
                <Button
                  flex={1}
                  size="$4"
                  icon={Calendar}
                  bg={routineType === 'SEQUENTIAL' ? '$backgroundAccent' : '$backgroundHover'}
                  borderWidth={1}
                  borderColor={routineType === 'SEQUENTIAL' ? '$primary' : '$borderColor'}
                  onPress={() => handleRoutineTypeChange('SEQUENTIAL')}
                  pressStyle={{ scale: 0.98 }}
                >
                  <Text
                    color={routineType === 'SEQUENTIAL' ? '$primary' : '$color'}
                    fontWeight={routineType === 'SEQUENTIAL' ? '600' : '500'}
                  >
                    Sequential
                  </Text>
                </Button>
                <Button
                  flex={1}
                  size="$4"
                  icon={ListChecks}
                  bg={
                    routineType === 'WEEKLY_COMPLETION' ? '$backgroundAccent' : '$backgroundHover'
                  }
                  borderWidth={1}
                  borderColor={routineType === 'WEEKLY_COMPLETION' ? '$primary' : '$borderColor'}
                  onPress={() => handleRoutineTypeChange('WEEKLY_COMPLETION')}
                  pressStyle={{ scale: 0.98 }}
                >
                  <Text
                    color={routineType === 'WEEKLY_COMPLETION' ? '$primary' : '$color'}
                    fontWeight={routineType === 'WEEKLY_COMPLETION' ? '600' : '500'}
                  >
                    Weekly
                  </Text>
                </Button>
              </XStack>
              <Text fontSize="$2" color="$color11">
                {routineType === 'SEQUENTIAL'
                  ? 'Days repeat in a fixed cycle, regardless of the calendar.'
                  : 'Complete all workouts within a week (Mon-Sun) in any order.'}
              </Text>
            </YStack>

            <YStack gap="$2">
              <Text
                fontSize="$2"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={1}
                color="$color10"
              >
                Active routine
              </Text>
              <XStack
                items="center"
                justify="space-between"
                p="$3"
                bg="$surface"
                borderWidth={1}
                borderColor="$borderColor"
                rounded="$4"
              >
                <YStack>
                  <Text fontWeight="600">Set as active</Text>
                  <Text color="$color11" fontSize="$2">
                    {watch('active')
                      ? 'On — this will be your current routine'
                      : 'Off — not your current routine'}
                  </Text>
                </YStack>
                <Controller
                  control={control}
                  name="active"
                  render={({ field: { onChange, value } }) => (
                    <Switch
                      checked={value}
                      onCheckedChange={onChange}
                      bg={value ? '$primary' : '$backgroundHover'}
                      borderWidth={1}
                      borderColor={value ? '$primary' : '$borderColor'}
                      accessibilityLabel="Set this routine as active"
                    >
                      <Switch.Thumb animation="bouncy" />
                    </Switch>
                  )}
                />
              </XStack>
            </YStack>

            <Controller
              control={control}
              name="startDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField label="Start Date" value={value} onChange={onChange} />
              )}
            />
          </YStack>
        </ScrollView>
      ) : (
        <YStack flex={1} gap="$3">
          <YStack gap="$1">
            <Text fontSize="$7" fontWeight="700">
              Build the pattern
            </Text>
            <Text color="$color11">Add days and assign workouts or rest to each slot.</Text>
          </YStack>

          <Separator borderColor="$borderColor" />

          <YStack flex={1}>
            <Controller
              control={control}
              name="pattern"
              render={({ field: { onChange, value } }) => (
                <RoutinePatternEditor
                  pattern={value as RoutinePatternItem[]}
                  onChange={onChange}
                  hideRestOption={routineType === 'WEEKLY_COMPLETION'}
                />
              )}
            />
          </YStack>
          {showPatternValidation && errors.pattern && (
            <Text color="$red10" fontSize="$2">
              {errors.pattern.message}
            </Text>
          )}
        </YStack>
      )}

      <XStack gap="$3" pb="$3" pt="$1">
        <Button
          flex={1}
          variant="outlined"
          borderColor="$borderColor"
          onPress={() => {
            if (step === 2) {
              setStep(1)
              return
            }
            router.back()
          }}
          disabled={loading}
        >
          <Text>{step === 1 ? 'Cancel' : 'Back'}</Text>
        </Button>
        <Button
          flex={2}
          bg="$primary"
          onPress={() => {
            if (step === 1) {
              onContinue()
              return
            }
            onSave()
          }}
          disabled={loading}
        >
          {loading ? (
            <XStack items="center" gap="$2">
              <LoadingSpinner size="small" />
              <Text>Saving…</Text>
            </XStack>
          ) : (
            <Text>{step === 1 ? 'Continue' : 'Create Routine'}</Text>
          )}
        </Button>
      </XStack>
    </YStack>
  )
}
