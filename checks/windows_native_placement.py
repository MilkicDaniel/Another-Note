"""Measure placement in a real packaged Windows host; run only on a Windows VM."""
import argparse
import ctypes as C
from ctypes import wintypes as W
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import traceback
import types


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, required=True)
    args = parser.parse_args()
    app = args.app.resolve()
    sys.path.insert(0, str(app))
    from win32_support import WindowsPlatform, MonitorInfo, near_pointer_bounds

    user = C.WinDLL('user32', use_last_error=True)
    kernel = C.WinDLL('kernel32', use_last_error=True)
    pointer = C.c_void_p
    callback_type = C.WINFUNCTYPE(W.BOOL, pointer, C.c_ssize_t)
    signatures = [
        (user, 'EnumWindows', [callback_type, C.c_ssize_t], W.BOOL),
        (user, 'GetWindowThreadProcessId', [pointer, C.POINTER(W.DWORD)], W.DWORD),
        (user, 'GetWindowRect', [pointer, C.POINTER(W.RECT)], W.BOOL),
        (user, 'IsWindowVisible', [pointer], W.BOOL),
        (user, 'GetClassNameW', [pointer, W.LPWSTR, C.c_int], C.c_int),
        (user, 'SetCursorPos', [C.c_int, C.c_int], W.BOOL),
        (user, 'GetPhysicalCursorPos', [C.POINTER(W.POINT)], W.BOOL),
        (user, 'MonitorFromPoint', [W.POINT, W.DWORD], pointer),
        (user, 'GetMonitorInfoW', [pointer, C.POINTER(MonitorInfo)], W.BOOL),
        (kernel, 'OpenProcess', [W.DWORD, W.BOOL, W.DWORD], pointer),
        (kernel, 'QueryFullProcessImageNameW', [pointer, W.DWORD, W.LPWSTR, C.POINTER(W.DWORD)], W.BOOL),
        (kernel, 'CloseHandle', [pointer], W.BOOL),
    ]
    for library, name, arguments, result in signatures:
        function = getattr(library, name)
        function.argtypes = arguments
        function.restype = result
    user.SetProcessDPIAware()
    original = W.POINT()
    user.GetPhysicalCursorPos(C.byref(original))
    monitor = user.MonitorFromPoint(original, 2)
    info = MonitorInfo()
    info.size = C.sizeof(info)
    assert user.GetMonitorInfoW(monitor, C.byref(info)), 'Cannot inspect the runner monitor'
    area = info.work.left, info.work.top, info.work.right, info.work.bottom
    print(json.dumps({'work_area': area, 'original_pointer': [original.x, original.y]}), flush=True)

    def rectangle(handle):
        rect = W.RECT()
        assert user.GetWindowRect(handle, C.byref(rect)), 'Cannot measure a native window'
        return rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top

    errors = []
    try:
        import clr
        clr.AddReference('System.Windows.Forms')
        clr.AddReference('System.Drawing')
        from System import Action
        from System.Drawing import Size
        from System.Threading import Thread, ThreadStart, ApartmentState
        from System.Windows.Forms import Application, Form, FormStartPosition

        def native_form_probe():
            form = None
            try:
                platform = WindowsPlatform()
                form = Form()
                form.Text = 'Another Note placement probe'
                form.Size = Size(600, 400)
                form.StartPosition = FormStartPosition.CenterScreen
                form.Show()
                form.Hide()
                editor = types.SimpleNamespace(window=types.SimpleNamespace(native=form), ui=lambda fn: fn())
                point = (area[0] + 64, area[1] + 64)
                before = rectangle(int(form.Handle.ToInt64()))
                platform.position_near_pointer(editor, point)
                placed = rectangle(int(form.Handle.ToInt64()))
                form.Show()
                Application.DoEvents()
                shown = rectangle(int(form.Handle.ToInt64()))
                print(json.dumps({'native_form': {'before': before, 'placed': placed, 'shown': shown, 'point': point}}), flush=True)
                assert shown == near_pointer_bounds(point, area, shown[2:]), (shown, point, area)
            except Exception:
                errors.append(traceback.format_exc())
            finally:
                if form is not None:
                    form.Close()
                    form.Dispose()

        thread = Thread(ThreadStart(native_form_probe))
        thread.SetApartmentState(ApartmentState.STA)
        thread.Start()
        assert thread.Join(30000), 'Native form check timed out'
    except Exception:
        errors.append(traceback.format_exc())

    processes = set()
    expected_image = str(app / 'runtime' / 'pythonw.exe').casefold()

    def app_windows():
        found = {}
        def visit(handle, _parameter):
            pid = W.DWORD()
            user.GetWindowThreadProcessId(handle, C.byref(pid))
            process = kernel.OpenProcess(0x1000, False, pid.value)
            if not process:
                return True
            try:
                length = W.DWORD(32768)
                image = C.create_unicode_buffer(length.value)
                if not kernel.QueryFullProcessImageNameW(process, 0, image, C.byref(length)):
                    return True
                if image.value.casefold() != expected_image:
                    return True
                processes.add(pid.value)
                name = C.create_unicode_buffer(256)
                user.GetClassNameW(handle, name, len(name))
                if user.IsWindowVisible(handle) and name.value.startswith('WindowsForms10.'):
                    found[int(handle)] = rectangle(handle)
            finally:
                kernel.CloseHandle(process)
            return True
        callback = callback_type(visit)
        assert user.EnumWindows(callback, 0), 'Cannot enumerate application windows'
        return found

    with tempfile.TemporaryDirectory(prefix='another-note-native-') as temporary:
        local_data = Path(temporary)
        environment = dict(os.environ, LOCALAPPDATA=str(local_data))
        state_folder = local_data / 'Another Note'
        try:
            first_point = (area[0] + 64, area[1] + 64)
            assert user.SetCursorPos(*first_point), 'Cannot set the test cursor'
            subprocess.Popen([str(app / 'Another-Note.exe')], cwd=app, env=environment)
            deadline = time.monotonic() + 45
            first = {}
            while time.monotonic() < deadline:
                first = app_windows()
                if len(first) == 1 and (state_folder / 'notebook' / 'notes.json').exists():
                    break
                time.sleep(0.2)
            time.sleep(1)
            first = app_windows()
            print(json.dumps({'first_launch': first, 'point': first_point}), flush=True)
            assert len(first) == 1, 'The packaged editor did not show one ready window'
            first_handle, first_rect = next(iter(first.items()))
            first_expected = near_pointer_bounds(first_point, area, first_rect[2:])
            assert all(abs(a-b) <= 2 for a,b in zip(first_rect, first_expected)), (first_rect, first_expected)

            second_point = (area[2] - 100, area[1] + 64)
            assert user.SetCursorPos(*second_point), 'Cannot move the test cursor'
            subprocess.Popen([str(app / 'Another-Note.exe')], cwd=app, env=environment)
            deadline = time.monotonic() + 30
            second = {}
            while time.monotonic() < deadline:
                second = app_windows()
                if len(second) == 2:
                    break
                time.sleep(0.2)
            time.sleep(1)
            second = app_windows()
            print(json.dumps({'second_launch': second, 'point': second_point}), flush=True)
            assert len(second) == 2, 'Relaunch did not show a second editor'
            assert second[first_handle] == first_rect, 'Relaunch moved the existing window'
            new_rect = next(rect for handle, rect in second.items() if handle != first_handle)
            second_expected = near_pointer_bounds(second_point, area, new_rect[2:])
            assert all(abs(a-b) <= 2 for a,b in zip(new_rect, second_expected)), (new_rect, second_expected)
        except Exception:
            errors.append(traceback.format_exc())
        finally:
            for name in ('diagnostics.log', 'startup-error.log'):
                path = state_folder / name
                if path.exists():
                    print(name + ':\n' + path.read_text(encoding='utf-8', errors='replace'), flush=True)
            app_windows()
            for pid in processes:
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(1)
            user.SetCursorPos(original.x, original.y)
    for error in errors:
        print(error, flush=True)
    if errors:
        raise SystemExit(1)
    print('Passed: real WinForms placement and packaged app first/repeat launch positions.', flush=True)


if __name__ == '__main__':
    main()
