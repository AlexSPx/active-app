const { calculateHistoryMetrics } = require('../../features/coach/historyMetrics')

test('calculates only recorded sets and reports unknown or malformed weights', () => {
  const actual = calculateHistoryMetrics([
    {
      id: 'r1',
      exercises: [
        { exerciseId: 'squat', repetitions: [5, 8, 3], weightsKg: [40, 0], durationSeconds: null },
      ],
    },
    {
      id: 'r2',
      exercises: [
        { exerciseId: 'squat', repetitions: [4], weightsKg: [50, 60], durationSeconds: [30] },
      ],
    },
  ])
  expect(actual).toEqual({
    completedSessions: 2,
    exerciseExposures: { squat: 2 },
    repetitions: 20,
    durationSeconds: 30,
    externalLoadVolumeKg: 400,
    missingWeights: 2,
    malformedSets: 1,
    missingIdentities: 0,
    invalidRepetitions: 1,
    invalidDurations: 0,
    invalidLoads: 0,
    bestSets: [
      { exerciseId: 'squat', weightKg: 50, repetitions: 4, recordId: 'r2' },
      { exerciseId: 'squat', weightKg: 40, repetitions: 5, recordId: 'r1' },
    ],
  })
})

test('empty history has no inferred activity', () => {
  expect(calculateHistoryMetrics([])).toEqual({
    completedSessions: 0,
    exerciseExposures: {},
    repetitions: 0,
    durationSeconds: 0,
    externalLoadVolumeKg: 0,
    missingWeights: 0,
    malformedSets: 0,
    missingIdentities: 0,
    invalidRepetitions: 0,
    invalidDurations: 0,
    invalidLoads: 0,
    bestSets: [],
  })
})
