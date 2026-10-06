import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useNavigation, router } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  YStack,
  XStack,
  Text,
  Input,
  TextArea,
  Button,
  ScrollView,
  Checkbox,
  getTokenValue,
  useTheme,
} from 'tamagui'
import DateTimePicker from '@react-native-community/datetimepicker'
import type { RoutinePatternItem, RoutineType } from '../../../types/routine'
import { useWorkouts } from '../../workouts'
import { syncEngine } from '../../../lib/sync'
import { RoutinePatternEditor } from './RoutinePatternEditor'
import { routineValidation, switchPatternDraft, type RoutineDraft } from '../routineDraft'

interface RoutineFormProps {
  initialValues?: RoutineDraft
  loading: boolean
  error: string | null
  onSave: (data: RoutineDraft) => Promise<boolean>
}

export function RoutineForm({ initialValues, loading, error, onSave }: RoutineFormProps) {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
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
  const [notesOpen, setNotesOpen] = useState(false)
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
  const update = <K extends keyof RoutineDraft>(key: K, value: RoutineDraft[K]) =>
    setData((current) => ({ ...current, [key]: value }))
  usePreventRemove((dirty || busy) && !saved, ({ data: event }) => {
    if (busy) return
    Alert.alert(
      'Discard this routine?',
      'Your unsaved name, notes, and training pattern will be discarded.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard routine',
          style: 'destructive',
          onPress: () => navigation.dispatch(event.action),
        },
      ]
    )
  })
  useEffect(() => {
    navigation.setOptions({
      title: 'Routines',
      headerBackVisible: false,
      headerRight: () => (
        <Button
          chromeless
          minH="$touch"
          color="$primary"
          disabled={busy}
          onPress={() => router.back()}
        >
          Cancel
        </Button>
      ),
    })
  }, [navigation, busy])
  useEffect(() => {
    if (saved) router.back()
  }, [saved])
  const changeType = (type: RoutineType) => {
    if (type === data.routineType) return
    const next = switchPatternDraft(drafts, data.routineType, data.pattern, type)
    setDrafts(next)
    setData((current) => ({ ...current, routineType: type, pattern: next[type] ?? [] }))
  }
  const save = async () => {
    if (issue || busy || loadingWorkouts) return
    setSaving(true)
    try {
      if (await onSave({ ...data, name: data.name.trim() })) setSaved(true)
    } finally {
      setSaving(false)
    }
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <YStack flex={1} bg="$background">
        <ScrollView
          flex={1}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <YStack width="100%" maxW="$content" self="center" p="$page" gap="$section">
            <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600">
              {initialValues ? 'Edit routine' : 'Create routine'}
            </Text>
            {error && (
              <Text
                accessibilityRole="alert"
                color="$destructive"
                fontSize="$body"
                lineHeight="$body"
              >
                {error}
              </Text>
            )}
            <YStack gap="$field">
              <Text fontSize="$caption" fontWeight="600">
                Routine name
              </Text>
              <Input
                accessibilityLabel="Routine name"
                value={data.name}
                onChangeText={(value) => update('name', value)}
                placeholder="e.g. Strength & recovery"
                maxLength={100}
                rounded="$control"
                minH="$action"
                bg="$surface"
                fontSize="$body"
              />
              <XStack items="center" justify="space-between">
                <Text fontSize="$caption" fontWeight="600">
                  Notes{' '}
                  <Text color="$colorSubtle" fontWeight="400">
                    (optional)
                  </Text>
                </Text>
                <Button
                  chromeless
                  color="$primary"
                  minH="$touch"
                  onPress={() => setNotesOpen(!notesOpen)}
                >
                  {notesOpen ? 'Hide' : data.description ? 'Edit' : 'Add'}
                </Button>
              </XStack>
              {notesOpen && (
                <TextArea
                  accessibilityLabel="Routine notes"
                  value={data.description ?? ''}
                  onChangeText={(value) => update('description', value)}
                  placeholder="Anything to remember for this routine"
                  maxLength={500}
                  rounded="$control"
                  minH="$day"
                  bg="$surface"
                  fontSize="$body"
                  lineHeight="$body"
                />
              )}
            </YStack>
            <YStack gap="$field">
              <Text fontSize="$sectionTitle" lineHeight="$sectionTitle" fontWeight="600">
                Training pattern
              </Text>
              <XStack bg="$backgroundHover" p="$compact" rounded="$menu" gap="$compact">
                {(['SEQUENTIAL', 'WEEKLY_COMPLETION'] as const).map((type) => (
                  <Button
                    key={type}
                    flex={1}
                    px="$compact"
                    minH="$touch"
                    rounded="$control"
                    bg={data.routineType === type ? '$surface' : '$backgroundTransparent'}
                    color={data.routineType === type ? '$primary' : '$colorSubtle'}
                    fontSize="$caption"
                    accessibilityState={{ selected: data.routineType === type }}
                    onPress={() => changeType(type)}
                  >
                    {type === 'SEQUENTIAL' ? 'Repeating cycle' : 'Flexible week'}
                  </Button>
                ))}
              </XStack>
              <Text color="$colorSubtle" fontSize="$caption" lineHeight="$caption">
                {data.routineType === 'SEQUENTIAL'
                  ? 'Repeat training and rest days in a set order.'
                  : 'Complete your workouts each week, in any order.'}
              </Text>
              <RoutinePatternEditor
                key={data.routineType}
                pattern={data.pattern}
                onChange={(pattern) => update('pattern', pattern)}
                hideRestOption={data.routineType === 'WEEKLY_COMPLETION'}
                routineName={data.name}
              />
            </YStack>
            <YStack borderTopWidth={1} borderColor="$borderColor" pt="$section" gap="$field">
              <XStack items="center" gap="$field">
                <Checkbox
                  checked={data.active}
                  onCheckedChange={(checked) => update('active', checked === true)}
                  size="$2"
                  rounded="$block"
                  borderColor={data.active ? '$primary' : '$borderColor'}
                  bg={data.active ? '$primary' : '$surface'}
                  accessibilityLabel="Set as active routine"
                >
                  <Checkbox.Indicator>
                    <Text color="$onPrimary">✓</Text>
                  </Checkbox.Indicator>
                </Checkbox>
                <Button
                  chromeless
                  px="$0"
                  minH="$touch"
                  onPress={() => update('active', !data.active)}
                >
                  <Text fontSize="$caption" fontWeight="600">
                    Set as active routine
                  </Text>
                </Button>
              </XStack>
              <Text color="$colorSubtle" fontSize="$caption" lineHeight="$caption">
                Use this routine for your training schedule.
              </Text>
              {data.active && (
                <YStack gap="$field">
                  <Text fontSize="$caption" fontWeight="600">
                    Start date
                  </Text>
                  <Button
                    bg="$surface"
                    rounded="$control"
                    borderWidth={1}
                    borderColor="$borderColor"
                    minH="$action"
                    onPress={() => setDateOpen(!dateOpen)}
                  >
                    {data.startDate.toLocaleDateString()}
                  </Button>
                  {dateOpen && (
                    <DateTimePicker
                      value={data.startDate}
                      mode="date"
                      accentColor={theme.primary.val}
                      textColor={theme.color.val}
                      onChange={(_, date) => {
                        if (Platform.OS === 'android') setDateOpen(false)
                        if (date) update('startDate', date)
                      }}
                    />
                  )}
                  <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                    {data.routineType === 'SEQUENTIAL'
                      ? 'Day 1 starts on this date.'
                      : 'Complete the sessions each Monday–Sunday week.'}
                  </Text>
                </YStack>
              )}
            </YStack>
          </YStack>
        </ScrollView>
        <YStack
          borderTopWidth={1}
          borderColor="$borderColor"
          bg="$background"
          px="$page"
          pt="$field"
          pb={Math.max(insets.bottom, getTokenValue('$card', 'space'))}
        >
          <YStack width="100%" maxW="$content" self="center" gap="$field">
            <Text
              accessibilityLiveRegion="polite"
              fontSize="$caption"
              lineHeight="$caption"
              color="$colorSubtle"
            >
              {loadingWorkouts
                ? 'Loading saved workouts…'
                : issue ||
                  (data.active
                    ? 'Ready to save and set as active.'
                    : 'Ready to save. Activate it later from your routines.')}
            </Text>
            <Button
              minH="$action"
              rounded="$button"
              bg={issue || busy || loadingWorkouts ? '$backgroundHover' : '$primary'}
              color={issue || busy || loadingWorkouts ? '$colorMuted' : '$onPrimary'}
              disabled={!!issue || busy || loadingWorkouts}
              onPress={save}
            >
              {busy ? 'Saving…' : data.active ? 'Save & set active' : 'Save routine'}
            </Button>
          </YStack>
        </YStack>
      </YStack>
    </KeyboardAvoidingView>
  )
}
