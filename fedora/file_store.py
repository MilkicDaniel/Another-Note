"""Private file bindings and persistent version history; no GUI dependencies."""
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import threading
import uuid
import re
import mimetypes
from urllib.parse import urlsplit, unquote

from notebook_store import NotebookStore, MODES


class FileStore:
    def __init__(self, folder):
        self.folder = Path(folder)
        self.links_path = self.folder / 'file-links.json'
        self.atomic = NotebookStore(self.folder)
        self.lock = threading.RLock()

    def links(self):
        if not self.links_path.exists():
            return {}
        value = json.loads(self.links_path.read_text(encoding='utf-8'))
        if not isinstance(value, dict) or any(not isinstance(key, str) or not isinstance(item, dict)
                or not isinstance(item.get('path'), str) or not Path(item['path']).is_absolute()
                for key, item in value.items()):
            raise ValueError('The saved file locations could not be read. Your files were kept.')
        return value

    def binding(self, key):
        if not isinstance(key, str):
            return None
        with self.lock:
            return self.links().get(key)

    def open(self, path, limit=128 * 1024 * 1024):
        path = Path(path).expanduser().resolve()
        for _attempt in range(3):
            try:
                before = path.stat()
            except FileNotFoundError as error:
                raise ValueError('The linked file could not be found.') from error
            if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
                raise ValueError('Choose a text file below the import size limit.')
            raw = path.read_bytes()
            stamp = self.disk_stamp(path.stat())
            if stamp == self.disk_stamp(before):
                break
        else:
            raise ValueError('The file is still changing on disk. Try again shortly.')
        text = raw.decode('utf-8-sig')
        newline = 'crlf' if b'\r\n' in raw and raw.count(b'\n') == raw.count(b'\r\n') else 'cr' if b'\r' in raw and b'\n' not in raw else 'lf'
        with self.lock:
            links = self.links()
            key = next((key for key, item in links.items() if os.path.normcase(item['path']) == os.path.normcase(str(path))), str(uuid.uuid4()))
            links[key] = {'path': str(path), 'lineEnding': newline, 'bom': raw.startswith(b'\xef\xbb\xbf')}
            self.atomic.atomic_write(self.links_path, json.dumps(links, ensure_ascii=False).encode('utf-8'))
        return {'name': path.name, 'text': text, 'fileKey': key, 'diskPath': str(path),
                'lineEnding': newline, 'bom': raw.startswith(b'\xef\xbb\xbf'), 'diskStamp': stamp}

    @staticmethod
    def disk_stamp(info):
        return ':'.join(str(value) for value in (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns))

    def check_changes(self, files):
        if not isinstance(files, list) or len(files) > 200:
            raise ValueError('Invalid file change check.')
        changed = []
        with self.lock:
            bindings = self.links()
        for item in files:
            if not isinstance(item, dict) or not isinstance(item.get('fileKey'), str):
                raise ValueError('Invalid file identity.')
            key = item['fileKey']
            try:
                binding = bindings.get(key)
                if not binding:
                    continue
                if self.disk_stamp(Path(binding['path']).stat()) != item.get('diskStamp'):
                    changed.append(self.read_bound(key))
            except (OSError, ValueError, UnicodeError) as error:
                changed.append({'fileKey': key, 'error': str(error)})
        return {'files': changed}

    def read_bound(self, key):
        binding = self.binding(key)
        if not binding:
            raise ValueError('This file has no remembered location.')
        return self.open(binding['path'])

    def link_target(self, reference, key=None):
        """Resolve a clicked reference without executing it or changing a binding."""
        if not isinstance(reference, str) or not reference or len(reference) > 8192 or re.search(r'[\x00-\x1f\x7f]', reference):
            raise ValueError('Invalid link.')
        reference = reference.strip()
        if reference.lower().startswith('www.'):
            reference = 'https://' + reference
        drive_path = bool(re.match(r'^[a-zA-Z]:[\\/]', reference))
        parts = urlsplit(reference)
        if parts.scheme.lower() in ('http', 'https'):
            if not parts.hostname or re.search(r'\s', reference):
                raise ValueError('Invalid website link.')
            return {'url': reference}
        if parts.scheme and parts.scheme.lower() != 'file' and not drive_path:
            raise ValueError('Only website links and local text files can be opened.')
        if parts.scheme.lower() == 'file':
            if parts.netloc and parts.netloc.lower() != 'localhost':
                if os.name != 'nt':
                    raise ValueError('This link does not point to a local file.')
                value = '//' + parts.netloc + unquote(parts.path)
            else:
                value = unquote(parts.path)
                if os.name == 'nt' and re.match(r'^/[a-zA-Z]:/', value):
                    value = value[1:]
        else:
            value = unquote(re.split(r'[?#]', reference, maxsplit=1)[0])
        if not value or '\x00' in value:
            raise ValueError('This link does not point to a file.')
        path = Path(value.replace('\\', '/')).expanduser()
        if not path.is_absolute():
            binding = self.binding(key)
            if not binding:
                raise ValueError('Save this file first so relative links have a folder to open from.')
            path = Path(binding['path']).parent / path
        path = path.resolve()
        image = (mimetypes.guess_type(str(path))[0] or '').startswith('image/')
        if image and not path.is_file():
            raise ValueError('The linked image file could not be found.')
        return {'path': str(path), **({'image': True} if image else {})}

    def open_link(self, target):
        path = Path(target['path'])
        limit = 128 if path.suffix.lower() in ('.json', '.vnotes') else 20
        return self.open(path, limit * 1024 * 1024)

    def write(self, text, key=None, destination=None, line_ending=None, bom=None):
        if not isinstance(text, str):
            raise ValueError('Invalid file text.')
        with self.lock:
            links = self.links()
            current = links.get(key) if isinstance(key, str) else None
            if destination is None:
                if not current:
                    raise ValueError('This file has no saved location. Use Save As.')
                path = Path(current['path'])
                line_ending = current.get('lineEnding', 'lf') if line_ending is None else line_ending
                bom = current.get('bom', False) if bom is None else bom
            else:
                path = Path(destination).expanduser().resolve()
                key = key if current else str(uuid.uuid4())
            line_ending = line_ending or 'lf'
            bom = bool(bom)
            if not path.parent.is_dir():
                raise ValueError('The file folder no longer exists. Use Save As.')
            normalized = text.replace('\r\n', '\n').replace('\r', '\n')
            newline = {'crlf': '\r\n', 'cr': '\r'}.get(line_ending, '\n')
            payload = (('\ufeff' if bom else '') + normalized.replace('\n', newline)).encode('utf-8')
            mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
            if not mode & 0o222:
                raise PermissionError('This file is read-only. Use Save As.')
            # The shared atomic writer flushes the temporary file and containing directory.
            self.atomic.atomic_write(path, payload, mode)
            links[key] = {'path': str(path), 'lineEnding': line_ending, 'bom': bool(bom)}
            self.atomic.atomic_write(self.links_path, json.dumps(links, ensure_ascii=False).encode('utf-8'))
            return {'saved': True, 'fileKey': key, 'name': path.name, 'diskPath': str(path)}


