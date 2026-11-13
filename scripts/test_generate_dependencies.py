import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('dependencies', Path(__file__).with_name('generate-dependencies.py'))
dependencies = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dependencies)


class DependenciesTest(unittest.TestCase):
    def test_scoped_alias_uses_real_package_and_locked_version(self):
        entries = dependencies.yarn_entries('"@scope/alias@npm:@scope/actual@^1.0.0":\n  version "1.2.3"\n')
        self.assertEqual(entries, {('JavaScript', '@scope/alias', '1.2.3', '@scope/actual')})
        self.assertEqual(dependencies.package_url('JavaScript', '@scope/actual', '1.2.3'),
                         'https://www.npmjs.com/package/@scope/actual/v/1.2.3')

    def test_exact_metadata_and_unknown(self):
        parse = dependencies.parse_metadata
        self.assertEqual(parse('JavaScript', '@scope/pkg', '1.0.0',
                               {'name': '@scope/pkg', 'version': '1.0.0', 'license': 'MIT'}), 'MIT')
        self.assertIsNone(parse('Rust', 'crate', '2.0.0',
                                {'version': {'crate': 'crate', 'num': '2.0.0', 'license': None}}))
        with self.assertRaises(ValueError):
            parse('JavaScript', '@scope/pkg', '1.0.0',
                  {'name': '@scope/pkg', 'version': '2.0.0', 'license': 'MIT'})


if __name__ == '__main__':
    unittest.main()
