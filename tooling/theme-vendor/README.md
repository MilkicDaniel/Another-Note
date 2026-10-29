# Offline theme palettes

`source/vendor/editor-themes.json` contains the 16 requested color palettes mapped to Another Note's syntax categories and interface variables. Each entry records the original extension identifier, published version, theme path, SHA-256 of the original theme file, exact versioned package URL, and the user's VS Code Themes link. PowerShell ISE was requested twice and appears once.

Normal builds read this checked-in data without network access. `build.py` embeds the palettes and `source/vendor/THEME_LICENSES.txt` into both editor editions, and combines theme and editor-tool notices for Fedora. Windows packaging uses the same combined notices when a Windows build is requested.

To reproduce a palette import:

1. Download the exact versioned `packageUrl` recorded in each palette entry. The downloads are VSIX ZIP archives; keep them outside the repository or in an ignored build directory.
2. Extract only each selected theme file, `package.json`, and its license notices into a directory named after the extension identifier. Preserve the original relative paths. No extension code needs to run.
3. Add `selected.json` in each extension directory containing `extension`, `version`, `label`, `mode` (`light` or `dark`), `theme` (relative file path), and `packageUrl`, using the recorded metadata. Check each raw theme file against its recorded SHA-256 before importing.
4. Run `python3 tooling/theme-vendor/import_themes.py /path/to/extracted-extensions`, review the resulting palette diff, then run `python3 build.py` and the theme checks.

The mapper reads JSON/JSONC data, expands shorthand colors, composites opacity over the editor background, and maps representative TextMate scopes to the editor's shared token categories. Missing interface colors use nearby colors from the same theme. This is a palette adaptation, not a VS Code theme engine. Fonts, grammars, extension code, semantic token behavior, and per-language scope distinctions are not included.

`source/vendor/THEME_LICENSES.txt` retains available license notices and source attribution. Bluloco Light's palette adaptations remain under LGPL version 3. Its original theme source is included in `upstream/bluloco-light.json`; the adapted palette and this mapping script are the corresponding modified source. Both LGPL version 3 and the incorporated GPL version 3 text are included in the app's theme notices. The source release supplies these files. Users can edit the embedded standalone palette or rebuild from source to replace it.

Checks:

```sh
node checks/test_editor_themes.cjs
node checks/editor_themes_browser.cjs
```

The browser check accepts `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE`, and `QA_SCREENSHOTS` for local test installations and versioned screenshots. It uses an isolated workspace and blocks external network requests.
