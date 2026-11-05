import { z } from 'zod'
import { launchFacade } from '../../features/launch/launchFacade'
import { apiService } from '../../services/apiService'
import { getDatabase } from '../db/connection'
import { getProfileScope, isCurrentProfile, type ProfileScope } from '../profileScope'
import { userNotificationsSchema, userSchema } from '../schemas/api'
import type { UpdateUserRequest, User } from '../../types/api'

const localUserSchema = userSchema.extend({
  notificationPreferences: userNotificationsSchema.nullable().optional(),
  notificationFrequency: z.number().finite().optional(),
})

let localProfileOperations: Promise<unknown> = Promise.resolve()

export class MissingLocalUserProfileError extends Error {
  constructor() {
    super('No local user profile has been initialized')
    this.name = 'MissingLocalUserProfileError'
  }
}

export function isMissingLocalUserProfile(error: unknown): boolean {
  return error instanceof MissingLocalUserProfileError
}

export class UserRepository {
  async getCurrentUser(): Promise<User> {
    if (launchFacade.auth.getStartupPlan().kind !== 'local-profile') return apiService.getUser()

    const scope = getProfileScope()
    return serializeLocalProfile(async () => {
      assertCurrentProfile(scope)
      const db = await getDatabase()
      assertCurrentProfile(scope)

      const row = await db.getFirstAsync<{ user_json: string }>(
        'SELECT user_json FROM user_profile WHERE id = 1'
      )
      assertCurrentProfile(scope)
      if (!row) throw new MissingLocalUserProfileError()

      const user = parseLocalUser(row.user_json)
      assertCurrentProfile(scope)
      return user
    })
  }

  async updateCurrentUser(payload: UpdateUserRequest): Promise<User> {
    if (launchFacade.auth.getStartupPlan().kind !== 'local-profile') {
      return apiService.updateCurrentUser(payload)
    }

    const scope = getProfileScope()
    return serializeLocalProfile(async () => {
      assertCurrentProfile(scope)
      const db = await getDatabase()
      assertCurrentProfile(scope)

      let updatedUser: User | null = null
      await db.withExclusiveTransactionAsync(async (transaction) => {
        assertCurrentProfile(scope)
        const row = await transaction.getFirstAsync<{ user_json: string }>(
          'SELECT user_json FROM user_profile WHERE id = 1'
        )
        assertCurrentProfile(scope)
        if (!row) throw new MissingLocalUserProfileError()

        const currentUser = parseLocalUser(row.user_json)
        const nextUser = parseLocalUserValue({
          ...currentUser,
          ...(payload.username === undefined ? {} : { username: payload.username }),
          ...(payload.firstName === undefined ? {} : { firstName: payload.firstName }),
          ...(payload.lastName === undefined ? {} : { lastName: payload.lastName }),
          ...(payload.email === undefined ? {} : { email: payload.email }),
          ...(payload.timezone === undefined ? {} : { timezone: payload.timezone }),
          ...(payload.measurements === undefined ? {} : { measurements: payload.measurements }),
          ...(payload.notificationFrequency === undefined
            ? {}
            : { notificationFrequency: payload.notificationFrequency }),
          ...(payload.registrationCompleted === undefined
            ? {}
            : { registrationCompleted: payload.registrationCompleted }),
        })

        assertCurrentProfile(scope)
        const result = await transaction.runAsync(
          'UPDATE user_profile SET user_json = ? WHERE id = 1',
          JSON.stringify(nextUser)
        )
        if (result.changes !== 1) throw new Error('Could not save the local user profile')
        assertCurrentProfile(scope)
        updatedUser = nextUser
      })

      assertCurrentProfile(scope)
      if (!updatedUser) throw new Error('Could not save the local user profile')
      return updatedUser
    })
  }

  async deleteCurrentUser(): Promise<void> {
    return apiService.deleteAccount()
  }
}

function serializeLocalProfile<T>(operation: () => Promise<T>): Promise<T> {
  const next = localProfileOperations.then(operation, operation)
  localProfileOperations = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

function parseLocalUser(serializedUser: string): User {
  const json: unknown = JSON.parse(serializedUser)
  return parseLocalUserValue(json)
}

function parseLocalUserValue(value: unknown): User {
  const parsed = localUserSchema.parse(value)
  const { timezone, measurements, streak, ...user } = parsed
  return {
    ...user,
    timezone,
    ...(measurements === undefined
      ? {}
      : {
          measurements:
            measurements === null
              ? null
              : {
                  weightKg: measurements.weightKg ?? null,
                  heightCm: measurements.heightCm ?? null,
                },
        }),
    ...(streak
      ? {
          streak: {
            ...streak,
            nextWorkoutId: streak.nextWorkoutId ?? null,
            nextWorkoutDeadline: streak.nextWorkoutDeadline ?? null,
            lastWorkoutCountedDate: streak.lastWorkoutCountedDate ?? null,
            currentWeekStart: streak.currentWeekStart ?? null,
          },
        }
      : {}),
  }
}

function assertCurrentProfile(scope: ProfileScope): void {
  if (!isCurrentProfile(scope)) throw new Error('Profile changed during user repository operation')
}
