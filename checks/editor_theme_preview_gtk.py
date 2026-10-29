#!/usr/bin/env python3
"""Drive the native Fedora GTK/WebKit window through the theme preferences with real input.

Opens a visible window. Uses XWayland (GDK_BACKEND=x11) so xdotool can send real
mouse and keyboard events, a separate app id and temporary XDG data, config and
cache directories. Does not read or modify the user's notebook. Build first with
`python3 build.py`. Set QA_SCREENSHOTS to a folder to save WebView snapshots.
"""
import json, os, pathlib, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(os.environ['QA_SCREENSHOTS']).resolve() if os.environ.get('QA_SCREENSHOTS') else None
if not shutil.which('xdotool'): raise SystemExit('Install xdotool to run this check.')
if not (ROOT / 'fedora/Another-Note.html').exists(): raise SystemExit('Run python3 build.py first.')
os.environ['GDK_BACKEND'] = 'x11'
if OUT: OUT.mkdir(parents=True, exist_ok=True)
results = {'steps': [], 'errors': []}
tmp = tempfile.TemporaryDirectory(prefix='another-note-gtk-probe-')
d = pathlib.Path(tmp.name)
for key in ['DATA', 'CACHE', 'CONFIG']: os.environ['XDG_%s_HOME' % key] = str(d / key.lower())
content = 'function greet(name) {\n  if (name) return "Hello";\n  return "Ready";\n}\nconst count = 3;\n'
fixture = {'format': 'vista-notes', 'version': 1, 'updatedAt': 100, 'activeId': 'a', 'settings': {'theme': 'dark', 'openIds': ['a', 'b']},
           'notes': [{'id': 'a', 'title': 'sample.js', 'content': content, 'mode': 'javascript', 'createdAt': 1, 'updatedAt': 100, 'removedAt': 0, 'trashedAt': 0},
                     {'id': 'b', 'title': 'other.txt', 'content': 'Other', 'mode': 'text', 'createdAt': 1, 'updatedAt': 90, 'removedAt': 0, 'trashedAt': 0}]}
folder = d / 'data/vista-notes/notebook'; folder.mkdir(parents=True); (folder / 'notes.json').write_text(json.dumps(fixture))
sys.path.insert(0, str(ROOT / 'fedora'))
import launcher
launcher.APP_ID = 'org.vistanotes.ThemeProbe'
app_dir = d / 'app'; app_dir.mkdir(); launcher.APP_DIR = app_dir
html = (ROOT / 'fedora/Another-Note.html').read_text()
html = html.replace('  initialize().catch(error=>{', '  window.addEventListener("error",e=>window.webkit.messageHandlers.probe.postMessage(JSON.stringify({error:e.message})));\n  initialize().catch(error=>{', 1)
(app_dir / 'Another-Note.html').write_text(html)
for name in ['spelling-worker.js.gz', 'format-worker.js.gz']: (app_dir / name).symlink_to(ROOT / 'fedora' / name)

original_load = launcher.load_toolkit
state = {}

def xdo(*args):
    return subprocess.run(['xdotool', *map(str, args)], capture_output=True, text=True, timeout=10).stdout.strip()

