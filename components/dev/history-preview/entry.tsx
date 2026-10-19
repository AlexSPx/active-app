import '../../../global.css'
import { useEffect } from 'react'
import { StatusBar, View } from 'react-native'
import { registerRootComponent } from 'expo'
import { useFonts } from 'expo-font'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { Uniwind } from 'uniwind'
import type { WorkoutRecord } from '../../../types/api'
import { RecordDetailView } from '../../../features/history/components/RecordDetailView'

function HistoryPreview() {
  const [loaded] = useFonts({
    'DM Sans': require('../../../assets/fonts/DM-Sans-Regular.ttf'),
    'DM Sans Medium': require('../../../assets/fonts/DM-Sans-Medium.ttf'),
    'DM Sans Semibold': require('../../../assets/fonts/DM-Sans-SemiBold.ttf'),
  })
  useEffect(() => {
    Uniwind.setTheme('dark')
  }, [])
  const record: WorkoutRecord = {
    id: 'preview',
    workoutId: 'preview',
    workoutTitle: 'Lower body foundations',
    startTime: '2026-10-14T08:00:00Z',
    createdAt: '2026-10-14T08:38:00Z',
    exerciseRecords: [
      { exerciseName: 'Barbell full squat', reps: [8, 8, 8], weight: [70, 70, 70] },
      { exerciseName: 'Barbell lunge', reps: [10, 10, 10], weight: [20, 20, 20] },
    ],
  }
  if (process.env.EXPO_PUBLIC_HISTORY_PREVIEW_CASE === 'single') {
    record.workoutTitle = 'Bb'
    record.createdAt = '2026-10-14T08:21:05Z'
    record.exerciseRecords = [
      {
        exerciseName: 'Barbell Bench Press - Medium Grip',
        reps: [10],
        weight: [10],
      },
    ]
  } else if (process.env.EXPO_PUBLIC_HISTORY_PREVIEW_CASE === 'cardio') {
    record.workoutTitle = 'Intervals'
    record.exerciseRecords = [
      {
        exerciseName: 'Run',
        reps: [],
        weight: [],
        durationSeconds: [90, 60],
      },
    ]
  }
  if (!loaded) return null
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} className="bg-background">
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1 }}>
          <RecordDetailView
            record={record}
            loading={false}
            error={null}
            onRetry={async () => {}}
            deleting={false}
            deleteError={null}
            confirmationOpen={false}
            onOpenConfirmation={() => {}}
            onCancelConfirmation={() => {}}
            onConfirmDelete={async () => false}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
registerRootComponent(HistoryPreview)
