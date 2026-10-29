"""Validated, atomic on-disk persistence for Another Note (standard library only)."""
import json
import math
import os
import re
from pathlib import Path
import tempfile
import copy
import threading
import time

MAX_BYTES = 64 * 1024 * 1024
MODES = {'markdown', 'bash', 'json', 'java', 'javascript', 'html', 'css', 'python', 'text'}


def merge_recent_settings(current, previous):
    def stamp(value):
        return value if type(value) in (int, float) and math.isfinite(value) and value > 0 else 0
    cleared = max(stamp(current.get('recentClearedAt')), stamp(previous.get('recentClearedAt')))
    records = {}
    for item in [*current.get('recentFiles', []), *previous.get('recentFiles', [])]:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str): continue
        closed_at = stamp(item.get('closedAt'))
        if cleared and closed_at <= cleared: continue
        if item['id'] not in records or closed_at > records[item['id']]['closedAt']:
            records[item['id']] = {'id': item['id'], 'closedAt': closed_at}
    shortcuts = ({'shortcutBindings': previous.get('shortcutBindings', {}),
                  'shortcutsUpdatedAt': previous['shortcutsUpdatedAt']}
                 if stamp(previous.get('shortcutsUpdatedAt')) > stamp(current.get('shortcutsUpdatedAt')) else {})
    preferences = ({'editorPreferences': copy.deepcopy(previous.get('editorPreferences', {})),
                    'editorPreferencesUpdatedAt': previous['editorPreferencesUpdatedAt']}
                   if stamp(previous.get('editorPreferencesUpdatedAt')) > stamp(current.get('editorPreferencesUpdatedAt')) else {})
    return {**current, **shortcuts, **preferences, 'recentClearedAt': cleared,
            'recentFiles': sorted(records.values(), key=lambda item:(item['closedAt'], item['id']))[-30:]}


def normalize_tag_changes(*lists):
    changes = {}
    for items in lists:
        if not isinstance(items, list): continue
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get('name'), str): continue
            name = ' '.join(re.sub(r'[\x00-\x1f\x7f]', ' ', item['name']).split())[:64]
            stamp = item.get('updatedAt')
            if not name or type(stamp) not in (int, float) or not math.isfinite(stamp) or stamp < 0: continue
            change = {'name': name, 'updatedAt': stamp, 'deleted': item.get('deleted') is True}
            previous = changes.get(name.lower())
            if previous is None or stamp > previous['updatedAt'] or stamp == previous['updatedAt'] and change['deleted']:
                changes[name.lower()] = change
    return list(changes.values())


def apply_tag_changes(state):
    changes = normalize_tag_changes(state.get('tagChanges'))
    deleted = {item['name'].lower(): item['updatedAt'] for item in changes if item['deleted']}
    state['tagChanges'] = changes
    for note in state['notes']:
        removed = [tag for tag in note.get('tags', []) if isinstance(tag, str) and tag.lower() in deleted]
        if removed:
            note['tags'] = [tag for tag in note.get('tags', []) if isinstance(tag, str) and tag.lower() not in deleted]
            note['tagsUpdatedAt'] = max(note.get('tagsUpdatedAt', 0), *(deleted[tag.lower()] for tag in removed))
    tags = {}
    for tag in [*state.get('tags', []), *(item['name'] for item in changes if not item['deleted']), *(tag for note in state['notes'] for tag in note.get('tags', []))]:
        if isinstance(tag, str) and tag.strip() and tag.lower() not in deleted: tags.setdefault(tag.lower(), tag)
    state['tags'] = list(tags.values())
    tag_filter = state['settings'].get('tagFilter', {})
    if isinstance(tag_filter, dict) and tag_filter.get('kind') == 'tag' and str(tag_filter.get('tag', '')).lower() in deleted:
        state['settings']['tagFilter'] = {'kind': 'all'}
    return state