def load_toolkit():
    Gtk, WebKit, Gio, GLib, Gdk, Pango = original_load()
    original_uri = WebKit.WebView.load_uri; original_run = Gtk.Application.run

    def load_uri(view, uri):
        state['view'] = view
        manager = view.get_user_content_manager(); manager.register_script_message_handler('probe', None)
        manager.connect('script-message-received::probe', lambda _m, v: results['errors'].append(json.loads(v.to_string()).get('error')))
        def message(_m, value):
            if json.loads(value.to_string()).get('command') == 'ready' and 'started' not in state:
                state['started'] = True; GLib.timeout_add(1200, lambda: (run_steps(), False)[1])
        manager.connect('script-message-received::vistaNotes', message)
        return original_uri(view, uri)
    WebKit.WebView.load_uri = load_uri

    def run(application, argv):
        state['app'] = application
        GLib.timeout_add_seconds(150, lambda: (results.update(timeout=True), application.quit(), False)[-1])
        return original_run(application, argv)
    Gtk.Application.run = run

    # Steps: each is (name, action) where action(next) eventually calls next().
    def js(code, callback=None):
        def done(view, result):
            try:
                value = view.evaluate_javascript_finish(result); text = value.to_string() if value else 'null'
                parsed = json.loads(text) if text not in ('undefined', '') else None
            except Exception as error:
                results['errors'].append('js: %s' % error); parsed = None
            if callback: callback(parsed)
        state['view'].evaluate_javascript('JSON.stringify((()=>{' + code + '})())', -1, None, None, None, done)

    def snapshot(name, callback):
        if not OUT: callback(); return
        def done(view, result):
            try: view.get_snapshot_finish(result).save_to_png(str(OUT / (name + '.png')))
            except Exception as error: results['errors'].append('snapshot %s: %s' % (name, error))
            callback()
        state['view'].get_snapshot(WebKit.SnapshotRegion.VISIBLE, WebKit.SnapshotOptions.NONE, None, done)

    def window_origin():
        ids = xdo('search', '--pid', os.getpid()).split()
        best = None
        for wid in ids:
            geometry = xdo('getwindowgeometry', '--shell', wid)
            values = dict(line.split('=') for line in geometry.splitlines() if '=' in line)
            if int(values.get('WIDTH', 0)) > 400 and int(values.get('HEIGHT', 0)) > 300: best = (wid, int(values['X']), int(values['Y']))
        return best

    def click_selector(selector, callback, dx=.5, dy=.5, drag=None):
        js("const r=document.querySelector(%s)?.getBoundingClientRect();return r?{x:r.left,y:r.top,w:r.width,h:r.height,s:devicePixelRatio,iw:innerWidth}:null" % json.dumps(selector), lambda rect: _click(rect, selector, callback, dx, dy, drag))

    def _click(rect, selector, callback, dx, dy, drag):
        if not rect: results['errors'].append('missing ' + selector); callback(); return
        wid = state['window'][0]; (ax, bx), (ay, by) = state['map']
        x = ax + bx * (rect['x'] + rect['w'] * dx); y = ay + by * (rect['y'] + rect['h'] * dy)
        xdo('windowactivate', wid)
        if drag:
            tx = ax + bx * (rect['x'] + rect['w'] * drag[0]); ty = ay + by * (rect['y'] + rect['h'] * drag[1])
            xdo('mousemove', int(x), int(y)); xdo('mousedown', 1)
            for i in range(1, 6): xdo('mousemove', int(x + (tx - x) * i / 5), int(y + (ty - y) * i / 5))
            xdo('mouseup', 1)
        else:
            xdo('mousemove', int(x), int(y)); xdo('click', 1)
        GLib.timeout_add(450, lambda: (callback(), False)[1])

    def key(keys, callback):
        xdo('windowactivate', state['window'][0]); xdo('key', '--clearmodifiers', *keys.split())
        GLib.timeout_add(350, lambda: (callback(), False)[1])

    def typed(text, callback):
        xdo('windowactivate', state['window'][0]); xdo('type', '--delay', '40', text)
        GLib.timeout_add(450, lambda: (callback(), False)[1])

    def check(name, code, expect):
        def step(nxt):
            def got(value):
                ok = expect(value); results['steps'].append({'check': name, 'ok': bool(ok), 'value': value}); nxt()
            js(code, got)
        return step

    # Map page coordinates to X screen coordinates from two real clicks; this covers
    # client-side decorations, header bars and display scaling.
    def calibrate(n):
        wid, wx, wy = state['window']; pts = [(wx + 400, wy + 420), (wx + 700, wy + 620)]; seen = []
        js("window.__probeSeen=[];addEventListener('pointerdown',e=>window.__probeSeen.push([e.clientX,e.clientY]),true);return 1")
        def go(i):
            if i == len(pts):
                def got(v):
                    (c1, c2) = v[-2:]; bx = (pts[1][0] - pts[0][0]) / (c2[0] - c1[0]); by = (pts[1][1] - pts[0][1]) / (c2[1] - c1[1])
                    state['map'] = ((pts[0][0] - bx * c1[0], bx), (pts[0][1] - by * c1[1], by)); results['map'] = state['map']; n()
                js("return window.__probeSeen", got); return
            xdo('windowactivate', wid); xdo('mousemove', *pts[i]); xdo('click', 1); GLib.timeout_add(400, lambda: (go(i + 1), False)[1])
        GLib.timeout_add(300, lambda: (go(0), False)[1])
    steps = [
        ('calibrate', calibrate),
        ('open', lambda n: (js("document.querySelector('[data-action=\"editorPreferences\"]')?document.querySelector('[data-action=\"editorPreferences\"]').click():showEditorPreferences();return true"), GLib.timeout_add(800, lambda: (n(), False)[1]))),
        ('snap-themes', lambda n: snapshot('1-themes', n)),
        ('no-native-color', check('no native color inputs', "return document.querySelectorAll('#editorPreferencesDialog input[type=color]').length", lambda v: v == 0)),
        ('tab-style', check('selected tab is underline only', "const s=getComputedStyle(document.activeElement);return [document.activeElement.id,s.borderTopLeftRadius,s.outlineStyle,s.borderLeftWidth]", lambda v: v == ['preferencesThemesTab', '0px', 'none', '0px'])),
        ('click-keyword', lambda n: click_selector('#preferencesPreviewCode .tok-keyword', n)),
        ('kw-selected', check('click keyword in preview selects Keywords row', "return [document.querySelector('.preference-color-row.selected')?.dataset.prefRow,document.querySelector('#preferencesPicker')?.previousElementSibling?.dataset.prefRow,document.getElementById('preferencesColorsTab').getAttribute('aria-selected')]", lambda v: v == ['syntax:keyword', 'syntax:keyword', 'true'])),
        ('remember', lambda n: js("window.__kw=document.querySelector('[data-syntax-hex=\"keyword\"]').value;return window.__kw", lambda v: n())),
        ('snap-picker', lambda n: snapshot('2-picker-open', n)),
        ('drag', lambda n: click_selector('.preference-picker-plane', n, .2, .8, drag=(.92, .08))),
        ('kw-changed', check('dragging picker changes keyword live (draft + preview)', "const v=document.querySelector('[data-syntax-hex=\"keyword\"]').value,c=getComputedStyle(document.querySelector('#preferencesPreviewCode .tok-keyword')).color,h=v.slice(1).match(/../g).map(x=>parseInt(x,16));return {before:window.__kw,after:v,preview:c,match:c==='rgb('+h.join(', ')+')',editor:getComputedStyle(document.querySelector('#highlight .tok-keyword')).color}", lambda v: v and v['after'] != v['before'] and v['match'])),
        ('snap-drag', lambda n: snapshot('3-after-drag', n)),
        ('hue', lambda n: click_selector('.preference-picker-hue', n, .1, .5)),
        ('hue-changed', check('hue slider click changes color', "return document.querySelector('[data-syntax-hex=\"keyword\"]').value", lambda v: isinstance(v, str) and len(v) == 7)),
        ('swatch', lambda n: click_selector('.preference-picker-swatches button:nth-child(3)', n)),
        ('swatch-ok', check('theme swatch sets the color', "const b=document.querySelector('.preference-picker-swatches button:nth-child(3)');return [b.dataset.pickerColor,document.querySelector('[data-syntax-hex=\"keyword\"]').value]", lambda v: v and v[0] == v[1])),
        ('esc', lambda n: key('Escape', n)),
        ('esc-ok', check('Escape closes only the picker', "return [!!document.getElementById('preferencesPicker'),document.getElementById('editorPreferencesDialog').open]", lambda v: v == [False, True])),
        ('click-tab', lambda n: click_selector('.pv-tab-active', n, .1, .2)),
        ('tab-ok', check('click preview active tab selects Active tab', "return document.querySelector('.preference-color-row.selected')?.dataset.prefRow", lambda v: v == 'surface:active-tab')),
        ('click-status', lambda n: click_selector('.pv-status', n, .5, .5)),
        ('status-ok', check('click status bar selects Status bar', "return document.querySelector('.preference-color-row.selected')?.dataset.prefRow", lambda v: v in ('surface:status', 'surface:status-text'))),
        ('click-caret', lambda n: click_selector('.pv-mark-caret', n, .5, .5)),
        ('caret-ok', check('click caret selects Text cursor', "return document.querySelector('.preference-color-row.selected')?.dataset.prefRow", lambda v: v == 'surface:caret')),
        ('focus-hex', lambda n: click_selector('[data-surface-hex="caret"]', n)),
        ('select-all', lambda n: key('ctrl+a', n)),
        ('type-hex', lambda n: typed('#00ff88', n)),
        ('hex-ok', check('typing HEX updates preview caret live', "return getComputedStyle(document.querySelector('.pv-mark-caret')).backgroundColor", lambda v: v == 'rgb(0, 255, 136)')),
        ('snap-colors', lambda n: snapshot('4-colors-caret', n)),
        ('light', lambda n: js("const s=document.getElementById('preferencesPalette');s.value='light';s.dispatchEvent(new Event('change',{bubbles:true}));return 1", lambda v: GLib.timeout_add(400, lambda: (n(), False)[1]))),
        ('snap-light', lambda n: snapshot('5-light', n)),
        ('font-tab', lambda n: click_selector('#preferencesFontTab', n)),
        ('font-ok', check('Font tab opens with real click', "return [document.getElementById('preferencesFont').hidden,document.getElementById('preferencesFontTab').getAttribute('aria-selected')]", lambda v: v == [False, 'true'])),
        ('snap-font', lambda n: snapshot('6-font', n)),
        ('dark-back', lambda n: js("const s=document.getElementById('preferencesPalette');s.value='dark';s.dispatchEvent(new Event('change',{bubbles:true}));return 1", lambda v: n())),
        ('apply', lambda n: click_selector('#preferencesApply', n)),
        ('applied', check('Apply: caret color in real editor + dialog closed', "return [document.getElementById('editorPreferencesDialog').open,getComputedStyle(document.getElementById('editor')).caretColor]", lambda v: v == [False, 'rgb(0, 255, 136)'])),
        ('snap-app', lambda n: snapshot('7-applied', n)),
    ]

    def run_steps():
        state['window'] = window_origin()
        if not state['window']: results['errors'].append('no X window'); state['app'].quit(); return
        index = [0]
        def nxt():
            if index[0] >= len(steps): GLib.timeout_add(300, lambda: (state['app'].quit(), False)[1]); return
            name, action = steps[index[0]]; index[0] += 1
            try: action(nxt)
            except Exception as error: results['errors'].append('%s: %r' % (name, error)); nxt()
        nxt()

    return Gtk, WebKit, Gio, GLib, Gdk, Pango

launcher.load_toolkit = load_toolkit
sys.argv = ['another-note-theme-probe']
launcher.run()
tmp.cleanup()
results['errors'] = [e for e in results['errors'] if e]
failed = [step['check'] for step in results['steps'] if not step['ok']]
for step in results['steps']: print(('ok    ' if step['ok'] else 'FAIL  ') + step['check'] + ('' if step['ok'] else ': ' + json.dumps(step['value'])))
if failed or results['errors'] or results.get('timeout') or len(results['steps']) < 13:
    raise SystemExit('Native theme preview check failed: ' + json.dumps({'failed': failed, 'errors': results['errors'], 'timeout': results.get('timeout', False)}))
print('Passed: native GTK/WebKit theme preferences with real input: in-app picker drag/hue/swatches/Escape, click-to-edit preview parts, live HEX, tabs and Apply.')
