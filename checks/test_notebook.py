"""Behavioral checks for durable saves, recovery, and non-destructive updates."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'fedora'))
from notebook_store import NotebookStore
import install


def notebook(content='echo "Saved ✓"'):
    return {'format': 'vista-notes', 'version': 1, 'updatedAt': 100, 'activeId': 'first',
            'settings': {'theme': 'system', 'fontSize': 15, 'wrap': True},
            'notes': [{'id': 'first', 'title': 'Bash note', 'content': content, 'mode': 'bash',
                       'createdAt': 1, 'updatedAt': 100, 'pinned': False, 'trashedAt': 0, 'removedAt': 0}]}


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name) / 'notebook'
        self.store = NotebookStore(self.folder)
        self.store.read()

    def tearDown(self):
        self.temp.cleanup()

    def test_restart_restores_all_notes_and_mode(self):
        saved = notebook()
        second = copy.deepcopy(saved['notes'][0])
        second.update(id='second', title='JSON', content='{"name":"日本語 📝"}', mode='json')
        saved['notes'].append(second)
        self.store.write(saved)
        self.assertEqual(NotebookStore(self.folder).read()['state'], saved)
        self.assertEqual(stat.S_IMODE(self.store.path.stat().st_mode), 0o600)

    def test_new_language_modes_and_saved_baselines_survive_restart(self):
        saved = notebook()
        for mode in ('java', 'javascript', 'html', 'css', 'python'):
            saved['notes'].append(dict(id=mode, title=mode, content='<source>\n', mode=mode, createdAt=1, updatedAt=100,
                                      savedState=dict(title=mode, content='old source', mode=mode), savedSignature='old'))
        self.store.write(saved)
        self.assertEqual(NotebookStore(self.folder).read()['state'], saved)

    def test_corruption_recovers_previous_valid_copy(self):
        first, second = notebook('first'), notebook('second')
        self.store.write(first)
        self.store.write(second)
        self.store.path.write_text('{broken')
        reopened = NotebookStore(self.folder)
        self.assertEqual(reopened.read(), {'state': first, 'recovered': True})
        reopened.write(notebook('recovered safely'))
        self.assertEqual(json.loads(reopened.previous.read_text()), first)

    def test_restart_preserves_modified_markers_and_recent_history(self):
        saved = notebook('edits since last file export')
        saved['notes'][0]['savedSignature'] = 'previous-file-signature'
        saved['notes'][0]['savedState'] = {'title': 'original.sh', 'content': 'last explicit save', 'mode': 'bash', 'lineEnding': 'lf', 'bom': False}
        saved['settings'].update(openIds=['first'], closedIds=['first'],
                                 recentFiles=[{'id': 'first', 'closedAt': 12345}])
        self.store.write(saved)
        self.assertEqual(NotebookStore(self.folder).read()['state'], saved)

    def test_both_corrupt_copies_are_preserved(self):
        self.folder.mkdir(exist_ok=True)
        self.store.path.write_text('{bad')
        self.store.previous.write_text('{also bad')
        reopened = NotebookStore(self.folder)
        with self.assertRaises(ValueError):
            reopened.read()
        with self.assertRaises(ValueError):
            reopened.write(notebook())
        self.assertEqual(self.store.path.read_text(), '{bad')
        self.assertEqual(self.store.previous.read_text(), '{also bad')

    def test_interrupted_replace_keeps_current_notebook(self):
        self.store.write(notebook('before'))
        original = os.replace
        def interrupt(source, destination):
            if Path(destination) == self.store.path:
                raise OSError('simulated interruption')
            original(source, destination)
        with patch('notebook_store.os.replace', side_effect=interrupt):
            with self.assertRaises(OSError):
                self.store.write(notebook('after'))
        self.assertEqual(NotebookStore(self.folder).read()['state'], notebook('before'))
        self.assertFalse(list(self.folder.glob('.notes-*')))

    def test_invalid_snapshot_does_not_overwrite_notes(self):
        self.store.write(notebook('keep me'))
        broken = notebook('bad')
        broken['notes'][0]['mode'] = 'unknown'
        with self.assertRaises(ValueError):
            self.store.write(broken)
        self.assertEqual(NotebookStore(self.folder).read()['state'], notebook('keep me'))

    def test_install_and_update_preserve_notebook(self):
        data_home = Path(self.temp.name) / 'Data with spaces'
        bin_dir = Path(self.temp.name) / 'bin'
        store = NotebookStore(data_home / 'vista-notes/notebook')
        store.read()
        store.write(notebook('keep across updates'))
        before = store.path.read_bytes()
        old_icon = data_home / 'icons/hicolor/scalable/apps' / f'{install.APP_ID}.svg'
        old_icon.parent.mkdir(parents=True)
        old_icon.write_text('<svg/>')
        with patch('install.shutil.which', return_value=None):
            command, desktop = install.install(data_home, bin_dir)
            install.install(data_home, bin_dir)
        self.assertEqual(store.path.read_bytes(), before)
        self.assertTrue(command.is_file())
        self.assertEqual(command.name, 'another-note')
        self.assertTrue((bin_dir / 'vista-notes').is_file())
        self.assertFalse(old_icon.exists())
        self.assertEqual((data_home / 'icons/hicolor/512x512/apps' / f'{install.APP_ID}.png').read_bytes(), (ROOT / 'fedora/another-note.png').read_bytes())
        self.assertIn('Name=Another Note\n', desktop.read_text())
        self.assertTrue(desktop.is_file())
        self.assertIn('Data with spaces', desktop.read_text())
        self.assertIn(' %F\n', desktop.read_text())
        self.assertIn('SingleMainWindow=false\nActions=new-window;\n', desktop.read_text())
        action = desktop.read_text().split('[Desktop Action new-window]\n', 1)[1]
        self.assertIn('Name=New Window\n', action)
        self.assertIn('Exec=/usr/bin/python3 ', action)
        self.assertNotIn('%F', action)


if __name__ == '__main__':
    unittest.main(verbosity=2)