def validate(state):
    if not isinstance(state, dict) or state.get('format') != 'vista-notes' or state.get('version') != 1:
        raise ValueError('Unsupported file workspace format.')
    notes = state.get('notes')
    if not isinstance(notes, list):
        raise ValueError('The workspace has an invalid file list.')
    seen = set()
    for note in notes:
        if not isinstance(note, dict):
            raise ValueError('Invalid file.')
        identity = note.get('id')
        if not isinstance(identity, str) or not identity or identity in seen:
            raise ValueError('Invalid or duplicate file identity.')
        seen.add(identity)
        linked = note.get('fileLink') is True
        if (not isinstance(note.get('title'), str) or note.get('mode') not in MODES
                or (not linked and not isinstance(note.get('content'), str))
                or (linked and (not isinstance(note.get('fileKey'), str) or not note['fileKey']
                                or not isinstance(note.get('diskPath'), str)))):
            raise ValueError('Invalid file text or format.')
        for key in ('createdAt', 'updatedAt'):
            value = note.get(key)
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise ValueError('Invalid file date.')
    if not isinstance(state.get('settings'), dict):
        raise ValueError('Invalid workspace settings.')
    return state


class NotebookStore:
    def __init__(self, folder):
        self.folder = Path(folder)
        self.path = self.folder / 'notes.json'
        self.previous = self.folder / 'notes.previous.json'
        self.safe_to_write = False

    @staticmethod
    def read_file(path):
        if path.stat().st_size > MAX_BYTES:
            raise ValueError('The workspace exceeds the 64 MB desktop limit.')
        return validate(json.loads(path.read_text(encoding='utf-8')))

    def read(self):
        errors = []
        for index, candidate in enumerate((self.path, self.previous)):
            if not candidate.exists():
                continue
            try:
                state = self.read_file(candidate)
                self.safe_to_write = True
                return {'state': state, 'recovered': bool(index)}
            except (OSError, ValueError) as error:
                errors.append(str(error))
        if errors:
            raise ValueError('Neither saved copy could be read. ' + '; '.join(errors))
        self.safe_to_write = True
        return {'state': None, 'recovered': False}

    def atomic_write(self, path, payload, mode=0o600):
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor, temporary = tempfile.mkstemp(prefix='.notes-', dir=path.parent)
        try:
            with os.fdopen(descriptor, 'wb') as output:
                if hasattr(os, 'fchmod'):
                    os.fchmod(output.fileno(), mode)
                output.write(payload)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
            # Windows cannot open and fsync a directory this way. The temporary
            # file has already been flushed before the atomic replacement.
            if os.name != 'nt' and hasattr(os, 'O_DIRECTORY'):
                directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def write(self, state):
        if not self.safe_to_write:
            raise ValueError('Open the existing workspace successfully before saving.')
        validate(state)
        payload = json.dumps(state, ensure_ascii=False, allow_nan=False).encode('utf-8')
        if len(payload) > MAX_BYTES:
            raise ValueError('The workspace exceeds the 64 MB desktop limit. Export some files before continuing.')
        # A damaged current file must never overwrite the valid recovery copy.
        if self.path.exists():
            try:
                self.read_file(self.path)
            except (OSError, ValueError):
                pass
            else:
                self.atomic_write(self.previous, self.path.read_bytes())
        self.atomic_write(self.path, payload)
        return {'saved': True}


