import importlib.util
import json
import contextlib
import io
import tempfile
from unittest.mock import patch
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

    def test_check_is_offline_and_does_not_modify_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'apps/client/features/about').mkdir(parents=True)
            client = root / 'apps/client/package.json'
            lock = root / 'yarn.lock'
            output = root / 'apps/client/features/about/dependencies.json'
            (root / 'package.json').write_text('{}')
            client.write_text(json.dumps({'dependencies': {'react-native': '1'}}))
            lock.write_text('react-native@1:\n  version "1.0.0"\n')
            record = {'ecosystem': 'JavaScript', 'name': 'react-native', 'version': '1.0.0',
                      'license': 'MIT', 'url': 'https://www.npmjs.com/package/react-native/v/1.0.0'}
            fresh = json.dumps([record], indent=2) + '\n'
            with patch.object(dependencies, 'ROOT', root), patch.object(dependencies, 'OUTPUT', output), \
                    patch('sys.argv', ['generate-dependencies.py', '--check']), \
                    patch.object(dependencies, 'fetch_license', side_effect=AssertionError('network used')), \
                    contextlib.redirect_stderr(io.StringIO()):
                output.write_text(fresh)
                dependencies.main()
                self.assertEqual(output.read_text(), fresh)
                for stale in (fresh.rstrip(), json.dumps([record, {**record, 'name': 'removed'}])):
                    output.write_text(stale)
                    with self.assertRaisesRegex(ValueError, 'snapshot is stale.*--fetch'):
                        dependencies.main()
                    self.assertEqual(output.read_text(), stale)
                output.write_text(fresh)
                client.write_text(json.dumps({'dependencies': {'react-native': '1', 'new': '1'}}))
                lock.write_text(lock.read_text() + 'new@1:\n  version "1.0.0"\n')
                with self.assertRaisesRegex(ValueError, 'lack cached metadata.*--fetch'):
                    dependencies.main()
                self.assertEqual(output.read_text(), fresh)
                client.write_text(json.dumps({'dependencies': {'react-native': '2'}}))
                lock.write_text('react-native@2:\n  version "2.0.0"\n')
                with self.assertRaisesRegex(ValueError, 'lack cached metadata.*--fetch'):
                    dependencies.main()
                self.assertEqual(output.read_text(), fresh)

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