class VersionStore:
    def __init__(self, folder):
        self.folder = Path(folder) / 'versions'
        self.atomic = NotebookStore(self.folder)
        self.lock = threading.RLock()

    def path(self, file_id):
        if not isinstance(file_id, str) or not file_id or len(file_id) > 1000:
            raise ValueError('Invalid file identity.')
        return self.folder / (hashlib.sha256(file_id.encode('utf-8')).hexdigest() + '.json')

    def read(self, file_id):
        with self.lock:
            path = self.path(file_id)
            return self.validate(json.loads(path.read_text(encoding='utf-8'))) if path.exists() else []

    @staticmethod
    def validate(versions):
        if not isinstance(versions, list) or len(versions) > 30:
            raise ValueError('Invalid version history.')
        for item in versions:
            if not isinstance(item, dict) or any(not isinstance(item.get(key), str) for key in ('id', 'title', 'content', 'mode', 'reason')):
                raise ValueError('Invalid version snapshot.')
            if item['mode'] not in MODES or type(item.get('createdAt')) not in (int, float) or not math.isfinite(item['createdAt']):
                raise ValueError('Invalid version metadata.')
        return versions

    def append(self, file_id, version):
        with self.lock:
            self.validate([version])
            previous = self.read(file_id)
            if previous and all(previous[-1][key] == version[key] for key in ('title', 'mode', 'content')):
                return {'saved': True, 'count': len(previous)}
            result = self.write(file_id, [version], previous=previous)
            return {'saved': True, 'count': len(result['versions'])}

    def write(self, file_id, versions, previous=None):
        with self.lock:
            self.validate(versions)
            # A window can have an older in-memory list after another window
            # adds checkpoints. Merge under the same lock as the disk write.
            by_id = {item['id']: item for item in [*versions, *(self.read(file_id) if previous is None else previous)]}
            merged = sorted(by_id.values(), key=lambda item:(item['createdAt'], item['id']))[-30:]
            sizes = [len(item['content'].encode('utf-16-le', errors='surrogatepass')) for item in merged]
            size = sum(sizes)
            while len(merged) > 2 and size > 32 * 1024 * 1024:
                merged.pop(0); size -= sizes.pop(0)
            self.atomic.atomic_write(self.path(file_id), json.dumps(merged, ensure_ascii=False, allow_nan=False).encode('utf-8'))
            return {'saved': True, 'versions': merged}

    def delete(self, file_id):
        with self.lock:
            self.path(file_id).unlink(missing_ok=True)
            return {'deleted': True}