class WorkspaceHub:
    """Merge window journals atomically; each window owns its own tab order."""
    def __init__(self, store, files=None, versions=None):
        self.store = store
        self.files, self.versions = files, versions
        self.lock = threading.RLock()
        self.state = None
        self.opened = False
        self.recovered = False
        self.tabs = {}
        self.tag_filters = {}
        self.retired = set()

    def compact_closed(self, state, opened):
        """Replace clean disk-backed closed documents with reopening links."""
        if self.files is None or state is None:
            return []
        changed = []
        for index, note in enumerate(state['notes']):
            if note['id'] in opened or note.get('fileLink') or note.get('trashedAt') or note.get('removedAt'):
                continue
            saved = note.get('savedState')
            if not note.get('fileKey') or not isinstance(saved, dict):
                continue
            if any(note.get(key) != saved.get(key) for key in ('title', 'content', 'mode')):
                continue
            if note.get('lineEnding', 'lf') != saved.get('lineEnding', 'lf') or bool(note.get('bom')) != bool(saved.get('bom')):
                continue
            try:
                binding = self.files.binding(note['fileKey'])
                if not binding or not Path(binding['path']).is_file():
                    continue
                with Path(binding['path']).open('rb'):
                    pass
            except (OSError, ValueError):
                continue  # Keep the recovery text when its disk file is unavailable.
            stamp = max(state.get('updatedAt', 0), note['updatedAt']) + 1
            state['notes'][index] = dict(id=note['id'], title=Path(binding['path']).name,
                                         fileKey=note['fileKey'], diskPath=binding['path'],
                                         mode=note['mode'], createdAt=note['createdAt'],
                                         updatedAt=stamp, fileLink=True)
            changed.append(note['id'])
        return changed

    def delete_closed_history(self, identities):
        if self.versions is not None:
            for identity in identities:
                self.versions.delete(identity)

    def open_file_link(self, window_id, identity, *, activate=True):
        with self.lock:
            if window_id in self.retired or not self.opened:
                raise ValueError('That editor window has closed.')
            note = next((item for item in (self.state or {}).get('notes', []) if item['id'] == identity), None)
            if note is None or note.get('removedAt') or note.get('trashedAt'):
                raise ValueError('That file is no longer available.')
            if note.get('fileLink'):
                disk = self.files.read_bound(note['fileKey'])
                if activate:
                    self.delete_closed_history([identity])
                text = disk['text'].replace('\r\n', '\n').replace('\r', '\n')
                stamp = max(int(time.time() * 1000), self.state.get('updatedAt', 0) + 1, note['updatedAt'] + 1)
                restored = dict(id=identity, title=disk['name'], content=text, mode=note['mode'],
                                createdAt=note['createdAt'], updatedAt=stamp, fileKey=disk['fileKey'],
                                diskPath=disk['diskPath'], lineEnding=disk['lineEnding'], bom=disk['bom'],
                                historyEpoch=note['updatedAt'], hasSavedFile=True)
                restored['savedState'] = {key: restored[key] for key in ('title', 'content', 'mode', 'lineEnding', 'bom')}
                state = copy.deepcopy(self.state)
                state['notes'] = [restored if item['id'] == identity else item for item in state['notes']]
                state['updatedAt'] = stamp
            else:
                # An open sibling window owns the current draft. Reuse it
                # instead of replacing its edits with a new disk read.
                restored, state = note, copy.deepcopy(self.state)
            if not activate:
                return {'file': copy.deepcopy(restored), 'openIds': self.open_file_ids()}
            tabs = {**self.tabs, window_id: list(dict.fromkeys([*self.tabs.get(window_id, []), identity]))}
            state['settings']['openIds'] = list(dict.fromkeys(item for ids in tabs.values() for item in ids))
            self.store.write(state)
            self.state, self.tabs = state, tabs
            return {'file': copy.deepcopy(restored), 'openIds': self.open_file_ids()}

    def version_operation(self, operation, identity, *args, epoch=0):
        with self.lock:
            note = next((item for item in (self.state or {}).get('notes', []) if item['id'] == identity), None)
            if operation != 'delete' and note and (note.get('fileLink') or note.get('historyEpoch', 0) != epoch):
                return [] if operation == 'read' else {'saved': True, 'versions': [], 'count': 0}
            return getattr(self.versions, operation)(identity, *args)

    def load(self, window_id, open_ids=None, *, open_tabs_only=False):
        with self.lock:
            if not self.opened:
                result = self.store.read()
                self.state, self.recovered = result['state'], result['recovered']
                self.opened = True
                if self.state is not None:
                    state = copy.deepcopy(self.state)
                    protected = set(state['settings'].get('openIds', [note['id'] for note in state['notes']])) | set(open_ids or [])
                    compacted = self.compact_closed(state, protected)
                    if compacted:
                        self.store.write(state)
                        self.state = state
                        self.delete_closed_history(compacted)
            state = copy.deepcopy(self.state)
            if state is not None:
                available = {n['id'] for n in state['notes'] if not n.get('removedAt') and not n.get('trashedAt')}
                ids = open_ids if open_ids is not None else self.tabs.get(window_id, state['settings'].get('openIds', list(available)))
                ids = list(dict.fromkeys(i for i in ids if i in available))
                self.tabs[window_id] = ids
                if any(note.get('fileLink') and note['id'] in ids for note in state['notes']):
                    for identity in ids:
                        if any(note['id'] == identity and note.get('fileLink') for note in self.state['notes']):
                            self.open_file_link(window_id, identity)
                    state = copy.deepcopy(self.state)
                state['settings']['openIds'] = ids
                # Filters belong to a window. A detached file starts visible.
                tag_filter = {'kind': 'all'} if open_ids is not None else self.tag_filters.get(window_id, state['settings'].get('tagFilter', {'kind': 'all'}))
                state['settings']['tagFilter'] = copy.deepcopy(tag_filter)
                apply_tag_changes(state)
                self.tag_filters[window_id] = copy.deepcopy(state['settings']['tagFilter'])
                if open_ids is not None or state.get('activeId') not in ids:
                    state['activeId'] = ids[-1] if ids else None
            else:
                self.tabs.setdefault(window_id, [])
            result = {'state': state, 'recovered': self.recovered}
            if state is not None and open_tabs_only:
                # Keep the complete validated journal in the hub. Only the
                # initial bridge payload is reduced; omitted files stay intact.
                opened = set(state['settings']['openIds'])
                initial = [note for note in state['notes'] if note['id'] in opened or note.get('fileLink')]
                if len(initial) < len(state['notes']):
                    result['deferred'] = True
                    result['availableIds'] = list(available)
                    state['notes'] = initial
            return result

    def save(self, window_id, incoming):
        with self.lock:
            validate(incoming)
            if window_id in self.retired:
                raise ValueError('That editor window has closed.')
            if not self.opened:
                raise ValueError('Load the workspace before saving.')
            state = copy.deepcopy(incoming)
            state['settings'] = merge_recent_settings(state['settings'], (self.state or {}).get('settings', {}))
            notes = {n['id']: n for n in (self.state or {}).get('notes', [])}
            for note in state['notes']:
                old = notes.get(note['id'])
                if old is None:
                    notes[note['id']] = note
                    continue
                merged = copy.deepcopy(note if note['updatedAt'] > old['updatedAt'] else old)
                if merged.get('fileLink'):
                    notes[note['id']] = merged
                    continue
                metadata = note if note.get('tagsUpdatedAt', 0) > old.get('tagsUpdatedAt', 0) else old
                merged['tags'] = copy.deepcopy(metadata.get('tags', []))
                merged['tagsUpdatedAt'] = metadata.get('tagsUpdatedAt', 0)
                notes[note['id']] = merged
            state['notes'] = list(notes.values())
            state['tags'] = [*(self.state or {}).get('tags', []), *state.get('tags', [])]
            state['tagChanges'] = normalize_tag_changes((self.state or {}).get('tagChanges'), state.get('tagChanges'))
            state['dictionaryChanges'] = normalize_tag_changes((self.state or {}).get('dictionaryChanges'), state.get('dictionaryChanges'))
            apply_tag_changes(state)
            available = {n['id'] for n in state['notes'] if not n.get('removedAt') and not n.get('trashedAt')}
            tabs = {**self.tabs, window_id: list(dict.fromkeys(incoming['settings'].get('openIds', [])))}
            tabs = {key: [i for i in ids if i in available] for key, ids in tabs.items()}
            state['settings']['openIds'] = list(dict.fromkeys(i for ids in tabs.values() for i in ids))
            state['updatedAt'] = max(state.get('updatedAt', 0), (self.state or {}).get('updatedAt', 0))
            compacted = self.compact_closed(state, set(state['settings']['openIds']))
            self.store.write(state)
            self.state, self.tabs = state, tabs
            self.delete_closed_history(compacted)
            self.tag_filters[window_id] = copy.deepcopy(state['settings'].get('tagFilter', {'kind': 'all'}))
            return copy.deepcopy(state)

    def open_file_ids(self):
        with self.lock:
            return list(dict.fromkeys(identity for ids in self.tabs.values() for identity in ids))

    def retire(self, window_id):
        with self.lock:
            self.retired.add(window_id)
            self.tabs.pop(window_id, None)
            self.tag_filters.pop(window_id, None)
            if self.state is None or not self.tabs:
                return None  # Keep the last window's tabs for the next launch.
            state = copy.deepcopy(self.state)
            state['settings']['openIds'] = list(dict.fromkeys(i for ids in self.tabs.values() for i in ids))
            if state.get('activeId') not in state['settings']['openIds']:
                state['activeId'] = next(iter(state['settings']['openIds']), None)
            self.store.write(state)
            self.state = state
            return copy.deepcopy(state)
