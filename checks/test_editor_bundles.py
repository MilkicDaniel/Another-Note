from pathlib import Path
import base64
import gzip
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fedora'))
from launcher import EditorBundles


class EditorBundleTests(unittest.TestCase):
    def test_packaged_bundles_load_only_on_demand_and_cache_across_windows(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = gzip.compress(b'packaged worker')
            (root / 'spelling-worker.js.gz').write_bytes(data)
            bundles = EditorBundles(root)
            self.assertEqual(bundles.cache, {})
            original = Path.read_bytes
            with patch.object(Path, 'read_bytes', autospec=True, side_effect=original) as read:
                with ThreadPoolExecutor(max_workers=4) as pool:
                    results = list(pool.map(bundles.read, ['spelling'] * 8))
                self.assertEqual(read.call_count, 1)
            self.assertTrue(all(base64.b64decode(result['source']) == data for result in results))
            self.assertNotIn('format', bundles.cache)

    def test_only_known_packaged_tool_names_can_be_read(self):
        bundles = EditorBundles(Path('/unused'))
        for name in ('../notes.json', '/etc/passwd', 'other', None, ['format']):
            with self.assertRaises(ValueError):
                bundles.read(name)

    def test_missing_bundle_has_an_actionable_error_and_is_not_cached(self):
        with tempfile.TemporaryDirectory() as temporary:
            bundles = EditorBundles(temporary)
            with self.assertRaisesRegex(ValueError, 'Re-extract'):
                bundles.read('format')
            self.assertEqual(bundles.cache, {})


if __name__ == '__main__':
    unittest.main()
