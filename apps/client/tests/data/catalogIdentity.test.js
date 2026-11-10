const {
  resolveExerciseIdentities,
  SOURCE_DATASET_VERSION,
} = require('../../lib/data/catalogIdentity')

const items = [
  { id: '11111111-1111-4111-8111-111111111111', sourceKey: 'squat', retired: false },
  { id: '22222222-2222-4222-8222-222222222222', sourceKey: 'retired', retired: true },
]
const catalog = {
  catalogVersion: 2,
  sourceDatasetVersion: 'new-dataset-revision',
  mappingComplete: true,
  unresolvedSourceKeys: [],
  unresolvedLegacyIds: [],
  sourceMappings: items.map(({ id, sourceKey }) => ({
    datasetVersion: SOURCE_DATASET_VERSION,
    sourceKey,
    exerciseId: id,
  })),
  items,
}

test('resolves exact active and retired IDs while retaining unknown UUIDs', () => {
  const unknown = '33333333-3333-4333-8333-333333333333'
  expect(
    resolveExerciseIdentities({ ...catalog, mappingComplete: false }, [
      items[0].id,
      items[1].id,
      unknown,
    ])
  ).toEqual([
    { kind: 'resolved', id: items[0].id, retired: false },
    { kind: 'resolved', id: items[1].id, retired: true },
    { kind: 'unresolved', originalId: unknown },
  ])
})

test('does not accept ambiguous legacy IDs or duplicate catalog IDs', () => {
  expect(
    resolveExerciseIdentities({ ...catalog, unresolvedLegacyIds: [items[0].id] }, [items[0].id])
  ).toEqual([{ kind: 'unresolved', originalId: items[0].id }])
  expect(() => resolveExerciseIdentities({ ...catalog, items: [items[0], items[0]] }, [])).toThrow(
    'Duplicate catalog exercise ID'
  )
})

test('uses only explicit mappings for the pinned revision', () => {
  const ids = ['local:exercise:squat', 'local:exercise:retired', 'local:exercise:missing']
  expect(resolveExerciseIdentities(catalog, ids)).toEqual([
    { kind: 'resolved', id: items[0].id, retired: false },
    { kind: 'resolved', id: items[1].id, retired: true },
    { kind: 'unresolved', originalId: ids[2] },
  ])
  expect(
    resolveExerciseIdentities(
      {
        ...catalog,
        sourceMappings: catalog.sourceMappings.map((m) => ({ ...m, datasetVersion: 'other' })),
      },
      ids
    )
  ).toEqual(ids.map((originalId) => ({ kind: 'unresolved', originalId })))
  expect(resolveExerciseIdentities({ ...catalog, mappingComplete: false }, [ids[0]])).toEqual([
    { kind: 'unresolved', originalId: ids[0] },
  ])
  expect(
    resolveExerciseIdentities({ ...catalog, unresolvedSourceKeys: ['squat'] }, [ids[0]])
  ).toEqual([{ kind: 'unresolved', originalId: ids[0] }])
})

test('maps every bundled local key against a complete snapshot', () => {
  const artifact = require('../../lib/data/exercise-catalog.json')
  const items = artifact.map(({ sourceKey }, index) => ({
    id: `server-${index}`,
    sourceKey,
    retired: false,
  }))
  const sourceMappings = items.map(({ id, sourceKey }) => ({
    datasetVersion: SOURCE_DATASET_VERSION,
    sourceKey,
    exerciseId: id,
  }))
  expect(
    resolveExerciseIdentities(
      { ...catalog, items, sourceMappings },
      artifact.map(({ id }) => id)
    )
  ).toEqual(items.map(({ id, retired }) => ({ kind: 'resolved', id, retired })))
})

// Exercise the real Rust import and the client resolver against the same snapshot.
test('resolves bundled IDs after the server imports a new revision', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const { execFileSync } = require('node:child_process')
  const root = path.resolve(__dirname, '../../../..')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-upgrade-'))
  try {
    const fixture = path.join(dir, 'snapshot.json')
    execFileSync(
      'cargo',
      [
        'test',
        '--locked',
        '-p',
        'active-api',
        '--test',
        'catalog',
        'import_is_atomic_repeatable_and_preserves_retired_identities',
      ],
      {
        cwd: root,
        env: { ...process.env, ACTIVE_CATALOG_UPGRADE_FIXTURE: fixture },
        stdio: 'pipe',
      }
    )
    const snapshot = JSON.parse(fs.readFileSync(fixture, 'utf8'))
    require('../../../../contracts/v1/response-contract.cjs').responses['catalog.get'].parse(
      snapshot
    )
    const artifact = require('../../lib/data/exercise-catalog.json')
    const result = resolveExerciseIdentities(
      snapshot,
      artifact.map(({ id }) => id)
    )
    expect(result).toEqual(
      artifact.map(({ sourceKey }) => {
        const item = snapshot.items.find((item) => item.sourceKey === sourceKey)
        return { kind: 'resolved', id: item.id, retired: item.retired }
      })
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}, 120000)
