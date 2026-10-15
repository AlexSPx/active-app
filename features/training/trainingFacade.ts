import { Platform } from 'react-native'
import { isBackendEnabledForLaunch } from '../../config/launchPolicy'
import type { User, WorkoutRecord, WorkoutRecordExercise } from '../../types/api'
import type { WidgetConfig } from '../../stores/widgetStore'

interface Achievement {
  type: '1RM' | 'VOLUME'
  value: number
  exercise: string
  setIndex?: number | null
}

interface TrainingFacade {
  getWidgets: (widgets: WidgetConfig[]) => WidgetConfig[] | null
  getReminderFrequency: (user: User | null) => number | null
  getWeeklyCompletion: (user: User | null) => string[] | null
  getExerciseAchievements: (exercise: WorkoutRecordExercise) => Achievement[]
  getWorkoutAchievements: (record: WorkoutRecord) => Achievement[]
}

function getExerciseAchievements(exercise: WorkoutRecordExercise): Achievement[] {
  const achievements: Achievement[] = []
  if (typeof exercise.achievedOneRmValue === 'number' && exercise.achievedOneRmValue > 0) {
    achievements.push({
      type: '1RM',
      value: exercise.achievedOneRmValue,
      exercise: exercise.exerciseName,
      setIndex: exercise.achievedOneRmSetIndex,
    })
  }
  if (
    typeof exercise.achievedTotalVolumeValue === 'number' &&
    exercise.achievedTotalVolumeValue > 0
  ) {
    achievements.push({
      type: 'VOLUME',
      value: exercise.achievedTotalVolumeValue,
      exercise: exercise.exerciseName,
    })
  }
  return achievements
}

const connectedTraining: TrainingFacade = {
  getWidgets: (widgets) => [...widgets].sort((a, b) => a.position - b.position),
  getReminderFrequency: (user) =>
    Platform.OS === 'web'
      ? (user?.notificationPreferences?.schedule?.length ?? 1)
      : (user?.notificationFrequency ?? 1),
  getWeeklyCompletion: (user) => user?.streak?.weeklyCompletedWorkoutIds ?? [],
  getExerciseAchievements,
  getWorkoutAchievements: (record) => record.exerciseRecords.flatMap(getExerciseAchievements),
}

const localTraining: TrainingFacade = {
  getWidgets: () => null,
  getReminderFrequency: () => null,
  getWeeklyCompletion: () => null,
  getExerciseAchievements: () => [],
  getWorkoutAchievements: () => [],
}

export function getTrainingFacade(): TrainingFacade {
  return isBackendEnabledForLaunch() ? connectedTraining : localTraining
}
