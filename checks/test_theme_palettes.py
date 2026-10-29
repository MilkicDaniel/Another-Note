"""Verify palette ingestion against original data, without network access."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('theme_import', ROOT / 'tooling/theme-vendor/import_themes.py')
themes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(themes)


class ThemePaletteTests(unittest.TestCase):
    def test_jsonc_keeps_strings_and_removes_comments_and_trailing_commas(self):
        value = themes.jsonc('''{
            // A line comment
            "source": "https://example.test/a/*b*/", /* a block comment */
            "tokens": ["a,}", "\\\\",],
        }''')
        self.assertEqual(value, {'source': 'https://example.test/a/*b*/', 'tokens': ['a,}', '\\']})

    def test_shorthand_and_opacity_use_original_background(self):
        self.assertEqual(themes.color('#abc'), '#aabbcc')
        self.assertEqual(themes.color('#ff000080', '#000000'), '#800000')
        self.assertEqual(themes.color('#1230', '#ffffff'), '#ffffff')
        self.assertIsNone(themes.color('url(https://example.test)'))

    def test_generic_scope_specificity_and_later_rules(self):
        rules = [
            {'scope': 'keyword', 'settings': {'foreground': '#111111'}},
            {'scope': ['keyword.control'], 'settings': {'foreground': '#222222'}},
            {'scope': 'source.css keyword.control', 'settings': {'foreground': '#333333'}},
            {'scope': 'keyword.control', 'settings': {'foreground': '#444444'}},
        ]
        self.assertEqual(themes.token(rules, ['keyword.control'], '#000000', '#ffffff'), '#444444')

    def test_bundled_lgpl_source_reproduces_exact_adapted_palette(self):
        raw = (ROOT / 'tooling/theme-vendor/upstream/bluloco-light.json').read_bytes()
        catalog = json.loads((ROOT / 'source/vendor/editor-themes.json').read_text())
        entry = next(theme for theme in catalog if theme['id'] == 'bluloco-light')
        self.assertEqual(hashlib.sha256(raw).hexdigest(), entry['sha256'])
        projected = themes.project(themes.jsonc(raw.decode('utf-8')), 'light')
        self.assertEqual(projected['colors'], entry['colors'])
        self.assertEqual(projected['surfaces'], entry['surfaces'])
        notices = (ROOT / 'source/vendor/THEME_LICENSES.txt').read_text()
        self.assertIn('GNU LESSER GENERAL PUBLIC LICENSE', notices)
        self.assertIn('GNU GENERAL PUBLIC LICENSE', notices)


if __name__ == '__main__':
    unittest.main()
