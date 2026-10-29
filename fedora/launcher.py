#!/usr/bin/env python3
"""Launch Another Note in its native Fedora GTK4 / WebKit6 window."""
import json
import base64
import math
import os
from pathlib import Path
import sys
import threading
import uuid

from notebook_store import NotebookStore, WorkspaceHub, MAX_BYTES
from file_store import FileStore, VersionStore

APP_ID = 'org.vistanotes.VistaNotes'
APP_DIR = Path(__file__).resolve().parent
MAX_IMPORT = 20 * 1024 * 1024
_x11_drag_connection = None


class EditorBundles:
    """Read only the packaged editor tools, once, when a window first needs them."""
    FILES = {'spelling': 'spelling-worker.js.gz', 'format': 'format-worker.js.gz'}

    def __init__(self, directory):
        self.directory = Path(directory)
        self.cache = {}
        self.lock = threading.Lock()

    def read(self, name):
        if not isinstance(name, str) or name not in self.FILES:
            raise ValueError('Unknown editor tool bundle.')
        with self.lock:
            if name not in self.cache:
                try:
                    data = (self.directory / self.FILES[name]).read_bytes()
                except FileNotFoundError as error:
                    raise ValueError('Editor tools are missing. Re-extract the Fedora package and run install.py.') from error
                self.cache[name] = base64.b64encode(data).decode('ascii')
            return {'source': self.cache[name]}


def configure_window_backend():
    """Keep exact drop placement available under GNOME through XWayland."""
    if os.environ.get('DISPLAY'):
        os.environ.setdefault('GDK_BACKEND', 'x11,wayland')


def x11_drag_position(window, position=None):
    """Use X11 placement only on an X11 surface; never bypass Wayland placement."""
    global _x11_drag_connection
    try:
        surface = window.get_surface()
        if not surface or 'X11' not in surface.__gtype__.name:
            return None
        import ctypes as C
        if _x11_drag_connection is None:
            import atexit
            import ctypes.util
            import gi
            gi.require_version('GdkX11', '4.0')
            from gi.repository import GdkX11
            lib = C.CDLL(ctypes.util.find_library('X11'))
            lib.XOpenDisplay.argtypes = [C.c_char_p]; lib.XOpenDisplay.restype = C.c_void_p
            lib.XCloseDisplay.argtypes = [C.c_void_p]
            lib.XDefaultRootWindow.argtypes = [C.c_void_p]; lib.XDefaultRootWindow.restype = C.c_ulong
            lib.XFlush.argtypes = [C.c_void_p]
            lib.XMoveWindow.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_int]
            lib.XQueryPointer.argtypes = [C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong), C.POINTER(C.c_ulong), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_uint)]
            display = lib.XOpenDisplay(None)
            if not display: return None
            atexit.register(lib.XCloseDisplay, display)
            _x11_drag_connection = lib, display, GdkX11
        lib, display, GdkX11 = _x11_drag_connection
        if position is not None:
            lib.XMoveWindow(display, GdkX11.X11Surface.get_xid(surface), int(position[0]), int(position[1]))
            lib.XFlush(display)
            return tuple(map(int, position))
        root, child = C.c_ulong(), C.c_ulong()
        x, y, wx, wy, mask = C.c_int(), C.c_int(), C.c_int(), C.c_int(), C.c_uint()
        if lib.XQueryPointer(display, lib.XDefaultRootWindow(display), C.byref(root), C.byref(child), C.byref(x), C.byref(y), C.byref(wx), C.byref(wy), C.byref(mask)):
            return x.value, y.value
    except (ImportError, OSError, ValueError, AttributeError, TypeError):
        return None


def load_toolkit():
    try:
        import cairo
        import gi
        gi.require_foreign('cairo')
        gi.require_version('Gtk', '4.0')
        gi.require_version('WebKit', '6.0')
        from gi.repository import Gtk, WebKit, Gio, GLib, Gdk, Pango
        if not hasattr(Gtk, 'FileDialog'):
            raise ValueError('GTK 4.10 or newer is required.')
        return Gtk, WebKit, Gio, GLib, Gdk, Pango
    except (ImportError, ValueError) as error:
        raise RuntimeError('Install the Fedora dependencies first:\n'
                           'sudo dnf install python3-gobject python3-cairo gtk4 libadwaita webkitgtk6.0 desktop-file-utils shared-mime-info') from error


def follow_system_theme(Gtk, Gio):
    """Use the desktop appearance for native menus and dialogs, including live changes."""
    try:
        import gi
        gi.require_version('Adw', '1')
        from gi.repository import Adw
    except (ImportError, ValueError):
        # Keep older installations working even before libadwaita is installed.
        source = Gio.SettingsSchemaSource.get_default()
        schema = source.lookup('org.gnome.desktop.interface', True) if source else None
        toolkit = Gtk.Settings.get_default()
        if not schema or not schema.has_key('color-scheme') or toolkit is None:
            return None
        desktop = Gio.Settings.new_full(schema, None, None)
        def update(settings, *_args):
            toolkit.set_property('gtk-application-prefer-dark-theme', settings.get_string('color-scheme') == 'prefer-dark')
        desktop.connect('changed::color-scheme', update)
        update(desktop)
        return desktop
    Adw.init()
    manager = Adw.StyleManager.get_default()
    manager.set_color_scheme(Adw.ColorScheme.DEFAULT)
    return manager


