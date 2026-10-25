import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native'
import { useNavigation, router } from 'expo-router'
import { usePreventRemove } from 'expo-router/react-navigation'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Button, SegmentedSelection, TextField, UiText } from '../../../components/ui/Controls'
import type { RoutinePatternItem, RoutineType } from '../../../types/routine'
import { useWorkouts } from '../../workouts'
import { syncEngine } from '../../../lib/sync'
import { RoutinePatternEditor } from './RoutinePatternEditor'
import { routineValidation, switchPatternDraft, type RoutineDraft } from '../routineDraft'
import { BackHeaderButton } from '../../../navigation/BackHeaderButton'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'

interface RoutineFormProps {
  initialValues?: RoutineDraft
  loading: boolean
  error: string | null
  onClearError?: () => void
  onSave: (data: RoutineDraft) => Promise<boolean>
}

export function RoutineForm({
  initialValues,
  loading,
  error,
  onClearError,
  onSave,
}: RoutineFormProps) {
  const isEditing = !!initialValues
  const navigation = useNavigation()
  const colors = useCadenceColors()
  const { workouts, loading: loadingWorkouts } = useWorkouts()
  const [initial] = useState<RoutineDraft>(
    () =>
      initialValues ?? {
        name: '',
        description: '',
        routineType: 'SEQUENTIAL',
        pattern: [],
        active: false,
        startDate: new Date(),
      }
  )
  const [data, setData] = useState(initial)
  const [drafts, setDrafts] = useState<Record<RoutineType, RoutinePatternItem[] | null>>({
    SEQUENTIAL: initial.routineType === 'SEQUENTIAL' ? initial.pattern : null,
    WEEKLY_COMPLETION: initial.routineType === 'WEEKLY_COMPLETION' ? initial.pattern : null,
  })
  const [dateOpen, setDateOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty =
    JSON.stringify(data) !== JSON.stringify(initial) ||
    Object.entries(drafts).some(
      ([type, pattern]) => type !== initial.routineType && !!pattern?.length
    )
  const busy = loading || saving
  const issue = routineValidation(
    {
      ...data,
      pattern: data.pattern.map((day) => ({
        ...day,
        workoutId: day.workoutId ? syncEngine.resolveId('workouts', day.workoutId) : null,
      })),
    },
    workouts.map((workout) => workout.id)
  )
  const update = <K extends keyof RoutineDraft>(key: K, value: RoutineDraft[K]) => {
    onClearError?.()
    setSaved(false)
    setData((current) => ({ ...current, [key]: value }))
  }

  usePreventRemove((dirty || busy) && !saved, ({ repeat }) => {
    if (busy) return
    Alert.alert(
      'Discard this routine?',
      'Your unsaved name, notes, and training pattern will be discarded.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard routine',
          style: 'destructive',
          onPress: () => {
            setSaved(true)
            repeat()
          },
        },
      ]
    )
  })

  useEffect(() => {
    navigation.setOptions({
      title: '',
      headerBackTitle: 'Routines',
      headerBackVisible: false,
      headerLeft: () => (
        <BackHeaderButton label="Routines" fallback="/(tabs)/(workouts)/routines" />
      ),
      headerRight: () => (
        <Button variant="ghost" density="compact" disabled={busy} onPress={() => router.back()}>
          <UiText textRole="captionEmphasis">Cancel</UiText>
        </Button>
      ),
    })
  }, [navigation, busy])

  useEffect(() => {
    if (saved) router.back()
  }, [saved])

  const changeType = (type: RoutineType) => {
    if (type === data.routineType) return
    onClearError?.()
    setSaved(false)
    const next = switchPatternDraft(drafts, data.routineType, data.pattern, type)
    setDrafts(next)
    setData((current) => ({ ...current, routineType: type, pattern: next[type] ?? [] }))
  }

  const save = async () => {
    if (issue || busy || loadingWorkouts) return
    onClearError?.()
    setSaving(true)
    try {
      if (await onSave({ ...data, name: data.name.trim() })) setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-3xl self-center gap-section p-page">
          <UiText textRole="screenTitle" accessibilityRole="header">
            {isEditing ? 'Edit routine.' : 'Create routine.'}
          </UiText>

          {!!error && (
            <UiText textRole="bodyDestructive" accessibilityRole="alert">
              {error}
            </UiText>
          )}

          <View className="gap-field">
            <UiText textRole="captionEmphasis">Routine name</UiText>
            <TextField
              accessibilityLabel="Routine name"
              value={data.name}
              onChangeText={(value) => update('name', value)}
              placeholder="e.g. Strength & recovery"
              maxLength={100}
              returnKeyType="done"
            />
            <View className="gap-compact">
              <View className="flex-row items-center justify-between">
                <UiText textRole="captionEmphasis">Notes</UiText>
                <UiText textRole="caption">Optional</UiText>
              </View>
              <TextField
                accessibilityLabel="Routine notes, optional"
                multiline
                textAlignVertical="top"
                className="h-20 min-h-20 py-field"
                value={data.description ?? ''}
                onChangeText={(value) => update('description', value)}
                placeholder="Your approach to this routine"
                maxLength={500}
              />
            </View>
          </View>

          <View className="gap-field">
            <UiText textRole="cardTitle" accessibilityRole="header">
              Training pattern
            </UiText>
            <SegmentedSelection
              value={data.routineType}
              options={[
                { value: 'SEQUENTIAL', label: 'Repeating cycle' },
                { value: 'WEEKLY_COMPLETION', label: 'Flexible week' },
              ]}
              onValueChange={changeType}
              accessibilityLabel="Routine pattern type"
            />
            <UiText textRole="bodyMuted">
              {data.routineType === 'SEQUENTIAL'
                ? 'Repeat training and rest days in a set order.'
                : 'Complete these workouts in any order each week.'}
            </UiText>
            <RoutinePatternEditor
              key={data.routineType}
              pattern={data.pattern}
              onChange={(pattern) => update('pattern', pattern)}
              hideRestOption={data.routineType === 'WEEKLY_COMPLETION'}
              routineName={data.name}
            />
          </View>

          <View className="gap-field border-t border-divider pt-section">
            <View className="gap-field">
              <UiText textRole="captionEmphasis">Start date</UiText>
              <Button
                variant="surface"
                accessibilityLabel={`Start date, ${data.startDate.toLocaleDateString()}`}
                onPress={() => setDateOpen((open) => !open)}
              >
                {data.startDate.toLocaleDateString()}
              </Button>
              {dateOpen && (
                <DateTimePicker
                  value={data.startDate}
                  mode="date"
                  accentColor={colors.accent}
                  textColor={colors.foreground}
                  onChange={(_, date) => {
                    if (Platform.OS === 'android') setDateOpen(false)
                    if (date) update('startDate', date)
                  }}
                />
              )}
            </View>
            <View className="flex-row items-center gap-field">
              <Switch
                value={data.active}
                onValueChange={(active) => update('active', active)}
                accessibilityLabel="Set as active routine"
                trackColor={{ false: colors.divider, true: colors.accent }}
                thumbColor={data.active ? colors.onAccent : colors.background}
              />
              <UiText textRole="captionEmphasis">Set as active routine</UiText>
            </View>
            <UiText textRole="caption">Use this routine for your training schedule.</UiText>
          </View>
        </View>
      </ScrollView>

      <View className="border-t border-divider bg-background px-page pb-card pt-field">
        <View className="w-full max-w-3xl self-center gap-field">
          <UiText textRole="caption" accessibilityLiveRegion="polite">
            {loadingWorkouts
              ? 'Loading saved workouts…'
              : issue ||
                (data.active
                  ? 'Ready to save and set as active.'
                  : 'Ready to save. Activate it later from your routines.')}
          </UiText>
          <Button disabled={!!issue || busy || loadingWorkouts} onPress={save} className="h-action">
            {busy ? 'Saving…' : data.active ? 'Save & set active' : 'Save routine'}
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
