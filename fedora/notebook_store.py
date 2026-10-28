"""Validated, atomic on-disk persistence for Another Note (standard library only)."""
import json
import math
import os
import re
from pathlib import Path
import tempfile
import copy
import threading

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
        if not isinstance(note.get('title'), str) or not isinstance(note.get('content'), str) or note.get('mode') not in MODES:
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
    def __init__(self, store):
        self.store = store
        self.lock = threading.RLock()
        self.state = None
        self.opened = False
        self.recovered = False
        self.tabs = {}
        self.tag_filters = {}
        self.retired = set()

    def load(self, window_id, open_ids=None):
        with self.lock:
            if not self.opened:
                result = self.store.read()
                self.state, self.recovered = result['state'], result['recovered']
                self.opened = True
            state = copy.deepcopy(self.state)
            if state is not None:
                available = {n['id'] for n in state['notes'] if not n.get('removedAt') and not n.get('trashedAt')}
                ids = open_ids if open_ids is not None else self.tabs.get(window_id, state['settings'].get('openIds', list(available)))
                ids = list(dict.fromkeys(i for i in ids if i in available))
                self.tabs[window_id] = ids
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
            return {'state': state, 'recovered': self.recovered}

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
            self.store.write(state)
            self.state, self.tabs = state, tabs
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
