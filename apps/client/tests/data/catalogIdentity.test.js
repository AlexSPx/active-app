const {
  resolveExerciseIdentities,
  SOURCE_DATASET_VERSION,
} = require('../../lib/data/catalogIdentity')

test('resolves exact source keys and retains unresolved historical identities', () => {
  const catalog = {
    catalogVersion: 1,
    sourceDatasetVersion: SOURCE_DATASET_VERSION,
    mappingComplete: true,
    unresolvedSourceKeys: [],
    unresolvedLegacyIds: [],
    items: [{ id: 'server-id', sourceKey: 'squat', retired: true }],
  }
  expect(
    resolveExerciseIdentities(catalog, [
      'local:exercise:squat',
      'local:exercise:missing',
      'old-server-id',
    ])
  ).toEqual([
    { kind: 'resolved', id: 'server-id', retired: true },
    { kind: 'unresolved', originalId: 'local:exercise:missing' },
    { kind: 'unresolved', originalId: 'old-server-id' },
  ])
  expect(
    resolveExerciseIdentities({ ...catalog, mappingComplete: false }, ['local:exercise:squat'])
  ).toEqual([{ kind: 'unresolved', originalId: 'local:exercise:squat' }])
})

test('maps every bundled local key against a complete snapshot', () => {
  const artifact = require('../../lib/data/exercise-catalog.json')
  const items = artifact.map(({ sourceKey }, index) => ({
    id: `server-${index}`,
    sourceKey,
    retired: false,
  }))
  const catalog = {
    catalogVersion: 1,
    sourceDatasetVersion: SOURCE_DATASET_VERSION,
    mappingComplete: true,
    unresolvedSourceKeys: [],
    unresolvedLegacyIds: [],
    items,
  }
  const result = resolveExerciseIdentities(
    catalog,
    artifact.map(({ id }) => id)
  )
  expect(result).toEqual(items.map(({ id, retired }) => ({ kind: 'resolved', id, retired })))
})
