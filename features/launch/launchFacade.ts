import { Platform } from 'react-native'
import {
  isBackendEnabledForLaunch,
  isNativeOfflineLaunch,
  isSyncEnabledForLaunch,
  nativeLaunchPolicy,
} from '../../config/launchPolicy'
import { LOCAL_PROFILE_OWNER, LOCAL_USER_ID } from '../../lib/profileScope'
import type { User, UpdateUserRequest, WorkoutRecord, WorkoutRecordExercise } from '../../types/api'

type RouteSegment = string | undefined
type AuthDestination = '/welcome' | '/welcome/register' | '/(tabs)' | '/settings/profile'
type RegistrationDraft = {
  firstName: string
  lastName: string
  username: string
  weight: number | null
  height: number | null
}

interface Achievement {
  type: '1RM' | 'VOLUME'
  value: number
  exercise: string
  setIndex?: number | null
}

function exerciseAchievements(exercise: WorkoutRecordExercise): Achievement[] {
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

function resolveAuthDestination(input: {
  isAuthenticated: boolean
  user: User | null
  profileOwnerId: string
  firstSegment: RouteSegment
  secondSegment: RouteSegment
  thirdSegment?: RouteSegment
}): AuthDestination | null {
  const inWelcomeGroup = input.firstSegment === 'welcome'
  const inLegalGroup = input.firstSegment === 'legal'
  const isPublicRoute = inWelcomeGroup || inLegalGroup
  const isRegistering = input.secondSegment === 'register'

  if (isNativeOfflineLaunch()) {
    const needsOnboarding =
      input.profileOwnerId === LOCAL_PROFILE_OWNER
        ? input.user?.registrationCompleted !== true
        : input.user?.registrationCompleted === false

    if (input.firstSegment === 'auth') return needsOnboarding ? '/welcome/register' : '/(tabs)'
    if (input.firstSegment === '(tabs)' && input.secondSegment === 'settings') {
      if (input.thirdSegment === 'account') return '/settings/profile'
      if (input.thirdSegment === 'sync') return '/(tabs)'
    }
    if (needsOnboarding && !isRegistering && !inLegalGroup) return '/welcome/register'
    if (!needsOnboarding && inWelcomeGroup) return '/(tabs)'
    return null
  }

  if (!input.isAuthenticated && !isPublicRoute) return '/welcome'
  if (input.isAuthenticated && input.user?.registrationCompleted === false && !isRegistering) {
    return '/welcome/register'
  }
  if (
    input.isAuthenticated &&
    input.user &&
    input.user.registrationCompleted !== false &&
    inWelcomeGroup
  ) {
    return '/(tabs)'
  }
  return null
}

function registrationInitialization(user: User | null): {
  values: Partial<RegistrationDraft & Pick<User, 'email' | 'timezone'>> & {
    isWorkOSAuth?: boolean
  }
  startAt: number | null
  notice: string | null
} | null {
  if (isNativeOfflineLaunch()) {
    if (!user) return null
    return {
      values: {
        ...(user.username ? { username: user.username } : {}),
        ...(user.firstName ? { firstName: user.firstName } : {}),
        ...(user.lastName ? { lastName: user.lastName } : {}),
        ...(user.timezone ? { timezone: user.timezone } : {}),
      },
      startAt: null,
      notice: null,
    }
  }

  if (!user || user.registrationCompleted) return null
  return {
    values: {
      ...(user.email ? { email: user.email } : {}),
      ...(user.username ? { username: user.username } : {}),
      ...(user.firstName ? { firstName: user.firstName } : {}),
      ...(user.lastName ? { lastName: user.lastName } : {}),
      isWorkOSAuth: true,
    },
    startAt: 1,
    notice: 'Please complete your profile details to continue.',
  }
}

function registrationBackAction(input: {
  step: number
  isWorkOSAuth: boolean
}): 'sign-out' | 'previous-step' | 'leave-registration' {
  if (!isNativeOfflineLaunch() && input.isWorkOSAuth && input.step === 1) return 'sign-out'
  return input.step > 0 ? 'previous-step' : 'leave-registration'
}

function registrationStepIsValid(step: number, draft: RegistrationDraft): boolean {
  switch (step) {
    case 0:
      return isNativeOfflineLaunch()
    case 1:
      return (
        isNativeOfflineLaunch() ||
        (draft.firstName.length > 0 && draft.lastName.length > 0 && draft.username.length > 0)
      )
    case 2:
      return draft.weight !== null && draft.height !== null
    case 3:
    case 4:
      return true
    default:
      return false
  }
}

function registrationAccountStep(): {
  description: string
  action: { kind: 'continue'; label: string } | { kind: 'workos'; label: string }
} {
  return isNativeOfflineLaunch()
    ? {
        description: 'Set up your local profile to track your workouts and progress.',
        action: { kind: 'continue', label: 'Get Started' },
      }
    : {
        description: 'Create an account to track your workouts and progress.',
        action: { kind: 'workos', label: 'Sign Up with WorkOS' },
      }
}

function registrationSubmissionError(input: {
  isWorkOSAuth: boolean
  registrationCompleted: boolean | undefined
}): string | null {
  if (isNativeOfflineLaunch()) return null
  if (!input.isWorkOSAuth || input.registrationCompleted) return 'Please use WorkOS to sign up.'
  return null
}

function settingsAccount(user: User | null): {
  name: string
  accessibilityLabel: string
  linkLabel: string
  email: string | null
  signOutAction: { label: string } | null
} {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
  const fallback = isNativeOfflineLaunch() ? 'Training profile' : user?.username || 'Your account'
  return {
    name: name || fallback,
    accessibilityLabel: isNativeOfflineLaunch() ? 'Training profile' : 'Your account',
    linkLabel: isNativeOfflineLaunch() ? 'Profile →' : 'Account →',
    email: isNativeOfflineLaunch() ? null : (user?.email ?? null),
    signOutAction: isNativeOfflineLaunch() ? null : { label: 'Sign out' },
  }
}

function settingsAccountPage(user: User | null): {
  description: string
  fullName: string
  email: { label: string; value: string } | null
  profileEditor: {
    title: string
    description: string
    firstNameLabel: string
    lastNameLabel: string
    saveLabel: string
  } | null
  accountActions: Array<{ kind: 'sign-out' } | { kind: 'delete-account' }>
} {
  const localProfile = isNativeOfflineLaunch()
  const firstName = user?.firstName ?? ''
  const lastName = user?.lastName ?? ''
  return {
    description: localProfile
      ? 'Your training profile is stored on this device.'
      : 'Your signed-in account.',
    fullName:
      [firstName, lastName].filter(Boolean).join(' ') ||
      (localProfile ? 'Training profile' : user?.username || 'Your account'),
    email: localProfile ? null : { label: 'Email', value: user?.email ?? 'Not set' },
    profileEditor: localProfile
      ? {
          title: 'Training profile',
          description: 'Your training name is stored on this device.',
          firstNameLabel: 'First name',
          lastNameLabel: 'Last name',
          saveLabel: 'Save training name',
        }
      : null,
    accountActions: localProfile ? [] : [{ kind: 'sign-out' }, { kind: 'delete-account' }],
  }
}

function syncSettingsPage():
  | { kind: 'local-storage'; title: string; description: string }
  | { kind: 'synchronization'; title: string; description: string } {
  return isSyncEnabledForLaunch()
    ? {
        kind: 'synchronization',
        title: 'Synchronization',
        description: 'Changes stay on this device until they sync with your account.',
      }
    : {
        kind: 'local-storage',
        title: 'Local storage',
        description: 'Your training data is saved on this device.',
      }
}

function syncMenuEntry(): { title: string; description: string } {
  return isSyncEnabledForLaunch()
    ? { title: 'Synchronization', description: 'Review queued changes and retry uploads' }
    : { title: 'Local storage', description: 'Your training data is saved on this device' }
}

function accountActionDecision(): { kind: 'available' } | { kind: 'unavailable'; message: string } {
  return isNativeOfflineLaunch() && !nativeLaunchPolicy.accountsEnabled
    ? { kind: 'unavailable', message: 'Accounts are unavailable in this version.' }
    : { kind: 'available' }
}

function profileUpdateHandling(user: User):
  | {
      kind: 'device-profile'
      settings: { timeZone: string; bodyWeight: number | null; height: number | null }
    }
  | { kind: 'account-profile' } {
  if (isNativeOfflineLaunch()) {
    return {
      kind: 'device-profile',
      settings: {
        timeZone: user.timezone || 'UTC',
        bodyWeight: user.measurements?.weightKg ?? null,
        height: user.measurements?.heightCm ?? null,
      },
    }
  }
  return { kind: 'account-profile' }
}

export const launchFacade = {
  auth: {
    resolveDestination: resolveAuthDestination,
    getStartupPlan():
      | { kind: 'local-profile' }
      | { kind: 'browser-session' }
      | { kind: 'credential-session' } {
      if (isNativeOfflineLaunch()) return { kind: 'local-profile' }
      return Platform.OS === 'web' ? { kind: 'browser-session' } : { kind: 'credential-session' }
    },
    sessionStorageKind(): 'browser' | 'secure-store' {
      return Platform.OS === 'web' ? 'browser' : 'secure-store'
    },
    accountActionDecision,
    profileFetchDecision(): 'skip' | 'read-profile' {
      return isNativeOfflineLaunch() && !nativeLaunchPolicy.accountsEnabled
        ? 'skip'
        : 'read-profile'
    },
    persistedUser(user: User | null): User | null {
      return isNativeOfflineLaunch() && user?.id === LOCAL_USER_ID ? null : user
    },
    profileUpdateHandling,
    profileUpdateSession(
      serverSession: 'unknown' | 'valid' | 'invalid'
    ): 'unknown' | 'valid' | 'invalid' {
      return isNativeOfflineLaunch() ? serverSession : 'valid'
    },
  },
  onboarding: {
    initialization: registrationInitialization,
    isStepValid: registrationStepIsValid,
    accountStep: registrationAccountStep,
    submissionError: registrationSubmissionError,
    backAction: registrationBackAction,
    title(): string {
      return isNativeOfflineLaunch() ? 'Set Up Profile' : 'Create Account'
    },
    createProfileUpdate(input: {
      username: string
      firstName: string
      lastName: string
      timezone: string
      weight: number | null
      height: number | null
      notificationFrequency: number
    }): UpdateUserRequest {
      return {
        username: input.username ? input.username.trim() : undefined,
        firstName: input.firstName ? input.firstName.trim() : '',
        lastName: input.lastName ? input.lastName.trim() : '',
        timezone: input.timezone,
        measurements: { weightKg: input.weight, heightCm: input.height },
        registrationCompleted: true,
        notificationFrequency: input.notificationFrequency,
      }
    },
  },
  settings: {
    menuAccount: settingsAccount,
    accountPage: settingsAccountPage,
    profileRoute(): '/settings/profile' | '/settings/account' {
      return isNativeOfflineLaunch() ? '/settings/profile' : '/settings/account'
    },
    syncMenuEntry,
    syncPage: syncSettingsPage,
  },
  training: {
    getReminderFrequency(user: User | null): number | null {
      if (!isBackendEnabledForLaunch()) return null
      return Platform.OS === 'web'
        ? (user?.notificationPreferences?.schedule?.length ?? 1)
        : (user?.notificationFrequency ?? 1)
    },
    getWeeklyCompletion(user: User | null): string[] | null {
      return isBackendEnabledForLaunch() ? (user?.streak?.weeklyCompletedWorkoutIds ?? []) : null
    },
    getExerciseAchievements(exercise: WorkoutRecordExercise): Achievement[] {
      return isBackendEnabledForLaunch() ? exerciseAchievements(exercise) : []
    },
    getWorkoutAchievements(record: WorkoutRecord): Achievement[] {
      return isBackendEnabledForLaunch() ? record.exerciseRecords.flatMap(exerciseAchievements) : []
    },
  },
  api: {
    assertBackendRequestsAllowed(): void {
      if (isBackendEnabledForLaunch()) return
      const error = Object.assign(
        new Error('Backend requests are disabled by the native launch policy'),
        { code: 'BACKEND_DISABLED' }
      )
      throw error
    },
    backendMode(): 'remote' | 'device' {
      return isBackendEnabledForLaunch() ? 'remote' : 'device'
    },
  },
  sync: {
    queueMode(): 'active' | 'local-only' {
      return isSyncEnabledForLaunch() ? 'active' : 'local-only'
    },
    disabledOperationError(): Error {
      return new Error('Sync is disabled by the native launch policy.')
    },
  },
  profile: {
    databaseBootstrapAction(): 'restore-local-user' | 'database-only' {
      return isNativeOfflineLaunch() ? 'restore-local-user' : 'database-only'
    },
  },
}
