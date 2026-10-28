"""Real filesystem checks for direct saving and durable version history."""
from pathlib import Path
import json
import os
import stat
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fedora'))
from file_store import FileStore, VersionStore


class FileFeaturesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.data = self.root / 'app-data'
        self.documents = self.root / 'Documents with spaces'
        self.documents.mkdir()
        self.files = FileStore(self.data)

    def tearDown(self):
        self.temp.cleanup()

    def test_relative_links_resolve_from_saved_source_and_keep_bindings(self):
        source=self.documents/'pages'/'index.html';source.parent.mkdir();source.write_text('<link href="../styles/main.css">')
        target=self.documents/'styles'/'main.css';target.parent.mkdir();target.write_bytes(b'\xef\xbb\xbfbody {\r\n color: red;\r\n}')
        binding=self.files.open(source)
        entry=self.files.open_link(self.files.link_target('../styles/main.css?v=2#color',binding['fileKey']))
        self.assertEqual(entry['diskPath'],str(target));self.assertTrue(entry['bom']);self.assertEqual(entry['lineEnding'],'crlf')
        self.assertEqual(entry['fileKey'],self.files.open(target)['fileKey']);self.assertIn('../styles/main.css',source.read_text());self.assertIn(b'\r\n',target.read_bytes())

    def test_absolute_encoded_and_file_uri_links(self):
        target=self.documents/"John's theme.css";target.write_text('/* keep */')
        for reference in (str(target),target.as_uri(),str(target).replace(' ', '%20')):
            self.assertEqual(self.files.open_link(self.files.link_target(reference))['text'],'/* keep */')

    def test_relative_image_reference_resolves_beside_its_source(self):
        source=self.documents/'index.html';source.write_text('<a href="./Images/icon.png">image</a>')
        image=self.documents/'Images'/'icon.png';image.parent.mkdir();image.write_bytes(b'\x89PNG\r\n\x1a\n\xff')
        opened=self.files.open(source)
        for reference in ('./Images/icon.png','./Images/icon.png?v=2#preview'):
            self.assertEqual(self.files.link_target(reference,opened['fileKey']),{'path':str(image),'image':True})

    def test_disk_checks_skip_unchanged_bytes_and_detect_atomic_replacements(self):
        path=self.documents/'watched.txt';path.write_text('before')
        opened=self.files.open(path)
        with patch.object(self.files,'read_bound',wraps=self.files.read_bound) as read:
            self.assertEqual(self.files.check_changes([{'fileKey':opened['fileKey'],'diskStamp':opened['diskStamp']}]),{'files':[]})
            read.assert_not_called()
        replacement=path.with_suffix('.tmp');replacement.write_text('after!');replacement.replace(path)
        changed=self.files.check_changes([{'fileKey':opened['fileKey'],'diskStamp':opened['diskStamp']}])['files'][0]
        self.assertEqual(changed['text'],'after!');self.assertNotEqual(changed['diskStamp'],opened['diskStamp'])
        self.assertEqual(changed['fileKey'],opened['fileKey'])
        path.unlink()
        self.assertIn('error',self.files.check_changes([{'fileKey':opened['fileKey'],'diskStamp':changed['diskStamp']}])['files'][0])
        self.assertEqual(self.files.check_changes([{'fileKey':'unknown'}]),{'files':[]})

    def test_web_links_and_invalid_schemes_are_separate_from_local_files(self):
        self.assertEqual(self.files.link_target('https://example.com/?a=1&b=2'),{'url':'https://example.com/?a=1&b=2'})
        self.assertEqual(self.files.link_target('www.example.com/path'),{'url':'https://www.example.com/path'})
        for reference in ('javascript:alert(1)','data:text/plain,text','shell:run','https://','file://other-host/etc/passwd','bad\x00.css'):
            with self.assertRaises(ValueError,msg=reference):self.files.link_target(reference)
        with self.assertRaisesRegex(ValueError,'Save this file first'):self.files.link_target('./main.css')
        with self.assertRaises(ValueError):self.files.open_link(self.files.link_target(str(self.documents/'missing.css')))

    def test_open_edit_save_and_restart_keep_original_location(self):
        path = self.documents / '日本語.sh'
        path.write_text('echo old\n')
        path.chmod(0o750)
        opened = self.files.open(path)
        result = FileStore(self.data).write('echo new\n', key=opened['fileKey'])
        self.assertEqual(result['diskPath'], str(path))
        self.assertEqual(path.read_text(), 'echo new\n')
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o750)
        self.assertEqual(self.files.open(path)['fileKey'], opened['fileKey'])
        self.assertEqual(self.files.read_bound(opened['fileKey'])['text'], 'echo new\n')

    def test_save_as_changes_binding_and_preserves_original(self):
        original, other = self.documents / 'first.txt', self.documents / 'second.txt'
        original.write_text('original')
        opened = self.files.open(original)
        self.files.write('new copy', key=opened['fileKey'], destination=other)
        FileStore(self.data).write('updated copy', key=opened['fileKey'])
        self.assertEqual(original.read_text(), 'original')
        self.assertEqual(other.read_text(), 'updated copy')

    def test_preserves_crlf_and_utf8_bom(self):
        path = self.documents / 'windows.json'
        path.write_bytes(b'\xef\xbb\xbf{\r\n}\r\n')
        opened = self.files.open(path)
        self.files.write('{\n  "ok": true\n}\n', key=opened['fileKey'])
        self.assertEqual(path.read_bytes(), b'\xef\xbb\xbf{\r\n  "ok": true\r\n}\r\n')

    def test_unknown_binding_cannot_write_arbitrary_path(self):
        path = self.documents / 'keep.txt'
        path.write_text('keep')
        with self.assertRaises(ValueError):
            self.files.write('overwrite', key=str(path))
        with self.assertRaises(ValueError):
            self.files.read_bound(str(path))
        self.assertEqual(path.read_text(), 'keep')

    def test_keep_current_format_then_save_uses_the_editor_format(self):
        path=self.documents/'format.txt';path.write_bytes(b'old\n')
        opened=self.files.open(path)
        path.write_bytes(b'\xef\xbb\xbfexternal\r\n')
        self.files.read_bound(opened['fileKey'])
        self.files.write('kept editor version\n',key=opened['fileKey'],line_ending='lf',bom=False)
        self.assertEqual(path.read_bytes(),b'kept editor version\n')

    def test_interrupted_atomic_save_preserves_original(self):
        path = self.documents / 'keep.txt'
        path.write_text('before')
        opened = self.files.open(path)
        original_replace = os.replace
        def interrupted(source, destination):
            if Path(destination) == path:
                self.assertEqual(Path(source).parent, path.parent, 'Temporary file is on the destination filesystem')
                raise OSError('interrupted')
            return original_replace(source, destination)
        with patch('notebook_store.os.replace', side_effect=interrupted):
            with self.assertRaises(OSError):
                self.files.write('after', key=opened['fileKey'])
        self.assertEqual(path.read_text(), 'before')
        self.assertFalse(list(self.documents.glob('.notes-*')))

    def test_readonly_file_is_not_overwritten(self):
        path = self.documents / 'readonly.txt'
        path.write_text('keep'); path.chmod(0o400)
        opened = self.files.open(path)
        with self.assertRaises(PermissionError):
            self.files.write('replace', key=opened['fileKey'])
        self.assertEqual(path.read_text(), 'keep')

    def test_versions_survive_restart_and_invalid_updates_preserve_history(self):
        versions = VersionStore(self.data)
        first = {'id': 'v1', 'title': 'test.json', 'content': '{}', 'mode': 'json', 'createdAt': 100, 'reason': 'Before edit'}
        second = {**first, 'id': 'v2', 'content': '{"ok": true}', 'createdAt': 200}
        versions.write('document', [first, second])
        self.assertEqual(VersionStore(self.data).read('document'), [first, second])
        with self.assertRaises(ValueError):
            versions.write('document', [{'id': 'broken'}])
        for invalid_time in (float('nan'), float('inf'), True):
            with self.assertRaises(ValueError):
                versions.write('document', [{**first, 'createdAt': invalid_time}])
        self.assertEqual(versions.read('document'), [first, second])
        self.assertEqual(stat.S_IMODE(versions.path('document').stat().st_mode), 0o600)

    def test_stale_history_writes_merge_checkpoints_from_other_windows(self):
        versions = VersionStore(self.data)
        first = dict(id='base', title='a.txt', content='base', mode='text', reason='Base', createdAt=1)
        second = dict(first, id='second', content='second window', createdAt=3)
        third = dict(first, id='third', content='first window', createdAt=2)
        versions.write('shared', [first, third])
        result = versions.write('shared', [first, second])
        self.assertEqual([v['id'] for v in versions.read('shared')], ['base', 'third', 'second'])
        self.assertEqual(result['versions'], versions.read('shared'))

    def test_new_language_version_histories_survive_restart(self):
        versions = VersionStore(self.data)
        for mode in ('java', 'javascript', 'html', 'css', 'python'):
            with self.subTest(mode=mode):
                snapshot = dict(id='v1', title='Example', content='<source>\n', mode=mode, createdAt=100, reason='Saved')
                versions.write(mode, [snapshot])
                self.assertEqual(VersionStore(self.data).read(mode), [snapshot])

    def test_merged_history_retains_limits_and_deletion_is_explicit(self):
        versions = VersionStore(self.data)
        entries = [dict(id=str(i), title='a.txt', content=str(i), mode='text', reason='Checkpoint', createdAt=i) for i in range(40)]
        versions.write('shared', entries[:25]); versions.write('shared', entries[25:])
        self.assertEqual(versions.read('shared'), entries[-30:])
        versions.write('shared', [])
        self.assertEqual(versions.read('shared'), entries[-30:], 'A stale empty cache cannot delete history')
        versions.delete('shared'); self.assertEqual(versions.read('shared'), [])

    def test_single_version_append_preserves_history_and_returns_no_contents(self):
        versions=VersionStore(self.data)
        first=dict(id='first',title='a.txt',content='first contents',mode='text',createdAt=1,reason='Opened')
        second=dict(first,id='second',content='new contents',createdAt=2)
        versions.write('file',[first])
        self.assertEqual(versions.append('file',second),{'saved':True,'count':2})
        self.assertEqual(versions.append('file',dict(second,id='duplicate',createdAt=3)),{'saved':True,'count':2})
        self.assertEqual(VersionStore(self.data).read('file'),[first,second])
        with self.assertRaises(ValueError):versions.append('file',dict(second,mode='invalid'))
        self.assertEqual(versions.read('file'),[first,second])

    def test_simultaneous_window_checkpoints_are_atomic(self):
        versions = VersionStore(self.data)
        first = dict(id='base', title='a.txt', content='base', mode='text', reason='Base', createdAt=1)
        versions.write('shared', [first])
        barrier, errors = threading.Barrier(2), []
        def write(identity):
            try:
                barrier.wait(timeout=3)
                versions.write('shared', [first, dict(first, id=identity, content=identity, createdAt=2)])
            except Exception as error: errors.append(error)
        workers = [threading.Thread(target=write, args=(identity,)) for identity in ('left', 'right')]
        for worker in workers: worker.start()
        for worker in workers: worker.join(timeout=5)
        self.assertFalse(errors)
        self.assertEqual({v['id'] for v in versions.read('shared')}, {'base', 'left', 'right'})

    def test_version_file_names_never_escape_history_folder(self):
        versions = VersionStore(self.data)
        self.assertEqual(versions.path('../../elsewhere').parent, self.data / 'versions')
        versions.write('document', [])
        versions.delete('document')
        self.assertFalse(versions.path('document').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
