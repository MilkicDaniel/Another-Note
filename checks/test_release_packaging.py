import tempfile,unittest
from pathlib import Path
from package_release import source_paths
from release_config import read_version,release_names

class ReleasePackagingTests(unittest.TestCase):
    def test_one_version_drives_every_download_filename(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);(root/'VERSION').write_text('2027.02.03-r12\n')
            version=read_version(root);names=release_names(version)
            self.assertEqual(len(set(names.values())),6)
            self.assertTrue(all(version in name for name in names.values()))
            self.assertTrue(names['html'].endswith('.html'));self.assertTrue(names['installer'].endswith('.exe'))
            self.assertTrue(names['fedora'].endswith('.zip'));self.assertTrue(names['source'].endswith('.zip'))
    def test_invalid_version_cannot_escape_the_output_directory(self):
        for version in ['../r6','r6','2026.10.27-r6/extra','2026.10.27-r6.exe','']:
            with self.assertRaises(ValueError):release_names(version)
    def test_source_archive_excludes_releases_git_metadata_and_caches(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            names=['VERSION','build.py','source/app.js','windows/launcher.py','dist/large.exe','.git/config','.idea/workspace.xml','.agents/local.json','.codex/config.toml','.aws/credentials','artifacts/runtime/cache.bin','checks/__pycache__/test.pyc','tooling/editor-vendor/node_modules/dependency/index.js','tooling/editor-vendor/generated/java-inline.mjs']
            for name in names:
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('fixture')
            actual={path.relative_to(root).as_posix() for path in source_paths(root)}
            self.assertEqual(actual,{'VERSION','build.py','source/app.js','windows/launcher.py'})

if __name__=='__main__':unittest.main()
