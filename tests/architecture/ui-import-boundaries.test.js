const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const repoRoot = path.resolve(__dirname, '../..')
const uiRoot = path.join(repoRoot, 'components/ui')
const productionRoots = [
  'app',
  'components',
  'config',
  'constants',
  'contexts',
  'features',
  'lib',
  'navigation',
  'providers',
  'services',
  'stores',
  'types',
  'utils',
]
const projectAliases = new Set([
  'app',
  'components',
  'config',
  'constants',
  'contexts',
  'features',
  'lib',
  'navigation',
  'services',
  'stores',
  'types',
  'utils',
])

function collectModuleSpecifiers(filename, source) {
  const scriptKind = /\.tsx$/.test(filename)
    ? ts.ScriptKind.TSX
    : /\.jsx$/.test(filename)
      ? ts.ScriptKind.JSX
      : /\.ts$/.test(filename)
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, scriptKind)
  if (sourceFile.parseDiagnostics.length) {
    throw new Error(`Could not parse ${path.relative(repoRoot, filename)}`)
  }

  const imports = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const expression = node.moduleReference.expression
      if (expression && ts.isStringLiteral(expression)) imports.push(expression.text)
    } else if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const moduleSpecifier = node.arguments[0]
      if (
        (isRequire || isDynamicImport) &&
        moduleSpecifier &&
        ts.isStringLiteralLike(moduleSpecifier)
      ) {
        imports.push(moduleSpecifier.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return imports
}

function projectImportPath(filename, specifier) {
  if (specifier.startsWith('.')) {
    return path.relative(repoRoot, path.resolve(path.dirname(filename), specifier))
  }
  return projectAliases.has(specifier.split('/')[0]) ? specifier : null
}

function findBoundaryViolations(filename, source) {
  const relativePath = path.relative(repoRoot, filename).split(path.sep).join('/')
  const isSharedUi = relativePath.startsWith('components/ui/')
  if (!isSharedUi) return []

  return collectModuleSpecifiers(filename, source).flatMap((specifier) => {
    const violations = []
    if (specifier === '@tanstack/react-query' || specifier.startsWith('@tanstack/react-query/')) {
      violations.push(`${specifier} is owned by the data layer`)
    }
    if (specifier === 'expo-router' || specifier.startsWith('expo-router/')) {
      violations.push(`${specifier} is owned by navigation`)
    }

    const importedPath = projectImportPath(filename, specifier)
    if (importedPath) {
      const segments = importedPath
        .replace(/\\/g, '/')
        .split('/')
        .map((segment) => segment.replace(/\.[^.]+$/, ''))
      if (segments[0] === 'features') {
        violations.push(specifier + ' imports a feature module')
      }
      if (segments.some((segment) => /^(?:stores?|repositories?)$/i.test(segment))) {
        violations.push(`${specifier} reaches a store or repository`)
      }
      if (
        segments.some(
          (segment, index) => segment === 'lib' && segments[index + 1] === 'queryClient'
        )
      ) {
        violations.push(`${specifier} imports lib/queryClient`)
      }
    }

    return violations.map((reason) => `${relativePath}: ${reason}`)
  })
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(filename)
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [filename] : []
  })
}

function findTamaguiImports(filename, source) {
  return collectModuleSpecifiers(filename, source)
    .filter((specifier) => specifier === 'tamagui' || specifier.startsWith('@tamagui/'))
    .map((specifier) => `${path.relative(repoRoot, filename)}: ${specifier}`)
}

describe('shared UI import boundaries', () => {
  test.each([
    ['store', "import store from '../../stores/authStore'"],
    ['repository', "export { UserRepository } from '../../lib/repositories/UserRepository'"],
    ['repository barrel', "import * as repositories from '../../lib/repositories'"],
    ['query client', "import client from '../../lib/queryClient'"],
    ['React Query', "import { useQuery } from '@tanstack/react-query'"],
    ['Expo Router', "import { useRouter } from 'expo-router'"],
    ['feature barrel', "import { useSettingsStore } from 'features/settings'"],
    ['dynamic store import', "const store = import('../../stores/authStore')"],
    ['required repository', "const repository = require('../../lib/repositories/UserRepository')"],
  ])('rejects a prohibited %s dependency from shared UI', (_boundary, source) => {
    expect(
      findBoundaryViolations(path.join(uiRoot, 'BoundaryFixture.tsx'), source)
    ).not.toHaveLength(0)
  })

  test('rejects Tamagui imports from application source', () => {
    const files = productionRoots.flatMap((root) => {
      const directory = path.join(repoRoot, root)
      return fs.existsSync(directory) ? sourceFiles(directory) : []
    })
    const violations = files.flatMap((filename) =>
      findTamaguiImports(filename, fs.readFileSync(filename, 'utf8'))
    )
    expect(violations).toEqual([])
  })

  test('dependencies, scripts, and bundler configs have no Tamagui wiring', () => {
    const manifest = require('../../package.json')
    const packageReferences = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.entries(manifest.scripts ?? {}).flat(),
    ].filter((entry) => /tamagui/i.test(entry))
    const buildReferences = ['metro.config.js', 'babel.config.js']
      .map((filename) => fs.readFileSync(path.join(repoRoot, filename), 'utf8'))
      .filter((contents) => /@tamagui|tamagui[.-](?:config|css)/i.test(contents))
    expect({ packageReferences, buildReferences }).toEqual({
      packageReferences: [],
      buildReferences: [],
    })
  })

  test('current shared UI modules comply with the import boundaries', () => {
    const violations = sourceFiles(uiRoot).flatMap((filename) =>
      findBoundaryViolations(filename, fs.readFileSync(filename, 'utf8'))
    )
    expect(violations).toEqual([])
  })
})