def run():
    configure_window_backend()
    Gtk, WebKit, Gio, GLib, Gdk, Pango = load_toolkit()
    trusted_uri = (APP_DIR / 'Another-Note.html').as_uri()

    class LiveTabDrags:
        MIME = 'application/x-another-note-tab'

        def __init__(self, application):
            self.application, self.sessions = application, {}

        def session_for_drop(self, drop):
            drag = drop.get_drag()
            return next((r for r in self.sessions.values() if r['drag'] == drag and not r.get('finished')), None) if drag else None

        def install_target(self, editor):
            target = Gtk.DropTargetAsync.new(Gdk.ContentFormats.new([self.MIME, 'text/uri-list']), Gdk.DragAction.MOVE | Gdk.DragAction.COPY)
            target.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
            def accept(_target, drop):
                if editor.drag_preview_token: return False
                if self.session_for_drop(drop) is not None: return True
                if not editor.accepts_file_drop(drop): return False
                return True
            editor.track_signal(target, 'accept', accept)
            def motion(_t, drop, x, y):
                record = self.session_for_drop(drop)
                if not record:
                    allowed = editor.accepts_file_drop(drop)
                    if allowed: editor.dismiss_web_file_drop(drop)
                    editor.show_file_drop(allowed)
                    return Gdk.DragAction.COPY if allowed else Gdk.DragAction(0)
                if not record or record.get('native_ended') or editor.closed or editor.closing or editor.drag_preview_token:
                    return Gdk.DragAction(0)
                timer = record.pop('leave_timer', None)
                if timer: GLib.source_remove(timer)
                if record.get('hover') is not editor:
                    record['hover_generation'] = record.get('hover_generation', 0) + 1
                    previous = record.get('preview_editor')
                    if previous and previous is not editor:
                        self.clear_hover(previous, record)
                        self.set_icon_visible(record, True)
                record['hover'] = editor
                if editor is record['source']:
                    if record.get('preview_editor'):
                        self.clear_hover(record['preview_editor'], record)
                    record['preview_editor'] = None
                    record['pending_hover'] = None
                    self.set_icon_visible(record, True)
                    return Gdk.DragAction.MOVE
                record['preview_editor'] = editor
                record['pending_hover'] = (editor, x, y, record.get('hover_generation', 0))
                self.dispatch_hover(record)
                return Gdk.DragAction.MOVE
            editor.track_signal(target, 'drag-enter', motion)
            editor.track_signal(target, 'drag-motion', motion)
            def leave(_t, drop):
                record = self.session_for_drop(drop)
                if not record:
                    editor.show_file_drop(False)
                    return
                if record.get('drop'): return
                if record and record.get('hover') is editor:
                    record['hover'] = None
                    record['pending_hover'] = None
                    record['hover_generation'] = record.get('hover_generation', 0) + 1
                    generation = record['hover_generation']
                    def finish_leave():
                        record.pop('leave_timer', None)
                        if not record.get('finished') and record.get('hover') is None and record.get('hover_generation') == generation:
                            self.clear_hover(editor, record)
                            record['preview_editor'] = None
                            self.set_icon_visible(record, True)
                        return False
                    record['leave_timer'] = GLib.timeout_add(40, finish_leave)
                elif record.get('preview_editor') is not editor:
                    self.clear_hover(editor, record)
            editor.track_signal(target, 'drag-leave', leave)
            def dropped(_t, drop, x, y):
                record = self.session_for_drop(drop)
                if not record: return editor.receive_file_drop(drop)
                record['drop'] = drop
                record['native_ended'] = True
                record['pending_hover'] = None
                record['hover_generation'] = record.get('hover_generation', 0) + 1
                if editor is record['source']:
                    self.defer_native_end(record, {'detached': True})
                    return True
                def ready(info):
                    if record.get('finished') or editor.closed: return
                    self.set_icon_visible(record, False)
                    if info.get('blocked'): self.notify(record, {'cancelled': True})
                    else: self.notify(record, {'targetId': editor.window_id, 'index': info.get('index')})
                self.hover(editor, record, x, y, ready)
                return True
            editor.track_signal(target, 'drop', dropped)
            editor.window.add_controller(target)
            editor.controllers.append(target)
            keys = Gtk.EventControllerKey.new()
            keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
            def pressed(_keys, keyval, _keycode, _state):
                if keyval != Gdk.KEY_Escape: return False
                record = next((r for r in self.sessions.values() if not r.get('notified')), None)
                if not record: return False
                record['drag'].emit('cancel', Gdk.DragCancelReason.USER_CANCELLED)
                return True
            editor.track_signal(keys, 'key-pressed', pressed)
            editor.window.add_controller(keys)
            editor.controllers.append(keys)

        def set_icon_visible(self, record, visible):
            if record.get('icon_visible') is not visible:
                record['icon_visible'] = visible
                record['icon'].set_opacity(1 if visible else 0)

        def clear_hover(self, editor, record):
            if not editor.closed:
                editor.evaluate('window.vistaNotesClearLiveTabHover && window.vistaNotesClearLiveTabHover(' + json.dumps(record['token']) + ',' + str(record.get('hover_generation', 0)) + ');')

        def dispatch_hover(self, record):
            if record.get('hover_in_flight') or record.get('hover_timer') or record.get('native_ended') or record.get('finished'): return False
            pending = record.pop('pending_hover', None)
            if not pending: return False
            editor, x, y, generation = pending
            record['hover_in_flight'] = True
            def done(info):
                record['hover_in_flight'] = False
                if record.get('finished') or record.get('native_ended'): return
                if record.get('hover') is editor and record.get('hover_generation', 0) == generation:
                    if info.get('blocked'): self.clear_hover(editor, record)
                    self.set_icon_visible(record, bool(info.get('blocked')))
                if record.get('pending_hover'):
                    def next_frame():
                        record.pop('hover_timer', None)
                        self.dispatch_hover(record)
                        return False
                    record['hover_timer'] = GLib.timeout_add(8, next_frame)
            self.hover(editor, record, x, y, done, generation)
            return False

        def hover(self, editor, record, x, y, callback=None, generation=None):
            try:
                # A manually started X11 drag can report stale controller
                # coordinates. Query the live surface pointer before deciding
                # which side of a tab the held file belongs on.
                surface = editor.window.get_surface()
                if 'X11' in str(getattr(surface, '__gtype__', '')):
                    device = Gdk.Display.get_default().get_default_seat().get_pointer()
                    position = surface.get_device_position(device) if device else None
                    if position and position[0]:
                        transform_x, transform_y = editor.window.get_surface_transform()
                        x, y = position[1] + transform_x, position[2] + transform_y
                native = editor.view.get_native()
                ok, bounds = editor.view.compute_bounds(native)
                if not ok:
                    if callback: callback({'blocked': True})
                    return
                zoom = editor.view.get_zoom_level()
                x, y = (x - bounds.get_x()) / zoom, (y - bounds.get_y()) / zoom
                revision = record.get('hover_generation', 0) if generation is None else generation
                finished = bool(record.get('drop'))
                script = 'JSON.stringify(window.vistaNotesLiveTabHover(' + json.dumps(record['meta']) + ',' + json.dumps(x) + ',' + json.dumps(y) + ',' + str(revision) + ',' + ('true' if finished else 'false') + '))'
                def done(view, result, *_args):
                    try:
                        value = json.loads(view.evaluate_javascript_finish(result).to_string())
                        if callback: callback(value if isinstance(value, dict) else {'blocked': True})
                    except (GLib.Error, ValueError, TypeError):
                        if callback: callback({'blocked': True})
                editor.view.evaluate_javascript(script, -1, None, None, None, done)
            except (GLib.Error, AttributeError, ValueError, TypeError):
                if callback: callback({'blocked': True})

        def window_geometry(self, editor):
            ok, bounds = editor.view.compute_bounds(editor.window)
            if not ok: return None
            surface = editor.window.get_surface()
            transform_x, transform_y = editor.window.get_surface_transform()
            return (surface.get_width(), surface.get_height(),
                    int(bounds.get_x()-transform_x), int(bounds.get_y()-transform_y),
                    editor.view.get_width(), editor.view.get_height(),
                    editor.window.get_titlebar().get_height())

        def update_window_geometry(self, record, geometry):
            if not geometry or record.get('native_ended') or record.get('geometry') == geometry: return
            _width, _height, x, y, _view_width, _view_height, _header_height = geometry
            record['geometry'] = geometry
            tab_x, tab_y, offset_x, offset_y = record['tab_geometry']
            record['window_hotspot'] = (int(x + tab_x + offset_x), int(y + tab_y + offset_y))

        def position_preview(self, record, final=False):
            child = record.get('child')
            if not child or child.closed or record.get('finished'): return False
            if record.get('native_ended') and not final: return False
            point = x11_drag_position(child.window)
            if not point: return False
            scale = child.window.get_scale_factor()
            position = tuple(int(point[i] - record['window_hotspot'][i] * scale) for i in range(2))
            if final or position != record.get('position'):
                x11_drag_position(child.window, position)
                record['position'] = position
            return True

        def reveal_detached(self, record):
            # Reveal the prepared window only after release, with its tab at
            # the held tab's position. Suppress GDK's default return animation
            # and retain the source until the frontend confirms the transfer.
            if record.get('released_on_desktop') or record.get('notified') or record.get('finished'): return
            record['released_on_desktop'] = True
            self.position_preview(record, final=True)
            child = record.get('child')
            if child and not child.closed and child.loaded:
                child.window.set_opacity(1)
                record['revealed'] = True
            self.clear_icon(record)
            record['drag'].drop_done(True)

        def begin(self, source, request_id, data):
            token, file_id = data.get('token'), data.get('fileId')
            if (not isinstance(token, str) or not token or len(token) > 100 or self.sessions
                    or source.closing or file_id not in self.application.hub.tabs.get(source.window_id, [])):
                source.reply(request_id, {'started': False}); return
            device = Gdk.Display.get_default().get_default_seat().get_pointer()
            position = source.window.get_surface().get_device_position(device) if device else None
            if not position or not position[-1] & Gdk.ModifierType.BUTTON1_MASK:
                source.reply(request_id, {'started': False}); return
            if position[0] and isinstance(data.get('bar'), dict):
                ok, bounds = source.view.compute_bounds(source.window)
                if ok:
                    zoom = source.view.get_zoom_level()
                    transform_x, transform_y = source.window.get_surface_transform()
                    x, y = (position[1] + transform_x - bounds.get_x()) / zoom, (position[2] + transform_y - bounds.get_y()) / zoom
                    bar = data['bar']
                    if bar['left']-24 <= x <= bar['right']+24 and bar['top']-24 <= y <= bar['bottom']+24:
                        source.reply(request_id, {'started': False}); return
            transfer = data.get('transfer')
            if not isinstance(transfer, dict) or transfer.get('fileId') != file_id:
                raise ValueError('Invalid tab drag transfer.')
            tab_width = max(105, min(240, int(data.get('width', 190))))
            tab_height = max(30, min(48, int(data.get('height', 36))))
            hotspot = (int(max(0, min(tab_width-1, float(data.get('offsetX', 30))))), int(max(0, min(tab_height-1, float(data.get('offsetY', 16))))))
            # GNOME accepts this additional MIME type for desktop drops on
            # Wayland, where an unaccepted drop otherwise reports an error.
            content = Gdk.ContentProvider.new_union([
                Gdk.ContentProvider.new_for_bytes(self.MIME, GLib.Bytes.new(token.encode())),
                Gdk.ContentProvider.new_for_bytes('application/x-rootwindow-drop', GLib.Bytes.new(b'')),
            ])
            drag = Gdk.Drag.begin(source.window.get_surface(), device, content, Gdk.DragAction.MOVE, 0, 0)
            if drag is None:
                source.reply(request_id, {'started': False}); return
            icon = Gtk.DragIcon.get_for_drag(drag)
            ratio = data.get('grabRatio')
            ratio = max(0, min(1, ratio)) if isinstance(ratio, (int, float)) and math.isfinite(ratio) else hotspot[0] / tab_width
            meta = {'token': token, 'title': str(data.get('title') or 'untitled')[:250], 'modified': bool(data.get('modified')), 'grabRatio': ratio}
            record = {'token': token, 'source': source, 'fileId': file_id, 'drag': drag, 'icon': icon, 'meta': meta, 'child': None}
            self.sessions[token] = record
            def ended(_drag):
                record['native_ended'] = True
                if not record.get('drop'):
                    self.defer_native_end(record, {})
            def cancelled(_drag, reason):
                record['native_ended'] = True
                if token in self.sessions and not record.get('notified'):
                    self.defer_native_end(record, {} if reason == Gdk.DragCancelReason.NO_TARGET else {'cancelled': True})
            def performed(_drag):
                if record.get('finished') or record.get('notified') or record.get('release_timer'): return
                record['native_ended'] = True
                record['pending_hover'] = None
                # An X11 root-window drop has no destination to emit
                # dnd-finished. Complete it ourselves after GDK has released
                # its grab. Give an in-app target time to deliver its drop
                # event first, so it keeps the normal acknowledged handoff.
                def released():
                    record.pop('release_timer', None)
                    if record.get('finished') or record.get('notified') or record.get('drop'): return False
                    self.defer_native_end(record, {'cancelled': True} if record.get('hover') and record['hover'] is not source else {})
                    return False
                record['release_timer'] = GLib.timeout_add(1000 if record.get('hover') and record['hover'] is not source else 75, released)
            record['drag_handlers'] = [drag.connect('dnd-finished', ended), drag.connect('cancel', cancelled), drag.connect('drop-performed', performed)]
            record['hotspot'] = hotspot
            drag.set_hotspot(*record['hotspot'])
            try:
                import cairo
                child = self.application.new_window(open_ids=[file_id], transfer=transfer, drag_preview=token)
                record['child'] = child
                geometry = self.window_geometry(source)
                width, height, x, y, view_width, view_height, header_height = geometry
                if source.window.is_maximized():
                    width, height = source.window.get_default_size()
                    width, height = max(width, 640), max(height, 480)
                    geometry = (width, height, x, y, width - 2*x, height - y - max(0, geometry[1]-y-view_height), header_height)
                child.window.set_default_size(width, height)
                frame = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=3)
                frame.set_size_request(tab_width, tab_height)
                title = Gtk.Label(label=meta['title'], ellipsize=Pango.EllipsizeMode.END, xalign=0)
                title.set_hexpand(True)
                title.set_margin_start(17)
                title.set_margin_end(7)
                frame.append(title)
                tab_labels = [title]
                if meta['modified']:
                    marker = Gtk.Label(label='●')
                    marker.add_css_class('drag-tab-dirty')
                    frame.append(marker)
                    tab_labels.append(marker)
                close = Gtk.Label(label='×')
                close.add_css_class('drag-tab-close')
                close.set_size_request(27, 29)
                frame.append(close)
                tab_labels.append(close)
                record['frame'] = frame
                record['tab_geometry'] = (float(data.get('tabX', 51)), float(data.get('tabY', 33)),
                                          record['hotspot'][0], record['hotspot'][1])
                self.update_window_geometry(record, geometry)
                child.set_background('light' if data.get('theme') == 'light' else 'dark')
                # Prepare recovery and layout without displaying the editor.
                # Only the compact native tab is visible while dragging.
                child.window.set_opacity(0)
                child.window.set_focusable(False)
                child.window.set_sensitive(False)
                child.window.realize()
                surface = child.window.get_surface()
                def passthrough(surface, *_args):
                    if child.drag_preview_token and not child.closed:
                        surface.set_input_region(cairo.Region())
                        if child.view.get_width() > 0:
                            self.update_window_geometry(record, self.window_geometry(child))
                # GTK recalculates CSD input shapes during allocation. Keep
                # this parked window from covering any real drop destination.
                record['preview_surface'] = surface
                record['layout_handler'] = surface.connect_after('layout', passthrough)
                record['passthrough'] = passthrough
                passthrough(surface)
                child.window.set_visible(True)
                passthrough(surface)
                frame.add_css_class('another-note-drag-tab')
                style = Gtk.CssProvider()
                colors = ('#fcfcfc', '#101820') if data.get('theme') == 'light' else ('#343d46', '#e1e8ef')
                style.load_from_data(('.another-note-drag-tab { background: ' + colors[0] + '; color: ' + colors[1] + '; border: 0; border-radius: 5px; } .another-note-drag-tab label { font-family: Cantarell, Arial, sans-serif; font-size: 12px; } .another-note-drag-tab .drag-tab-dirty { color: #e5b178; font-size: 9px; } .another-note-drag-tab .drag-tab-close { font-size: 19px; } dnd { margin: 0; padding: 0; border: 0; box-shadow: none; background: transparent; }').encode())
                for widget in [frame, icon, *tab_labels]:
                    widget.get_style_context().add_provider(style, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
                icon.set_child(frame)
                # This prepared editor is not part of the drag image. Keep it
                # parked until release rather than moving a full window for
                # every pointer update.
                x11_drag_position(child.window, (-10000, -10000))
                record['timer'] = GLib.timeout_add_seconds(120, lambda: self.timeout(record))
                source.reply(request_id, {'started': True})
            except (GLib.Error, ImportError, KeyError, OSError, ValueError, TypeError, RuntimeError):
                source.reply(request_id, {'started': True})
                self.notify(record, {'cancelled': True})

        def defer_native_end(self, record, outcome):
            # GDK still uses the drag surface in its signal default handler.
            # Release the icon/window only after that native callback returns.
            if record.get('finished') or record.get('notified'): return
            if not record.get('native_outcome', {}).get('cancelled'):
                record['native_outcome'] = outcome
            if record.get('end_idle'): return
            def complete():
                record.pop('end_idle', None)
                if record.get('finished') or record.get('notified'): return False
                result = record.pop('native_outcome', {})
                if record.get('drop') and not result.get('cancelled') and not result.get('detached'): return False
                if not result.get('cancelled'): self.reveal_detached(record)
                self.notify(record, result)
                return False
            record['end_idle'] = GLib.idle_add(complete, priority=GLib.PRIORITY_DEFAULT)

        def disconnect_preview_layout(self, record):
            surface, handler = record.pop('preview_surface', None), record.pop('layout_handler', None)
            if surface is not None and handler is not None: surface.disconnect(handler)
            record.pop('passthrough', None)

        def notify(self, record, outcome):
            if outcome.get('cancelled') and record.get('commit'):
                source, request_id = record.pop('commit')
                source.reply(request_id, error='The detached editor could not be prepared. The original file was kept.')
            if record.get('finished') or record.get('notified') or record['source'].closed: return
            record['notified'] = True
            record['source'].evaluate('window.vistaNotesFinishLiveTabDrag && window.vistaNotesFinishLiveTabDrag(' + json.dumps(record['token']) + ',' + json.dumps(outcome) + ');')

        def preview_ready(self, editor):
            record = self.sessions.get(editor.drag_preview_token)
            if record:
                record['passthrough'](editor.window.get_surface())
                if record.get('commit'): self.promote(record)

        def commit(self, source, request_id, data):
            record = self.sessions.get(data.get('token'))
            if not record or record['source'] is not source or not record.get('child') or record['child'].closed:
                raise ValueError('The detached editor is unavailable. The original file was kept.')
            record['commit'] = (source, request_id)
            if record['child'].loaded: self.promote(record)

        def clear_icon(self, record):
            if record.get('icon_cleared'): return
            record['icon_cleared'] = True
            icon = record['icon']
            icon.set_visible(False)
            icon.set_child(None)
            # Release the frame-clock handlers while the drag surface exists.
            if icon.get_realized(): icon.unrealize()

        def promote(self, record):
            if record.get('finished') or record.get('promoted') or not record.get('commit'): return
            self.disconnect_preview_layout(record)
            self.clear_icon(record)
            child = record['child']
            import cairo
            surface = child.window.get_surface()
            # Older introspection bindings reject the documented None region.
            # Keep the full input region in sync when this window is resized.
            def restore_input(surface, *_args):
                surface.set_input_region(cairo.Region(cairo.RectangleInt(0, 0, surface.get_width(), surface.get_height())))
            restore_input(surface)
            child.track_signal(surface, 'notify::width', restore_input)
            child.track_signal(surface, 'notify::height', restore_input)
            child.window.set_sensitive(True)
            child.window.set_focusable(True)
            child.window.set_opacity(1)
            child.drag_preview_token = None
            record['promoted'] = True
            child.window.present()
            source, request_id = record.pop('commit')
            source.reply(request_id, {'moved': True, 'windowId': child.window_id})

        def timeout(self, record):
            record.pop('timer', None)
            self.notify(record, {'cancelled': True})
            return False

        def finish(self, source, data):
            record = self.sessions.get(data.get('token'))
            if record and record['source'] is source: self.cleanup(record, bool(data.get('ok')))

        def cleanup(self, record, success=False):
            if self.sessions.pop(record['token'], None) is None: return
            record['finished'] = True
            timer = record.pop('timer', None)
            if timer: GLib.source_remove(timer)
            for timer_name in ('leave_timer', 'hover_timer', 'release_timer', 'end_idle'):
                timer = record.pop(timer_name, None)
                if timer: GLib.source_remove(timer)
            self.disconnect_preview_layout(record)
            for handler in record.pop('drag_handlers', []): record['drag'].disconnect(handler)
            record['hover_generation'] = record.get('hover_generation', 0) + 1
            for editor in list(self.application.editors.values()):
                if editor.loaded and not editor.closed:
                    self.clear_hover(editor, record)
            self.clear_icon(record)
            child = record.get('child')
            if child and not child.closed and not record.get('promoted'):
                child.can_destroy = True
                child.window.destroy()
            drop = record.get('drop')
            if not record.get('native_ended'):
                # A startup failure or timeout can abort while the button is
                # still held. Cancel the native grab as well as the preview.
                record['drag'].emit('cancel', Gdk.DragCancelReason.USER_CANCELLED)
            if drop: drop.finish(Gdk.DragAction.MOVE if success else Gdk.DragAction(0))
            else: record['drag'].drop_done(success)

        def window_removed(self, editor):
            for record in list(self.sessions.values()):
                if record['source'] is editor: self.cleanup(record)
                elif record.get('child') is editor and not record.get('promoted'): self.notify(record, {'cancelled': True})

    class NotesWindow:
        def __init__(self, application, window_id='main', open_ids=None, transfer=None, origin=None):
            self.application = application
            self.window_id = window_id
            self.initial_ids = open_ids
            self.transfer = transfer
            self.transfer_origin = origin
            self.closed = False
            self.window = None
            self.view = None
            self.closing = False
            self.close_timeout = None
            self.startup_timeout = None
            self.can_destroy = False
            self.loaded = False
            self.drag_preview_token = None
            self.pending_imports = []
            self.imports_running = False
            self.pending_file_drops = []
            self.file_drops_running = False
            self.connections = []
            self.controllers = []
            self.content_manager = None
            self.style_provider = None
            self.disposed = False
            self.hub = application.hub
            self.store = application.store
            self.files = application.files
            self.versions = application.versions

        def track_signal(self, owner, name, callback):
            handler = owner.connect(name, callback)
            self.connections.append((owner, handler))
            return handler

        def dispose(self):
            if self.disposed: return
            self.disposed = True
            self.cancel_startup_timeout()
            self.cancel_close_timeout()
            # GObject signal closures hold Python owners alive. Disconnect
            # them explicitly so a closed WebView releases its web process,
            # manager, native controllers and complete editor workspace.
            for owner, handler in self.connections: owner.disconnect(handler)
            self.connections.clear()
            if self.content_manager is not None:
                self.content_manager.unregister_script_message_handler('vistaNotes', None)
                self.content_manager = None
            for controller in self.controllers: self.window.remove_controller(controller)
            self.controllers.clear()
            if self.view is not None: self.view.stop_loading()
            if self.style_provider is not None:
                Gtk.StyleContext.remove_provider_for_display(Gdk.Display.get_default(), self.style_provider)
                self.style_provider = None

        def activate_window(self, _app):
            if self.window:
                if self.loaded:
                    self.window.present()
                return
            self.system_theme = follow_system_theme(Gtk, Gio)
            provider = Gtk.CssProvider()
            css = ('headerbar.vista-notes-header {min-height:30px;padding:0 6px;}'
                   'headerbar.vista-notes-header windowhandle {min-height:30px;}'
                   'headerbar.vista-notes-header windowcontrols {margin:0;border-spacing:2px;}'
                   'headerbar.vista-notes-header windowcontrols button {min-width:22px;min-height:22px;padding:2px;margin:2px 0;}'
                   'headerbar.vista-notes-header label {font-size:12px;}'
                   'label.vista-drag-tab {padding:8px 14px;border-radius:6px;background:@theme_bg_color;color:@theme_fg_color;}')
            if hasattr(provider, 'load_from_string'):
                provider.load_from_string(css)
            else:
                provider.load_from_data(css.encode())
            Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
            self.style_provider = provider
            manager = WebKit.UserContentManager()
            self.content_manager = manager
            self.track_signal(manager, 'script-message-received::vistaNotes', self.on_message)
            if not manager.register_script_message_handler('vistaNotes', None):
                raise RuntimeError('Could not initialize the editor bridge.')
            self.view = WebKit.WebView(user_content_manager=manager)
            self.set_background('dark')
            self.track_signal(self.view, 'decide-policy', self.decide_policy)
            self.track_signal(self.view, 'notify::title', self.title_changed)
            self.track_signal(self.view, 'permission-request', lambda _view, request: (request.deny(), True)[1])
            self.track_signal(self.view, 'web-process-terminated', self.process_terminated)
            self.track_signal(self.view, 'load-failed', self.load_failed)
            self.window = Gtk.ApplicationWindow(application=self.application, title='Another Note', default_width=1120, default_height=790)
            self.window.set_icon_name(APP_ID)
            header = Gtk.HeaderBar()
            header.add_css_class('vista-notes-header')
            self.title_label = Gtk.Label(label='Another Note', ellipsize=Pango.EllipsizeMode.END, max_width_chars=65)
            header.set_title_widget(self.title_label)
            self.window.set_titlebar(header)
            self.window.set_child(self.view)
            self.application.live_drags.install_target(self)
            self.track_signal(self.window, 'close-request', self.close_requested)
            self.startup_timeout = GLib.timeout_add_seconds(35, self.startup_failed)
            self.view.load_uri(trusted_uri)

        def set_background(self, theme):
            color = Gdk.RGBA()
            color.parse('#000000' if theme == 'dark' else '#fcfcfc')
            self.view.set_background_color(color)

        def cancel_startup_timeout(self):
            if self.startup_timeout:
                GLib.source_remove(self.startup_timeout)
                self.startup_timeout = None

        def show_editor(self, theme):
            self.set_background(theme)
            self.cancel_startup_timeout()
            self.loaded = True
            self.can_destroy = False
            if self.drag_preview_token:
                self.application.live_drags.preview_ready(self)
                return
            self.window.present()
            if self.transfer_origin:
                parent, request_id = self.transfer_origin
                self.transfer_origin = None
                parent.reply(request_id, {'moved': True, 'windowId': self.window_id})

        def startup_failed(self, detail='The editor did not finish starting. Close and reopen Another Note.'):
            if self.drag_preview_token:
                record = self.application.live_drags.sessions.get(self.drag_preview_token)
                if record: self.application.live_drags.notify(record, {'cancelled': True})
                self.can_destroy = True
                self.window.destroy()
                return False
            self.cancel_startup_timeout()
            self.can_destroy = True
            if self.transfer_origin:
                parent, request_id = self.transfer_origin
                self.transfer_origin = None
                parent.reply(request_id, error='The new window could not start. The file stayed in its original tab.')
                self.window.destroy()
                return False
            self.window.present()
            Gtk.AlertDialog(message='Could not start the editor.', detail=str(detail)).show(self.window)
            return False

        def load_failed(self, _view, _event, _uri, error):
            if not self.loaded:
                self.startup_failed(error.message)
            return True

        def title_changed(self, view, _property):
            title = view.get_title() or 'Another Note'
            self.window.set_title(title)
            self.title_label.set_label(title)

        def decide_policy(self, _view, decision, kind):
            if kind in (WebKit.PolicyDecisionType.NAVIGATION_ACTION, WebKit.PolicyDecisionType.NEW_WINDOW_ACTION):
                target = decision.get_navigation_action().get_request().get_uri()
                if target != trusted_uri or kind == WebKit.PolicyDecisionType.NEW_WINDOW_ACTION:
                    decision.ignore()
                    if target.startswith(('https://', 'http://')):
                        Gtk.UriLauncher.new(target).launch(self.window, None, None)
                    return True
            return False

        def evaluate(self, script):
            self.view.evaluate_javascript(script, -1, None, None, None, None)

        def reply(self, request_id, result=None, error=None):
            if self.closed or self.view.get_uri() != trusted_uri:
                return False
            self.evaluate('window.vistaNotesNativeResult(' + json.dumps(request_id) + ',' + json.dumps(result) + ',' + json.dumps(str(error) if error else None) + ');')
            return False

        def background(self, request_id, function):
            def worker():
                try:
                    result = function()
                    # Continuous drag frames must not starve completed disk
                    # requests and delay the native handoff until timeout.
                    GLib.idle_add(self.reply, request_id, result, priority=GLib.PRIORITY_DEFAULT)
                except (OSError, ValueError, TypeError) as error:
                    GLib.idle_add(self.reply, request_id, None, str(error), priority=GLib.PRIORITY_DEFAULT)
            threading.Thread(target=worker, daemon=True).start()

        def on_message(self, _manager, value):
            if self.closed or self.view.get_uri() != trusted_uri:
                return
            request_id = None
            try:
                text = value.to_string()
                if len(text) > MAX_BYTES + 1024 * 1024:
                    raise ValueError('The workspace is too large to save.')
                data = json.loads(text)
                request_id = data.get('id')
                command = data.get('command')
                if not isinstance(request_id, str) or len(request_id) > 100:
                    raise ValueError('Invalid request identity.')
                if command == 'load':
                    def load():
                        result = self.hub.load(self.window_id, self.initial_ids,
                                               open_tabs_only=data.get('deferClosed') is True and not self.transfer)
                        self.initial_ids = None
                        result['windowId'] = self.window_id
                        result['historyAppend'] = True
                        result['nativeDrag'] = False
                        result['liveDrag'] = True
                        result['openIds'] = self.hub.open_file_ids()
                        result['transfer'] = self.transfer
                        self.transfer = None
                        return result
                    self.background(request_id, load)
                elif command == 'load_remaining':
                    def load_remaining():
                        result = self.hub.load(self.window_id)
                        result['openIds'] = self.hub.open_file_ids()
                        return result
                    self.background(request_id, load_remaining)
                elif command == 'open_file_link':
                    self.background(request_id, lambda: self.hub.open_file_link(self.window_id, data.get('fileId')))
                elif command == 'read_file_link':
                    self.background(request_id, lambda: self.hub.open_file_link(self.window_id, data.get('fileId'), activate=False))
                elif command == 'ready':
                    if (self.transfer_origin or self.drag_preview_token) and data.get('failed'):
                        self.startup_failed('The file could not be loaded.')
                        return
                    self.show_editor(data.get('theme', 'dark'))
                    self.reply(request_id, {'ready': True})
                    self.deliver_imports()
                elif command == 'appearance':
                    theme = data.get('theme')
                    if theme not in ('light', 'dark'):
                        raise ValueError('Invalid appearance.')
                    self.set_background(theme)
                    self.reply(request_id, {'updated': True})
                elif command == 'editor_bundle':
                    self.background(request_id, lambda: self.application.editor_bundles.read(data.get('bundle')))
                elif command == 'save':
                    state = data.get('state')
                    def save():
                        snapshot = self.hub.save(self.window_id, state)
                        GLib.idle_add(self.application.workspace_saved, self, snapshot, priority=GLib.PRIORITY_DEFAULT)
                        return {'saved': True, 'openIds': snapshot['settings']['openIds'],
                                'fileLinks': [note for note in snapshot['notes'] if note.get('fileLink')]}
                    self.background(request_id, save)
                elif command == 'open_tabs':
                    self.background(request_id, lambda: {'openIds': self.hub.open_file_ids()})
                elif command == 'window_list':
                    self.reply(request_id, {'windows': [{'id': editor.window_id} for editor in self.application.editors.values()
                               if editor is not self and editor.loaded and not editor.closed and not editor.closing and not editor.drag_preview_token]})
                elif command == 'window_message':
                    recipient, token, kind = data.get('recipient'), data.get('token'), data.get('type')
                    if (not isinstance(recipient, str) or not isinstance(token, str) or not token or len(token) > 100
                            or kind not in ('collect-offer', 'collect-progress', 'collect-result', 'collect-cancel')):
                        raise ValueError('Invalid window message.')
                    target = self.application.editors.get(recipient)
                    delivered = bool(target and target is not self and target.loaded and not target.closed and not target.closing and not target.drag_preview_token)
                    if delivered:
                        target.evaluate('window.vistaNotesWindowMessage(' + json.dumps({'sender': self.window_id, 'type': kind, 'token': token, 'result': data.get('result')}) + ');')
                    self.reply(request_id, {'delivered': delivered})
                elif command == 'move_file':
                    self.application.move_file(self, request_id, data)
                elif command == 'tab_drop_target':
                    self.application.locate_tab_drop(self, request_id)
                elif command == 'begin_tab_drag':
                    self.application.live_drags.begin(self, request_id, data)
                elif command == 'commit_tab_drag':
                    self.application.live_drags.commit(self, request_id, data)
                elif command == 'finish_tab_drag':
                    self.application.live_drags.finish(self, data)
                    self.reply(request_id, {'finished': True})
                elif command == 'transfer_result':
                    accepted = self.application.transfer_result(self, data)
                    self.reply(request_id, {'accepted': accepted})
                elif command == 'close_empty_window':
                    others = any(editor is not self and not editor.closed and not editor.can_destroy
                                 and not editor.drag_preview_token for editor in self.application.editors.values())
                    if not self.loaded or self.hub.tabs.get(self.window_id) != [] or not others:
                        self.reply(request_id, {'closed': False})
                    else:
                        self.reply(request_id, {'closed': True})
                        self.closing = True
                        self.can_destroy = True
                        GLib.idle_add(self.window.destroy)
                elif command == 'detach_file':
                    file_id, transfer = data.get('fileId'), data.get('transfer')
                    if not self.loaded or self.closing or file_id not in self.hub.tabs.get(self.window_id, []):
                        raise ValueError('That file is not open in this window.')
                    if not isinstance(transfer, dict) or transfer.get('fileId') != file_id:
                        raise ValueError('Invalid file transfer.')
                    self.application.new_window(open_ids=[file_id], transfer=transfer, origin=(self, request_id))
                elif command == 'read_file':
                    key = data.get('fileKey')
                    self.background(request_id, lambda: self.files.read_bound(key))
                elif command == 'check_files':
                    self.background(request_id, lambda: self.files.check_changes(data.get('files')))
                elif command == 'open_link':
                    target = self.files.link_target(data.get('reference'), data.get('fileKey'))
                    if 'url' in target or target.get('image'):
                        # Local files need the file launcher so desktop portals
                        # grant the image viewer access to the actual file.
                        opener = Gtk.UriLauncher.new(target['url']) if 'url' in target else Gtk.FileLauncher.new(Gio.File.new_for_path(target['path']))
                        def launched(opener, result):
                            try:
                                if not opener.launch_finish(result):
                                    raise ValueError('The default application could not open this link.')
                                self.reply(request_id, {'external': True, **({'image': True} if target.get('image') else {})})
                            except (GLib.Error, ValueError) as error:
                                self.reply(request_id, error=str(error))
                        opener.launch(self.window, None, launched)
                    else:
                        self.background(request_id, lambda: {'file': self.files.open_link(target)})
                elif command == 'save_file':
                    key, content = data.get('fileKey'), data.get('text')
                    if not isinstance(content, str):
                        raise ValueError('Invalid file contents.')
                    def write(destination=None):
                        return self.files.write(content, key=key, destination=destination,
                                                line_ending=data.get('lineEnding', 'lf'), bom=data.get('bom', False))
                    if key and not data.get('saveAs'):
                        self.background(request_id, write)
                    else:
                        dialog = Gtk.FileDialog(title='Save File As', initial_name=Path(str(data.get('name') or 'untitled.txt')).name)
                        def chosen_file(chooser, response):
                            try:
                                destination = chooser.save_finish(response).get_path()
                                if not destination:
                                    raise ValueError('Choose a local file location.')
                                self.background(request_id, lambda: write(destination))
                            except GLib.Error:
                                self.reply(request_id, error='Cancelled')
                            except ValueError as error:
                                self.reply(request_id, error=str(error))
                        dialog.save(self.window, None, chosen_file)
                elif command == 'versions_load':
                    file_id = data.get('fileId')
                    self.background(request_id, lambda: {'versions': self.hub.version_operation('read', file_id, epoch=data.get('historyEpoch', 0))})
                elif command == 'versions_store':
                    file_id, versions = data.get('fileId'), data.get('versions')
                    self.background(request_id, lambda: self.hub.version_operation('write', file_id, versions, epoch=data.get('historyEpoch', 0)))
                elif command == 'versions_append':
                    self.background(request_id, lambda: self.hub.version_operation('append', data.get('fileId'), data.get('version'), epoch=data.get('historyEpoch', 0)))
                elif command == 'versions_delete':
                    file_id = data.get('fileId')
                    self.background(request_id, lambda: self.hub.version_operation('delete', file_id))
                elif command == 'export':
                    name, content = data.get('name'), data.get('text')
                    if not isinstance(name, str) or not isinstance(content, str):
                        raise ValueError('Invalid export.')
                    dialog = Gtk.FileDialog(title='Export from Another Note', initial_name=Path(name).name)
                    def chosen(chooser, response):
                        try:
                            destination = chooser.save_finish(response)
                            def written(file, result):
                                try:
                                    file.replace_contents_finish(result)
                                    self.reply(request_id, {'saved': True})
                                except GLib.Error as error:
                                    self.reply(request_id, error=error.message)
                            destination.replace_contents_async(content.encode('utf-8'), None, False, Gio.FileCreateFlags.PRIVATE, None, written)
                        except GLib.Error:
                            self.reply(request_id, error='Cancelled')
                    dialog.save(self.window, None, chosen)
                elif command == 'import':
                    dialog = Gtk.FileDialog(title='Open files, code, or an Another Note backup')
                    def chosen(chooser, response):
                        try:
                            files = chooser.open_multiple_finish(response)
                            selected = [files.get_item(i).get_path() for i in range(files.get_n_items())]
                            self.background(request_id, lambda: {'files': self.read_imports(selected)})
                        except GLib.Error:
                            self.reply(request_id, error='Cancelled')
                    dialog.open_multiple(self.window, None, chosen)
                elif command == 'clipboard':
                    content = data.get('text')
                    if not isinstance(content, str):
                        raise ValueError('Invalid clipboard text.')
                    self.window.get_clipboard().set(content)
                    self.reply(request_id, {'copied': True})
                elif command == 'read_clipboard':
                    def clipboard_read(clipboard, result):
                        if self.closed:
                            return
                        try:
                            self.reply(request_id, {'text': clipboard.read_text_finish(result) or ''})
                        except Exception as error:
                            self.reply(request_id, error=str(error))
                    self.window.get_clipboard().read_text_async(None, clipboard_read)
                elif command == 'print':
                    operation = WebKit.PrintOperation.new(self.view)
                    operation.run_dialog(self.window)
                    self.reply(request_id, {'printed': True})
                elif command == 'close_ready':
                    if self.closing:
                        self.cancel_close_timeout()
                        self.can_destroy = True
                        self.window.destroy()
                elif command == 'close_prompt':
                    self.cancel_close_timeout()
                    self.reply(request_id, {'waiting': True, 'windowCount': sum(not editor.closed and not editor.drag_preview_token for editor in self.application.editors.values())})
                elif command == 'close_window':
                    self.reply(request_id, {'closing': True})
                    self.window.close()
                elif command == 'close_cancelled':
                    self.cancel_close_timeout()
                    self.closing = False
                    self.reply(request_id, {'stayed': True})
                elif command == 'close_failed':
                    self.cancel_close_timeout()
                    self.closing = False
                    Gtk.AlertDialog(message='Your latest changes could not be saved.', detail='The app has stayed open. Use Back up to export your files before closing.').show(self.window)
                    self.reply(request_id, {'stayed': True})
                else:
                    raise ValueError('Unsupported desktop action.')
            except (ValueError, TypeError, OSError, RuntimeError, GLib.Error) as error:
                self.reply(request_id, error=str(error))

        def read_imports(self, paths):
            entries = []
            for value in paths:
                try:
                    if not value:
                        raise ValueError('Choose a local text file.')
                    path = Path(value)
                    limit = 128 * 1024 * 1024 if path.suffix.lower() in {'.vnotes', '.json'} else MAX_IMPORT
                    if not path.is_file() or path.stat().st_size > limit:
                        raise ValueError('Choose a backup below 128 MB or a text file below 20 MB.')
                    entries.append(self.files.open(path, limit))
                except (OSError, ValueError) as error:
                    entries.append({'name': Path(value).name if value else 'File', 'error': str(error)})
            return entries

        def can_receive_file_drop(self):
            return self.loaded and not self.closed and not self.closing and not self.drag_preview_token and not self.application.live_drags.sessions

        def show_file_drop(self, active):
            if not self.closed:
                self.evaluate('window.vistaNotesFileDropHover && window.vistaNotesFileDropHover(' + ('true' if active else 'false') + ');')

        def accepts_file_drop(self, drop):
            return self.can_receive_file_drop() and drop.get_formats().contain_mime_type('text/uri-list')

        def dismiss_web_file_drop(self, drop):
            # GTK offers crossing events to WebKit as well as the window.
            # Reject its competing file drop and cancel its pending replies
            # before our native target finishes the operation. Text and tab
            # drags do not take this path.
            controllers = self.view.observe_controllers()
            for index in range(controllers.get_n_items()):
                controller = controllers.get_item(index)
                if controller.__gtype__.name == 'GtkDropTargetAsync':
                    controller.reject_drop(drop)
                    controller.emit('drag-leave', drop)

        def receive_file_drop(self, drop):
            self.show_file_drop(False)
            if not self.accepts_file_drop(drop): return False
            self.dismiss_web_file_drop(drop)
            def ready(drop, result, *_args):
                success = False
                try:
                    value = drop.read_value_finish(result)
                    if self.can_receive_file_drop():
                        files = value.get_files()
                        if files:
                            self.pending_file_drops.extend(file.get_path() for file in files)
                            self.deliver_file_drops()
                            success = True
                except (GLib.Error, OSError, ValueError, TypeError, AttributeError):
                    if not self.closed:
                        self.evaluate('window.vistaNotesOpenDroppedFiles && window.vistaNotesOpenDroppedFiles(' + json.dumps([{'name':'Dropped files','error':'The dropped file list could not be read. Try dropping the files again.'}]) + ');')
                finally:
                    drop.finish(Gdk.DragAction.COPY if success else Gdk.DragAction(0))
            drop.read_value_async(Gdk.FileList, GLib.PRIORITY_DEFAULT, None, ready)
            return True

        def deliver_file_drops(self):
            if self.closed or self.file_drops_running or not self.pending_file_drops: return False
            paths, self.pending_file_drops = self.pending_file_drops, []
            self.file_drops_running = True
            def read():
                entries = self.read_imports(paths)
                GLib.idle_add(self.file_drops_ready, entries, priority=GLib.PRIORITY_DEFAULT)
            threading.Thread(target=read, daemon=True).start()
            return False

        def file_drops_ready(self, entries):
            self.file_drops_running = False
            if not self.closed and not self.closing:
                self.window.present()
                self.evaluate('window.vistaNotesOpenDroppedFiles && window.vistaNotesOpenDroppedFiles(' + json.dumps(entries) + ');')
                self.deliver_file_drops()
            return False

        def open_documents(self, _app, files, _count, _hint):
            self.pending_imports.extend(file.get_path() for file in files)
            self.activate_window(self)
            if self.loaded:
                self.deliver_imports()

        def deliver_imports(self):
            if self.closed or self.imports_running or not self.pending_imports:
                return False
            paths, self.pending_imports = self.pending_imports, []
            self.imports_running = True
            def read():
                entries = self.read_imports(paths)
                GLib.idle_add(self.imports_ready, entries, priority=GLib.PRIORITY_DEFAULT)
            threading.Thread(target=read, daemon=True).start()
            return False

        def imports_ready(self, entries):
            self.imports_running = False
            if not self.closed:
                self.evaluate('window.vistaNotesImport && window.vistaNotesImport(' + json.dumps(entries) + ');')
                self.deliver_imports()
            return False

        def cancel_close_timeout(self):
            if self.close_timeout:
                GLib.source_remove(self.close_timeout)
                self.close_timeout = None

        def close_requested(self, _window):
            if self.can_destroy:
                return False
            if self.closing:
                return True
            self.closing = True
            self.evaluate('window.vistaNotesPrepareClose ? window.vistaNotesPrepareClose() : null;')
            def timeout():
                self.close_timeout = None
                self.closing = False
                dialog = Gtk.AlertDialog(message='The editor is not responding.', detail='Your last saved files remain on disk. You can keep waiting or close the window.', buttons=['Keep waiting', 'Close window'], cancel_button=0, default_button=0)
                def answer(alert, result):
                    try:
                        if alert.choose_finish(result) == 1:
                            self.can_destroy = True
                            self.window.destroy()
                    except GLib.Error:
                        pass
                dialog.choose(self.window, None, answer)
                return False
            self.close_timeout = GLib.timeout_add_seconds(10, timeout)
            return True

        def process_terminated(self, _view, _reason):
            if self.closed or self.disposed: return
            if self.transfer_origin or self.drag_preview_token:
                self.startup_failed('The new editor stopped before the file was ready.')
                return
            self.cancel_startup_timeout()
            self.can_destroy = True
            self.window.present()
            Gtk.AlertDialog(message='The editor stopped unexpectedly.', detail='Close and reopen Another Note to load the latest files saved to disk.').show(self.window)

    class NotesApplication(Gtk.Application):
        def __init__(self):
            super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.HANDLES_OPEN)
            data_home = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))
            self.store = NotebookStore(data_home / 'vista-notes' / 'notebook')
            self.files = FileStore(self.store.folder)
            self.versions = VersionStore(self.store.folder)
            self.hub = WorkspaceHub(self.store, self.files, self.versions)
            self.editor_bundles = EditorBundles(APP_DIR)
            self.editors = {}
            self.transfers = {}
            self.transfer_receipts = {}
            self.primary = None
            self.window_sequence = 0
            self.live_drags = LiveTabDrags(self)
            self.connect('activate', self.activate_window)
            self.connect('open', self.open_documents)
            self.connect('window-removed', self.window_removed)

        def locate_tab_drop(self, source, request_id):
            # Keep the working DOM pointer gesture. Query focus only after its
            # release, when Wayland's implicit button grab has ended.
            def locate(attempt=0):
                if source.closed:
                    return False
                try:
                    seat = Gdk.Display.get_default().get_default_seat()
                    device = seat.get_pointer() if seat else None
                    surface, x, y = device.get_surface_at_position() if device else (None, 0, 0)
                    target = next((editor for editor in self.editors.values()
                                   if editor is not source and editor.loaded and not editor.closed
                                   and not editor.closing and editor.window.get_surface() == surface), None) if surface else None
                    if target is None:
                        if attempt < 12:
                            GLib.timeout_add(16, locate, attempt + 1)
                        else:
                            source.reply(request_id, {'targetId': None})
                        return False
                    native = target.view.get_native()
                    tx, ty = native.get_surface_transform()
                    ok, bounds = target.view.compute_bounds(native)
                    if not ok:
                        source.reply(request_id, {'targetId': None})
                        return False
                    zoom = target.view.get_zoom_level()
                    x, y = (x + tx - bounds.get_x()) / zoom, (y + ty - bounds.get_y()) / zoom
                    # Matching the native surface also covers its header bar.
                    script = 'JSON.stringify(window.vistaNotesTabDropInfo && window.vistaNotesTabDropInfo(' + json.dumps(x) + ',' + json.dumps(y) + ',true))'
                    def destination_ready(view, result, *_args):
                        try:
                            info = json.loads(view.evaluate_javascript_finish(result).to_string())
                            if (target.closed or target.closing or self.editors.get(target.window_id) is not target
                                    or not isinstance(info, dict)):
                                source.reply(request_id, {'targetId': None})
                            elif info.get('blocked'):
                                source.reply(request_id, {'blocked': True})
                            elif type(info.get('index')) is int and info['index'] >= 0:
                                source.reply(request_id, {'targetId': target.window_id, 'index': info['index']})
                            else:
                                source.reply(request_id, {'targetId': None})
                        except (GLib.Error, OSError, ValueError, TypeError):
                            source.reply(request_id, {'targetId': None})
                    target.view.evaluate_javascript(script, -1, None, None, None, destination_ready)
                except (GLib.Error, OSError, ValueError, TypeError, AttributeError):
                    source.reply(request_id, {'targetId': None})
                return False
            GLib.idle_add(locate)

        def move_file(self, source, request_id, data):
            target = self.editors.get(data.get('targetId'))
            file_id, transfer = data.get('fileId'), data.get('transfer')
            if target is None or target is source or target.closed or not target.loaded or target.closing:
                raise ValueError('The destination window is unavailable.')
            if source.closing or file_id not in self.hub.tabs.get(source.window_id, []):
                raise ValueError('That file is not open in its source window.')
            if not isinstance(transfer, dict) or transfer.get('fileId') != file_id:
                raise ValueError('Invalid file transfer.')
            state = self.hub.load(source.window_id)['state']
            if not state or not any(n['id'] == file_id and not n.get('removedAt') and not n.get('trashedAt') for n in state['notes']):
                raise ValueError('That file is unavailable.')
            state['settings']['openIds'], state['activeId'] = [file_id], file_id
            token = uuid.uuid4().hex
            record = {'source': source, 'requestId': request_id, 'target': target, 'fileId': file_id}
            self.transfers[token] = record
            record['timer'] = GLib.timeout_add_seconds(35, lambda: self.fail_transfer(token, 'The destination did not confirm the move. The original tab was kept.'))
            seed = {'workspace': state, 'transfer': transfer}
            index = data.get('index')
            if not isinstance(index, (int, float)):
                index = None
            target.evaluate('window.vistaNotesAcceptTabTransfer(' + json.dumps(token) + ',' + json.dumps(seed) + ',' + json.dumps(index) + ');')
            target.window.present()

        def fail_transfer(self, token, error):
            record = self.transfers.pop(token, None)
            if record:
                self.remember_transfer_receipt(token, record['target'], False)
                GLib.source_remove(record['timer'])
                if not record['target'].closed:
                    record['target'].evaluate('window.vistaNotesCancelTabTransfer && window.vistaNotesCancelTabTransfer(' + json.dumps(token) + ');')
                record['source'].reply(record['requestId'], error=error)
            return False

        def remember_transfer_receipt(self, token, target, ok):
            self.transfer_receipts[token] = {'target': target.window_id, 'ok': ok}
            while len(self.transfer_receipts) > 100:
                self.transfer_receipts.pop(next(iter(self.transfer_receipts)))

        def transfer_result(self, target, data):
            token = data.get('token')
            record = self.transfers.get(token)
            if record is None:
                receipt = self.transfer_receipts.get(token)
                if receipt and receipt['target'] == target.window_id:
                    return receipt['ok']
                raise ValueError('That file transfer is no longer pending.')
            if record['target'] is not target:
                raise ValueError('That file transfer is no longer pending.')
            if not data.get('ok') or record['fileId'] not in self.hub.tabs.get(target.window_id, []):
                self.fail_transfer(token, str(data.get('error') or 'The destination could not receive the file.'))
                return False
            self.transfers.pop(token)
            self.remember_transfer_receipt(token, target, True)
            GLib.source_remove(record['timer'])
            record['source'].reply(record['requestId'], {'moved': True, 'windowId': target.window_id})
            return True

        def new_window(self, open_ids=None, transfer=None, origin=None, drag_preview=None):
            identity = 'main' if self.window_sequence == 0 else 'window-' + uuid.uuid4().hex
            self.window_sequence += 1
            editor = NotesWindow(self, identity, open_ids, transfer, origin)
            editor.drag_preview_token = drag_preview
            self.editors[identity] = editor
            if self.primary is None:
                self.primary = editor
            try:
                editor.activate_window(self)
            except Exception:
                self.editors.pop(identity, None)
                if self.primary is editor: self.primary = next(iter(self.editors.values()), None)
                editor.closed = True
                if editor.window is not None:
                    editor.window.destroy()
                editor.dispose()
                raise
            return editor

        def activate_window(self, _app):
            # Restore the previous session only in the first window. A later
            # launch starts with no tabs, so the editor creates one blank file.
            self.new_window(open_ids=[] if self.editors else None)

        def open_documents(self, _app, files, _count, _hint):
            available = [item for item in self.editors.values() if not item.closed and not item.closing]
            if not available:
                available = [self.new_window()]
            focused = self.get_active_window()
            editor = next((item for item in available if item.window == focused), available[0])
            editor.pending_imports.extend(file.get_path() for file in files)
            if editor.loaded:
                editor.window.present()
                editor.deliver_imports()

        def workspace_saved(self, source, snapshot):
            targets = [editor for editor in self.editors.values()
                       if editor is not source and editor.loaded and not editor.closed]
            if not targets:
                return False
            script = 'window.vistaNotesWorkspaceChanged && window.vistaNotesWorkspaceChanged(' + json.dumps(snapshot) + ');'
            for editor in targets:
                editor.evaluate(script)
            return False

        def window_removed(self, _app, window):
            editor = next((item for item in self.editors.values() if item.window == window), None)
            if editor is None:
                return
            editor.closed = True
            self.live_drags.window_removed(editor)
            for token, transfer in list(self.transfers.items()):
                if editor in (transfer['source'], transfer['target']):
                    self.fail_transfer(token, 'A window closed before the file transfer finished.')
            editor.cancel_startup_timeout()
            editor.cancel_close_timeout()
            self.editors.pop(editor.window_id, None)
            if self.primary is editor: self.primary = next(iter(self.editors.values()), None)
            editor.dispose()
            if editor.transfer_origin:
                parent, request_id = editor.transfer_origin
                editor.transfer_origin = None
                parent.reply(request_id, error='The new window closed before the file was ready. The original tab was kept.')
            self.hold()
            def retire():
                try:
                    snapshot = self.hub.retire(editor.window_id)
                    if snapshot is not None:
                        GLib.idle_add(self.workspace_saved, editor, snapshot)
                except (OSError, ValueError):
                    # Contents were flushed before closing. The next journal save
                    # also retries the remaining windows' tab layout.
                    pass
                finally:
                    GLib.idle_add(self.release)
            threading.Thread(target=retire, daemon=True).start()

    return NotesApplication().run(['another-note', *sys.argv[1:]])


if __name__ == '__main__':
    try:
        sys.exit(run())
    except (RuntimeError, OSError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
