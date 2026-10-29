"""Adding Windows assets must preserve existing public release downloads."""
from pathlib import Path
import gzip
import hashlib
import json
import struct
import tempfile
import unittest
import zipfile

from package_release import write_checksums
from release_config import read_version, release_names
from windows.build_windows import MAGIC
from windows.publish_release import WINDOWS_INPUTS, prepare_addition


class WindowsPublishingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.existing, self.built, self.merged, self.root = [self.directory / name for name in ('existing', 'built', 'merged', 'root')]
        for folder in (self.existing, self.built, self.root):
            folder.mkdir()
        self.version = read_version()
        self.names = release_names(self.version)
        self.native = f'<meta name="another-note-build" content="{self.version}"><script id="startupTheme">ready()</script>'
        for name in WINDOWS_INPUTS:
            path = self.root / 'windows' / name;path.parent.mkdir(parents=True, exist_ok=True);path.write_text('runtime input ' + name)
        (self.root / 'source').mkdir();(self.root / 'source/app.js').write_text('current editor')
        with zipfile.ZipFile(self.existing / self.names['source'], 'w') as archive:
            for path in self.root.rglob('*'):
                if path.is_file():archive.write(path, 'another-note-source/' + path.relative_to(self.root).as_posix())
        shared = {'notebook_store.py': b'current notebook', 'file_store.py': b'current bindings',
                  'spelling-worker.js.gz': gzip.compress(b'spelling'), 'format-worker.js.gz': gzip.compress(b'formatting')}
        with zipfile.ZipFile(self.existing / self.names['fedora'], 'w') as archive:
            for name, data in {**shared, 'Another-Note.html': self.native.encode()}.items():archive.writestr('another-note-fedora/' + name, data)
        (self.existing / self.names['html']).write_text('published standalone')
        write_checksums(self.existing)
        for key in ('html', 'fedora', 'source'):
            (self.built / self.names[key]).write_bytes((self.existing / self.names[key]).read_bytes())
        bridge = (self.root / 'windows/bridge.js').read_text()
        html = self.native.replace('<script id="startupTheme">', '<script id="windowsBridge">' + bridge + '</script>\n  <script id="startupTheme">').encode()
        files = {**shared, 'Another-Note.html': html, f'Another-Note-{self.version}.html': html,
                 'release.json': json.dumps({'build': self.version, 'editor': f'Another-Note-{self.version}.html', 'sha256': hashlib.sha256(html).hexdigest()}).encode()}
        manifest = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
        with zipfile.ZipFile(self.built / self.names['windows'], 'w') as archive:
            for name, data in {**files, 'SHA256SUMS.json': json.dumps(manifest).encode()}.items():archive.writestr('another-note-windows/' + name, data)
        payload = (self.built / self.names['windows']).read_bytes()
        (self.built / self.names['installer']).write_bytes(b'MZ test installer' + payload + struct.pack('<16sQ32s', MAGIC, len(payload), hashlib.sha256(payload).digest()))
        write_checksums(self.built, include_windows=True)

    def tearDown(self):
        self.temp.cleanup()

    def test_addition_keeps_existing_downloads_and_extends_checksums(self):
        before = {path.name: path.read_bytes() for path in self.existing.iterdir()}
        additions = prepare_addition(self.existing, self.built, self.merged, self.version, self.root)
        self.assertEqual(set(additions), {self.names['installer'], self.names['windows']})
        manifest = write_checksums(self.merged, include_windows=True).read_text()
        for key in ('html', 'fedora', 'source'):
            self.assertEqual((self.merged / self.names[key]).read_bytes(), before[self.names[key]])
        self.assertTrue(all(line in manifest for line in before[self.names['checksums']].decode().splitlines()))
        self.assertEqual(len(manifest.splitlines()), 5)
        self.assertEqual({path.name: path.read_bytes() for path in self.existing.iterdir()}, before)

    def test_runtime_change_blocks_addition_before_any_output(self):
        (self.root / 'windows/windows_host.py').write_text('changed runtime requires another version')
        with self.assertRaisesRegex(ValueError, 'Application inputs changed'):
            prepare_addition(self.existing, self.built, self.merged, self.version, self.root)
        self.assertFalse(self.merged.exists())

    def test_missing_windows_build_preserves_existing_manifest(self):
        manifest = (self.built / self.names['checksums']).read_bytes()
        (self.built / self.names['installer']).unlink()
        with self.assertRaises(FileNotFoundError):write_checksums(self.built, include_windows=True)
        self.assertEqual((self.built / self.names['checksums']).read_bytes(), manifest)

    def test_already_published_windows_files_are_not_replaced(self):
        for key in ('installer', 'windows'):
            (self.existing / self.names[key]).write_bytes((self.built / self.names[key]).read_bytes())
        write_checksums(self.existing, include_windows=True)
        self.assertEqual(prepare_addition(self.existing, self.built, self.merged, self.version, self.root), [])
