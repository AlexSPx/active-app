import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useColorScheme,
  type TextInputProps,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  MessageCircle,
  X,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Button, UiText, TextField, SegmentedSelection } from '../../../components/ui/Controls'
import { TextInput } from 'react-native'
import { useCoachController } from '../hooks/useCoachController'
import { exerciseCatalog } from '../../../lib/exercises/catalog'
import type { CoachResponse, CoachWorkout } from '../contracts'
import { shouldFollowCoachMessages } from '../scrollBehavior'

type Details = {
  metrics: Map<string, string>
  names: Map<string, string>
  evidence: Map<string, string>
}

type Draft = Extract<CoachResponse, { kind: 'workout_draft' | 'routine_draft' }>

function loadSummary(exercise: CoachWorkout['exercises'][number]) {
  const loads = exercise.sets.flatMap((set) => (set.kind === 'strength' ? [set.load] : []))
  if (!loads.length) return ''
  if (loads.some((load) => load.kind === 'user_selected')) return 'Set weights'
  if (loads.every((load) => load.kind === 'bodyweight')) return 'Bodyweight'
  const weights = loads.flatMap((load) => (load.kind === 'kilograms' ? [load.value] : []))
  const low = Math.min(...weights),
    high = Math.max(...weights)
  const weight = `${low === high ? low : `${low}–${high}`} kg`
  return loads.some((load) => load.kind === 'bodyweight') ? `Bodyweight · ${weight}` : weight
}

function SetNumberInput({
  value,
  onChange,
  ...props
}: Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}) {
  const [text, setText] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value)
  }, [value])
  return (
    <TextInput
      {...props}
      value={text}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        setText(value)
      }}
      onChangeText={(next) => {
        setText(next)
        onChange(next)
      }}
    />
  )
}

