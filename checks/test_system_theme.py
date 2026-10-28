"""Native appearance selection without requiring a display server."""
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fedora'))
from launcher import follow_system_theme
import launcher
import json


class SystemThemeTests(unittest.TestCase):
    def test_native_style_manager_follows_system_default(self):
        manager = Mock()
        adw = types.SimpleNamespace(init=Mock(), StyleManager=types.SimpleNamespace(get_default=lambda: manager),
                                    ColorScheme=types.SimpleNamespace(DEFAULT='system'))
        gi = types.ModuleType('gi'); gi.require_version = Mock()
        repository = types.ModuleType('gi.repository'); repository.Adw = adw
        with patch.dict(sys.modules, {'gi': gi, 'gi.repository': repository}):
            self.assertIs(follow_system_theme(Mock(), Mock()), manager)
        gi.require_version.assert_called_once_with('Adw', '1')
        adw.init.assert_called_once()
        manager.set_color_scheme.assert_called_once_with('system')

    def test_older_install_follows_gnome_changes_both_directions(self):
        toolkit, desktop, schema = Mock(), Mock(), Mock()
        desktop.get_string.return_value = 'prefer-dark'
        Gtk = types.SimpleNamespace(Settings=types.SimpleNamespace(get_default=lambda: toolkit))
        Gio = types.SimpleNamespace(SettingsSchemaSource=Mock(), Settings=Mock())
        Gio.SettingsSchemaSource.get_default.return_value.lookup.return_value = schema
        Gio.Settings.new_full.return_value = desktop
        with patch.dict(sys.modules, {'gi': None}):
            self.assertIs(follow_system_theme(Gtk, Gio), desktop)
        toolkit.set_property.assert_called_with('gtk-application-prefer-dark-theme', True)
        signal, update = desktop.connect.call_args.args
        self.assertEqual(signal, 'changed::color-scheme')
        desktop.get_string.return_value = 'prefer-light'; update(desktop, 'color-scheme')
        toolkit.set_property.assert_called_with('gtk-application-prefer-dark-theme', False)
        desktop.get_string.return_value = 'prefer-dark'; update(desktop, 'color-scheme')
        toolkit.set_property.assert_called_with('gtk-application-prefer-dark-theme', True)

    def test_desktop_without_gnome_schema_keeps_native_default(self):
        Gtk, Gio = Mock(), Mock()
        Gio.SettingsSchemaSource.get_default.return_value = None
        with patch.dict(sys.modules, {'gi': None}):
            self.assertIsNone(follow_system_theme(Gtk, Gio))
        Gtk.Settings.get_default.return_value.set_property.assert_not_called()


class StartupWindowTests(unittest.TestCase):
    def app(self):
        events = []
        class Application:
            def __init__(self, **_kwargs):
                self.handlers = {}
            def connect(self, name, callback):
                self.handlers[name] = callback
            def run(self, _argv):
                self.handlers['activate'](self)
                return self
        class Color:
            def parse(self, value):
                self.value = value
                return True
        Gtk, WebKit, Gio, GLib, Gdk, Pango = (Mock() for _ in range(6))
        Gtk.Application = Application
        Gdk.RGBA = Color
        Gdk.DragAction.MOVE = 2
        Gdk.DragAction.COPY = 1
        window = Gtk.ApplicationWindow.return_value
        view = WebKit.WebView.return_value
        view.set_background_color.side_effect = lambda color: events.append(('background', color.value))
        window.present.side_effect = lambda: events.append(('present',))
        def load(uri):
            window.present.assert_not_called()
            view.get_uri.return_value = uri
            events.append(('load',))
        view.load_uri.side_effect = load
        GLib.timeout_add_seconds.return_value = 9
        with patch('launcher.load_toolkit', return_value=(Gtk, WebKit, Gio, GLib, Gdk, Pango)), patch('launcher.follow_system_theme'):
            app = launcher.run()
        return app.primary, events, Gtk, GLib

    def test_window_waits_for_resolved_editor_theme_before_first_presentation(self):
        for theme, color in [('dark', '#191e23'), ('light', '#fcfcfc')]:
            with self.subTest(theme=theme):
                app, events, Gtk, GLib = self.app()
                self.assertEqual(events, [('background', '#191e23'), ('load',)])
                message = types.SimpleNamespace(to_string=lambda: json.dumps({'id': 'ready-1', 'command': 'ready', 'theme': theme}))
                app.on_message(None, message)
                self.assertEqual(events[-2:], [('background', color), ('present',)])
                self.assertTrue(app.loaded)
                GLib.source_remove.assert_called_once_with(9)
                app.activate_window(app)
                self.assertEqual(events[-1], ('present',))
                other = 'light' if theme == 'dark' else 'dark'
                app.on_message(None, types.SimpleNamespace(to_string=lambda: json.dumps({'id': 'theme-2', 'command': 'appearance', 'theme': other})))
                self.assertEqual(events[-1], ('background', '#fcfcfc' if other == 'light' else '#191e23'))

    def test_startup_timeout_or_load_error_remains_visible_and_closable(self):
        for failure in ('timeout', 'load'):
            with self.subTest(failure=failure):
                app, events, Gtk, GLib = self.app()
                if failure == 'timeout':
                    self.assertFalse(app.startup_failed())
                else:
                    self.assertTrue(app.load_failed(None, None, 'file:///missing', types.SimpleNamespace(message='Missing file')))
                self.assertTrue(app.can_destroy)
                self.assertEqual(events[-1], ('present',))
                Gtk.AlertDialog.return_value.show.assert_called_once_with(app.window)
                self.assertIsNone(app.startup_timeout)

    def test_close_prompt_can_wait_without_timeout_and_cancel_without_saving(self):
        app, events, Gtk, GLib = self.app()
        def send(command):
            app.on_message(None, types.SimpleNamespace(to_string=lambda: json.dumps({'id': command, 'command': command, 'theme': 'dark'})))
        send('ready')
        self.assertTrue(app.close_requested(app.window))
        self.assertTrue(app.closing)
        send('close_prompt')
        self.assertIsNone(app.close_timeout)
        self.assertTrue(app.close_requested(app.window))
        send('close_cancelled')
        self.assertFalse(app.closing)
        app.window.destroy.assert_not_called()
        Gtk.AlertDialog.assert_not_called()
        self.assertTrue(app.close_requested(app.window))
        send('close_prompt'); send('close_ready')
        app.window.destroy.assert_called_once()


if __name__ == '__main__':
    unittest.main(verbosity=2)
