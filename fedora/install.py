#!/usr/bin/env python3
"""Install or update Another Note for the current user; never touch notes."""
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

SOURCE = Path(__file__).resolve().parent
APP_ID = 'org.vistanotes.VistaNotes'


def desktop_argument(value):
    encoded = str(value).replace('\\', '\\\\\\\\').replace('"', '\\\\"')
    encoded = encoded.replace('$', '\\\\$').replace('`', '\\\\`').replace('%', '%%')
    if any(c in encoded for c in '\n\r\t'):
        raise ValueError('The installation path must not contain a newline or tab.')
    return '"' + encoded + '"'


def install(data_home, bin_dir):
    app_dir = data_home / 'vista-notes' / 'app'
    applications = data_home / 'applications'
    icons = data_home / 'icons/hicolor/512x512/apps'
    mime_packages = data_home / 'mime/packages'
    for directory in (app_dir, applications, bin_dir, icons, mime_packages):
        directory.mkdir(parents=True, exist_ok=True)
    for name in ('Another-Note.html', 'launcher.py', 'notebook_store.py', 'file_store.py', 'another-note.png', 'THIRD_PARTY_LICENSES.txt', 'spelling-worker.js.gz', 'format-worker.js.gz'):
        origin, destination = SOURCE / name, app_dir / name
        if origin.resolve() != destination.resolve():
            shutil.copyfile(origin, destination)
    shutil.copyfile(app_dir / 'another-note.png', icons / f'{APP_ID}.png')
    (data_home / 'icons/hicolor/scalable/apps' / f'{APP_ID}.svg').unlink(missing_ok=True)
    command = bin_dir / 'another-note'
    command.write_text('#!/bin/sh\nexec /usr/bin/python3 ' + shlex.quote(str(app_dir / 'launcher.py')) + ' "$@"\n', encoding='utf-8')
    command.chmod(0o755)
    legacy_command = bin_dir / 'vista-notes'
    legacy_command.write_text(command.read_text(), encoding='utf-8')
    legacy_command.chmod(0o755)
    desktop = applications / f'{APP_ID}.desktop'
    desktop.write_text(
        '[Desktop Entry]\nType=Application\nName=Another Note\n'
        'Comment=Text and code editor with automatic workspace recovery\n'
        'Exec=/usr/bin/python3 ' + desktop_argument(app_dir / 'launcher.py') + ' %F\n'
        'TryExec=/usr/bin/python3\nIcon=' + APP_ID + '\n'
        'Terminal=false\nCategories=Utility;TextEditor;\n'
        'MimeType=text/plain;text/markdown;application/json;text/x-shellscript;text/x-java;application/javascript;text/javascript;text/html;text/css;text/x-python;application/x-vista-notes;\n'
        'StartupNotify=true\nStartupWMClass=' + APP_ID + '\n', encoding='utf-8')
    (mime_packages / 'vista-notes.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">\n'
        '  <mime-type type="application/x-vista-notes"><comment>Another Note file backup</comment>'
        '<glob pattern="*.vnotes"/></mime-type>\n</mime-info>\n', encoding='utf-8')
    for tool, folder in (('update-desktop-database', applications), ('update-mime-database', data_home / 'mime'), ('gtk-update-icon-cache', data_home / 'icons/hicolor')):
        executable = shutil.which(tool)
        if executable:
            args = [executable, str(folder)] if tool != 'gtk-update-icon-cache' else [executable, '-f', '-t', str(folder)]
            subprocess.run(args, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return command, desktop


def main():
    try:
        data_home = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')).expanduser().resolve()
        command, _ = install(data_home, Path.home() / '.local/bin')
    except (OSError, ValueError) as error:
        print(f'Installation failed: {error}', file=sys.stderr)
        return 1
    print('Another Note is installed. Find it in the applications menu.')
    print(f'You can also run: {command}')
    print('Your files are kept when you close, update, or reinstall the app.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
