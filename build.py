#!/usr/bin/env python3
"""Build one editor source as standalone HTML and a native page with lazy tools."""
from pathlib import Path
import base64
import gzip
import json
from html import escape as html_escape
from release_config import read_version

ROOT = Path(__file__).resolve().parent
VERSION=read_version(ROOT)
html = (ROOT / 'source/shell.html').read_text().replace('/* APP_BUILD */', VERSION)
html = html.replace('/* APP_ICON */', base64.b64encode((ROOT / 'source/app-icon.png').read_bytes()).decode('ascii'))
html = html.replace('/* APP_CSS */', '\n'.join((ROOT/'source'/name).read_text() for name in ['app.css','color-picker.css','editor-minimap.css','editor-scrollbars.css','editor-structure.css','search-fields.css','help-dialogs.css']))
html = html.replace('/* THIRD_PARTY_LICENSES */', html_escape((ROOT / 'source/vendor/THIRD_PARTY_LICENSES.txt').read_text()))
assets=json.loads((ROOT/'source/vendor/editor-assets.json').read_text())
bootstrap=(ROOT/'source/vendor/worker-loader.js').read_bytes()
html=html.replace('/* EDITOR_BOOTSTRAP_BASE64 */',base64.b64encode(bootstrap).decode('ascii'))
workers={}
for name,keys,vendor,modules in [
    ('spelling',('enAff','enDic','gbAff','gbDic'),'spelling-vendor.js',('editor-word-utils.js','editor-worker.js')),
    ('format',('ruff','shell','treeSitter','java'),'format-vendor.js',('format-worker.js',)),
]:
    worker='const EDITOR_ASSETS='+json.dumps({key:assets[key] for key in keys},ensure_ascii=False,separators=(',',':'))+';\n'
    if name=='format':
        worker+='const editorAssetCache=new Map();globalThis.editorAssetBytes=name=>{if(!editorAssetCache.has(name)){const binary=atob(EDITOR_ASSETS[name]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);editorAssetCache.set(name,bytes);}return editorAssetCache.get(name);};\n'
    worker+=(ROOT/'source/vendor'/vendor).read_text()+'\n'+'\n'.join((ROOT/'source'/module).read_text() for module in modules)
    workers[name]=gzip.compress(worker.encode(),compresslevel=9,mtime=0)
javascript = (ROOT / 'source/app.js').read_text()
javascript = javascript.replace('/* SYNTAX_FORMATS */', (ROOT / 'source/syntax-formats.js').read_text())
javascript = javascript.replace('/* EDITOR_RENDERING */', (ROOT / 'source/editor-rendering.js').read_text())
javascript = javascript.replace('/* CODE_PREVIEWS */', (ROOT/'source/code-previews.js').read_text())
javascript = javascript.replace('/* EDITOR_MINIMAP */', (ROOT/'source/editor-minimap.js').read_text())
javascript = javascript.replace('/* EDITOR_SCROLLBARS */', (ROOT/'source/editor-scrollbars.js').read_text())
javascript = javascript.replace('/* EDITOR_OCCURRENCES */', (ROOT/'source/editor-occurrences.js').read_text())
javascript = javascript.replace('/* CODE_STRUCTURE */', (ROOT/'source/code-structure.js').read_text())
javascript = javascript.replace('/* EDITOR_COLOR_SPACING */', (ROOT/'source/editor-color-spacing.js').read_text())
javascript = javascript.replace('/* EDITOR_STRUCTURE */', (ROOT/'source/editor-structure.js').read_text())
javascript = javascript.replace('/* KEYBOARD_SHORTCUTS */', (ROOT/'source/keyboard-shortcuts.js').read_text())
javascript = javascript.replace('/* TAB_SCROLLING */', (ROOT / 'source/tab-scrolling.js').read_text())
javascript = javascript.replace('/* TAG_FEATURES */', (ROOT / 'source/tag-features.js').read_text())
javascript = javascript.replace('/* MENU_CONTROLS */', (ROOT / 'source/menu-controls.js').read_text())
javascript = javascript.replace('/* WINDOW_FEATURES */', (ROOT / 'source/window-features.js').read_text())
javascript = javascript.replace('/* TAB_TRANSFER */', (ROOT / 'source/tab-transfer.js').read_text())
javascript = javascript.replace('/* LIVE_TAB_DRAG */', (ROOT / 'source/live-tab-drag.js').read_text())
javascript = javascript.replace('/* FILE_FEATURES */', (ROOT / 'source/file-features.js').read_text())
javascript = javascript.replace('/* FILE_FOLDERS */', (ROOT / 'source/file-folders.js').read_text())
javascript = javascript.replace('/* FILE_REFRESH */', (ROOT / 'source/file-refresh.js').read_text())
javascript = javascript.replace('/* EDITOR_TOOLS */', (ROOT/'source/editor-tools.js').read_text())
javascript = javascript.replace('/* EDITOR_WORKER_CLIENT */', (ROOT/'source/editor-worker-client.js').read_text())
javascript = javascript.replace('/* CODE_INTELLIGENCE */', (ROOT/'source/code-intelligence.js').read_text())
javascript = javascript.replace('/* EDITOR_COMPLETIONS */', (ROOT/'source/editor-completions.js').read_text())
javascript = javascript.replace('/* EDITOR_COLORS */', (ROOT/'source/editor-colors.js').read_text())
javascript = javascript.replace('/* COLOR_PICKER */', (ROOT/'source/color-picker.js').read_text())
javascript = javascript.replace('/* SYMBOL_REFERENCES */', (ROOT/'source/symbol-references.js').read_text())
javascript = javascript.replace('/* EDITOR_LINKS */', (ROOT/'source/editor-links.js').read_text())
javascript = javascript.replace('/* FILE_DROPS */', (ROOT / 'source/file-drops.js').read_text())
javascript = javascript.replace('/* FILE_CLOSING */', (ROOT / 'source/file-closing.js').read_text())
javascript = javascript.replace('/* SEARCH_FEATURES */', (ROOT / 'source/search-features.js').read_text())
html = html.replace('/* SEARCH_WORKER */', (ROOT/'source/symbol-index.js').read_text()+'\n'+(ROOT / 'source/search-worker.js').read_text())
html = html.replace('/* APP_JS */', javascript)
standalone=html
native=html
for name,data in workers.items():
    marker='/* '+name.upper()+'_WORKER_BASE64 */'
    standalone=standalone.replace(marker,base64.b64encode(data).decode('ascii'))
    native=native.replace(marker,'')
    (ROOT/'fedora'/f'{name}-worker.js.gz').write_bytes(data)
for target in [ROOT / 'dist/index.html', ROOT / 'dist/Vista-Notes.html', ROOT / 'dist/Another-Note.html',ROOT/'dist'/('Another-Note-'+VERSION+'.html')]:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(standalone, encoding='utf-8')
(ROOT/'fedora/Another-Note.html').write_text(native,encoding='utf-8')
print(f'Built standalone HTML ({len(standalone.encode()):,} bytes) and native editor page ({len(native.encode()):,} bytes).')
