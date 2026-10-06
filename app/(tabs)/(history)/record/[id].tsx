import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Button, Dialog, Text, YStack, XStack, View, ScrollView } from 'tamagui'
import { Popover } from '@tamagui/popover'
import { Sheet } from '@tamagui/sheet'
import { MoreHorizontal } from '@tamagui/lucide-icons'
import { useMemo, useState } from 'react'
import { Platform } from 'react-native'
import { useWorkoutRecords, useWorkoutMutations } from '../../../../features/workouts'
import { LoadingSpinner } from '../../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../../components/ui/ErrorDisplay'
import {
  countSetsForRecord,
  computeVolumeForRecord,
  isCardioExerciseRecord,
  formatSeconds,
} from '../../../../utils/workoutUtils'
import { parseServerUtcDate } from '../../../../utils/date'
import { recordDurationSeconds } from '../../../../features/history/components/record'

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { workoutRecords, loading, error, refetch } = useWorkoutRecords()
  const {
    deleteWorkoutRecord,
    loading: deleting,
    error: deleteError,
    clearError,
  } = useWorkoutMutations()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const record = useMemo(
    () => workoutRecords.find((item) => (item.id ?? `${item.workoutId}-${item.createdAt}`) === id),
    [workoutRecords, id]
  )

  const confirmDelete = async () => {
    if (!record?.id || deleting) return
    if (await deleteWorkoutRecord(record.id)) {
      setConfirmOpen(false)
      router.replace('/(tabs)/(history)')
    }
  }
  const openConfirmation = () => {
    setMenuOpen(false)
    clearError()
    setConfirmOpen(true)
  }

  if (loading)
    return (
      <YStack flex={1} justify="center" items="center" bg="$background" gap="$field">
        <LoadingSpinner />
        <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
          Loading record…
        </Text>
      </YStack>
    )
  if (error)
    return (
      <View flex={1} bg="$background" p="$page">
        <ErrorDisplay title="Failed to load record" message={error} onRetry={refetch} />
      </View>
    )
  if (!record)
    return (
      <YStack flex={1} bg="$background" p="$page" gap="$field" justify="center">
        <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600" color="$color">
          Record not found
        </Text>
        <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
          It may have been deleted or not yet synced.
        </Text>
      </YStack>
    )

  const date = parseServerUtcDate(record.createdAt)
  const totalSets = countSetsForRecord(record)
  const strengthSets = record.exerciseRecords.reduce((sum, ex) => sum + (ex.reps?.length || 0), 0)
  const intervals = totalSets - strengthSets
  const totalVolume = computeVolumeForRecord(record)
  const duration = recordDurationSeconds(record)
  const confirmContent = (
    <YStack gap="$field">
      {Platform.OS === 'web' ? (
        <Dialog.Title
          fontSize="$sectionTitle"
          lineHeight="$sectionTitle"
          fontWeight="600"
          color="$color"
        >
          Delete this record?
        </Dialog.Title>
      ) : (
        <Text
          accessibilityRole="header"
          fontSize="$sectionTitle"
          lineHeight="$sectionTitle"
          fontWeight="600"
          color="$color"
        >
          Delete this record?
        </Text>
      )}
      <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
        {record.workoutTitle} · {date.toLocaleDateString([], { day: 'numeric', month: 'long' })}.
        Its recorded sets and notes will be removed.
      </Text>
      {!!deleteError && (
        <Text accessibilityRole="alert" fontSize="$body" lineHeight="$body" color="$destructive">
          {deleteError}
        </Text>
      )}
      <Button
        unstyled
        disabled={deleting}
        minH="$action"
        bg="$destructive"
        rounded="$button"
        items="center"
        justify="center"
        onPress={confirmDelete}
      >
        <Text fontSize="$body" lineHeight="$body" fontWeight="600" color="$onPrimary">
          {deleting ? 'Deleting…' : 'Delete record'}
        </Text>
      </Button>
      <Button
        unstyled
        disabled={deleting}
        minH="$action"
        bg="$backgroundStrong"
        rounded="$button"
        items="center"
        justify="center"
        onPress={() => setConfirmOpen(false)}
      >
        <Text fontSize="$body" lineHeight="$body" fontWeight="600" color="$color">
          Keep record
        </Text>
      </Button>
    </YStack>
  )

  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen
        options={{
          headerRight: () =>
            record.id ? (
              <Popover open={menuOpen} onOpenChange={setMenuOpen} placement="bottom-end">
                <Popover.Trigger asChild>
                  <Button
                    unstyled
                    width="$touch"
                    height="$touch"
                    rounded="$control"
                    items="center"
                    justify="center"
                    accessibilityLabel="Session actions"
                  >
                    <MoreHorizontal size="$iconSmall" color="$colorSubtle" />
                  </Button>
                </Popover.Trigger>
                <Popover.Content
                  bg="$surface"
                  p="$compact"
                  rounded="$menu"
                  borderWidth="$0.5"
                  borderColor="$borderColor"
                >
                  <Button
                    unstyled
                    minH="$touch"
                    px="$field"
                    rounded="$control"
                    justify="center"
                    onPress={openConfirmation}
                  >
                    <Text fontSize="$body" lineHeight="$body" color="$destructive">
                      Delete record
                    </Text>
                  </Button>
                </Popover.Content>
              </Popover>
            ) : null,
        }}
      />
      <ScrollView flex={1}>
        <YStack width="100%" maxW="$content" self="center" px="$page" py="$section">
          <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600" color="$color">
            {record.workoutTitle}
          </Text>
          <Text mt="$field" fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            {date.toLocaleDateString([], {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
          <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            Finished at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <XStack
            py="$card"
            my="$section"
            borderTopWidth="$0.5"
            borderBottomWidth="$0.5"
            borderColor="$borderColor"
          >
            <YStack flex={1} pr="$field" gap="$compact">
              <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                Duration
              </Text>
              <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600" color="$color">
                {duration > 0 ? formatSeconds(duration) : '—'}
              </Text>
            </YStack>
            <YStack
              flex={1}
              px="$field"
              gap="$compact"
              borderLeftWidth="$0.5"
              borderColor="$borderColor"
            >
              <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                {strengthSets > 0 ? (intervals > 0 ? 'Sets / intervals' : 'Sets') : 'Intervals'}
              </Text>
              <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600" color="$color">
                {strengthSets > 0
                  ? intervals > 0
                    ? `${strengthSets} / ${intervals}`
                    : strengthSets
                  : intervals}
              </Text>
            </YStack>
            <YStack
              flex={1}
              pl="$field"
              gap="$compact"
              borderLeftWidth="$0.5"
              borderColor="$borderColor"
            >
              <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                Volume · kg × reps
              </Text>
              <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600" color="$color">
                {strengthSets > 0 ? totalVolume.toLocaleString() : '—'}
              </Text>
            </YStack>
          </XStack>
          <Text
            mb="$field"
            fontSize="$sectionTitle"
            lineHeight="$sectionTitle"
            fontWeight="600"
            color="$color"
          >
            Recorded exercises
          </Text>
          <YStack gap="$field">
            {record.exerciseRecords.map((ex, index) => {
              const cardio = isCardioExerciseRecord(ex)
              const rows = cardio ? ex.durationSeconds || [] : ex.reps || []
              const volume =
                ex.reps?.reduce((sum, reps, i) => sum + reps * (ex.weight?.[i] || 0), 0) || 0
              const oneRm = (ex.achievedOneRmValue ?? 0) > 0
              const volumePr = (ex.achievedTotalVolumeValue ?? 0) > 0
              return (
                <YStack
                  key={`${ex.exerciseName}-${index}`}
                  bg="$surface"
                  p="$card"
                  rounded="$card"
                  borderWidth="$0.5"
                  borderColor="$borderColor"
                  gap="$compact"
                >
                  <Text fontSize="$header" lineHeight="$header" fontWeight="600" color="$color">
                    {ex.exerciseName}
                  </Text>
                  <Text mb="$field" fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                    {rows.length}{' '}
                    {cardio
                      ? rows.length === 1
                        ? 'recorded interval'
                        : 'recorded intervals'
                      : 'sets'}
                    {!cardio ? ` · ${volume.toLocaleString()} kg volume` : ''}
                  </Text>
                  <XStack pb="$compact" gap="$field">
                    <Text flex={1} fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                      {cardio ? 'Interval' : 'Set'}
                    </Text>
                    {!cardio && (
                      <Text
                        flex={1}
                        text="right"
                        fontSize="$caption"
                        lineHeight="$caption"
                        color="$colorSubtle"
                      >
                        Weight · kg
                      </Text>
                    )}
                    <Text
                      flex={1}
                      text="right"
                      fontSize="$caption"
                      lineHeight="$caption"
                      color="$colorSubtle"
                    >
                      {cardio ? 'Duration' : 'Reps'}
                    </Text>
                  </XStack>
                  {rows.map((value, i) => (
                    <XStack
                      key={i}
                      minH="$setRow"
                      items="center"
                      gap="$field"
                      borderTopWidth="$0.5"
                      borderColor="$borderColor"
                    >
                      <XStack flex={1} gap="$compact" items="center">
                        <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
                          {i + 1}
                        </Text>
                        {!cardio && oneRm && ex.achievedOneRmSetIndex === i && (
                          <Text
                            accessibilityLabel="Personal record set"
                            px="$compact"
                            rounded="$badge"
                            bg="$backgroundAccent"
                            color="$primary"
                            fontSize="$caption"
                            lineHeight="$caption"
                          >
                            PR
                          </Text>
                        )}
                      </XStack>
                      {!cardio && (
                        <Text
                          flex={1}
                          text="right"
                          fontSize="$body"
                          lineHeight="$body"
                          color="$color"
                        >
                          {(ex.weight?.[i] ?? 0).toLocaleString()}
                        </Text>
                      )}
                      <Text
                        flex={1}
                        text="right"
                        fontSize="$body"
                        lineHeight="$body"
                        color="$color"
                      >
                        {cardio ? formatSeconds(value) : value}
                      </Text>
                    </XStack>
                  ))}
                  {rows.length === 0 && (
                    <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
                      No recorded sets.
                    </Text>
                  )}
                  {(oneRm || volumePr) && (
                    <YStack mt="$field" gap="$compact">
                      <Text
                        self="flex-start"
                        px="$2"
                        py="$compact"
                        rounded="$badge"
                        bg="$backgroundAccent"
                        color="$primary"
                        fontSize="$caption"
                        lineHeight="$caption"
                        fontWeight="600"
                      >
                        Personal record
                      </Text>
                      {oneRm && (
                        <Text fontSize="$caption" lineHeight="$caption" color="$primary">
                          Est. 1RM record · {ex.achievedOneRmValue?.toLocaleString()} kg
                        </Text>
                      )}
                      {volumePr && (
                        <Text fontSize="$caption" lineHeight="$caption" color="$primary">
                          Volume record · {ex.achievedTotalVolumeValue?.toLocaleString()} kg
                        </Text>
                      )}
                    </YStack>
                  )}
                  {!!ex.notes && (
                    <Text mt="$field" fontSize="$body" lineHeight="$body" color="$colorSubtle">
                      {ex.notes}
                    </Text>
                  )}
                </YStack>
              )
            })}
          </YStack>
          {!!record.notes && (
            <YStack mt="$section" gap="$field">
              <Text
                fontSize="$sectionTitle"
                lineHeight="$sectionTitle"
                fontWeight="600"
                color="$color"
              >
                Session notes
              </Text>
              <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
                {record.notes}
              </Text>
            </YStack>
          )}
        </YStack>
      </ScrollView>
      {Platform.OS === 'web' ? (
        <Dialog
          modal
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!deleting) setConfirmOpen(open)
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content
              accessibilityLabel="Delete this record?"
              bg="$surface"
              p="$section"
              rounded="$sheet"
              borderWidth="$0.5"
              borderColor="$borderColor"
              maxW="$content"
            >
              {confirmContent}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ) : (
        <Sheet
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!deleting) setConfirmOpen(open)
          }}
          modal
          dismissOnOverlayPress={!deleting}
          snapPointsMode="fit"
        >
          <Sheet.Overlay bg="$background" />
          <Sheet.Handle bg="$colorMuted" />
          <Sheet.Frame
            bg="$surface"
            borderTopLeftRadius="$sheet"
            borderTopRightRadius="$sheet"
            p="$section"
          >
            {confirmContent}
          </Sheet.Frame>
        </Sheet>
      )}
    </YStack>
  )
}
