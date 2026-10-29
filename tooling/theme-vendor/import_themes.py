#!/usr/bin/env python3
"""Map published VS Code theme color data to Another Note's offline presets.

Input: a directory of extracted, versioned extensions, each with selected.json
containing extension, version, label, mode, theme and packageUrl. No extension
code is executed. The output retains only color values and source attribution.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
THEMES = [
    ('dracula', 'Dracula', 'dracula-theme.theme-dracula', 'dracula-theme'),
    ('eva-dark', 'Eva Dark', 'fisheva.eva-theme', 'eva-dark'),
    ('panda', 'Panda Syntax', 'tinkertrain.theme-panda', 'panda-syntax'),
    ('nord', 'Nord', 'arcticicestudio.nord-visual-studio-code', 'nord'),
    ('one-monokai', 'One Monokai', 'azemoh.one-monokai', 'one-monokai'),
    ('atom-one-dark', 'Atom One Dark', 'akamud.vscode-theme-onedark', 'atom-one-dark'),
    ('field-lights', 'Field Lights', 'sveggiani.vscode-field-lights', 'field-lights'),
    ('reui', 'ReUI', 'barrsan.reui', 'reui'),
    ('vs-2017-dark', 'Visual Studio 2017 Dark (C/C++)', 'ms-vscode.cpptools-themes', '2017-dark-visual-studio-c-c'),
    ('github-dark', 'GitHub Dark', 'GitHub.github-vscode-theme', 'github-dark'),
    ('powershell-ise', 'PowerShell ISE', 'ms-vscode.PowerShell', 'powershell-ise'),
    ('atom-one-light', 'Atom One Light', 'akamud.vscode-theme-onelight', 'atom-one-light'),
    ('bluloco-light', 'Bluloco Light', 'uloco.theme-bluloco-light', 'bluloco-light'),
    ('grey-light-pro', 'Grey Light+ Pro', 'elanzalaco.grey-light-plus-pro', 'grey-light-pro'),
    ('github-light', 'GitHub (Thomas Pink)', 'thomaspink.theme-github', 'github'),
    ('quiet-light', 'Quiet Light for VSC', 'onecrayon.theme-quietlight-vsc', 'quiet-light-for-vsc'),
]
SCOPES = {
    'keyword': ['keyword.control', 'keyword', 'storage.type', 'storage'],
    'string': ['string.quoted.double', 'string'],
    'number': ['constant.numeric', 'constant.language', 'constant'],
    'comment': ['comment.line', 'comment'],
    'variable': ['variable.other.readwrite', 'variable.other', 'variable', 'variable.parameter'],
    'command': ['entity.name.function', 'support.function', 'entity.name.command'],
    'property': ['variable.other.property', 'support.type.property-name', 'entity.other.attribute-name', 'meta.object-literal.key'],
    'operator': ['keyword.operator', 'punctuation'],
    'heading': ['markup.heading', 'entity.name.section'],
    'code': ['markup.inline.raw', 'markup.raw.inline', 'markup.raw', 'string'],
    'fence': ['markup.fenced_code.block', 'markup.raw.block', 'punctuation.definition.markdown', 'comment'],
    'emphasis': ['markup.bold', 'markup.italic', 'markup'],
}


def jsonc(text):
    # Preserve comment-like text inside strings and ignore JSONC trailing commas.
    text = re.sub(r'"(?:\\.|[^"\\])*"|//[^\r\n]*|/\*[\s\S]*?\*/',
                  lambda m: m[0] if m[0].startswith('"') else '', text)
    text = re.sub(r'"(?:\\.|[^"\\])*"|,\s*(?=[}\]])',
                  lambda m: m[0] if m[0].startswith('"') else '', text)
    return json.loads(text)


def color(value, background='#ffffff'):
    if not isinstance(value, str) or not re.fullmatch(r'#[\da-fA-F]{3,8}', value):
        return None
    value = value[1:]
    if len(value) in (3, 4):
        value = ''.join(c * 2 for c in value)
    if len(value) not in (6, 8):
        return None
    if len(value) == 8:
        alpha = int(value[6:], 16) / 255
        return mix(background, '#' + value[:6], alpha)
    return '#' + value.lower()


def mix(a, b, amount):
    return '#' + ''.join(f'{round(int(a[i:i+2],16)*(1-amount)+int(b[i:i+2],16)*amount):02x}' for i in (1, 3, 5))


def token(rules, candidates, fallback, background):
    for candidate in candidates:
        matches = []
        for index, rule in enumerate(rules):
            scopes = rule.get('scope', [])
            if isinstance(scopes, str):
                scopes = scopes.split(',')
            for scope in scopes:
                scope = scope.strip()
                # Prefer generic categories over language-specific context rules.
                if ' ' not in scope and (candidate == scope or candidate.startswith(scope + '.')):
                    value = color(rule.get('settings', {}).get('foreground'), background)
                    if value:
                        matches.append((len(scope), index, value))
        if matches:
            return max(matches)[2]
    return fallback


def project(theme, mode):
    ui = theme.get('colors', {})
    rules = theme.get('tokenColors', [])
    global_style = next((r.get('settings', {}) for r in rules if not r.get('scope')), {})
    bg = color(ui.get('editor.background') or global_style.get('background')) or ('#1e1e1e' if mode == 'dark' else '#ffffff')
    fg = color(ui.get('editor.foreground') or global_style.get('foreground'), bg) or ('#d4d4d4' if mode == 'dark' else '#24292e')
    def pick(keys, fallback, background=bg):
        return next((c for key in keys if (c := color(ui.get(key), background))), fallback)
    panel = pick(['sideBar.background', 'activityBar.background'], mix(bg, fg, .035))
    muted = pick(['descriptionForeground', 'sideBar.foreground'], mix(bg, fg, .63))
    accent = pick(['textLink.foreground', 'activityBarBadge.background', 'button.background'], '#72beed' if mode == 'dark' else '#086caf')
    selection = pick(['editor.selectionBackground', 'editor.inactiveSelectionBackground'], mix(bg, accent, .3))
    surfaces = {
        'paper': bg, 'panel': panel, 'raised': pick(['input.background', 'dropdown.background'], mix(panel, fg, .04), panel),
        'text': pick(['foreground'], fg), 'muted': muted,
        'line': pick(['panel.border', 'sideBar.border'], mix(bg, fg, .3)),
        'line-soft': pick(['editorGroup.border', 'tab.border'], mix(bg, fg, .15)),
        'accent': accent, 'hover': pick(['list.hoverBackground'], mix(panel, accent, .12), panel),
        'selected': pick(['list.inactiveSelectionBackground', 'list.activeSelectionBackground'], mix(panel, accent, .18), panel),
        'tabs': pick(['editorGroupHeader.tabsBackground'], panel),
        'active-tab': pick(['tab.activeBackground'], bg), 'inactive-tab': pick(['tab.inactiveBackground'], panel),
        'gutter': pick(['editorLineNumber.foreground'], muted),
        'active-line': pick(['editor.lineHighlightBackground'], mix(bg, fg, .04)),
        'code': pick(['textCodeBlock.background'], panel),
        'danger': pick(['errorForeground', 'editorError.foreground'], '#ef9393' if mode == 'dark' else '#b43939'),
        'good': pick(['gitDecoration.addedResourceForeground'], '#7ccaa2' if mode == 'dark' else '#367e62'),
        'chrome': pick(['titleBar.activeBackground'], panel), 'chrome-text': pick(['titleBar.activeForeground'], fg),
        'status': pick(['statusBar.background'], panel), 'status-text': pick(['statusBar.foreground'], muted),
        'selection': selection,
    }
    colors = {'text': fg}
    for key, scopes in SCOPES.items():
        colors[key] = token(rules, scopes, muted if key in ('comment', 'fence') else fg, bg)
    return {'colors': colors, 'surfaces': surfaces}


def generate(packages, output):
    catalog = []
    for id, name, extension, slug in THEMES:
        directory = packages / extension
        metadata = json.loads((directory / 'selected.json').read_text())
        raw = (directory / metadata['theme']).read_bytes()
        manifest = json.loads((directory / 'package.json').read_text())
        catalog.append({
            'id': id, 'name': name, 'mode': metadata['mode'],
            **project(jsonc(raw.decode('utf-8-sig')), metadata['mode']),
            'source': f'https://vscodethemes.com/e/{extension}/{slug}',
            'extension': extension, 'version': metadata['version'], 'path': metadata['theme'],
            'sha256': hashlib.sha256(raw).hexdigest(), 'packageUrl': metadata['packageUrl'],
            'author': manifest.get('author') or manifest.get('publisher'),
            'license': manifest.get('license'),
        })
    output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {len(catalog)} theme palettes into {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packages', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'source/vendor/editor-themes.json')
    args = parser.parse_args()
    generate(args.packages, args.output)
