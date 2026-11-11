import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = resolve(import.meta.dirname, '../../..')
// The evidence root contains evaluation/coach-v1/reviews/knowledge-review-01/.
const evidenceRoot = resolve(process.env.COACH_EVIDENCE_ROOT || base)
const read = (path) => readFileSync(resolve(path.startsWith('evaluation/coach-v1/reviews/knowledge-review-01/') ? evidenceRoot : base, path), 'utf8')
const json = (path) => JSON.parse(read(path))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export function verifyReviewArchive(readReview, trustedHash) {
  const raw = readReview('manifest.json')
  const errors = []
  if (hash(raw) !== trustedHash) errors.push('Untrusted review manifest')
  const manifest = JSON.parse(raw)
  for (const [path, expected] of Object.entries(manifest.outputs))
    if (hash(readReview(path)) !== expected) errors.push(`Review file changed: ${path}`)
  return { manifest, errors }
}

/** Returns integrity errors and release blockers separately; does not grant rights. */
export function validateCoachKnowledgeData() {
  const errors = []
  const { manifest: reviewManifest, errors: reviewErrors } = verifyReviewArchive(
    (path) => read(`evaluation/coach-v1/reviews/knowledge-review-01/${path}`),
    'f64dcea73c296de716a482d74cf6eede36871e8a7913c0f12cd046507ebc1e83'
  )
  errors.push(...reviewErrors)
  if (
    hash(canonical(json('lib/data/coach/revision-01/decisions.json'))) !==
    '6be74f598d990bbc3cf8657c449c1bc07204c94112f1cdc02fe5ce5ad27a246d'
  )
    errors.push('Untrusted review ledger')
  const manifest = json('lib/data/coach/authoring-manifest.json')
  const ledger = json('lib/data/coach/revision-01/decisions.json')
  for (const [path, expected] of Object.entries(manifest.files))
    if (hash(read(path)) !== expected) errors.push(`Authoring file changed: ${path}`)
  if (
    hash(read('evaluation/coach-v1/reviews/knowledge-review-01/manifest.json')) !==
    ledger.review_manifest_sha256
  )
    errors.push('Review manifest changed')
  if (
    hash(read('lib/data/coach/authoring-manifest.json')) !== reviewManifest.author_manifest_sha256
  )
    errors.push('Authoring manifest changed')
  const review = read('evaluation/coach-v1/reviews/knowledge-review-01/rows.jsonl')
    .trim()
    .split('\n')
    .map(JSON.parse)
  const cards = json('features/coach/knowledge/cards.json')
  const sources = json('features/coach/knowledge/sources.json')
  const annotations = json('lib/data/coach/exercise-planning-metadata.json')
  const evidence = json('lib/data/coach/revision-01/evidence.json')
  const catalog = json('lib/data/exercise-catalog.json')
  if (
    !Array.isArray(evidence.sources) ||
    evidence.sources.some(
      (source) =>
        source.role !== 'factual_support_candidate' ||
        !source.url ||
        !source.termsUrl ||
        !source.redistribution ||
        !source.training ||
        source.clearance !== 'unverified' ||
        !source.claimIds?.length ||
        source.claimIds.some((id) => !cards.some((card) => card.id === id))
    )
  )
    errors.push('Invalid factual support candidate')
  const sourceIds = new Set(sources.map((source) => source.id))
  if (
    sourceIds.size !== sources.length ||
    cards.some((card) => card.sourceIds.some((id) => !sourceIds.has(id)))
  )
    errors.push('Invalid source references')
  if (
    sources.some(
      (source) =>
        !source.permissionBasis ||
        !source.url ||
        !source.redistributionPermission ||
        !source.trainingPermission
    )
  )
    errors.push('Missing source permission declaration')
  if (
    ledger.rows.length !== review.length ||
    review.length !== 54 ||
    new Set(ledger.rows.map((r) => `${r.kind}:${r.id}`)).size !== 54
  )
    errors.push('Review row coverage mismatch')
  for (const entry of ledger.rows) {
    const original = review.find((r) => r.kind === entry.kind && r.id === entry.id)
    const authorRow = (entry.kind === 'card' ? cards : annotations).find(
      (r) => (r.id ?? r.sourceKey) === entry.id
    )
    if (
      !original ||
      !authorRow ||
      hash(canonical(entry.raw)) !== entry.raw_sha256 ||
      canonical(authorRow) !== canonical(entry.raw) ||
      entry.raw_sha256 !== entry.manifest_sha256 ||
      ['decision', 'reason', 'common_limit', 'raw_sha256'].some(
        (key) => entry[key] !== original[key]
      )
    )
      errors.push(`Invalid lineage: ${entry.id}`)
    if (
      entry.kind === 'annotation' &&
      !catalog.some((item) => (item.sourceKey ?? item.id) === entry.id)
    )
      errors.push(`Missing catalog identity: ${entry.id}`)
    if (
      entry.decision === 'revise' &&
      (!entry.revision ||
        hash(canonical(entry.revision)) !== entry.revision_sha256 ||
        entry.revision_review_status !== 'pending_independent_review')
    )
      errors.push(`Invalid revision: ${entry.id}`)
    if (entry.decision !== 'revise' && entry.revision)
      errors.push(`Unexpected revision: ${entry.id}`)
  }
  if (ledger.rows.filter((entry) => entry.decision === 'revise').length !== 18)
    errors.push('Expected 18 revisions')
  return {
    errors,
    releaseBlockers: [
      'Factual support and applicable redistribution and training permissions are unverified.',
      'Qualified human review is outstanding for all rows.',
      'Revisions require independent model review.',
    ],
  }
}

/** Mandatory callable boundary for consumers that opt into development data or export. */
export function enforceCoachKnowledgeGate(purpose) {
  if (!['development', 'release', 'training'].includes(purpose))
    throw new Error('Unknown knowledge gate purpose')
  const { errors, releaseBlockers } = validateCoachKnowledgeData()
  const blockers = purpose === 'development' ? errors : [...errors, ...releaseBlockers]
  if (blockers.length) throw new Error(`Coach knowledge gate failed: ${blockers.join('; ')}`)
}
