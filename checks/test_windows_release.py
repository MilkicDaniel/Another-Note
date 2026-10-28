import json,tempfile,unittest
from pathlib import Path
from windows.windows_release import build_from_html,load_release,write_editor_bundle

def page(build):return '<meta name="another-note-build" content="'+build+'"><span class="app-build">'+build+'</span>'

class WindowsReleaseTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.folder=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_updating_a_release_changes_the_editor_file_url(self):
        first=write_editor_bundle(self.folder,page('2026.10.27-r4'));old=(self.folder/first['editor']).as_uri()
        release=write_editor_bundle(self.folder,page('2026.10.27-r5'));current=load_release(self.folder)
        self.assertEqual(current,release);self.assertNotEqual((self.folder/current['editor']).as_uri(),old)
        self.assertEqual(current['build'],'2026.10.27-r5');self.assertEqual((self.folder/current['editor']).read_bytes(),(self.folder/'Another-Note.html').read_bytes())
    def test_a_stale_canonical_page_does_not_replace_the_versioned_editor(self):
        release=write_editor_bundle(self.folder,page('2026.10.27-r5'));(self.folder/'Another-Note.html').write_text(page('2026.10.27-r2'))
        self.assertEqual(load_release(self.folder),release)
    def test_changed_editor_bytes_are_rejected(self):
        release=write_editor_bundle(self.folder,page('2026.10.27-r5'));(self.folder/release['editor']).write_text(page('2026.10.27-r2'))
        with self.assertRaisesRegex(ValueError,'does not match'):load_release(self.folder)
    def test_manifest_must_match_the_editor_build(self):
        write_editor_bundle(self.folder,page('2026.10.27-r5'));release=json.loads((self.folder/'release.json').read_text());release['build']='2026.10.27-r2';(self.folder/'release.json').write_text(json.dumps(release))
        with self.assertRaisesRegex(ValueError,'release is invalid'):load_release(self.folder)
    def test_manifest_cannot_select_another_file(self):
        for editor in ['../Another-Note.html','Another-Note.html','https://example.com/editor.html']:
            release={'build':'2026.10.27-r5','editor':editor,'sha256':'0'*64};(self.folder/'release.json').write_text(json.dumps(release))
            with self.assertRaises(ValueError):load_release(self.folder)
    def test_development_pages_keep_their_existing_entry_point(self):
        (self.folder/'Another-Note.html').write_text(page('2026.10.27-r5'));self.assertEqual(load_release(self.folder)['editor'],'Another-Note.html')
    def test_invalid_build_identifiers_are_rejected(self):
        for build in ['r5','../r5','2026.10.27-r5/other','']:
            with self.assertRaises(ValueError):build_from_html(page(build))

if __name__=='__main__':unittest.main()
