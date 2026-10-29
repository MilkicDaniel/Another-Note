"""Add requested Windows binaries to a public release without replacing other downloads."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from release_config import ROOT, read_version, release_names
from windows.build_windows import check_installer


WINDOWS_INPUTS = ('launcher.py', 'windows_host.py', 'windows_release.py', 'win32_support.py',
                  'bridge.js', 'bootstrap.c', 'setup.c', 'install.ps1', 'runtime-lock.json', 'build_windows.py')


def verify_checksums(folder, version):
    folder = Path(folder)
    names = release_names(version)
    allowed = {names[key] for key in ('html', 'fedora', 'source', 'installer', 'windows')}
    seen = set()
    for line in (folder / names['checksums']).read_text().splitlines():
        digest, name = line.split('  ', 1)
        if name not in allowed or name in seen:
            raise ValueError('Unexpected or duplicate release checksum entry.')
        if hashlib.sha256((folder / name).read_bytes()).hexdigest() != digest:
            raise ValueError('Release checksum mismatch: ' + name)
        seen.add(name)
    if not {names[key] for key in ('html', 'fedora', 'source')} <= seen:
        raise ValueError('The existing editor release is incomplete.')
    return seen


def prepare_addition(existing, built, merged, version, root=ROOT):
    existing, built, merged, root = map(Path, (existing, built, merged, root))
    names = release_names(version)
    present = verify_checksums(existing, version)
    verify_checksums(built, version)
    check_installer(built / names['installer'], built / names['windows'], version)
    # This version is already public. A packaging-only update may add Windows;
    # changed application code needs a new VERSION and its own editor release.
    with zipfile.ZipFile(existing / names['source']) as source:
        paths = [path for path in (root / 'source').rglob('*') if path.is_file()]
        paths += [root / 'windows' / name for name in WINDOWS_INPUTS]
        for path in paths:
            relative = path.relative_to(root).as_posix()
            if source.read('another-note-source/' + relative) != path.read_bytes():
                raise ValueError('Application inputs changed since the public release: ' + relative)
    with zipfile.ZipFile(existing / names['fedora']) as editor, zipfile.ZipFile(built / names['windows']) as windows:
        bridge = (root / 'windows/bridge.js').read_text()
        native = windows.read('another-note-windows/Another-Note.html').decode().replace('<script id="windowsBridge">' + bridge + '</script>\n  ', '', 1)
        if native != editor.read('another-note-fedora/Another-Note.html').decode():
            raise ValueError('The Windows editor differs from the published editor.')
        for name in ('notebook_store.py', 'file_store.py', 'spelling-worker.js.gz', 'format-worker.js.gz'):
            a, b = editor.read('another-note-fedora/' + name), windows.read('another-note-windows/' + name)
            if name.endswith('.gz'):
                a, b = gzip.decompress(a), gzip.decompress(b)
            if a != b:
                raise ValueError('The Windows runtime differs from the public release: ' + name)
    windows_names = {names['installer'], names['windows']}
    if present & windows_names and not windows_names <= present:
        raise ValueError('The existing Windows release is incomplete; no files were replaced.')
    if windows_names <= present:
        check_installer(existing / names['installer'], existing / names['windows'], version)
    merged.mkdir(parents=True, exist_ok=True)
    for key in ('html', 'fedora', 'source'):
        shutil.copyfile(existing / names[key], merged / names[key])
    for name in windows_names:
        shutil.copyfile((existing if name in present else built) / name, merged / name)
    return sorted(windows_names - present)


def publish(repo, downloads, notes):
    version = read_version()
    names = release_names(version)
    release = json.loads(subprocess.check_output(['gh', 'release', 'view', version, '--repo', repo, '--json', 'isDraft,body,assets'], text=True))
    if release['isDraft']:
        raise ValueError('Use the normal draft release publisher for a draft.')
    with tempfile.TemporaryDirectory(prefix='another-note-windows-publish-') as temporary:
        existing, merged = Path(temporary) / 'existing', Path(temporary) / 'merged'
        command = ['gh', 'release', 'download', version, '--repo', repo, '--dir', str(existing)]
        allowed = set(names.values())
        for asset in release['assets']:
            if asset['name'] in allowed:
                command += ['--pattern', asset['name']]
        subprocess.run(command, check=True)
        additions = prepare_addition(existing, downloads, merged, version)
        subprocess.run([sys.executable, str(ROOT / 'package_release.py'), '--output', str(merged), '--include-windows', '--checksums-only'], check=True)
        if additions:
            subprocess.run(['gh', 'release', 'upload', version, '--repo', repo, *[str(merged / name) for name in additions]], check=True)
        subprocess.run(['gh', 'release', 'upload', version, '--repo', repo, str(merged / names['checksums']), '--clobber'], check=True)
        body = release['body'].replace('Windows source updates are included; new Windows installer/portable binaries were not requested and are not included in this release. Earlier Windows downloads remain available in their original release.', 'Windows installer and portable ZIP downloads are now included in this release.')
        marker = '\n\n<!-- requested-windows-downloads -->\n'
        body = body.split(marker, 1)[0] + marker + Path(notes).read_text()
        note_file = Path(temporary) / 'notes.md';note_file.write_text(body)
        subprocess.run(['gh', 'release', 'edit', version, '--repo', repo, '--notes-file', str(note_file)], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--downloads', type=Path, required=True)
    parser.add_argument('--notes', type=Path, required=True)
    args = parser.parse_args()
    publish(args.repo, args.downloads, args.notes)
