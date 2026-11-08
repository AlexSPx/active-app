const { collection, filterCollection } = require('../../features/exercises/collection')

test('browses the entire offline catalog and finds a named movement with its instructions', () => {
  const all = filterCollection({ search: '', muscles: [], equipment: null })
  expect(all).toHaveLength(876)
  const result = filterCollection({
    search: '  BARBELL bench medium - incline ',
    muscles: ['chest'],
    equipment: 'BARBELL',
  })
  expect(result.map((exercise) => exercise.name)).toEqual([
    'Barbell Incline Bench Press - Medium Grip',
  ])
  expect(result[0].instructions[0]).toContain('incline bench')
})

test('searches friendly equipment and muscle names and intersects active filters', () => {
  const search = 'pushups bodyweight chest'
  expect(
    filterCollection({ search, muscles: ['chest'], equipment: 'BODY_ONLY' }).map(
      (exercise) => exercise.name
    )
  ).toEqual(['Pushups', 'Pushups (Close and Wide Hand Positions)'])
  expect(filterCollection({ search, muscles: ['quadriceps'], equipment: 'BODY_ONLY' })).toEqual([])
  expect(filterCollection({ search, muscles: ['chest'], equipment: 'BARBELL' })).toEqual([])
  expect(collection.find((exercise) => exercise.name === 'Pushups').equipment).toBe('BODY_ONLY')
})
