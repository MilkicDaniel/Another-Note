"""Closed disk files retain links; every live tab keeps its complete document."""
import copy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fedora'))
from notebook_store import NotebookStore, WorkspaceHub
from file_store import FileStore, VersionStore


class ClosedFileLinkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.store = NotebookStore(self.folder / 'notebook')
        self.files = FileStore(self.store.folder)
        self.versions = VersionStore(self.store.folder)
        self.store.read()
        self.notes = []
        for identity in ('open', 'closed'):
            path = self.folder / (identity + '.txt')
            path.write_text('Source ' + identity + '\n\u2603\n')
            disk = self.files.open(path)
            saved = dict(title=disk['name'], content=disk['text'], mode='text', lineEnding='lf', bom=False)
            note = dict(id=identity, **saved, createdAt=1, updatedAt=100, savedState=saved,
                        savedSignature='a saved hash', fileKey=disk['fileKey'], diskPath=disk['diskPath'],
                        tags=['Keep while open'], tagsUpdatedAt=90, pinned=True, lineNumbers=False)
            self.notes.append(note)
            self.versions.append(identity, dict(id='version-' + identity, title=saved['title'], content='Older source', mode='text', reason='Saved', createdAt=50))
        self.workspace = dict(format='vista-notes', version=1, updatedAt=100, activeId='open',
                              settings=dict(openIds=['open'], theme='dark', closedIds=['closed'], recentFiles=[dict(id='closed', closedAt=90)]), notes=self.notes)
        self.store.write(self.workspace)
        self.hub = WorkspaceHub(self.store, self.files, self.versions)

    def tearDown(self):
        self.temp.cleanup()

    def test_startup_keeps_open_file_exactly_and_migrates_only_closed_file(self):
        result = self.hub.load('main', open_tabs_only=True)
        active, closed = result['state']['notes']
        self.assertEqual(active, self.notes[0], 'An open tab retains every existing field')
        self.assertEqual(self.versions.read('open')[0]['content'], 'Older source')
        self.assertEqual(set(closed), {'id', 'title', 'mode', 'createdAt', 'updatedAt', 'fileKey', 'diskPath', 'fileLink'})
        self.assertTrue(closed['fileLink'])
        self.assertNotIn('deferred', result, 'Closed links are available without a second contents request')
        self.assertEqual(self.versions.read('closed'), [])
        self.assertEqual(self.store.read()['state']['notes'][1], closed)
        self.assertEqual((self.folder / 'closed.txt').read_text(), self.notes[1]['content'])

    def test_file_in_another_window_keeps_body_tags_baseline_and_history(self):
        state = copy.deepcopy(self.workspace)
        state['settings']['openIds'] = ['open', 'closed']
        self.store.write(state)
        parent = self.hub.load('main')['state']
        child = self.hub.load('child', ['closed'])['state']
        parent['settings']['openIds'] = ['open']
        snapshot = self.hub.save('main', parent)
        self.assertEqual(snapshot['notes'][1], self.notes[1])
        self.assertTrue(self.versions.read('closed'))
        child['settings']['openIds'] = []
        snapshot = self.hub.save('child', child)
        self.assertTrue(snapshot['notes'][1]['fileLink'])
        self.assertEqual(snapshot['notes'][0], self.notes[0])
        self.assertEqual(self.versions.read('closed'), [])

    def test_reopen_reads_disk_and_stale_history_writes_cannot_restore_old_history(self):
        self.hub.load('main')
        (self.folder / 'closed.txt').write_bytes(b'\xef\xbb\xbfUpdated\r\nfrom disk\r\n')
        reopened = self.hub.open_file_link('main', 'closed')['file']
        self.assertEqual(reopened['content'], 'Updated\nfrom disk\n')
        self.assertEqual(reopened['lineEnding'], 'crlf')
        self.assertTrue(reopened['bom'])
        self.assertNotIn('tags', reopened)
        self.assertEqual(reopened['savedState']['content'], reopened['content'])
        version = dict(id='late', title='closed.txt', content='Old queued source', mode='text', reason='Typing', createdAt=200)
        self.hub.version_operation('append', 'closed', version, epoch=0)
        self.assertEqual(self.versions.read('closed'), [])
        self.hub.version_operation('append', 'closed', version, epoch=reopened['historyEpoch'])
        self.assertEqual(self.versions.read('closed'), [version])

    def test_reopen_uses_an_open_sibling_draft_and_never_overwrites_it_from_disk(self):
        self.hub.load('main')
        self.hub.open_file_link('main', 'closed')
        parent = self.hub.load('main')['state']
        parent['notes'][1]['content'] = 'Unsaved changes in another window'
        parent['notes'][1]['tags'] = ['Current tab tags']
        parent['notes'][1]['updatedAt'] += 100
        parent['notes'][1]['tagsUpdatedAt'] = parent['notes'][1]['updatedAt']
        self.hub.save('main', parent)
        self.hub.load('child', [])
        opened = self.hub.open_file_link('child', 'closed')['file']
        self.assertEqual(opened['content'], 'Unsaved changes in another window')
        self.assertEqual(opened['tags'], ['Current tab tags'])

    def test_backup_read_does_not_open_file_or_retain_its_contents(self):
        self.hub.load('main')
        before = copy.deepcopy(self.hub.state)
        opened = self.hub.open_file_link('main', 'closed', activate=False)
        self.assertEqual(opened['file']['content'], self.notes[1]['content'])
        self.assertEqual(self.hub.tabs['main'], ['open'])
        self.assertEqual(self.hub.state, before)

    def test_unavailable_disk_files_and_modified_or_unbound_documents_keep_recovery(self):
        for condition in ('missing', 'modified', 'unbound'):
            with self.subTest(condition=condition):
                state = copy.deepcopy(self.workspace)
                if condition == 'missing':
                    (self.folder / 'closed.txt').unlink(missing_ok=True)
                elif condition == 'modified':
                    (self.folder / 'closed.txt').write_text(self.notes[1]['content'])
                    state['notes'][1]['content'] = 'Unsaved recovery source'
                else:
                    state['notes'][1].pop('fileKey')
                self.store.write(state)
                hub = WorkspaceHub(self.store, self.files, self.versions)
                self.assertEqual(hub.load('main')['state']['notes'][1], state['notes'][1])

    def test_stale_closed_snapshot_cannot_resurrect_body_tags_or_history(self):
        self.hub.load('main')
        saved = self.hub.save('main', self.workspace)
        self.assertTrue(saved['notes'][1]['fileLink'])
        self.assertNotIn('content', saved['notes'][1])
        self.assertNotIn('tags', saved['notes'][1])
        self.hub.version_operation('append', 'closed', self.versions.read('open')[0])
        self.assertEqual(self.versions.read('closed'), [])

    def test_write_failure_preserves_existing_history(self):
        with patch.object(self.store, 'write', side_effect=OSError('Storage unavailable')):
            with self.assertRaisesRegex(OSError, 'Storage unavailable'):
                self.hub.load('main')
        self.assertTrue(self.versions.read('closed'))

    def test_broken_link_cannot_change_existing_open_tabs_or_saved_links(self):
        self.hub.load('main')
        before = copy.deepcopy(self.hub.state)
        (self.folder / 'closed.txt').unlink()
        with self.assertRaisesRegex(ValueError, 'could not be found'):
            self.hub.open_file_link('main', 'closed')
        self.assertEqual(self.hub.state, before)
        self.assertEqual(self.hub.tabs['main'], ['open'])
