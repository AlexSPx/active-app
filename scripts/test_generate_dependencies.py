import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('dependencies', Path(__file__).with_name('generate-dependencies.py'))
dependencies = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dependencies)


class DependenciesTest(unittest.TestCase):
    def test_scoped_alias_uses_real_package_and_locked_version(self):
        entries = dependencies.yarn_entries('"@scope/alias@npm:@scope/actual@^1.0.0":\n  version "1.2.3"\n', {'@scope/alias': 'npm:@scope/actual@^1.0.0'})
        self.assertEqual(entries, {('JavaScript', '@scope/alias', '1.2.3', '@scope/actual')})
        self.assertEqual(dependencies.package_url('JavaScript', '@scope/actual', '1.2.3'),
                         'https://www.npmjs.com/package/@scope/actual/v/1.2.3')

    def test_client_closure_excludes_unrelated_packages_and_honors_resolutions(self):
        lock = """client@1:
  version "1.0.0"
  dependencies:
    shared "^1"
  optionalDependencies:
    optional "1"
shared@2:
  version "2.0.1"
optional@1:
  version "1.0.2"
tooling@1:
  version "1.0.3"
"""
        entries = dependencies.yarn_entries(lock, {'client': '1'}, {'shared': '2'})
        self.assertEqual({(entry[1], entry[2]) for entry in entries},
                         {('client', '1.0.0'), ('shared', '2.0.1'), ('optional', '1.0.2')})
        with self.assertRaisesRegex(ValueError, 'Missing Yarn selector'):
            dependencies.yarn_entries(lock, {'missing': '1'})

    def test_actual_client_graph_excludes_workspace_tooling(self):
        root = dependencies.ROOT
        client = json.loads((root / 'apps/client/package.json').read_text())
        workspace = json.loads((root / 'package.json').read_text())
        entries = dependencies.yarn_entries((root / 'yarn.lock').read_text(),
                                           client['dependencies'], workspace['resolutions'])
        names = {entry[1] for entry in entries}
        self.assertTrue({'expo', 'react-native'} <= names)
        self.assertTrue({'prettier', 'jest-expo', 'openapi-typescript', '@remotion/cli'}.isdisjoint(names))

    def test_exact_metadata_and_unknown(self):
        parse = dependencies.parse_metadata
        self.assertEqual(parse('JavaScript', '@scope/pkg', '1.0.0',
                               {'name': '@scope/pkg', 'version': '1.0.0', 'license': 'MIT'}), 'MIT')
        self.assertIsNone(parse('JavaScript', 'pkg', '2.0.0',
                                {'name': 'pkg', 'version': '2.0.0', 'license': None}))
        with self.assertRaises(ValueError):
            parse('JavaScript', '@scope/pkg', '1.0.0',
                  {'name': '@scope/pkg', 'version': '2.0.0', 'license': 'MIT'})


if __name__ == '__main__':
    unittest.main()
