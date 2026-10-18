import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { measurementText, parseMeasurement } from '../settings/inputs'
import { launchFacade } from '../launch/launchFacade'
import { registrationFormSchema, type RegistrationFormData } from '../../lib/schemas/forms'
import type { User } from '../../types/api'

export const registrationSteps = ['agreement', 'personal', 'body', 'notifications'] as const
export type RegistrationStep = (typeof registrationSteps)[number]

export type RegistrationAdvanceResult =
  | { kind: 'blocked' }
  | { kind: 'advanced'; step: RegistrationStep }
  | { kind: 'complete'; values: RegistrationFormData }

export function useRegistrationController(user: User | null) {
  const [step, setStep] = useState<RegistrationStep>('agreement')
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [weightText, setWeightText] = useState('70')
  const [heightText, setHeightText] = useState('170')
  const [weightEntryError, setWeightEntryError] = useState<string | null>(null)
  const [heightEntryError, setHeightEntryError] = useState<string | null>(null)
  const initialized = useRef(false)

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: {
      email: '',
      isWorkOSAuth: false,
      username: '',
      firstName: '',
      lastName: '',
      weight: 70,
      height: 170,
      weightUnit: 'kg',
      heightUnit: 'cm',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      notificationFrequency: 1,
    },
    mode: 'onChange',
    shouldUnregister: false,
  })

  const username = form.watch('username')
  const firstName = form.watch('firstName')
  const lastName = form.watch('lastName')
  const weight = form.watch('weight')
  const height = form.watch('height')
  const weightUnit = form.watch('weightUnit')
  const heightUnit = form.watch('heightUnit')
  const stepIndex = registrationSteps.indexOf(step)

  useEffect(() => {
    if (!user || initialized.current) return

    const initialization = launchFacade.onboarding.initialization(user)
    if (initialization) {
      const values = initialization.values
      if (values.username) form.setValue('username', values.username)
      if (values.firstName) form.setValue('firstName', values.firstName)
      if (values.lastName) form.setValue('lastName', values.lastName)
      if (values.timezone) form.setValue('timezone', values.timezone)
      if (user.measurements?.weightKg != null) {
        form.setValue('weight', user.measurements.weightKg)
        setWeightText(measurementText(user.measurements.weightKg, form.getValues('weightUnit')))
      }
      if (user.measurements?.heightCm != null) {
        form.setValue('height', user.measurements.heightCm)
        setHeightText(measurementText(user.measurements.heightCm, form.getValues('heightUnit')))
      }
    }
    initialized.current = true
  }, [form, user])

  const setWeightUnit = (unit: RegistrationFormData['weightUnit']) => {
    form.setValue('weightUnit', unit)
    setWeightText(measurementText(weight, unit))
    setWeightEntryError(null)
  }

  const setHeightUnit = (unit: RegistrationFormData['heightUnit']) => {
    form.setValue('heightUnit', unit)
    setHeightText(measurementText(height, unit))
    setHeightEntryError(null)
  }

  const updateWeightText = (text: string) => {
    setWeightText(text)
    const value = parseMeasurement(text, weightUnit)
    if (value === undefined) {
      setWeightEntryError('Enter a valid weight or clear the field to skip it.')
      return
    }
    setWeightEntryError(null)
    form.setValue('weight', value, { shouldDirty: true, shouldValidate: true })
  }

  const updateHeightText = (text: string) => {
    setHeightText(text)
    const value = parseMeasurement(text, heightUnit)
    if (value === undefined) {
      setHeightEntryError('Enter a valid height or clear the field to skip it.')
      return
    }
    setHeightEntryError(null)
    form.setValue('height', value, { shouldDirty: true, shouldValidate: true })
  }

  const next = async (): Promise<RegistrationAdvanceResult> => {
    if (step === 'agreement') {
      if (!agreementAccepted) return { kind: 'blocked' }
      setDirection('forward')
      setStep('personal')
      return { kind: 'advanced', step: 'personal' }
    }

    if (step === 'personal') {
      const valid = await form.trigger(['username', 'firstName', 'lastName'])
      if (!valid) return { kind: 'blocked' }
      setDirection('forward')
      setStep('body')
      return { kind: 'advanced', step: 'body' }
    }

    if (step === 'body') {
      if (weightEntryError || heightEntryError) return { kind: 'blocked' }
      const valid = await form.trigger(['weight', 'height'])
      if (!valid) return { kind: 'blocked' }
      setDirection('forward')
      setStep('notifications')
      return { kind: 'advanced', step: 'notifications' }
    }

    const valid = await form.trigger()
    return valid ? { kind: 'complete', values: form.getValues() } : { kind: 'blocked' }
  }

  const back = (): boolean => {
    if (stepIndex === 0) return false
    const previousStep = registrationSteps[stepIndex - 1]
    setDirection('back')
    setStep(previousStep)
    return true
  }

  return {
    step,
    stepIndex,
    stepCount: registrationSteps.length,
    direction,
    agreementAccepted,
    setAgreementAccepted,
    values: { username, firstName, lastName, weight, height, weightUnit, heightUnit },
    errors: form.formState.errors,
    weightText,
    heightText,
    weightEntryError,
    heightEntryError,
    setWeightUnit,
    setHeightUnit,
    updateWeightText,
    updateHeightText,
    setUsername: (value: string) =>
      form.setValue('username', value, { shouldDirty: true, shouldValidate: true }),
    setFirstName: (value: string) =>
      form.setValue('firstName', value, { shouldDirty: true, shouldValidate: true }),
    setLastName: (value: string) =>
      form.setValue('lastName', value, { shouldDirty: true, shouldValidate: true }),
    next,
    back,
  }
}