function RoutineCycle({ draft }: { draft: Extract<Draft, { kind: 'routine_draft' }> }) {
  const c = colors(useColorScheme() === 'dark')
  if (draft.routine.type === 'WEEKLY_COMPLETION') {
    return (
      <Text
        style={{
          backgroundColor: c.surface,
          color: c.quiet,
          borderRadius: 11,
          padding: 10,
          fontSize: 11,
          lineHeight: 17,
        }}
      >
        Complete all {draft.routine.workoutRefs.length} workouts each week, in any order.
      </Text>
    )
  }
  return (
    <View>
      <Text style={{ color: c.quiet, fontSize: 11, marginBottom: 6 }}>
        Repeating {draft.routine.days.length}-day cycle · Rest included
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {draft.routine.days.map((day, index) => {
          const workoutIndex =
            day.kind === 'workout'
              ? draft.workouts.findIndex((workout) => workout.ref === day.workoutRef)
              : -1
          const label =
            day.kind === 'rest'
              ? 'Rest'
              : workoutIndex >= 0
                ? String.fromCharCode(65 + workoutIndex)
                : 'Workout'
          return (
            <View
              key={index}
              accessibilityLabel={`Day ${index + 1}: ${day.kind === 'rest' ? 'Rest' : (draft.workouts[workoutIndex]?.title ?? 'Workout')}`}
              style={{
                flexGrow: 1,
                minWidth: 38,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 9,
                minHeight: 36,
                backgroundColor: day.kind === 'rest' ? c.surface : c.featured,
              }}
            >
              <Text style={{ color: c.quiet, fontSize: 9 }}>Day {index + 1}</Text>
              <Text
                style={{
                  color: day.kind === 'rest' ? c.quiet : c.plum,
                  fontSize: day.kind === 'rest' ? 10 : 12,
                  fontWeight: day.kind === 'rest' ? '400' : '600',
                }}
              >
                {label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export function Review({
  initial,
  details,
  save,
  saving,
  remoteUnmapped,
  transitioning,
  request,
  onChange,
  bottomInset = 0,
  selectedWorkout,
  saved = false,
}: {
  initial: Draft
  bottomInset?: number
  selectedWorkout?: string | null
  saved?: boolean
  onChange?: (draft: Draft) => void
  details: Details
  save: (draft: Draft) => void
  saving: boolean
  remoteUnmapped: boolean
  transitioning: boolean
  request?: string
}) {
  const [draft, setDraft] = useState(initial)
  const reviewScroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    onChangeRef.current?.(draft)
  }, [draft])
  const [openWorkout, setOpenWorkout] = useState<string | null>(
    initial.kind === 'workout_draft' ? initial.workout.ref : (selectedWorkout ?? null)
  )
  const cycleRef = useRef(
    initial.kind === 'routine_draft' && initial.routine.type === 'SEQUENTIAL'
      ? initial.routine.days
      : null
  )
  const [openExercises, setOpenExercises] = useState<Record<string, boolean>>({})
  const [openLoadOptions, setOpenLoadOptions] = useState<string | null>(null)
  const [openGuidance, setOpenGuidance] = useState<string | null>(null)
  const c = colors(useColorScheme() === 'dark')
  const workouts = draft.kind === 'workout_draft' ? [draft.workout] : draft.workouts
  const updateWorkout = (
    index: number,
    change: CoachWorkout | ((workout: CoachWorkout) => CoachWorkout)
  ) => {
    const apply = (workout: CoachWorkout) =>
      typeof change === 'function' ? change(workout) : change
    setDraft((old) =>
      old.kind === 'workout_draft'
        ? { ...old, workout: apply(old.workout) }
        : {
            ...old,
            workouts: old.workouts.map((workout, i) => (i === index ? apply(workout) : workout)),
          }
    )
  }
  const updateExercise = (
    wi: number,
    ei: number,
    change: (exercise: CoachWorkout['exercises'][number]) => CoachWorkout['exercises'][number]
  ) =>
    updateWorkout(wi, (workout) => ({
      ...workout,
      exercises: workout.exercises.map((exercise, i) => (i === ei ? change(exercise) : exercise)),
    }))
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={reviewScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 10 }}
      >
        <Text style={{ color: c.ink, fontSize: 12 }}>
          {draft.kind === 'routine_draft' ? 'Routine name' : 'Workout name'}
        </Text>
        <TextInput
          accessibilityLabel={draft.kind === 'routine_draft' ? 'Routine name' : 'Workout name'}
          editable={!saving}
          maxLength={80}
          value={draft.kind === 'routine_draft' ? draft.routine.title : draft.workout.title}
          onChangeText={(title) =>
            setDraft((old) =>
              old.kind === 'routine_draft'
                ? { ...old, routine: { ...old.routine, title } }
                : { ...old, workout: { ...old.workout, title } }
            )
          }
          style={{
            color: c.ink,
            backgroundColor: c.raised,
            borderRadius: 12,
            minHeight: 44,
            paddingHorizontal: 12,
          }}
        />
        {draft.kind === 'workout_draft' &&
          draft.assumptions.some((item) => item.startsWith('PARTIAL WORKOUT')) && (
            <UiText textRole="bodyDestructive">
              Partial workout — review the listed shortfalls and uncovered requirements before
              saving.
            </UiText>
          )}
        {draft.kind === 'workout_draft' && (
          <UiText textRole="bodyMuted">
            Keep the first session comfortable. Stop with about 2 good reps left in each set.
          </UiText>
        )}
        {!request && (
          <UiText textRole="bodyDestructive">
            This restored draft has no original request, so its constraints cannot be rechecked.
            Start a new coach request to create a saveable draft.
          </UiText>
        )}
        {remoteUnmapped && (
          <UiText textRole="bodyDestructive">
            Saving is unavailable: exercise IDs are not mapped for sync.
          </UiText>
        )}
        {draft.kind === 'routine_draft' && (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Text style={{ color: c.ink, fontSize: 13, fontWeight: '600' }}>How it repeats</Text>
            <SegmentedSelection
              accessibilityLabel="Routine schedule"
              disabled={saving}
              value={draft.routine.type}
              options={[
                { value: 'SEQUENTIAL', label: 'Repeating cycle' },
                { value: 'WEEKLY_COMPLETION', label: 'Weekly goal' },
              ]}
              onValueChange={(type) =>
                setDraft((old) => {
                  if (old.kind !== 'routine_draft' || old.routine.type === type) return old
                  if (old.routine.type === 'SEQUENTIAL') cycleRef.current = old.routine.days
                  const title = old.routine.title
                  return {
                    ...old,
                    routine:
                      type === 'WEEKLY_COMPLETION'
                        ? { type, title, workoutRefs: old.workouts.map((workout) => workout.ref) }
                        : {
                            type: 'SEQUENTIAL',
                            title,
                            days:
                              cycleRef.current ??
                              old.workouts.flatMap((workout, index) =>
                                index % 2 === 1
                                  ? [
                                      { kind: 'workout' as const, workoutRef: workout.ref },
                                      { kind: 'rest' as const },
                                    ]
                                  : [{ kind: 'workout' as const, workoutRef: workout.ref }]
                              ),
                          },
                  }
                })
              }
            />
            <RoutineCycle draft={draft} />
            <Text style={{ color: c.quiet, fontSize: 11 }}>
              {draft.routine.type === 'SEQUENTIAL'
                ? 'Follow the days in order, then repeat.'
                : 'Fit the workouts around your week, in any order.'}
            </Text>
          </View>
        )}
        {workouts.some((workout) =>
          workout.exercises.some((exercise) =>
            exercise.sets.some((set) => set.kind !== 'timed' && set.load.kind === 'user_selected')
          )
        ) && (
          <UiText textRole="bodyDestructive">
            Choose a load for the marked sets before saving.
          </UiText>
        )}
        <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600', marginTop: 12 }}>
          {draft.kind === 'routine_draft' ? `Workouts  ${workouts.length} included` : 'Exercises'}
        </Text>
        {workouts.map((workout, wi) => (
          <View
            key={workout.ref}
            onLayout={(event) => {
              if (draft.kind === 'routine_draft' && selectedWorkout === workout.ref) {
                reviewScroll.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: false })
              }
            }}
            style={
              draft.kind === 'routine_draft'
                ? { borderWidth: 1, borderColor: c.line, borderRadius: 14, overflow: 'hidden' }
                : { gap: 10 }
            }
          >
            {draft.kind === 'routine_draft' && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: openWorkout === workout.ref }}
                onPress={() => setOpenWorkout(openWorkout === workout.ref ? null : workout.ref)}
                style={{
                  minHeight: 58,
                  paddingHorizontal: 12,
                  paddingVertical: 13,
                  backgroundColor: c.surface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 30,
                    borderRadius: 9,
                    backgroundColor: c.raised,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: c.plum, fontWeight: '600' }}>
                    {String.fromCharCode(65 + wi)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <UiText textRole="bodyEmphasis">{workout.title || `Workout ${wi + 1}`}</UiText>
                  <UiText textRole="caption">
                    {workout.exercises.length} exercises
                    {workout.schedule
                      ? ` · About ${Math.round(workout.schedule.estimatedSeconds / 60)} min`
                      : ''}
                  </UiText>
                </View>
                {openWorkout === workout.ref ? (
                  <ChevronDown size={20} color={c.quiet} />
                ) : (
                  <ChevronRight size={20} color={c.quiet} />
                )}
              </Pressable>
            )}
            {(draft.kind === 'workout_draft' || openWorkout === workout.ref) && (
              <>
                {draft.kind === 'routine_draft' && (
                  <TextField
                    disabled={saving}
                    accessibilityLabel={`Workout ${wi + 1} title`}
                    value={workout.title}
                    onChangeText={(title) => updateWorkout(wi, { ...workout, title })}
                  />
                )}
                {workout.preparation?.map((part) => (
                  <UiText key={part.kind} textRole="caption">
                    {part.kind === 'warmup' ? 'Warm-up' : 'Cool-down'}: {part.description} (
                    {part.durationSeconds / 60} min)
                  </UiText>
                ))}
                {workout.exercises.map((exercise, ei) => {
                  const exerciseKey = `${workout.ref}:${ei}`
                  const name =
                    details.names.get(exercise.catalogId) ??
                    exerciseCatalog.find((item) => item.id === exercise.catalogId)?.name ??
                    exercise.catalogId
                  const summary = [`${exercise.sets.length} sets`, loadSummary(exercise)]
                    .filter(Boolean)
                    .join(' · ')
                  const expanded = openExercises[exerciseKey] ?? ei === 0
                  const isDumbbell =
                    exerciseCatalog.find((item) => item.id === exercise.catalogId)?.equipment ===
                    'DUMBBELL'
                  const hasGuidance = !!(
                    exercise.guidance?.effort ||
                    exercise.guidance?.restSeconds !== undefined ||
                    exercise.guidance?.repetitionsRange ||
                    exercise.guidance?.cues?.length ||
                    exercise.guidance?.progression
                  )
                  return (
                    <View key={exerciseKey} style={{ gap: 0 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        accessibilityLabel={`${name} details, ${summary}`}
                        onPress={() =>
                          setOpenExercises((old) => ({ ...old, [exerciseKey]: !expanded }))
                        }
                        style={{
                          backgroundColor: c.surface,
                          borderRadius: 14,
                          padding: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: c.ink, fontWeight: '600', fontSize: 14 }}>
                            {ei + 1}. {name}
                          </Text>
                          <Text style={{ color: c.quiet, fontSize: 11, marginTop: 4 }}>
                            {summary} · {expanded ? 'Hide sets' : 'Edit sets'}
                          </Text>
                        </View>
                        {expanded ? (
                          <ChevronDown size={20} color={c.quiet} />
                        ) : (
                          <ChevronRight size={20} color={c.quiet} />
                        )}
                      </Pressable>
                      {expanded && (
                        <View style={{ padding: 12, gap: 8 }}>
                          {(exercise.guidance?.restSeconds !== undefined || isDumbbell) && (
                            <Text style={{ color: c.quiet, fontSize: 11, lineHeight: 17 }}>
                              {exercise.guidance?.restSeconds !== undefined
                                ? `Rest ${exercise.guidance.restSeconds} sec between sets. `
                                : ''}
                              {isDumbbell ? 'Weight is per dumbbell.' : ''}
                            </Text>
                          )}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ width: 28, color: c.quiet, fontSize: 11 }}>Set</Text>
                            <Text style={{ flex: 1, color: c.quiet, fontSize: 11 }}>
                              Weight (kg)
                            </Text>
                            <Text style={{ flex: 1, color: c.quiet, fontSize: 11 }}>
                              {exercise.sets.every((set) => set.kind === 'strength')
                                ? 'Reps'
                                : exercise.sets.every((set) => set.kind === 'timed')
                                  ? 'Seconds'
                                  : 'Reps / sec'}
                            </Text>
                            <View style={{ width: 44 }} />
                          </View>
                          {exercise.sets.map((set, si) => {
                            const updateSet = (
                              change: (
                                current: CoachWorkout['exercises'][number]['sets'][number]
                              ) => CoachWorkout['exercises'][number]['sets'][number]
                            ) =>
                              updateExercise(wi, ei, (exercise) => ({
                                ...exercise,
                                sets: exercise.sets.map((current, j) =>
                                  j === si ? change(current) : current
                                ),
                              }))
                            const inputStyle = {
                              color: c.ink,
                              backgroundColor: c.raised,
                              borderColor: c.line,
                              borderWidth: 1,
                              borderRadius: 9,
                              minHeight: 44,
                              paddingHorizontal: 8,
                              flex: 1,
                            }
                            return (
                              <View key={si} style={{ gap: 6 }}>
                                <View
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                                >
                                  <Text style={{ width: 28, color: c.quiet }}>{si + 1}</Text>
                                  {set.kind === 'timed' ? (
                                    <Text style={{ flex: 1, color: c.quiet }}>Timed</Text>
                                  ) : set.load.kind === 'bodyweight' ? (
                                    <Text style={{ flex: 1, color: c.quiet }}>Bodyweight</Text>
                                  ) : (
                                    <SetNumberInput
                                      accessibilityLabel={`Set ${si + 1} kilograms`}
                                      editable={!saving}
                                      keyboardType="decimal-pad"
                                      selectTextOnFocus
                                      placeholder="kg"
                                      placeholderTextColor={c.quiet}
                                      value={
                                        set.load.kind === 'kilograms' ? String(set.load.value) : ''
                                      }
                                      onChange={(value) =>
                                        updateSet((current) =>
                                          current.kind === 'strength'
                                            ? {
                                                ...current,
                                                load: value.trim()
                                                  ? {
                                                      kind: 'kilograms',
                                                      value: Number(value.replace(',', '.')),
                                                    }
                                                  : { kind: 'user_selected' },
                                              }
                                            : current
                                        )
                                      }
                                      style={inputStyle}
                                    />
                                  )}
                                  <SetNumberInput
                                    accessibilityLabel={
                                      set.kind === 'timed'
                                        ? `Set ${si + 1} duration seconds`
                                        : `Set ${si + 1} repetitions`
                                    }
                                    editable={!saving}
                                    keyboardType="number-pad"
                                    selectTextOnFocus
                                    value={String(
                                      set.kind === 'timed' ? set.durationSeconds : set.repetitions
                                    )}
                                    onChange={(value) =>
                                      updateSet((current) =>
                                        current.kind === 'timed'
                                          ? { ...current, durationSeconds: Number(value) }
                                          : { ...current, repetitions: Number(value) }
                                      )
                                    }
                                    style={inputStyle}
                                  />
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Delete set ${si + 1} for ${name}`}
                                    accessibilityState={{
                                      disabled: saving || exercise.sets.length === 1,
                                    }}
                                    disabled={saving || exercise.sets.length === 1}
                                    onPress={() =>
                                      updateExercise(wi, ei, (exercise) =>
                                        exercise.sets.length > 1
                                          ? {
                                              ...exercise,
                                              sets: exercise.sets.filter((_, j) => j !== si),
                                            }
                                          : exercise
                                      )
                                    }
                                    style={{
                                      width: 44,
                                      minHeight: 44,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      opacity: exercise.sets.length === 1 ? 0.35 : 1,
                                    }}
                                  >
                                    <Trash2 size={17} color={c.quiet} />
                                  </Pressable>
                                </View>
                              </View>
                            )
                          })}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add set to ${name}`}
                            disabled={saving}
                            onPress={() =>
                              updateExercise(wi, ei, (exercise) => {
                                const last = exercise.sets[exercise.sets.length - 1]
                                return last
                                  ? { ...exercise, sets: [...exercise.sets, { ...last }] }
                                  : exercise
                              })
                            }
                            style={{
                              minHeight: 44,
                              justifyContent: 'center',
                              alignItems: 'center',
                              backgroundColor: c.raised,
                              borderRadius: 11,
                            }}
                          >
                            <Text style={{ color: c.plum, fontWeight: '600', fontSize: 12 }}>
                              + Add set
                            </Text>
                          </Pressable>
                          {exercise.sets.some((set) => set.kind === 'strength') && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Change load types for ${name}`}
                              accessibilityState={{ expanded: openLoadOptions === exerciseKey }}
                              disabled={saving}
                              onPress={() =>
                                setOpenLoadOptions(
                                  openLoadOptions === exerciseKey ? null : exerciseKey
                                )
                              }
                              style={{ minHeight: 44, justifyContent: 'center' }}
                            >
                              <Text style={{ color: c.plum, fontSize: 12 }}>
                                {openLoadOptions === exerciseKey
                                  ? 'Hide load options'
                                  : 'Change load types'}
                              </Text>
                            </Pressable>
                          )}
                          {openLoadOptions === exerciseKey &&
                            exercise.sets.map((set, si) =>
                              set.kind === 'strength' ? (
                                <View key={si} style={{ gap: 4 }}>
                                  <Text style={{ color: c.quiet, fontSize: 11 }}>Set {si + 1}</Text>
                                  <SegmentedSelection
                                    disabled={saving}
                                    accessibilityLabel={`Set ${si + 1} load type`}
                                    value={
                                      set.load.kind === 'user_selected'
                                        ? 'kilograms'
                                        : set.load.kind
                                    }
                                    options={[
                                      { value: 'kilograms', label: 'Kilograms' },
                                      { value: 'bodyweight', label: 'Bodyweight' },
                                    ]}
                                    onValueChange={(kind) =>
                                      updateExercise(wi, ei, (exercise) => ({
                                        ...exercise,
                                        sets: exercise.sets.map((current, j) =>
                                          j === si && current.kind === 'strength'
                                            ? {
                                                ...current,
                                                load:
                                                  kind === 'bodyweight'
                                                    ? { kind: 'bodyweight' }
                                                    : { kind: 'user_selected' },
                                              }
                                            : current
                                        ),
                                      }))
                                    }
                                  />
                                </View>
                              ) : null
                            )}
                          {hasGuidance && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ expanded: openGuidance === exerciseKey }}
                              onPress={() =>
                                setOpenGuidance(openGuidance === exerciseKey ? null : exerciseKey)
                              }
                              style={{ minHeight: 44, justifyContent: 'center' }}
                            >
                              <UiText textRole="bodyEmphasis">
                                {openGuidance === exerciseKey ? 'Hide guidance' : 'Show guidance'}
                              </UiText>
                            </Pressable>
                          )}
                          {openGuidance === exerciseKey && (
                            <>
                              {exercise.guidance?.effort && (
                                <UiText textRole="caption">
                                  Effort: {exercise.guidance.effort.value}{' '}
                                  {exercise.guidance.effort.kind === 'rpe'
                                    ? 'RPE'
                                    : 'reps in reserve'}
                                </UiText>
                              )}
                              {exercise.guidance?.restSeconds !== undefined && (
                                <UiText textRole="caption">
                                  Rest: {exercise.guidance.restSeconds} seconds
                                </UiText>
                              )}
                              {exercise.guidance?.repetitionsRange && (
                                <UiText textRole="caption">
                                  Repetitions per set: {exercise.guidance.repetitionsRange.min}–
                                  {exercise.guidance.repetitionsRange.max}
                                </UiText>
                              )}
                              {exercise.guidance?.cues?.map((cue, ci) => (
                                <UiText key={`cue-${ci}`} textRole="caption">
                                  {cue}
                                </UiText>
                              ))}
                              {exercise.guidance?.progression && (
                                <UiText textRole="caption">
                                  Progression: {exercise.guidance.progression}
                                </UiText>
                              )}
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  )
                })}
              </>
            )}
          </View>
        ))}
        {draft.kind === 'routine_draft' && (
          <Text style={{ color: c.quiet, fontSize: 11, lineHeight: 17 }}>
            Saving adds the routine and all its workouts to your library. Your active routine stays
            as it is.
          </Text>
        )}
        {draft.assumptions.map((assumption, i) => (
          <UiText key={i} textRole="caption">
            Assumption: {assumption}
          </UiText>
        ))}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Math.max(bottomInset, 25),
          borderTopWidth: 1,
          borderColor: c.line,
        }}
      >
        {draft.kind === 'routine_draft' && (
          <Text style={{ color: c.quiet, textAlign: 'center', fontSize: 11, marginBottom: 9 }}>
            Saves the routine and all {workouts.length} workouts.
          </Text>
        )}
        <Button
          disabled={remoteUnmapped || transitioning || saving || !request}
          loading={saving}
          onPress={() => save(draft)}
        >
          {saved ? 'Save copy' : draft.kind === 'routine_draft' ? 'Save routine' : 'Save workout'}
        </Button>
      </View>
    </View>
  )
}
function Response({
  response,
  details,
  save,
  saving,
  remoteUnmapped,
  transitioning,
  request,
  saveNotice,
  saved,
  onChange,
}: {
  response: CoachResponse
  onChange: (draft: Draft) => void
  saveNotice: string
  saved?: boolean
  details: Details
  save: (draft: Draft) => void
  saving: boolean
  remoteUnmapped: boolean
  transitioning: boolean
  request?: string
}) {
  const [reviewing, setReviewing] = useState(false)
  const [selectedWorkout, setSelectedWorkout] = useState<string | null>(null)
  const wasSaving = useRef(false)
  useEffect(() => {
    if (wasSaving.current && !saving && saved && !saveNotice) setReviewing(false)
    wasSaving.current = saving
  }, [saving, saved, saveNotice])
  const insets = useSafeAreaInsets()
  const dark = useColorScheme() === 'dark'
  const c = colors(dark)
  if (response.kind === 'clarification') return <UiText selectable>{response.question}</UiText>
  if (response.kind === 'cannot_fulfill') return <UiText selectable>{response.reason}</UiText>
  if (response.kind === 'answer')
    return (
      <View className="gap-compact">
        {response.blocks.map((block, i) =>
          block.kind === 'metric' ? (
            <UiText key={i} selectable>
              {details.metrics.get(block.metricId) ?? block.metricId}
            </UiText>
          ) : (
            <View key={i}>
              <UiText selectable>{block.text}</UiText>
              {block.evidence.map((ref) => (
                <UiText key={`${ref.kind}:${ref.id}`} textRole="caption" selectable>
                  Evidence: {ref.kind} · {details.evidence.get(`${ref.kind}:${ref.id}`) ?? ref.id}
                </UiText>
              ))}
            </View>
          )
        )}
        {response.limitations.map((limit, i) => (
          <UiText key={i} textRole="bodyMuted">
            {limit}
          </UiText>
        ))}
      </View>
    )
  const workouts = response.kind === 'workout_draft' ? [response.workout] : response.workouts
  const title = response.kind === 'workout_draft' ? response.workout.title : response.routine.title
  const equipment = workouts.flatMap((workout) =>
    workout.exercises.map(
      (exercise) => exerciseCatalog.find((item) => item.id === exercise.catalogId)?.equipment
    )
  )
  const equipmentLabel =
    equipment.length && equipment.every((item) => item === equipment[0])
      ? equipment[0] === 'BODY_ONLY'
        ? 'Bodyweight'
        : equipment[0] === 'DUMBBELL'
          ? 'Dumbbells'
          : undefined
      : undefined
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: 22,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          backgroundColor: c.featured,
          paddingTop: 15,
          paddingHorizontal: 16,
          paddingBottom: 13,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Dumbbell size={14} color={c.quiet} />
            <Text style={{ color: c.quiet, fontSize: 11 }}>
              {response.kind === 'workout_draft' ? 'Workout' : 'Routine'}
            </Text>
          </View>
          <Text
            style={{
              color: c.quiet,
              backgroundColor: c.card,
              borderRadius: 8,
              overflow: 'hidden',
              paddingHorizontal: 8,
              paddingVertical: 3,
              fontSize: 10,
            }}
          >
            {saved ? 'Saved' : 'Draft'}
          </Text>
        </View>
        <Text
          style={{
            color: c.ink,
            fontSize: 24,
            lineHeight: 30,
            letterSpacing: -0.8,
            fontWeight: '600',
            marginBottom: 5,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: c.quiet, fontSize: 12, lineHeight: 18 }}>
          {response.kind === 'workout_draft'
            ? `${workouts[0].schedule ? `About ${Math.round(workouts[0].schedule.estimatedSeconds / 60)} min · ` : ''}${workouts[0].exercises.length} exercises${equipmentLabel ? ` · ${equipmentLabel}` : ''}`
            : `${workouts.length} workouts${workouts[0].schedule && workouts.every((workout) => workout.schedule?.estimatedSeconds === workouts[0].schedule?.estimatedSeconds) ? ` · About ${Math.round(workouts[0].schedule.estimatedSeconds / 60)} min each` : ''}`}
        </Text>
      </View>
      {response.kind === 'routine_draft' && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
          <RoutineCycle draft={response} />
        </View>
      )}
      <View style={{ paddingHorizontal: 16, paddingTop: 3 }}>
        {response.kind === 'workout_draft'
          ? workouts[0].exercises.map((exercise, index) => {
              const name =
                details.names.get(exercise.catalogId) ??
                exerciseCatalog.find((item) => item.id === exercise.catalogId)?.name ??
                exercise.catalogId
              const first = exercise.sets[0]
              const detail = [
                exercise.guidance?.restSeconds !== undefined
                  ? `Rest ${exercise.guidance.restSeconds} sec`
                  : null,
                loadSummary(exercise) || null,
              ]
                .filter(Boolean)
                .join(' · ')
              const uniform = exercise.sets.every(
                (set) =>
                  first &&
                  (set.kind === 'timed' && first.kind === 'timed'
                    ? set.durationSeconds === first.durationSeconds
                    : set.kind === 'strength' &&
                      first.kind === 'strength' &&
                      set.repetitions === first.repetitions)
              )
              return (
                <View
                  key={`${exercise.catalogId}-${index}`}
                  style={{
                    borderTopWidth: 1,
                    borderColor: c.line,
                    paddingVertical: 10,
                    minHeight: 48,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.ink, fontSize: 13, lineHeight: 19, fontWeight: '600' }}>
                      {name}
                    </Text>
                    {!!detail && (
                      <Text style={{ color: c.quiet, fontSize: 11, lineHeight: 17 }}>{detail}</Text>
                    )}
                  </View>
                  <Text style={{ color: c.plum, fontSize: 12, fontWeight: '600' }}>
                    {uniform
                      ? `${exercise.sets.length} × ${first?.kind === 'timed' ? `${first.durationSeconds}s` : first?.repetitions}`
                      : `${exercise.sets.length} sets`}
                  </Text>
                </View>
              )
            })
          : workouts.map((workout, index) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Preview ${workout.title}`}
                onPress={() => {
                  setSelectedWorkout(workout.ref)
                  setReviewing(true)
                }}
                key={workout.ref}
                style={{
                  borderTopWidth: 1,
                  borderColor: c.line,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 34,
                    borderRadius: 11,
                    backgroundColor: c.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: c.plum, fontSize: 12, fontWeight: '600' }}>
                    {String.fromCharCode(65 + index)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.ink, fontSize: 13, lineHeight: 19, fontWeight: '600' }}>
                    {workout.title}
                  </Text>
                  <Text style={{ color: c.quiet, fontSize: 11, lineHeight: 17 }}>
                    {workout.exercises.length} exercises
                    {workout.schedule
                      ? ` · ${Math.round(workout.schedule.estimatedSeconds / 60)} min`
                      : ''}
                  </Text>
                </View>
                <ChevronRight size={15} color={c.quiet} />
              </Pressable>
            ))}
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSelectedWorkout(null)
            setReviewing(true)
          }}
          style={{
            backgroundColor: c.plum,
            borderRadius: 14,
            minHeight: 46,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Pencil size={17} color={c.onPlum} />
          <Text style={{ color: c.onPlum, fontSize: 13, fontWeight: '600' }}>
            {saved ? 'View saved' : 'Review'}{' '}
            {response.kind === 'workout_draft' ? 'workout' : 'routine'}
          </Text>
        </Pressable>
        <Text style={{ textAlign: 'center', color: c.quiet, fontSize: 10, marginTop: 8 }}>
          {response.kind === 'workout_draft'
            ? saved
              ? 'Saved to your library.'
              : 'Make it yours before you save.'
            : ''}
        </Text>
      </View>
      <Modal
        visible={reviewing}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewing(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}>
          <KeyboardAvoidingView
            style={{
              height: '92%',
              backgroundColor: c.canvas,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              overflow: 'hidden',
            }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View
              style={{
                width: 34,
                height: 4,
                borderRadius: 4,
                backgroundColor: c.line,
                alignSelf: 'center',
                marginTop: 10,
              }}
            />
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: 12,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink, fontSize: 22, fontWeight: '600' }}>
                  Review {response.kind === 'workout_draft' ? 'workout' : 'routine'}
                </Text>
                <Text style={{ color: c.quiet, fontSize: 12, marginTop: 4 }}>
                  {response.kind === 'workout_draft'
                    ? 'Adjust the details to suit you.'
                    : 'One routine. All your workouts together.'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close review"
                onPress={() => setReviewing(false)}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X color={c.ink} />
              </Pressable>
            </View>
            {!!saveNotice && (
              <Text accessibilityLiveRegion="polite" style={{ color: c.ink }}>
                {saveNotice}
              </Text>
            )}
            <Review
              key={`${selectedWorkout ?? 'all'}:${reviewing}`}
              initial={response}
              selectedWorkout={selectedWorkout}
              saved={saved}
              bottomInset={insets.bottom}
              onChange={onChange}
              details={details}
              save={save}
              saving={saving}
              remoteUnmapped={remoteUnmapped}
              transitioning={transitioning}
              request={request}
            />
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  )
}
const colors = (dark: boolean) =>
  dark
    ? {
        canvas: '#2d2235',
        ink: '#faf5fc',
        quiet: '#c0afcb',
        surface: '#382b42',
        raised: '#42314d',
        line: '#51415d',
        plum: '#e3d7ee',
        onPlum: '#2d2235',
        featured: '#493656',
        featuredLine: '#796287',
        card: '#382b42',
      }
    : {
        canvas: '#faf7fc',
        ink: '#2d2235',
        quiet: '#76627e',
        surface: '#f0e9f5',
        raised: '#e9dff0',
        line: '#dcd0e4',
        plum: '#624572',
        onPlum: '#faf5fc',
        featured: '#e3d7ee',
        featuredLine: '#c6b8d0',
        card: '#fffcff',
      }

export function CoachScreen() {
  const coach = useCoachController()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const c = colors(useColorScheme() === 'dark')
  const [showHistory, setShowHistory] = useState(true)
  const [historySearch, setHistorySearch] = useState('')
  const [composerHeight, setComposerHeight] = useState(72)
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const restorePosition = useRef(true)
  const scrollKey = coach.currentConversationId ?? '__new__'
  const lastScrollKey = useRef(scrollKey)
  const previousItemCount = useRef(coach.items.length)
  const nearBottom = useRef(true)
  const viewportHeight = useRef(0)
  const followMessages = useRef(false)
  if (lastScrollKey.current !== scrollKey) {
    const firstSend =
      lastScrollKey.current === '__new__' && coach.items.length > previousItemCount.current
    lastScrollKey.current = scrollKey
    restorePosition.current = true
    followMessages.current = firstSend && nearBottom.current
    nearBottom.current = coach.scrollOffset === 0
  } else if (coach.items.length > previousItemCount.current && !restorePosition.current) {
    followMessages.current = nearBottom.current
  }
  previousItemCount.current = coach.items.length
  const query = historySearch.trim().toLocaleLowerCase()
  const history = coach.history.filter((entry) =>
    `${entry.title} ${entry.searchText}`.toLocaleLowerCase().includes(query)
  )
  const dayLabel = (value: string) => {
    const date = new Date(value)
    const today = new Date()
    const days = Math.round(
      (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
        86400000
    )
    return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'Last 7 days' : 'Earlier'
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.canvas, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingBottom: 16,
          gap: 10,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{ padding: 6 }}
        >
          <ArrowLeft color={c.plum} size={20} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open chat history"
          onPress={() => setShowHistory(true)}
          style={{ padding: 8 }}
        >
          <History color={c.plum} />
        </Pressable>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 21,
            backgroundColor: c.featured,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Dumbbell color={c.ink} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.ink, fontSize: 18, fontWeight: '600' }}>Coach</Text>
          <Text style={{ color: c.quiet, fontSize: 11 }}>Your training assistant</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new conversation"
          onPress={coach.newConversation}
          style={{ padding: 8 }}
        >
          <Plus color={c.plum} />
        </Pressable>
      </View>
      <Modal
        visible={showHistory}
        animationType="slide"
        onRequestClose={() => setShowHistory(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: c.canvas,
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 16 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to conversation"
              onPress={() => {
                setShowHistory(false)
              }}
              style={{ padding: 8 }}
            >
              <ArrowLeft color={c.plum} />
            </Pressable>
            <Text style={{ flex: 1, color: c.ink, fontSize: 25, fontFamily: 'DM Sans Semibold' }}>
              Your chats
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                coach.newConversation()
                setShowHistory(false)
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: c.plum,
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Plus size={15} color={c.onPlum} />
              <Text style={{ color: c.onPlum, fontFamily: 'DM Sans Semibold', fontSize: 12 }}>
                New chat
              </Text>
            </Pressable>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              backgroundColor: c.surface,
              borderRadius: 15,
              paddingHorizontal: 13,
              marginBottom: 12,
            }}
          >
            <Search size={17} color={c.quiet} />
            <TextInput
              accessibilityLabel="Search chats"
              placeholder="Search your chats"
              placeholderTextColor={c.quiet}
              value={historySearch}
              onChangeText={setHistorySearch}
              style={{ flex: 1, minHeight: 46, color: c.ink, fontFamily: 'DM Sans', fontSize: 13 }}
            />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {history.length === 0 && (
              <View style={{ alignItems: 'center', padding: 55, gap: 8 }}>
                <Search size={28} color={c.quiet} />
                <Text style={{ color: c.ink, fontSize: 18, fontFamily: 'DM Sans Semibold' }}>
                  {historySearch ? 'No chats found' : 'No conversations yet'}
                </Text>
                <Text style={{ color: c.quiet, textAlign: 'center' }}>
                  {historySearch
                    ? 'Try a workout name or another topic.'
                    : 'Start a conversation with Coach.'}
                </Text>
              </View>
            )}
            {history.map((entry, index) => (
              <View key={entry.id}>
                {(index === 0 ||
                  dayLabel(history[index - 1].updated_at) !== dayLabel(entry.updated_at)) && (
                  <Text
                    style={{
                      color: c.quiet,
                      fontSize: 12,
                      marginTop: 18,
                      marginBottom: 4,
                      fontFamily: 'DM Sans Semibold',
                    }}
                  >
                    {dayLabel(entry.updated_at)}
                  </Text>
                )}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    gap: 11,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 39,
                      borderRadius: 12,
                      backgroundColor: c.featured,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {entry.artifact ? (
                      <Dumbbell size={19} color={c.plum} />
                    ) : (
                      <MessageCircle size={19} color={c.plum} />
                    )}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open conversation: ${entry.title}`}
                    onPress={() => {
                      setShowHistory(false)
                      void coach.openConversation(entry.id)
                    }}
                    style={{ flex: 1 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          color: c.ink,
                          fontSize: 14,
                          fontFamily: 'DM Sans Semibold',
                        }}
                      >
                        {entry.title}
                      </Text>
                      <Text style={{ color: c.quiet, fontSize: 10 }}>
                        {dayLabel(entry.updated_at) === 'Today' ||
                        dayLabel(entry.updated_at) === 'Yesterday'
                          ? new Date(entry.updated_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : new Date(entry.updated_at).toLocaleDateString([], { weekday: 'short' })}
                      </Text>
                    </View>
                    <Text numberOfLines={2} style={{ color: c.quiet, fontSize: 11 }}>
                      {entry.preview || 'Start a conversation with Coach.'}
                    </Text>
                    {!!entry.artifact && (
                      <Text style={{ color: c.plum, fontSize: 11 }}>
                        {entry.saved ? 'Saved ' : ''}
                        {entry.artifact === 'plan' ? 'plan' : 'workout'}
                        {entry.saved ? '' : ' draft'}
                      </Text>
                    )}
                    {entry.id === coach.currentConversationId && (
                      <Text style={{ color: c.quiet, fontSize: 10 }}>Current chat</Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete conversation: ${entry.title}`}
                    onPress={() =>
                      Alert.alert(
                        'Delete conversation?',
                        'This removes the conversation from this device.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => void coach.deleteConversation(entry.id),
                          },
                        ]
                      )
                    }
                    style={{ padding: 12 }}
                  >
                    <X color={c.quiet} size={18} />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
      <ScrollView
        key={scrollKey}
        ref={scroll}
        onScroll={(event) => {
          if (!restorePosition.current) {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
            nearBottom.current = shouldFollowCoachMessages(
              contentOffset.y,
              layoutMeasurement.height,
              contentSize.height
            )
            coach.setScrollOffset(contentOffset.y)
          }
        }}
        scrollEventThrottle={100}
        onLayout={(event) => {
          viewportHeight.current = event.nativeEvent.layout.height
        }}
        onContentSizeChange={(_width, height) => {
          if (restorePosition.current) {
            nearBottom.current = shouldFollowCoachMessages(
              coach.scrollOffset,
              viewportHeight.current,
              height
            )
            if (followMessages.current) scroll.current?.scrollToEnd({ animated: true })
            else scroll.current?.scrollTo({ y: coach.scrollOffset, animated: false })
            restorePosition.current = false
            followMessages.current = false
          } else if (followMessages.current) {
            followMessages.current = false
            scroll.current?.scrollToEnd({ animated: true })
          }
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 19,
          paddingBottom: composerHeight + 46,
          gap: 20,
          flexGrow: 1,
        }}
      >
        <Text style={{ color: c.quiet, textAlign: 'center', fontSize: 11 }}>Today</Text>
        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Dumbbell size={13} color={c.plum} />
            <Text style={{ color: c.plum, fontSize: 11, fontFamily: 'DM Sans Semibold' }}>
              Coach
            </Text>
          </View>
          <Text style={{ color: c.ink, lineHeight: 22 }}>What would you like to work on?</Text>
          <Text style={{ color: c.quiet, fontSize: 12, lineHeight: 18 }}>
            Experimental coach. Training advice and workout drafts have not been validated. Review
            suggestions carefully.
          </Text>
        </View>
        {coach.items.length === 0 && coach.status === 'ready' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {['Build me a workout', 'Build me a plan', 'How long should I rest?'].map((choice) => (
              <Pressable
                key={choice}
                accessibilityRole="button"
                onPress={() => void coach.send(choice)}
                style={{
                  backgroundColor: c.surface,
                  borderRadius: 22,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  minHeight: 38,
                  opacity: coach.status === 'ready' ? 1 : 0.45,
                }}
              >
                <Text style={{ color: c.plum, fontSize: 12 }}>{choice}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {coach.items.map((item, i) =>
          item.kind === 'user' ? (
            <View key={i} style={{ alignItems: 'flex-end' }}>
              <Text
                selectable
                style={{
                  overflow: 'hidden',
                  maxWidth: '88%',
                  backgroundColor: c.plum,
                  color: c.onPlum,
                  borderRadius: 17,
                  borderBottomRightRadius: 5,
                  padding: 12,
                  lineHeight: 21,
                }}
              >
                {item.text}
              </Text>
            </View>
          ) : (
            <View key={item.reviewId} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Dumbbell size={13} color={c.plum} />
                <Text style={{ color: c.plum, fontSize: 11, fontFamily: 'DM Sans Semibold' }}>
                  Coach
                </Text>
              </View>
              <Response
                response={item.response}
                onChange={(draft) => coach.updateReview(item.reviewId, draft)}
                saveNotice={coach.saveNotice}
                saved={item.saved}
                details={item.details}
                save={(draft) => void coach.saveReview(draft, item.reviewId, item.request)}
                saving={coach.saving}
                remoteUnmapped={coach.remoteUnmapped}
                transitioning={coach.transitioning}
                request={item.request}
              />
              {i === coach.items.length - 1 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {(item.response.kind === 'workout_draft'
                    ? ['Make it easier', 'Build a plan around this']
                    : item.response.kind === 'routine_draft'
                      ? ['How do I progress?', 'Make sessions shorter']
                      : []
                  ).map((choice) => (
                    <Pressable
                      key={choice}
                      disabled={coach.status !== 'ready'}
                      accessibilityRole="button"
                      onPress={() => void coach.send(choice)}
                      style={{
                        backgroundColor: c.surface,
                        borderRadius: 22,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        minHeight: 38,
                        opacity: coach.status === 'ready' ? 1 : 0.45,
                      }}
                    >
                      <Text style={{ color: c.plum, fontSize: 12 }}>{choice}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )
        )}
        {(coach.status === 'checking' ||
          coach.status === 'loading' ||
          coach.status === 'generating') && (
          <Text accessibilityLiveRegion="polite" style={{ color: c.quiet }}>
            {coach.status === 'generating'
              ? 'Thinking…'
              : coach.status === 'loading'
                ? 'Loading model…'
                : `${coach.progressPhase === 'download' ? 'Downloading model' : 'Checking model'}… ${coach.progress > 0 ? `${Math.round(coach.progress * 100)}%` : ''}`}
          </Text>
        )}
        {!!coach.notice && (
          <Text selectable accessibilityLiveRegion="polite" style={{ color: c.quiet }}>
            {coach.notice}
          </Text>
        )}
        {!!coach.saveNotice && (
          <Text selectable accessibilityLiveRegion="polite" style={{ color: c.ink }}>
            {coach.saveNotice}
          </Text>
        )}
        {coach.status === 'download' && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.quiet }}>
              Download the 2.08 GB fine-tuned Qwen 3.5 2B model to use Coach. Extra free space is
              needed for verification.
            </Text>
            <Button onPress={() => void coach.prepare(true)}>Download model</Button>
          </View>
        )}
        {(coach.status === 'checking' ||
          coach.status === 'loading' ||
          coach.status === 'generating') && (
          <Button variant="secondary" onPress={coach.cancel}>
            Cancel
          </Button>
        )}
        {coach.status === 'error' && (
          <Button variant="secondary" onPress={() => void coach.prepare()}>
            Retry
          </Button>
        )}
        {coach.status === 'ready' && (
          <Button variant="ghost" onPress={() => void coach.removeModel()}>
            Delete downloaded model
          </Button>
        )}
      </ScrollView>
      <View
        onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Math.max(insets.bottom, 28),
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            backgroundColor: c.card,
            borderColor: c.line,
            borderWidth: 1,
            borderRadius: 29,
            padding: 8,
            paddingLeft: 13,
          }}
        >
          <TextInput
            accessibilityLabel="Message Coach"
            multiline
            value={coach.draft}
            onChangeText={coach.setDraft}
            editable={coach.status === 'ready'}
            placeholder="Message Coach…"
            placeholderTextColor={c.quiet}
            maxLength={4000}
            style={{ flex: 1, minHeight: 36, maxHeight: 88, color: c.ink, paddingVertical: 7 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={coach.status !== 'ready' || !coach.draft.trim()}
            onPress={() => void coach.send()}
            style={{
              width: 44,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.plum,
              opacity: coach.status === 'ready' && coach.draft.trim() ? 1 : 0.4,
            }}
          >
            <ArrowUp size={20} color={c.onPlum} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
