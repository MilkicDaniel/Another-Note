"""Real concurrent window journals: independent tab order, no lost edits or save side effects."""
from pathlib import Path
import copy
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fedora'))
from notebook_store import NotebookStore, WorkspaceHub


class WindowJournalTests(unittest.TestCase):
    def test_bootstrap_loads_open_tabs_and_defers_closed_trash_and_tombstones(self):
        closed = copy.deepcopy(self.parent['notes'][0])
        closed.update(id='closed', content='Closed source\n\u2603', tags=['Keep'])
        trash = {**closed, 'id': 'trash', 'trashedAt': 90}
        removed = {**closed, 'id': 'removed', 'removedAt': 95}
        self.parent['notes'].extend([closed, trash, removed])
        self.parent['settings'].update(closedIds=['closed'], recentFiles=[{'id': 'closed', 'closedAt': 80}])
        self.hub.save('main', self.parent)
        initial = self.hub.load('main', open_tabs_only=True)
        self.assertTrue(initial['deferred'])
        self.assertEqual([note['id'] for note in initial['state']['notes']], ['a', 'b'])
        self.assertEqual(set(initial['availableIds']), {'a', 'b', 'closed'})
        self.assertEqual(initial['state']['settings']['closedIds'], ['closed'])
        self.assertEqual(len(self.hub.state['notes']), 5)
        self.assertEqual(len(self.store.read()['state']['notes']), 5)
        # Even an early partial client journal cannot delete deferred records.
        initial['state']['notes'][0].update(content='Edited before hydration', updatedAt=200)
        self.hub.save('main', initial['state'])
        remaining = self.hub.load('main')['state']
        self.assertEqual(remaining['notes'][0]['content'], 'Edited before hydration')
        self.assertEqual(remaining['notes'][2:], [closed, trash, removed])
        self.assertEqual(remaining['settings']['openIds'], ['a', 'b'])

    def test_bootstrap_empty_tabs_and_fully_open_workspace(self):
        all_open = self.hub.load('main', open_tabs_only=True)
        self.assertNotIn('deferred', all_open)
        fresh = self.hub.load('fresh', [], open_tabs_only=True)
        self.assertTrue(fresh['deferred'])
        self.assertEqual(fresh['state']['notes'], [])
        self.assertEqual(fresh['state']['settings']['openIds'], [])
        self.assertIsNone(fresh['state']['activeId'])
        self.assertEqual(len(self.hub.load('fresh')['state']['notes']), 2)

    def test_editor_preferences_and_reset_survive_stale_window_saves_and_restart(self):
        child=self.hub.load('child',['b'])['state']
        preferences={'appearance':{'fontFamily':'Consolas','fontStyle':'italic','colors':{'dark':{'keyword':'#c0ffee'}}},'formatting':{'java':{'bracePolicy':'always'}}}
        self.parent['settings'].update(editorPreferences=preferences,editorPreferencesUpdatedAt=200)
        self.hub.save('main',self.parent);self.hub.save('child',child)
        self.assertEqual(self.hub.state['settings']['editorPreferences'],preferences)
        child['settings'].update(editorPreferences={},editorPreferencesUpdatedAt=300)
        self.hub.save('child',child);self.hub.save('main',self.parent)
        restored=WorkspaceHub(self.store).load('restart')['state']['settings']
        self.assertEqual(restored['editorPreferences'],{});self.assertEqual(restored['editorPreferencesUpdatedAt'],300)
    def test_shortcuts_survive_stale_window_saves_and_reset(self):
        child = self.hub.load('child', ['b'])['state']
        self.parent['settings'].update(shortcutBindings={'export': ['Ctrl+Alt+S']}, shortcutsUpdatedAt=200)
        self.hub.save('main', self.parent)
        self.hub.save('child', child)
        self.assertEqual(self.hub.state['settings']['shortcutBindings'], {'export': ['Ctrl+Alt+S']})
        child['settings'].update(shortcutBindings={}, shortcutsUpdatedAt=300)
        self.hub.save('child', child)
        self.hub.save('main', self.parent)
        restarted = WorkspaceHub(self.store).load('restart')['state']
        self.assertEqual(restarted['settings']['shortcutBindings'], {})
        self.assertEqual(restarted['settings']['shortcutsUpdatedAt'], 300)

    def test_recent_history_merges_and_clear_survives_stale_window_saves(self):
        child=self.hub.load('child',['b'])['state']
        self.parent['settings']['openIds']=[];self.parent['settings']['recentFiles']=[{'id':'a','closedAt':200}]
        self.hub.save('main',self.parent);self.hub.save('child',child)
        self.assertEqual(self.hub.state['settings']['recentFiles'],[{'id':'a','closedAt':200}]);self.assertEqual(self.hub.open_file_ids(),['b'])
        child['settings']['recentClearedAt']=300;child['settings']['recentFiles']=[];self.hub.save('child',child);self.hub.save('main',self.parent)
        self.assertEqual(self.hub.state['settings']['recentFiles'],[])
        self.assertEqual(self.hub.state['settings']['recentClearedAt'],300)
    def test_dictionary_changes_merge_across_windows_and_restart(self):
        child = self.hub.load('child', ['a'])['state']
        self.parent['dictionaryChanges'] = [dict(name='camelWrng', updatedAt=200, deleted=False)]
        self.hub.save('main', self.parent)
        child['dictionaryChanges'] = [dict(name='CAMELWRNG', updatedAt=300, deleted=True), dict(name='snake_case', updatedAt=250, deleted=False)]
        self.hub.save('child', child)
        self.hub.save('main', self.parent)
        restarted = WorkspaceHub(self.store).load('restarted')['state']
        changes = {entry['name'].lower(): entry for entry in restarted['dictionaryChanges']}
        self.assertTrue(changes['camelwrng']['deleted'])
        self.assertFalse(changes['snake_case']['deleted'])
        self.assertEqual(restarted['notes'][0]['content'], '{}')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = NotebookStore(Path(self.temp.name))
        self.store.read()
        files = [dict(id=i, title=i+'.json', content='{}', mode='json', createdAt=1, updatedAt=100,
                      trashedAt=0, removedAt=0, savedSignature='explicit-save', savedState={'title': i+'.json', 'content': '{}', 'mode': 'json'},
                      fileKey='opaque-'+i, diskPath='/files/'+i+'.json') for i in ('a', 'b')]
        self.store.write(dict(format='vista-notes', version=1, updatedAt=100, activeId='a', settings={'openIds': ['a','b'], 'theme': 'dark'}, notes=files))
        self.hub = WorkspaceHub(self.store)
        self.parent = self.hub.load('main')['state']

    def tearDown(self):
        self.temp.cleanup()

    def test_child_load_keeps_dirty_file_binding_and_source_tabs_until_ready(self):
        self.parent['notes'][0]['content'] = 'unsaved draft'
        self.parent['notes'][0]['updatedAt'] = 200
        self.hub.save('main', self.parent)
        child = self.hub.load('child', ['a'])['state']
        self.assertEqual(child['settings']['openIds'], ['a'])
        self.assertEqual(child['activeId'], 'a')
        self.assertEqual(self.hub.tabs['main'], ['a','b'])
        self.assertEqual(child['notes'][0]['content'], 'unsaved draft')
        self.assertEqual(child['notes'][0]['savedState']['content'], '{}')
        self.assertEqual(child['notes'][0]['savedSignature'], 'explicit-save')
        self.assertEqual(child['notes'][0]['fileKey'], 'opaque-a')
        self.parent['settings']['openIds'] = ['b']
        self.hub.save('main', self.parent)
        self.assertEqual(self.store.read()['state']['settings']['openIds'], ['b','a'])

    def test_simultaneous_saves_preserve_edits_in_both_windows(self):
        child = self.hub.load('child', ['a'])['state']
        self.parent['settings']['openIds'] = ['b']
        self.parent['notes'][1].update(content='parent edit', updatedAt=201)
        child['notes'][0].update(content='child edit', updatedAt=202)
        barrier = threading.Barrier(2)
        errors = []
        def save(identity, state):
            try:
                barrier.wait(timeout=3)
                self.hub.save(identity, state)
            except Exception as error:
                errors.append(error)
        threads = [threading.Thread(target=save, args=('main', self.parent)), threading.Thread(target=save, args=('child', child))]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=5)
        self.assertFalse(errors)
        saved = self.store.read()['state']
        self.assertEqual({n['id']: n['content'] for n in saved['notes']}, {'a':'child edit','b':'parent edit'})
        self.assertEqual(set(saved['settings']['openIds']), {'a','b'})
        self.assertEqual(self.hub.load('main')['state']['settings']['openIds'], ['b'])
        self.assertEqual(self.hub.load('child')['state']['settings']['openIds'], ['a'])

    def test_failed_journal_does_not_acknowledge_or_overwrite_last_good_copy(self):
        before = copy.deepcopy(self.hub.state)
        self.parent['notes'][0].update(content='new edit', updatedAt=300)
        with patch.object(self.store, 'write', side_effect=OSError('disk full')):
            with self.assertRaises(OSError): self.hub.save('main', self.parent)
        self.assertEqual(self.hub.state, before)
        self.assertEqual(self.store.read()['state']['notes'][0]['content'], '{}')

    def test_tag_updates_merge_independently_of_content_and_saved_baselines(self):
        child = self.hub.load('child', ['a'])['state']
        self.parent['notes'][0].update(tags=['Work', 'Ideas'], tagsUpdatedAt=300)
        self.parent['tags'] = ['Work', 'Ideas', 'Unused']
        self.hub.save('main', self.parent)
        child['notes'][0].update(content='newer text', updatedAt=400)
        saved = self.hub.save('child', child)
        file = next(n for n in saved['notes'] if n['id'] == 'a')
        self.assertEqual(file['tags'], ['Work', 'Ideas'])
        self.assertEqual(file['content'], 'newer text')
        self.assertEqual(file['savedState']['content'], '{}')
        self.assertEqual(file['fileKey'], 'opaque-a')
        self.assertEqual(saved['tags'], ['Work', 'Ideas', 'Unused'])
        self.parent['notes'][0].update(tags=[], tagsUpdatedAt=500)
        self.hub.save('main', self.parent)
        saved = self.hub.save('child', child)
        self.assertEqual(next(n for n in saved['notes'] if n['id'] == 'a')['tags'], [])
        self.assertEqual(NotebookStore(self.store.folder).read()['state']['tags'], saved['tags'])

    def test_filters_are_per_window_and_keep_hidden_files_open(self):
        self.parent['settings']['tagFilter'] = {'kind': 'tag', 'tag': 'Work'}
        self.parent['notes'][0].update(tags=['Work'], tagsUpdatedAt=200)
        self.hub.save('main', self.parent)
        child = self.hub.load('child', ['b'])['state']
        self.assertEqual(child['settings']['tagFilter'], {'kind': 'all'})
        child['settings']['tagFilter'] = {'kind': 'untagged'}
        self.hub.save('child', child)
        main = self.hub.load('main')['state']
        self.assertEqual(main['settings']['tagFilter'], {'kind': 'tag', 'tag': 'Work'})
        self.assertEqual(main['settings']['openIds'], ['a', 'b'])
        self.assertEqual(self.hub.load('child')['state']['settings']['tagFilter'], {'kind': 'untagged'})
        self.hub.save('main', main)
        reopened = WorkspaceHub(NotebookStore(self.store.folder)).load('reopened')['state']
        self.assertEqual(reopened['settings']['openIds'], ['a', 'b'])
        self.assertEqual(reopened['settings']['tagFilter'], {'kind': 'tag', 'tag': 'Work'})

    def test_deleted_tags_stay_deleted_across_stale_windows_and_can_be_recreated(self):
        self.parent['notes'][0].update(tags=['Work', 'Keep'], tagsUpdatedAt=200)
        self.parent['notes'][1].update(tags=['Work'], tagsUpdatedAt=200, trashedAt=10)
        self.parent['tags'] = ['Work', 'Keep', 'Unused']
        self.parent['settings']['tagFilter'] = {'kind': 'tag', 'tag': 'Work'}
        self.hub.save('main', self.parent)
        stale = self.hub.load('child', ['a'])['state']
        self.parent['tagChanges'] = [dict(name='Work', updatedAt=500, deleted=True), dict(name='Unused', updatedAt=501, deleted=True)]
        deleted = self.hub.save('main', self.parent)
        self.assertEqual(deleted['tags'], ['Keep'])
        self.assertEqual(deleted['notes'][0]['tags'], ['Keep'])
        self.assertEqual(deleted['notes'][1]['tags'], [])
        self.assertEqual(deleted['settings']['tagFilter'], {'kind': 'all'})
        stale['notes'][0].update(content='new text from stale window', updatedAt=900)
        merged = self.hub.save('child', stale)
        self.assertEqual(merged['notes'][0]['content'], 'new text from stale window')
        self.assertEqual(merged['notes'][0]['tags'], ['Keep'])
        self.assertEqual(merged['notes'][0]['savedState']['content'], '{}')
        self.assertEqual(merged['notes'][0]['fileKey'], 'opaque-a')
        self.assertEqual(merged['tags'], ['Keep'])
        self.assertEqual(self.hub.load('main')['state']['settings']['tagFilter'], {'kind': 'all'})
        recreated = self.hub.load('main')['state']
        recreated['tagChanges'] = [dict(name='Work', updatedAt=1000, deleted=False), dict(name='Unused', updatedAt=501, deleted=True)]
        recreated['notes'][0].update(tags=['Keep', 'Work'], tagsUpdatedAt=1000)
        self.hub.save('main', recreated)
        merged = self.hub.save('child', stale)
        self.assertIn('Work', merged['tags'])
        self.assertIn('Work', merged['notes'][0]['tags'])
        self.assertEqual(merged['notes'][1]['tags'], [], 'Recreation must not resurrect older assignments')
        reopened = WorkspaceHub(NotebookStore(self.store.folder)).load('reopened')['state']
        self.assertEqual(reopened['tagChanges'], merged['tagChanges'])
        self.assertEqual(reopened['notes'][1]['tags'], [])

    def test_closing_one_window_keeps_all_content_and_the_other_window_open(self):
        child = self.hub.load('child', ['a'])['state']
        self.parent['settings']['openIds'] = ['b']
        self.hub.save('main', self.parent)
        child['notes'][0].update(content='child draft', updatedAt=300)
        self.hub.save('child', child)
        self.hub.retire('child')
        saved = self.store.read()['state']
        self.assertEqual(saved['settings']['openIds'], ['b'])
        self.assertEqual(saved['notes'][0]['content'], 'child draft')
        with self.assertRaises(ValueError): self.hub.save('child', child)
        self.hub.retire('main')
        self.assertEqual(self.store.read()['state']['settings']['openIds'], ['b'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
