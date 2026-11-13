import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { enforceCoachKnowledgeGate } from '../../features/coach/knowledge/validate-data.mjs'

const root = resolve(import.meta.dirname, '../..')
const purpose = process.argv[2] ?? 'development'
if (!['local', 'development', 'release', 'training'].includes(purpose)) throw Error('Unknown coach gate purpose')
enforceCoachKnowledgeGate(purpose === 'local' ? 'local' : 'development')

// The release tool entry point must never reach quarantined development data.
const visited = new Set()
function visit(file) {
  if (visited.has(file)) return
  visited.add(file)
  const name = relative(root, file).replaceAll('\\', '/')
  if (/^(features\/coach\/knowledge\/(retrieve|policy|cards|sources)|features\/coach\/tools\/developmentCatalog|lib\/data\/coach\/)/.test(name))
    throw Error(`Quarantined coach data reachable from production tools: ${name}`)
  if (file.endsWith('.json')) return
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    if (!specifier.startsWith('.')) continue
    const base = resolve(dirname(file), specifier)
    const target = [base, ...['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json'].map(ext => base + ext), ...['index.ts', 'index.tsx', 'index.js'].map(ext => resolve(base, ext))].find(p => existsSync(p) && !requireDirectory(p))
    if (!target) throw Error(`Unresolved production import ${specifier} in ${name}`)
    visit(target)
  }
}
import { statSync } from 'node:fs'
function requireDirectory(file) { return statSync(file).isDirectory() }
visit(resolve(root, 'features/coach/tools/createCoachTools.ts'))
if (purpose === 'release' || purpose === 'training') {
  const blockers = []
  try { enforceCoachKnowledgeGate(purpose) } catch (error) { blockers.push(error.message) }
  if (purpose === 'release') blockers.push('Acceptance evidence is missing for evaluated quality, qualified human review, source rights, supported native devices, offline lifecycle, and persistence/profile isolation.')
  if (blockers.length) throw Error(`Coach ${purpose} gate failed: ${blockers.join(' ')}`)
}
console.log(`PASS: coach ${purpose} knowledge integrity and production tool graph`)
