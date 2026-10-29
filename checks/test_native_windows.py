"""Exercise real GTK controller creation and handoff routing with a display-free toolkit host."""
from pathlib import Path
import json
import os
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fedora'))
import launcher


class BackendSelectionTests(unittest.TestCase):
    def test_prefers_xwayland_when_available_and_keeps_explicit_choices(self):
        for environment, expected in [({'DISPLAY':':0','WAYLAND_DISPLAY':'wayland-0'},'x11,wayland'),({'WAYLAND_DISPLAY':'wayland-0'},None),({'DISPLAY':':0','GDK_BACKEND':'wayland'},'wayland')]:
            with self.subTest(environment=environment), patch.dict(os.environ,environment,clear=True):
                launcher.configure_window_backend()
                self.assertEqual(os.environ.get('GDK_BACKEND'),expected)


class NativeWindowTests(unittest.TestCase):
    def test_context_menu_clipboard_read_is_async_and_reports_failure(self):
        clipboard=self.parent.window.get_clipboard.return_value
        clipboard.read_text_finish.return_value='First\nSecond\t😀'
        self.send(self.parent,'read_clipboard')
        self.assertEqual(clipboard.read_text_async.call_args.args[0],None)
        callback=clipboard.read_text_async.call_args.args[1]
        callback(clipboard,object())
        self.assertIn('First\\nSecond\\t',self.replies(self.parent)[-1])
        clipboard.read_text_finish.side_effect=RuntimeError('Clipboard unavailable')
        callback(clipboard,object())
        self.assertIn('Clipboard unavailable',self.replies(self.parent)[-1])
        self.parent.closed=True
        self.parent.view.evaluate_javascript.reset_mock()
        callback(clipboard,object())
        self.parent.view.evaluate_javascript.assert_not_called()

    def test_window_collection_lists_live_editors_and_routes_through_the_host(self):
        child=self.detach();self.send(child,'load');self.send(child,'ready',theme='dark')
        self.send(self.parent,'window_list');self.assertIn(child.window_id,self.replies(self.parent)[-1])
        self.send(self.parent,'window_message',recipient=child.window_id,token='collect-1',type='collect-offer')
        script=next(text for text in reversed(self.replies(child)) if text.startswith('window.vistaNotesWindowMessage('))
        payload=json.loads(script[len('window.vistaNotesWindowMessage('):-2]);self.assertEqual(payload['sender'],self.parent.window_id)
        child.closing=True
        self.send(self.parent,'window_message',recipient=child.window_id,token='collect-1',type='collect-offer')
        self.assertIn('"delivered": false',self.replies(self.parent)[-1])
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        class Application:
            def __init__(self, **_kwargs): self.handlers = {}
            def connect(self, name, callback): self.handlers[name] = callback
            def run(self, _argv): self.handlers['activate'](self); return self
            def hold(self): pass
            def release(self): pass
            def get_active_window(self): return None
        class InlineThread:
            def __init__(self, target, **_kwargs): self.target = target
            def start(self): self.target()
        class Color:
            def parse(self, value): self.value = value; return True
        self.Gtk, self.WebKit, self.Gio, self.GLib, self.Gdk, self.Pango = (Mock() for _ in range(6))
        self.Gtk.Application = Application
        self.Gdk.RGBA = Color
        self.Gdk.DragAction.MOVE = 2
        self.Gdk.DragAction.COPY = 1
        self.Gdk.DragAction.side_effect = lambda value: value
        self.GLib.PRIORITY_DEFAULT = 0
        self.GLib.idle_add.side_effect = lambda callback, *args, **_kwargs: callback(*args)
        self.GLib.timeout_add.side_effect = lambda _delay, callback, *args: callback(*args)
        self.GLib.timeout_add_seconds.return_value = 9
        self.GLib.Error = RuntimeError
        self.views, self.windows = [], []
        def view(**_kwargs):
            item = Mock()
            item.get_width.return_value = 1110
            item.get_height.return_value = 738
            item.get_zoom_level.return_value = 1
            item.observe_controllers.return_value.get_n_items.return_value = 0
            bounds = Mock(); bounds.get_x.return_value = 5; bounds.get_y.return_value = 47
            item.compute_bounds.return_value = (True, bounds)
            item.load_uri.side_effect = lambda uri: setattr(item.get_uri, 'return_value', uri)
            self.views.append(item)
            return item
        def window(**kwargs):
            item = Mock()
            item.get_width.return_value = 1120; item.get_height.return_value = 790
            item.get_surface.return_value.get_width.return_value = 1120
            item.get_surface.return_value.get_height.return_value = 790
            item.get_surface_transform.return_value = (0,0)
            item.get_scale_factor.return_value = 1; item.is_maximized.return_value = False
            item.get_titlebar.return_value.get_height.return_value = 42
            item.destroy.side_effect = lambda: kwargs['application'].window_removed(kwargs['application'], item)
            self.windows.append(item)
            return item
        self.WebKit.WebView.side_effect = view
        self.Gtk.ApplicationWindow.side_effect = window
        patches = [patch('launcher.load_toolkit', return_value=(self.Gtk,self.WebKit,self.Gio,self.GLib,self.Gdk,self.Pango)), patch('launcher.follow_system_theme'), patch('launcher.threading.Thread', InlineThread), patch.dict(os.environ, {'XDG_DATA_HOME':self.temp.name})]
        for item in patches: item.start(); self.addCleanup(item.stop)
        self.app = launcher.run()
        self.parent = self.app.primary
        self.app.store.read()
        notes = [dict(id=i,title=i+'.txt',mode='text',content='draft '+i,createdAt=1,updatedAt=100,removedAt=0,trashedAt=0) for i in ('a','b')]
        self.app.store.write(dict(format='vista-notes',version=1,updatedAt=100,activeId='a',settings={'openIds':['a','b'],'theme':'dark'},notes=notes))
        self.send(self.parent,'load')
        self.send(self.parent,'ready',theme='dark')

    @staticmethod
    def send(editor, command, identity=None, **data):
        editor.on_message(None, types.SimpleNamespace(to_string=lambda:json.dumps(dict(id=identity or command, command=command, **data))))

    @staticmethod
    def replies(editor):
        return [call.args[0] for call in editor.view.evaluate_javascript.call_args_list]

    def detach(self):
        self.send(self.parent,'detach_file','move-1',fileId='a',transfer={'fileId':'a','cursor':{'start':1,'end':3,'top':10,'left':0},'history':{'undo':[],'redo':[]}})
        return next(item for item in self.app.editors.values() if item is not self.parent)

    def test_first_launch_restores_tabs_but_relaunch_opens_an_independent_empty_window(self):
        self.assertEqual(self.app.hub.tabs[self.parent.window_id], ['a', 'b'])
        self.parent.window.present.reset_mock()
        self.parent.view.evaluate_javascript.reset_mock()
        self.app.handlers['activate'](self.app)
        child = next(item for item in self.app.editors.values() if item is not self.parent)
        self.assertEqual(child.initial_ids, [])
        self.assertIs(self.app.primary, self.parent)
        self.send(child, 'load')
        loaded = self.app.hub.load(child.window_id)['state']
        self.assertEqual(loaded['settings']['openIds'], [])
        self.assertIsNone(loaded['activeId'])
        self.assertEqual([note['content'] for note in loaded['notes']], ['draft a', 'draft b'])
        self.assertEqual(self.app.hub.tabs[self.parent.window_id], ['a', 'b'])
        child.window.present.assert_not_called()
        self.send(child, 'ready', theme='dark')
        child.window.present.assert_called_once()
        self.parent.window.present.assert_not_called()
        self.parent.view.evaluate_javascript.assert_not_called()

    def test_repeated_launches_create_separate_windows_even_while_one_is_starting(self):
        for _ in range(2):
            self.app.handlers['activate'](self.app)
        children = [item for item in self.app.editors.values() if item is not self.parent]
        self.assertEqual(len(children), 2)
        self.assertNotEqual(children[0].window_id, children[1].window_id)
        for child in children:
            self.assertEqual(child.initial_ids, [])
            self.send(child, 'load')
            self.assertEqual(self.app.hub.tabs[child.window_id], [])
        self.assertEqual(self.app.hub.tabs[self.parent.window_id], ['a', 'b'])

    def test_relaunch_while_an_existing_window_is_closing_keeps_its_tabs_separate(self):
        self.parent.closing = True
        self.app.handlers['activate'](self.app)
        child = next(item for item in self.app.editors.values() if item is not self.parent)
        self.send(child, 'load')
        self.assertEqual(self.app.hub.tabs[child.window_id], [])
        self.assertEqual(self.app.hub.tabs[self.parent.window_id], ['a', 'b'])

    def test_open_with_file_launch_still_delivers_files_to_the_existing_window(self):
        file = Mock()
        file.get_path.return_value = '/files/another.txt'
        with patch.object(self.parent, 'deliver_imports') as deliver:
            self.app.open_documents(self.app, [file], 1, '')
        self.assertEqual(len(self.app.editors), 1)
        self.assertEqual(self.parent.pending_imports, ['/files/another.txt'])
        deliver.assert_called_once()

    def test_classic_tabs_keep_webkit_pointer_handling(self):
        self.parent.window.set_child.assert_called_once_with(self.parent.view)
        self.parent.view.add_controller.assert_not_called()
        self.Gtk.DragSource.new.assert_not_called()
        self.Gtk.DropTargetAsync.new.assert_called_once()
        self.Gtk.DropTarget.new.assert_not_called()
        self.Gdk.ContentFormats.new.assert_called_once_with([self.app.live_drags.MIME, 'text/uri-list'])
        self.assertEqual(self.parent.window.add_controller.call_count, 2)
        self.Gdk.Drag.begin.assert_not_called()
        self.assertTrue(any('"nativeDrag": false' in reply for reply in self.replies(self.parent)))

    def test_completed_disk_requests_do_not_wait_behind_drag_frames(self):
        self.send(self.parent,'load','responsive-load')
        self.assertTrue(any(call.args[0] == self.parent.reply and call.args[1] == 'responsive-load' and call.kwargs.get('priority') == 0 for call in self.GLib.idle_add.call_args_list))
        def fail():raise OSError('Disk unavailable')
        self.parent.background('responsive-error',fail)
        self.GLib.idle_add.assert_called_with(self.parent.reply,'responsive-error',None,'Disk unavailable',priority=0)

    def test_multi_file_import_keeps_valid_files_around_failed_selections(self):
        first, binary, last = (Path(self.temp.name) / name for name in ('first.txt', 'bad.bin', 'last.json'))
        first.write_text('first'); binary.write_bytes(b'\xff\xfe'); last.write_text('{}')
        entries = self.parent.read_imports([first, binary, None, Path(self.temp.name) / 'missing.txt', last])
        self.assertEqual([item['name'] for item in entries], ['first.txt', 'bad.bin', 'File', 'missing.txt', 'last.json'])
        self.assertEqual(entries[0]['text'], 'first')
        self.assertEqual(entries[-1]['text'], '{}')
        self.assertTrue(all('error' in entry for entry in entries[1:4]))

    def test_external_imports_read_in_background_and_queue_new_batches(self):
        tasks = []
        class DeferredThread:
            def __init__(self, target, **_kwargs): tasks.append(target)
            def start(self): pass
        with patch('launcher.threading.Thread', DeferredThread), patch.object(self.parent, 'read_imports', side_effect=lambda paths:[{'name':str(paths[0]),'text':'contents'}]) as read:
            self.parent.pending_imports.append('first.txt')
            self.parent.deliver_imports()
            read.assert_not_called()
            self.assertTrue(self.parent.imports_running)
            self.parent.pending_imports.append('second.txt')
            self.parent.deliver_imports()
            self.assertEqual(len(tasks), 1)
            tasks.pop(0)()
            self.assertEqual(read.call_args.args[0], ['first.txt'])
            self.assertEqual(len(tasks), 1)
            tasks.pop(0)()
            self.assertEqual(read.call_args.args[0], ['second.txt'])
            self.assertFalse(self.parent.imports_running)
            delivered = [script for script in self.replies(self.parent) if 'window.vistaNotesImport(' in script]
            self.assertEqual(len(delivered), 2)
            self.assertIn('first.txt', delivered[0]); self.assertIn('second.txt', delivered[1])

    def test_late_file_import_does_not_touch_closed_webview(self):
        self.parent.closed = True
        self.parent.view.evaluate_javascript.reset_mock()
        self.parent.imports_running = True
        self.parent.imports_ready([{'name':'late.txt','text':'late'}])
        self.assertFalse(self.parent.imports_running)
        self.parent.view.evaluate_javascript.assert_not_called()

    def file_drop(self, paths):
        value = Mock()
        files = []
        for path in paths:
            file = Mock(); file.get_path.return_value = path; files.append(file)
        value.get_files.return_value = files
        drop = Mock(); drop.get_drag.return_value = None
        drop.get_formats.return_value.contain_mime_type.return_value = True
        drop.read_value_finish.return_value = value
        drop.read_value_async.side_effect = lambda _type, _priority, _cancel, callback: callback(drop, object())
        target = self.Gtk.DropTargetAsync.new.return_value
        dropped = next(call.args[1] for call in target.connect.call_args_list if call.args[0] == 'drop')
        return dropped(target, drop, 100, 100)

    def test_native_file_drop_opens_multiple_paths_with_save_bindings(self):
        first, second = (Path(self.temp.name) / name for name in ('first.java', 'second.py'))
        first.write_text('class First {}'); second.write_text('print("hello")')
        self.assertTrue(self.file_drop([str(first), str(second)]))
        scripts = [script for script in self.replies(self.parent) if 'window.vistaNotesOpenDroppedFiles(' in script]
        self.assertEqual(len(scripts), 1)
        for name in ('first.java', 'second.py', 'fileKey', 'diskPath'): self.assertIn(name, scripts[0])
        self.assertEqual(first.read_text(), 'class First {}'); self.assertEqual(second.read_text(), 'print("hello")')
        self.parent.view.add_controller.assert_not_called()

    def test_file_drop_skips_bad_paths_without_losing_valid_files(self):
        path = Path(self.temp.name) / 'valid.txt'; path.write_text('valid')
        self.assertTrue(self.file_drop([None, str(Path(self.temp.name) / 'missing'), str(path)]))
        script = next(script for script in self.replies(self.parent) if 'window.vistaNotesOpenDroppedFiles(' in script)
        self.assertIn('valid.txt', script); self.assertIn('error', script)

    def test_file_drop_rejects_unready_or_closing_windows_and_tab_transfers(self):
        for field, value in [('loaded', False), ('closing', True), ('closed', True), ('drag_preview_token', 'tab-token')]:
            with self.subTest(field=field):
                previous = getattr(self.parent, field); setattr(self.parent, field, value)
                self.assertFalse(self.file_drop(['test.txt']))
                setattr(self.parent, field, previous)
        self.app.live_drags.sessions['held-tab'] = {}
        self.assertFalse(self.file_drop(['test.txt']))

    def test_native_file_drop_requires_file_formats_and_highlights_the_window(self):
        target = self.Gtk.DropTargetAsync.new.return_value
        handlers = {call.args[0]: call.args[1] for call in target.connect.call_args_list}
        drop = Mock(); drop.get_drag.return_value = None
        drop.get_formats.return_value.contain_mime_type.return_value = False
        self.assertFalse(handlers['accept'](target, drop), 'Internal tab MIME cannot become a file drop')
        drop.get_formats.return_value.contain_mime_type.return_value = True
        self.assertTrue(handlers['accept'](target, drop))
        self.assertEqual(handlers['drag-enter'](target, drop, 10, 10), self.Gdk.DragAction.COPY)
        handlers['drag-leave'](target, drop)
        self.assertTrue(any('vistaNotesFileDropHover(true)' in script for script in self.replies(self.parent)))
        self.assertTrue(any('vistaNotesFileDropHover(false)' in script for script in self.replies(self.parent)))

    def test_file_drops_read_in_background_and_queue_following_drops(self):
        tasks = []
        class DeferredThread:
            def __init__(self, target, **_kwargs): tasks.append(target)
            def start(self): pass
        with patch('launcher.threading.Thread', DeferredThread), patch.object(self.parent, 'read_imports', side_effect=lambda paths:[{'name':paths[0],'text':'contents'}]) as read:
            self.file_drop(['first.txt']); self.file_drop(['second.txt'])
            read.assert_not_called(); self.assertEqual(len(tasks), 1)
            tasks.pop(0)(); self.assertEqual(read.call_args.args[0], ['first.txt'])
            self.assertEqual(len(tasks), 1)
            tasks.pop(0)(); self.assertEqual(read.call_args.args[0], ['second.txt'])
            self.assertFalse(self.parent.file_drops_running)

    def test_late_file_drop_does_not_touch_a_closed_webview(self):
        self.parent.closed = True; self.parent.view.evaluate_javascript.reset_mock()
        self.parent.file_drops_running = True
        self.parent.file_drops_ready([{'name':'late.txt','text':'late'}])
        self.assertFalse(self.parent.file_drops_running)
        self.parent.view.evaluate_javascript.assert_not_called()

    def test_file_drop_cancels_webkit_replies_without_changing_text_controllers(self):
        web_drop = Mock(); web_drop.__gtype__ = types.SimpleNamespace(name='GtkDropTargetAsync')
        text = Mock(); text.__gtype__ = types.SimpleNamespace(name='GtkEventControllerKey')
        model = self.parent.view.observe_controllers.return_value
        model.get_n_items.return_value = 2
        model.get_item.side_effect = lambda index: [web_drop, text][index]
        self.parent.dismiss_web_file_drop('uri-drop')
        web_drop.reject_drop.assert_called_once_with('uri-drop')
        web_drop.emit.assert_called_once_with('drag-leave', 'uri-drop')
        text.reject_drop.assert_not_called(); text.set_propagation_phase.assert_not_called()
        self.parent.view.add_controller.assert_not_called()

    def test_file_drop_finishes_only_after_reading_its_file_list(self):
        callbacks = []
        drop = Mock(); drop.get_formats.return_value.contain_mime_type.return_value = True
        drop.read_value_async.side_effect = lambda _type, _priority, _cancel, callback: callbacks.append(callback)
        self.assertTrue(self.parent.receive_file_drop(drop))
        drop.finish.assert_not_called()
        self.parent.closed = True
        callbacks.pop()(drop, object())
        drop.finish.assert_called_once_with(0)

    def test_file_list_read_failure_finishes_drop_without_releasing_another_import(self):
        drop = Mock(); drop.get_formats.return_value.contain_mime_type.return_value = True
        drop.read_value_finish.side_effect = RuntimeError('Source closed')
        drop.read_value_async.side_effect = lambda _type, _priority, _cancel, callback: callback(drop, object())
        self.parent.file_drops_running = True
        self.assertTrue(self.parent.receive_file_drop(drop))
        drop.finish.assert_called_once_with(0)
        self.assertTrue(self.parent.file_drops_running)
        self.assertTrue(any('could not be read' in script for script in self.replies(self.parent)))

    def test_single_window_saves_do_not_serialize_unused_broadcasts(self):
        with patch('launcher.json.dumps', wraps=json.dumps) as serialize:
            self.app.workspace_saved(self.parent, self.app.hub.state)
            serialize.assert_not_called()
        child = self.detach()
        self.send(child, 'load'); self.send(child, 'ready', theme='dark')
        child.view.evaluate_javascript.reset_mock()
        self.app.workspace_saved(self.parent, self.app.hub.state)
        self.assertTrue(any('window.vistaNotesWorkspaceChanged(' in script for script in self.replies(child)))

    def begin_live_drag(self, held=True):
        cairo = patch.dict(sys.modules, {'cairo': Mock()})
        cairo.start(); self.addCleanup(cairo.stop)
        self.Gdk.ModifierType.BUTTON1_MASK = 256
        self.Gdk.DragAction.MOVE = 2
        self.Gdk.DragAction.side_effect = lambda value: value
        self.parent.window.get_surface().get_device_position.return_value = (True, 20, 50, 256 if held else 0)
        self.send(self.parent, 'begin_tab_drag', 'live-start', token='live-token', fileId='a', title='a.txt', theme='dark', modified=True, transfer={'fileId':'a'})
        return self.app.live_drags.sessions.get('live-token')

    def test_live_drag_shows_only_a_compact_tab_and_keeps_editor_hidden(self):
        # Pointer-device modifier state alone can be zero with a held button.
        pointer = self.Gdk.Display.get_default().get_default_seat().get_pointer()
        pointer.get_modifier_state.return_value = 0
        record = self.begin_live_drag()
        self.assertIsNotNone(record)
        child = record['child']
        child.window.set_child.assert_called_once_with(child.view)
        self.Gtk.WidgetPaintable.new.assert_not_called()
        self.Gtk.Picture.new_for_paintable.assert_not_called()
        record['frame'].set_size_request.assert_called_once_with(190,36)
        self.assertEqual(record['hotspot'],(30,16))
        child.window.set_opacity.assert_called_once_with(0)
        child.window.set_visible.assert_called_once_with(True)
        self.assertEqual(self.app.hub.tabs['main'], ['a','b'])
        self.send(child, 'load'); self.send(child, 'ready', theme='dark')
        child.window.present.assert_not_called()
        self.send(self.parent, 'close_prompt', 'during-drag')
        self.assertTrue(any('during-drag' in reply and '"windowCount": 1' in reply for reply in self.replies(self.parent)))

    def test_release_before_native_handoff_preserves_ordinary_pointer_fallback(self):
        self.assertIsNone(self.begin_live_drag(held=False))
        self.Gdk.Drag.begin.assert_not_called()
        self.assertEqual(len(self.app.editors), 1)
        self.assertTrue(any('live-start' in reply and '"started": false' in reply for reply in self.replies(self.parent)))

    def test_invalid_tab_dimensions_never_start_a_native_grab(self):
        self.begin_live_drag(held=False)
        self.parent.window.get_surface().get_device_position.return_value=(True,20,50,256)
        self.send(self.parent,'begin_tab_drag','bad-width',token='bad-width',fileId='a',width=None,transfer={'fileId':'a'})
        self.Gdk.Drag.begin.assert_not_called()
        self.assertFalse(self.app.live_drags.sessions)

    def test_pointer_returning_to_bar_before_bridge_delivery_keeps_local_drag(self):
        self.Gdk.ModifierType.BUTTON1_MASK = 256
        self.parent.window.get_surface().get_device_position.return_value = (True, 100, 90, 256)
        self.send(self.parent, 'begin_tab_drag', 'returned', token='returned', fileId='a', transfer={'fileId':'a'}, bar={'left':0,'right':1120,'top':29,'bottom':69})
        self.Gdk.Drag.begin.assert_not_called()
        self.assertTrue(any('returned' in reply and '"started": false' in reply for reply in self.replies(self.parent)))

    def test_desktop_release_keeps_window_geometry_and_suppresses_snap_back(self):
        moves=[]
        def position(_window, point=None):
            if point is not None:moves.append(point)
            return point if point is not None else (1400,860)
        with patch('launcher.x11_drag_position', side_effect=position):
            record=self.begin_live_drag(); child=record['child']
            self.send(child,'load');self.send(child,'ready',theme='dark')
            self.assertEqual(record['geometry'],(1120,790,5,47,1110,738,42))
            self.assertEqual(record['hotspot'],(30,16),'The compact icon uses the grab point inside the tab')
            self.assertEqual(record['window_hotspot'],(86,96),'The released window accounts for the native header and border offsets')
            cancelled=next(call.args[1] for call in record['drag'].connect.call_args_list if call.args[0]=='cancel')
            cancelled(record['drag'],self.Gdk.DragCancelReason.NO_TARGET)
            self.assertEqual(moves[-1],(1314,764))
            self.assertTrue(record['revealed']);record['drag'].drop_done.assert_called_with(True)
            child.window.set_opacity.assert_called_with(1)
            moves.clear();self.app.live_drags.reveal_detached(record)
            self.assertEqual(moves,[],'A late native completion must not reposition the released window')
            moves.clear();self.send(self.parent,'commit_tab_drag',token='live-token')
            self.assertEqual(moves,[],'Committing the real window must not move it after release')

    def test_hover_coalesces_motion_and_leaving_invalidates_older_work(self):
        record=self.begin_live_drag()
        receiver=self.app.new_window(open_ids=[]);self.send(receiver,'load');self.send(receiver,'ready',theme='dark')
        drop=Mock();drop.get_drag.return_value=record['drag']
        target=self.Gtk.DropTargetAsync.new.return_value
        motion=next(call.args[1] for call in reversed(target.connect.call_args_list) if call.args[0]=='drag-motion')
        leave=next(call.args[1] for call in reversed(target.connect.call_args_list) if call.args[0]=='drag-leave')
        callbacks=[];timers=[]
        self.GLib.timeout_add.side_effect=lambda delay,callback,*args:timers.append((delay,callback)) or len(timers)
        def evaluate(script,*args):
            if 'JSON.stringify(window.vistaNotesLiveTabHover' in script:callbacks.append((script,args[-1]))
        receiver.view.evaluate_javascript.side_effect=evaluate
        receiver.view.evaluate_javascript_finish.return_value.to_string.return_value='{"index":1}'
        motion(target,drop,100,90);motion(target,drop,200,90);motion(target,drop,300,90)
        self.assertFalse(any(call.args == (0,) for call in record['icon'].set_opacity.call_args_list),'Keep the floating window visible until the receiving tab is ready')
        self.assertEqual(len(callbacks),1,'Only one WebKit hover request may be in flight')
        callbacks[0][1](receiver.view,object())
        record['icon'].set_opacity.assert_called_with(0)
        self.assertEqual(timers[-1][0],8);timers[-1][1]()
        self.assertEqual(len(callbacks),2);self.assertIn(',295.0,43.0,',callbacks[1][0],'The next request uses the latest mouse position')
        leave(target,drop);generation=record['hover_generation']
        callbacks[1][1](receiver.view,object())
        self.assertEqual(record['hover_generation'],generation)
        self.assertEqual(timers[-1][0],40);timers[-1][1]()
        record['icon'].set_opacity.assert_called_with(1)
        self.assertTrue(any('vistaNotesClearLiveTabHover("live-token",'+str(generation) in reply for reply in self.replies(receiver)))

    def test_x11_hover_uses_live_pointer_with_surface_and_zoom_offsets(self):
        record=self.begin_live_drag()
        surface=self.parent.window.get_surface()
        surface.__gtype__=types.SimpleNamespace(name='GdkX11Toplevel')
        surface.get_device_position.return_value=(True,160,110,256)
        self.parent.window.get_surface_transform.return_value=(-5,-5)
        self.parent.view.get_zoom_level.return_value=2
        self.app.live_drags.hover(self.parent,record,-5,-5)
        self.assertTrue(any(',75.0,29.0,' in reply for reply in self.replies(self.parent)), 'Native hover must follow the pointer instead of stale drag event coordinates')

    def test_native_drop_freezes_preview_before_releasing_the_source(self):
        record=self.begin_live_drag();drop=Mock();drop.get_drag.return_value=record['drag']
        receiver=self.app.new_window(open_ids=[]);self.send(receiver,'load');self.send(receiver,'ready',theme='dark')
        target=self.Gtk.DropTargetAsync.new.return_value
        dropped=next(call.args[1] for call in reversed(target.connect.call_args_list) if call.args[0]=='drop')
        motion=next(call.args[1] for call in reversed(target.connect.call_args_list) if call.args[0]=='drag-motion')
        receiver.view.evaluate_javascript_finish.return_value.to_string.return_value='{"index":0}'
        def evaluate(script,*args):
            if 'JSON.stringify(window.vistaNotesLiveTabHover' in script:
                self.assertTrue(script.endswith(',true))'),'A released preview must stop scrolling before the native transfer is notified')
                args[-1](receiver.view,object())
        receiver.view.evaluate_javascript.side_effect=evaluate
        self.assertTrue(dropped(target,drop,100,90));record['icon'].set_opacity.assert_called_with(0)
        calls=receiver.view.evaluate_javascript.call_count
        self.assertEqual(motion(target,drop,300,90),0)
        self.assertEqual(receiver.view.evaluate_javascript.call_count,calls,'Late native motion must not restart the preview')
        self.assertEqual(self.app.hub.tabs['main'],['a','b'],'Ownership still waits for frontend acknowledgement')

    def test_live_commit_waits_for_readiness_then_reuses_the_prepared_window(self):
        record = self.begin_live_drag(); child = record['child']
        self.send(self.parent, 'commit_tab_drag', 'live-commit', token='live-token')
        self.assertFalse(any('live-commit' in reply for reply in self.replies(self.parent)))
        self.send(child, 'load'); self.send(child, 'ready', theme='dark')
        self.assertEqual(len(self.app.editors), 2)
        self.assertIsNone(child.drag_preview_token)
        child.window.present.assert_called_once()
        child.window.set_opacity.assert_called_with(1)
        child.window.set_sensitive.assert_called_with(True)
        self.assertTrue(any('live-commit' in reply and '"moved": true' in reply for reply in self.replies(self.parent)))
        self.assertEqual(self.app.hub.tabs['main'], ['a','b'], 'Only the acknowledged frontend can release the original')
        self.send(self.parent, 'finish_tab_drag', token='live-token', ok=True)
        self.assertFalse(child.closed)
        self.assertFalse(self.app.live_drags.sessions)

    def test_completed_drag_disconnects_callbacks_and_preview_layout(self):
        record=self.begin_live_drag();child=record['child']
        surface,layout_handler=record['preview_surface'],record['layout_handler']
        handlers=list(record['drag_handlers'])
        self.send(child,'load');self.send(child,'ready',theme='dark')
        self.send(self.parent,'commit_tab_drag','commit-cleanup',token='live-token')
        surface.disconnect.assert_called_once_with(layout_handler)
        self.assertNotIn('passthrough',record)
        child.window.present.assert_called_once()
        self.app.live_drags.promote(record)
        child.window.present.assert_called_once()
        self.send(self.parent,'finish_tab_drag',token='live-token',ok=True)
        for handler in handlers:record['drag'].disconnect.assert_any_call(handler)
        self.assertNotIn('drag_handlers',record)

    def test_closed_window_releases_webkit_bridge_controllers_and_primary(self):
        child=self.detach();self.send(child,'load');self.send(child,'ready',theme='dark')
        manager=self.parent.content_manager
        connections=list(self.parent.connections);controllers=list(self.parent.controllers)
        self.parent.window.destroy()
        self.assertTrue(self.parent.disposed)
        self.assertIs(self.app.primary,child)
        for owner,handler in connections:owner.disconnect.assert_any_call(handler)
        for controller in controllers:self.parent.window.remove_controller.assert_any_call(controller)
        manager.unregister_script_message_handler.assert_called_once_with('vistaNotes',None)
        self.parent.view.stop_loading.assert_called_once()
        self.assertFalse(self.parent.connections)
        self.assertFalse(self.parent.controllers)
        self.parent.dispose()
        manager.unregister_script_message_handler.assert_called_once()
        self.parent.view.stop_loading.assert_called_once()

    def test_reopening_during_last_window_shutdown_uses_a_fresh_identity(self):
        retired_id=self.parent.window_id
        self.parent.window.destroy()
        self.assertIsNone(self.app.primary)
        create_window=self.Gtk.ApplicationWindow.side_effect
        self.Gtk.ApplicationWindow.side_effect=OSError('Window creation failed')
        with self.assertRaises(OSError): self.app.new_window()
        self.assertIsNone(self.app.primary)
        self.assertFalse(self.app.editors)
        self.Gtk.ApplicationWindow.side_effect=create_window
        replacement=self.app.new_window()
        self.assertNotEqual(replacement.window_id,retired_id)
        self.assertIs(self.app.primary,replacement)
        self.send(replacement,'load');self.send(replacement,'ready',theme='dark')
        state=self.app.hub.load(replacement.window_id)['state']
        self.app.hub.save(replacement.window_id,state)
        self.assertEqual(self.app.hub.tabs[replacement.window_id],['a','b'])

    def test_native_completion_waits_until_signal_handler_returns(self):
        record=self.begin_live_drag();child=record['child'];pending=[]
        self.GLib.idle_add.side_effect=lambda callback,*args,**kwargs:pending.append((callback,args)) or 123
        cancelled=next(call.args[1] for call in record['drag'].connect.call_args_list if call.args[0]=='cancel')
        cancelled(record['drag'],self.Gdk.DragCancelReason.NO_TARGET)
        self.assertFalse(record.get('notified'))
        record['icon'].unrealize.assert_not_called()
        record['drag'].drop_done.assert_not_called()
        callback,args=pending.pop(0);self.assertFalse(callback(*args))
        self.assertTrue(record['notified'])
        record['icon'].unrealize.assert_called_once()

    def test_cancel_wins_when_native_completion_arrives_in_same_turn(self):
        record=self.begin_live_drag();pending=[]
        self.GLib.idle_add.side_effect=lambda callback,*args,**kwargs:pending.append((callback,args)) or 124
        cancelled=next(call.args[1] for call in record['drag'].connect.call_args_list if call.args[0]=='cancel')
        ended=next(call.args[1] for call in record['drag'].connect.call_args_list if call.args[0]=='dnd-finished')
        cancelled(record['drag'],self.Gdk.DragCancelReason.USER_CANCELLED)
        ended(record['drag'])
        self.assertEqual(len(pending),1)
        callback,args=pending.pop();callback(*args)
        self.assertTrue(any('vistaNotesFinishLiveTabDrag("live-token",{"cancelled": true})' in reply for reply in self.replies(self.parent)))
        self.assertFalse(record.get('released_on_desktop'))

    def test_late_native_completion_cannot_reveal_a_destroyed_preview(self):
        record=self.begin_live_drag();child=record['child'];pending=[]
        self.GLib.idle_add.side_effect=lambda callback,*args,**kwargs:pending.append((callback,args)) or 125
        self.app.live_drags.defer_native_end(record,{})
        callback,args=pending[0]
        self.send(self.parent,'finish_tab_drag',token='live-token',ok=False)
        self.assertTrue(child.closed)
        self.assertFalse(callback(*args))
        child.window.set_opacity.assert_called_once_with(0)

    def test_dropping_callback_after_cleanup_does_not_touch_the_drag_icon(self):
        record=self.begin_live_drag();drop=Mock();drop.get_drag.return_value=record['drag'];pending=[]
        receiver=self.app.new_window(open_ids=[]);self.send(receiver,'load');self.send(receiver,'ready',theme='dark')
        target=self.Gtk.DropTargetAsync.new.return_value
        dropped=next(call.args[1] for call in reversed(target.connect.call_args_list) if call.args[0]=='drop')
        receiver.view.evaluate_javascript.side_effect=lambda script,*args:pending.append(args[-1]) if 'JSON.stringify(window.vistaNotesLiveTabHover' in script else None
        dropped(target,drop,100,90)
        self.send(self.parent,'finish_tab_drag',token='live-token',ok=False)
        receiver.view.evaluate_javascript_finish.return_value.to_string.return_value='{"index":0}'
        pending[0](receiver.view,object())
        self.assertFalse(record['icon'].set_opacity.called)

    def test_live_cancel_cleans_icon_before_drag_surface_and_keeps_original(self):
        record = self.begin_live_drag(); child = record['child']
        self.send(child, 'load'); self.send(child, 'ready', theme='dark')
        calls = Mock()
        calls.attach_mock(record['icon'].unrealize, 'unrealize_icon')
        calls.attach_mock(record['drag'].drop_done, 'finish_drag')
        self.app.live_drags.notify(record, {'cancelled': True})
        self.send(self.parent, 'finish_tab_drag', token='live-token', ok=False)
        self.assertTrue(child.closed)
        self.assertEqual(self.app.hub.tabs['main'], ['a','b'])
        self.assertEqual([call[0] for call in calls.mock_calls], ['unrealize_icon','finish_drag'])
        record['drag'].drop_done.assert_called_once_with(False)
        record['drag'].emit.assert_called_once_with('cancel', self.Gdk.DragCancelReason.USER_CANCELLED)
        self.send(self.parent, 'finish_tab_drag', token='live-token', ok=False)
        record['drag'].drop_done.assert_called_once()
        self.assertFalse(self.app.live_drags.sessions)

    def test_escape_cancels_native_drag_before_button_release(self):
        record = self.begin_live_drag()
        keys = self.Gtk.EventControllerKey.new.return_value
        pressed = next(call.args[1] for call in keys.connect.call_args_list if call.args[0] == 'key-pressed')
        self.assertFalse(pressed(keys, 'ordinary-key', 0, 0))
        self.assertTrue(pressed(keys, self.Gdk.KEY_Escape, 0, 0))
        record['drag'].emit.assert_called_once_with('cancel', self.Gdk.DragCancelReason.USER_CANCELLED)
        record['notified'] = True
        self.assertFalse(pressed(keys, self.Gdk.KEY_Escape, 0, 0))

    def test_late_completion_after_cancel_never_reveals_the_editor(self):
        record=self.begin_live_drag();child=record['child']
        self.send(child,'load');self.send(child,'ready',theme='dark')
        self.app.live_drags.notify(record,{'cancelled':True})
        self.app.live_drags.reveal_detached(record)
        child.window.set_opacity.assert_called_once_with(0)
        self.assertFalse(record.get('released_on_desktop',False))

    def test_wayland_desktop_drop_uses_root_drop_offer_and_finished_signal(self):
        record = self.begin_live_drag()
        offered = [call.args[0] for call in self.Gdk.ContentProvider.new_for_bytes.call_args_list]
        self.assertEqual(offered, [self.app.live_drags.MIME,'application/x-rootwindow-drop'])
        finished = next(call.args[1] for call in record['drag'].connect.call_args_list if call.args[0] == 'dnd-finished')
        finished(record['drag'])
        self.assertTrue(record['notified'])
        self.assertTrue(any('vistaNotesFinishLiveTabDrag("live-token",{});' in reply for reply in self.replies(self.parent)))

    def performed_release(self, record):
        pending = []
        self.GLib.timeout_add.side_effect = lambda delay, callback, *args: pending.append((callback, args)) or 217
        performed = next((call.args[1] for call in record['drag'].connect.call_args_list if call.args[0] == 'drop-performed'), None)
        self.assertIsNotNone(performed, 'Desktop drops can emit drop-performed without dnd-finished')
        performed(record['drag'])
        self.assertEqual(len(pending), 1)
        return pending[0]

    def test_desktop_release_finishes_without_a_destination_finished_signal(self):
        record = self.begin_live_drag(); child = record['child']
        self.send(child, 'load'); self.send(child, 'ready', theme='dark')
        callback, args = self.performed_release(record)
        self.assertFalse(record.get('notified'), 'Wait until the native release handler has returned')
        self.assertFalse(callback(*args))
        self.assertTrue(record['notified']); self.assertTrue(record['revealed'])
        record['drag'].drop_done.assert_called_with(True)
        self.assertEqual(self.app.hub.tabs['main'], ['a', 'b'], 'Only a ready destination can release the original file')
        calls = self.parent.view.evaluate_javascript.call_count
        ended = next(call.args[1] for call in record['drag'].connect.call_args_list if call.args[0] == 'dnd-finished')
        ended(record['drag'])
        self.assertEqual(self.parent.view.evaluate_javascript.call_count, calls)

    def test_internal_drop_arriving_after_release_keeps_its_destination(self):
        record = self.begin_live_drag()
        receiver=self.app.new_window(open_ids=[]);self.send(receiver,'load');self.send(receiver,'ready',theme='dark');record['hover']=receiver
        callback, args = self.performed_release(record)
        target = self.Gtk.DropTargetAsync.new.return_value
        dropped = next(call.args[1] for call in reversed(target.connect.call_args_list) if call.args[0] == 'drop')
        drop = Mock(); drop.get_drag.return_value = record['drag']
        pending = []
        receiver.view.evaluate_javascript.side_effect = lambda script, *args: pending.append(args[-1]) if 'JSON.stringify(window.vistaNotesLiveTabHover' in script else None
        self.assertTrue(dropped(target, drop, 100, 90))
        self.assertFalse(callback(*args))
        self.assertFalse(record.get('notified')); self.assertFalse(record.get('released_on_desktop'))
        receiver.view.evaluate_javascript_finish.return_value.to_string.return_value = '{"index":1}'
        pending.pop()(receiver.view, object())
        self.assertTrue(any('"targetId": "'+receiver.window_id+'", "index": 1' in reply for reply in self.replies(self.parent)))
        self.assertFalse(record.get('released_on_desktop'))

    def test_unconfirmed_internal_release_keeps_the_original_file(self):
        record = self.begin_live_drag()
        receiver=self.app.new_window(open_ids=[]);self.send(receiver,'load');self.send(receiver,'ready',theme='dark');record['hover']=receiver
        callback, args = self.performed_release(record)
        callback(*args)
        self.assertTrue(record['notified']); self.assertFalse(record.get('released_on_desktop'))
        self.assertTrue(any('vistaNotesFinishLiveTabDrag("live-token",{"cancelled": true})' in reply for reply in self.replies(self.parent)))

    def test_dropping_a_detached_tab_on_its_source_promotes_a_new_window(self):
        record=self.begin_live_drag();child=record['child'];drop=Mock();drop.get_drag.return_value=record['drag']
        target=self.Gtk.DropTargetAsync.new.return_value
        motion=next(call.args[1] for call in target.connect.call_args_list if call.args[0]=='drag-motion')
        dropped=next(call.args[1] for call in target.connect.call_args_list if call.args[0]=='drop')
        self.assertEqual(motion(target,drop,200,300),self.Gdk.DragAction.MOVE)
        self.assertFalse(any('JSON.stringify(window.vistaNotesLiveTabHover' in reply for reply in self.replies(self.parent)),'Source window does not advertise reinsertion during the gesture')
        self.assertTrue(dropped(target,drop,200,300));self.assertTrue(record['released_on_desktop'])
        self.assertTrue(any('"detached": true' in reply for reply in self.replies(self.parent)))
        self.assertEqual(self.app.hub.tabs['main'],['a','b'],'Source ownership waits for the prepared window acknowledgement')
        self.send(child,'load');self.send(child,'ready',theme='dark');self.send(self.parent,'commit_tab_drag','return-commit',token='live-token')
        self.assertTrue(record['promoted']);self.assertIsNone(child.drag_preview_token)
        self.send(self.parent,'finish_tab_drag',token='live-token',ok=True);self.assertFalse(child.closed);drop.finish.assert_called_with(self.Gdk.DragAction.MOVE)

    def test_release_fallback_over_source_is_a_detach_rather_than_cancel(self):
        record=self.begin_live_drag();record['hover']=self.parent
        callback,args=self.performed_release(record);callback(*args)
        self.assertTrue(record['released_on_desktop']);self.assertTrue(record['notified'])
        self.assertFalse(record.get('native_outcome',{}).get('cancelled'))

    def test_cancel_and_cleanup_invalidate_pending_release(self):
        record = self.begin_live_drag()
        callback, args = self.performed_release(record)
        self.send(self.parent, 'finish_tab_drag', token='live-token', ok=False)
        self.GLib.source_remove.assert_any_call(217)
        self.assertFalse(callback(*args))
        self.assertFalse(record.get('released_on_desktop'))
        self.assertFalse(self.app.live_drags.sessions)

    def test_failed_live_preview_never_acknowledges_or_releases_original(self):
        record = self.begin_live_drag(); child = record['child']
        self.send(self.parent, 'commit_tab_drag', 'live-failed', token='live-token')
        child.startup_failed('Renderer failed')
        self.assertTrue(child.closed)
        self.assertEqual(self.app.hub.tabs['main'], ['a','b'])
        self.assertTrue(any('"cancelled": true' in reply for reply in self.replies(self.parent)))
        self.assertFalse(any('live-failed' in reply and '"moved": true' in reply for reply in self.replies(self.parent)))
        self.assertTrue(any('live-failed' in reply and 'original file was kept' in reply for reply in self.replies(self.parent)), 'Startup failure rejects a waiting commit immediately')
        self.send(self.parent, 'finish_tab_drag', token='live-token', ok=False)
        self.assertFalse(self.app.live_drags.sessions)

    def prepare_drop_lookup(self, info, zoom=1):
        child=self.detach();self.send(child,'load');self.send(child,'ready',theme='dark')
        target=self.parent
        target.view.get_native.return_value=target.window
        target.window.get_surface_transform.return_value=(-5,-5)
        bounds=Mock();bounds.get_x.return_value=0;bounds.get_y.return_value=42
        target.view.compute_bounds.return_value=(True,bounds)
        target.view.get_zoom_level.return_value=zoom
        pointer=self.Gdk.Display.get_default().get_default_seat().get_pointer()
        pointer.get_surface_at_position.return_value=(target.window.get_surface(),80*zoom+5,50*zoom+47)
        target.view.evaluate_javascript_finish.return_value.to_string.return_value=json.dumps(info)
        def evaluate(script, *_args):
            if 'vistaNotesTabDropInfo' in script:
                self.assertIn('(80.0,50.0,true)',script,'Header, surface transform and page zoom are removed; the native window surface accepts body/header drops')
                _args[-1](target.view,object())
        target.view.evaluate_javascript.side_effect=evaluate
        return child,pointer

    def test_pointer_release_locates_other_window_without_native_dragging(self):
        child,_pointer=self.prepare_drop_lookup({'index':1},zoom=2)
        self.send(child,'tab_drop_target','drop-lookup')
        self.assertTrue(any('drop-lookup' in reply and '"targetId": "main"' in reply and '"index": 1' in reply for reply in self.replies(child)))
        self.assertEqual(self.app.hub.tabs[child.window_id],['a'],'Lookup is read-only; transfer still waits for acknowledgement')
        self.Gtk.DragSource.new.assert_not_called()

    def test_pointer_focus_can_change_after_wayland_button_release(self):
        child,pointer=self.prepare_drop_lookup({'index':0})
        destination=pointer.get_surface_at_position.return_value
        pointer.get_surface_at_position.side_effect=[(child.window.get_surface(),300,300)]*8+[destination]
        self.send(child,'tab_drop_target','drop-focus')
        self.assertEqual(pointer.get_surface_at_position.call_count,9)
        self.assertTrue(any('drop-focus' in reply and '"targetId": "main"' in reply for reply in self.replies(child)))

    def test_pointer_drop_on_busy_or_unready_window_does_not_claim_a_tab(self):
        for info,expected in [({'blocked':True},'"blocked": true'),(None,'"targetId": null')]:
            child,_pointer=self.prepare_drop_lookup(info)
            self.send(child,'tab_drop_target','drop-target-'+str(info))
            self.assertIn(expected,self.replies(child)[-1])

    def test_pointer_drop_on_desktop_keeps_popout_fallback(self):
        pointer=self.Gdk.Display.get_default().get_default_seat().get_pointer()
        pointer.get_surface_at_position.return_value=(None,0,0)
        self.send(self.parent,'tab_drop_target','drop-desktop')
        self.assertEqual(pointer.get_surface_at_position.call_count,13)
        self.assertTrue(any('drop-desktop' in reply and '"targetId": null' in reply for reply in self.replies(self.parent)))

    def test_new_window_waits_for_load_and_ready_before_acknowledging_move(self):
        child = self.detach()
        self.assertIsNot(child.window,self.parent.window)
        child.window.present.assert_not_called()
        self.assertFalse(any('move-1' in reply for reply in self.replies(self.parent)))
        self.send(child,'load')
        loaded = self.app.hub.load(child.window_id)['state']
        self.assertEqual(loaded['settings']['openIds'],['a'])
        self.assertEqual(self.app.hub.tabs['main'],['a','b'])
        self.send(child,'ready',theme='dark')
        child.window.present.assert_called_once()
        acknowledgements = [reply for reply in self.replies(self.parent) if 'move-1' in reply]
        self.assertEqual(len(acknowledgements),1)
        self.assertIn('"moved": true',acknowledgements[0])
        self.assertEqual(self.app.hub.tabs['main'],['a','b'],'Only the frontend releases its source tab after acknowledgement')
        self.parent.window.destroy.assert_not_called()

    def test_failed_child_reports_failure_and_leaves_parent_live(self):
        child = self.detach()
        child.startup_failed('failed')
        self.assertTrue(child.closed)
        self.assertNotIn(child.window_id,self.app.editors)
        self.assertEqual(self.app.hub.tabs['main'],['a','b'])
        self.assertTrue(self.parent.loaded)
        self.assertTrue(any('move-1' in reply and 'original tab' in reply for reply in self.replies(self.parent)))
        self.parent.window.destroy.assert_not_called()

    def test_closing_a_child_does_not_close_other_windows(self):
        child = self.detach();self.send(child,'load');self.send(child,'ready',theme='dark')
        self.assertTrue(child.close_requested(child.window))
        self.send(child,'close_prompt');self.send(child,'close_ready')
        self.assertTrue(child.closed)
        self.assertEqual(len(self.app.editors),1)
        self.parent.window.destroy.assert_not_called()

    def test_close_context_counts_live_windows_and_last_window_keeps_its_tabs(self):
        self.send(self.parent,'close_prompt','last-window')
        self.assertTrue(any('last-window' in reply and '"windowCount": 1' in reply for reply in self.replies(self.parent)))
        child=self.detach();self.send(child,'load');self.send(child,'ready',theme='dark')
        self.send(child,'close_prompt','two-windows')
        self.assertTrue(any('two-windows' in reply and '"windowCount": 2' in reply for reply in self.replies(child)))
        self.assertTrue(child.close_requested(child.window));self.send(child,'close_ready')
        self.send(self.parent,'close_prompt','last-again')
        self.assertTrue(any('last-again' in reply and '"windowCount": 1' in reply for reply in self.replies(self.parent)))
        self.assertTrue(self.parent.close_requested(self.parent.window));self.send(self.parent,'close_ready')
        self.assertEqual(self.app.store.read()['state']['settings']['openIds'],['a','b'])
        self.assertEqual(self.app.store.read()['state']['notes'][0]['content'],'draft a')

    def test_window_creation_error_is_reported_without_losing_original(self):
        self.Gtk.ApplicationWindow.side_effect = RuntimeError('Could not allocate a window')
        self.send(self.parent,'detach_file','move-failed',fileId='a',transfer={'fileId':'a'})
        self.assertEqual(len(self.app.editors),1)
        self.assertEqual(self.app.hub.tabs['main'],['a','b'])
        self.assertTrue(any('move-failed' in reply and 'Could not allocate' in reply for reply in self.replies(self.parent)))

    def test_window_transfer_commits_before_source_can_close(self):
        child = self.detach();self.send(child,'load');self.send(child,'ready',theme='dark')
        parent_state = self.app.hub.load('main')['state'];parent_state['settings']['openIds']=['b'];parent_state['activeId']='b';self.app.hub.save('main',parent_state)
        self.send(child,'move_file','move-back',fileId='a',targetId='main',index=0,transfer={'fileId':'a'})
        self.assertFalse(any('move-back' in reply for reply in self.replies(child)))
        token = next(iter(self.app.transfers))
        target_state=self.app.hub.load('main')['state'];target_state['settings']['openIds']=['a','b'];target_state['activeId']='a';self.app.hub.save('main',target_state)
        self.send(self.parent,'transfer_result',token=token,ok=True)
        self.assertTrue(any('move-back' in reply and '"moved": true' in reply for reply in self.replies(child)))
        self.assertTrue(self.app.transfer_result(self.parent,{'token':token,'ok':True}),'A repeated acknowledgement is idempotent')
        state=self.app.hub.load(child.window_id)['state'];state['settings']['openIds']=[];state['activeId']=None;self.app.hub.save(child.window_id,state)
        self.send(child,'close_empty_window')
        self.assertTrue(child.closed);self.assertEqual(self.app.hub.tabs['main'],['a','b']);self.parent.window.destroy.assert_not_called()
        self.assertEqual({n['id']:n['content'] for n in self.app.store.read()['state']['notes']},{'a':'draft a','b':'draft b'})

    def test_nonempty_window_cannot_be_closed_by_empty_window_action(self):
        self.send(self.parent,'close_empty_window')
        self.parent.window.destroy.assert_not_called()
        state=self.app.hub.load('main')['state'];state['settings']['openIds']=[];state['activeId']=None;self.app.hub.save('main',state)
        self.send(self.parent,'close_empty_window')
        self.assertFalse(self.parent.closed, 'The final empty window stays available for creating or opening files')
        self.assertEqual(len(self.app.store.read()['state']['notes']),2)

    def test_only_one_of_two_empty_windows_can_auto_close(self):
        child=self.detach();self.send(child,'load');self.send(child,'ready',theme='dark')
        for editor in (self.parent,child):
            state=self.app.hub.load(editor.window_id)['state'];state['settings']['openIds']=[];state['activeId']=None;self.app.hub.save(editor.window_id,state)
        self.send(child,'close_empty_window');self.send(self.parent,'close_empty_window')
        self.assertTrue(child.closed);self.assertFalse(self.parent.closed)

    def test_clicked_local_and_website_links_use_correct_handlers(self):
        index=Path(self.temp.name)/'index.html';index.write_text('<link href="style.css">')
        css=index.with_name('style.css');css.write_text('body { color: red; }')
        entry=self.parent.files.open(index)
        self.send(self.parent,'open_link','linked-file',reference='./style.css?v=2',fileKey=entry['fileKey'])
        self.assertTrue(any('linked-file' in r and 'body { color: red; }' in r for r in self.replies(self.parent)))
        self.send(self.parent,'open_link','linked-web',reference='https://example.com/guide')
        self.Gtk.UriLauncher.new.assert_called_with('https://example.com/guide')
        self.Gtk.UriLauncher.new.return_value.launch.assert_called()
        image=index.parent/'Images'/'icon.png';image.parent.mkdir();image.write_bytes(b'\x89PNG\r\n\x1a\n\xff')
        self.send(self.parent,'open_link','linked-image',reference='./Images/icon.png',fileKey=entry['fileKey'])
        self.Gio.File.new_for_path.assert_called_with(str(image))
        self.Gtk.FileLauncher.new.assert_called_with(self.Gio.File.new_for_path.return_value)
        self.assertFalse(any('linked-image' in r for r in self.replies(self.parent)),'Wait for the desktop launch result')
        opener=self.Gtk.FileLauncher.new.return_value
        opener.launch.call_args.args[2](opener,object())
        opener.launch_finish.assert_called_once()
        self.assertTrue(any('linked-image' in r and '"image": true' in r for r in self.replies(self.parent)))

    def test_image_launch_failure_is_reported_to_the_editor(self):
        image=Path(self.temp.name)/'icon.png';image.write_bytes(b'\x89PNG')
        self.send(self.parent,'open_link','failed-image',reference=image.as_uri())
        opener=self.Gtk.FileLauncher.new.return_value
        opener.launch_finish.side_effect=RuntimeError('No image application is available')
        opener.launch.call_args.args[2](opener,object())
        self.assertTrue(any('failed-image' in r and 'No image application is available' in r for r in self.replies(self.parent)))

    def test_disk_change_checks_use_authorized_file_bindings(self):
        path=Path(self.temp.name)/'watched.txt';path.write_text('before')
        opened=self.parent.files.open(path)
        path.write_text('changed externally')
        self.send(self.parent,'check_files','changed-files',files=[{'fileKey':opened['fileKey'],'diskStamp':opened['diskStamp']}])
        self.assertTrue(any('changed-files' in r and 'changed externally' in r for r in self.replies(self.parent)))

    def test_checkpoint_append_does_not_send_the_history_back_to_webkit(self):
        version=dict(id='checkpoint',title='a.txt',content='checkpoint-private-content',mode='text',createdAt=1,reason='Saved')
        self.send(self.parent,'versions_append','append-history',fileId='a',version=version)
        reply=next(r for r in self.replies(self.parent) if 'append-history' in r)
        self.assertIn('"saved": true',reply);self.assertNotIn('checkpoint-private-content',reply)
        self.assertEqual(self.parent.versions.read('a'),[version])

    def test_failed_reattach_keeps_original_and_rejects_late_ack(self):
        child=self.detach();self.send(child,'load');self.send(child,'ready',theme='dark')
        self.send(child,'move_file','move-timeout',fileId='a',targetId='main',transfer={'fileId':'a'})
        token=next(iter(self.app.transfers))
        self.app.fail_transfer(token,'Destination timed out')
        self.assertEqual(self.app.hub.tabs[child.window_id],['a'])
        self.assertFalse(self.app.transfer_result(self.parent,{'token':token,'ok':True}))
        self.assertTrue(any('move-timeout' in reply and 'Destination timed out' in reply for reply in self.replies(child)))


if __name__ == '__main__': unittest.main(verbosity=2)
