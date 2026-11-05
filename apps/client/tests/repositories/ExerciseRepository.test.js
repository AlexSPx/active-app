jest.mock('../../lib/db/connection', () => ({ getDatabase: jest.fn() }))
jest.mock('../../config/launchPolicy', () => ({ isBackendEnabledForLaunch: jest.fn(() => false) }))
jest.mock('../../services/apiService', () => ({
  apiService: { searchExercises: jest.fn(), getExerciseLogs: jest.fn() },
}))

const { getDatabase } = require('../../lib/db/connection')
const { isBackendEnabledForLaunch } = require('../../config/launchPolicy')
const { apiService } = require('../../services/apiService')
const { ExerciseRepository } = require('../../lib/repositories/ExerciseRepository')

describe('ExerciseRepository local search', () => {
  let repository

  beforeEach(() => {
    jest.clearAllMocks()
    getDatabase.mockResolvedValue({ getAllAsync: jest.fn(async () => []) })
    repository = new ExerciseRepository()
  })

  it('searches the bundled catalog without a backend request', async () => {
    const exercises = await repository.search('  bench press  ')

    expect(exercises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'local:exercise:Barbell_Bench_Press_-_Medium_Grip',
          name: 'Barbell Bench Press - Medium Grip',
          category: 'STRENGTH',
          primaryMuscles: expect.any(Array),
          instructions: expect.any(Array),
        }),
      ])
    )
    expect(apiService.searchExercises).not.toHaveBeenCalled()
  })

  it('overlays cached UUIDs and exposes exercises found only in saved templates', async () => {
    const db = {
      getAllAsync: jest.fn(async () => [
        {
          workout_template: JSON.stringify({
            exercises: [
              {
                exerciseId: '8bb49c10-479d-4cdc-bbe6-5ac3ce75661b',
                exerciseTitle: 'Barbell Bench Press - Medium Grip',
                category: 'STRENGTH',
                primaryMuscles: ['chest'],
                secondaryMuscles: ['triceps'],
              },
              {
                exerciseId: '3d18a8bc-443f-4aa5-b4d5-bce5f0a0ca61',
                exerciseTitle: 'My Archived Exercise',
                category: 'STRENGTH',
                primaryMuscles: ['back'],
                secondaryMuscles: [],
              },
            ],
          }),
        },
      ]),
    }
    getDatabase.mockResolvedValue(db)

    const exercises = await repository.search('bench')
    expect(exercises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '8bb49c10-479d-4cdc-bbe6-5ac3ce75661b',
          name: 'Barbell Bench Press - Medium Grip',
          primaryMuscles: ['chest'],
        }),
      ])
    )

    const cachedOnly = await repository.search('archived')
    expect(cachedOnly).toEqual([
      expect.objectContaining({
        id: '3d18a8bc-443f-4aa5-b4d5-bce5f0a0ca61',
        name: 'My Archived Exercise',
        category: 'STRENGTH',
        level: 'BEGINNER',
      }),
    ])
    expect(db.getAllAsync).toHaveBeenCalledTimes(2)
    expect(apiService.searchExercises).not.toHaveBeenCalled()
  })

  it('keeps backend-enabled exercise search on the API catalog', async () => {
    const remoteExercise = {
      id: '8bb49c10-479d-4cdc-bbe6-5ac3ce75661b',
      name: 'Remote exercise',
      level: 'BEGINNER',
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      category: 'STRENGTH',
    }
    isBackendEnabledForLaunch.mockReturnValue(true)
    apiService.searchExercises.mockResolvedValue([remoteExercise])

    await expect(repository.search('remote')).resolves.toEqual([remoteExercise])
    expect(apiService.searchExercises).toHaveBeenCalledWith('remote')
    expect(getDatabase).not.toHaveBeenCalled()
  })
})
