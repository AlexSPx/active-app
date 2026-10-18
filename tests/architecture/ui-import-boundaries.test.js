const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const repoRoot = path.resolve(__dirname, '../..')
const uiRoot = path.join(repoRoot, 'components/ui')
const migratedUiFiles = new Set([
  'components/ui/Controls.tsx',
  'components/ui/CadenceOverlay.tsx',
  'components/ui/ActionMenu.tsx',
  'components/ui/Badge.tsx',
  'components/ui/useCadenceColors.ts',
  'components/ui/StartWorkoutButton.tsx',
  'components/ui/ErrorDisplay.tsx',
  'components/ui/LoadingSpinner.tsx',
  'components/ui/index.ts',
])
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

    if (
      migratedUiFiles.has(relativePath) &&
      (specifier === 'tamagui' || specifier.startsWith('@tamagui/'))
    ) {
      violations.push(`${specifier} is forbidden in migrated shared UI`)
    }
    return violations.map((reason) => `${relativePath}: ${reason}`)
  })
}

function uiSourceFiles(directory = uiRoot) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return uiSourceFiles(filename)
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [filename] : []
  })
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

  test.each([...migratedUiFiles])('rejects Tamagui imports from %s', (relativePath) => {
    const filename = path.join(repoRoot, relativePath)
    expect(findBoundaryViolations(filename, "import { View } from 'tamagui'")).not.toHaveLength(0)
    expect(
      findBoundaryViolations(filename, "import { Sheet } from '@tamagui/sheet'")
    ).not.toHaveLength(0)
  })

  test('does not apply the Tamagui boundary to legacy shared UI or AppThemeProvider', () => {
    expect(
      findBoundaryViolations(
        path.join(uiRoot, 'EmptyState.tsx'),
        "import { YStack } from 'tamagui'"
      )
    ).toEqual([])
    expect(
      findBoundaryViolations(
        path.join(repoRoot, 'providers/AppThemeProvider.tsx'),
        "import { TamaguiProvider } from 'tamagui'"
      )
    ).toEqual([])
  })

  test('current shared UI modules comply with the import boundaries', () => {
    const violations = uiSourceFiles().flatMap((filename) =>
      findBoundaryViolations(filename, fs.readFileSync(filename, 'utf8'))
    )
    expect(violations).toEqual([])
  })
})
