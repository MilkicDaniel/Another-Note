# Another Note

A local text and code editor, available as a standalone HTML file and desktop apps for Fedora and Windows. Files and unsaved drafts are kept locally between sessions.

## Downloads

- **HTML:** open [Another-Note-2026.10.29-r9.html](https://github.com/MilkicDaniel/Another-Note/releases/download/2026.10.29-r9/Another-Note-2026.10.29-r9.html) in your browser.
- **Windows:** run [Another-Note-Setup-2026.10.29-r6.exe](https://github.com/MilkicDaniel/Another-Note/releases/download/2026.10.29-r6/Another-Note-Setup-2026.10.29-r6.exe), or extract [Another-Note-Windows-2026.10.29-r6.zip](https://github.com/MilkicDaniel/Another-Note/releases/download/2026.10.29-r6/Another-Note-Windows-2026.10.29-r6.zip) and run `Another-Note.exe` inside it. This is build r6; Windows builds are published on request. Close all app windows before updating.
- **Fedora:** extract [Another-Note-Fedora-2026.10.29-r9.zip](https://github.com/MilkicDaniel/Another-Note/releases/download/2026.10.29-r9/Another-Note-Fedora-2026.10.29-r9.zip) and run `python3 install.py` inside the extracted folder. Close all Another Note windows before updating.

[Current release, source archive and checksums](https://github.com/MilkicDaniel/Another-Note/releases/tag/2026.10.29-r9).

Every downloadable file includes its build number, including source ZIPs and checksum lists. The application version is stored in `VERSION`. Internal source and installed runtime filenames remain stable.

See the [Windows instructions](windows/README.txt) and the [Fedora instructions](fedora/README.md) for dependencies, desktop integration, storage, and recovery details.

## Features

- Tabs with live reordering, scrolling, separate windows, and transfers between windows. Keep holding an incoming tab to choose its position before releasing it.
- Syntax coloring for Bash, JSON, Java, JavaScript, HTML, CSS, Python, and Markdown; local code suggestions and HTML closing tags.
- Find, replace, regex, selected-range replacement, Find All across open tabs, and name-based code usages. Ctrl+click jumps directly when there is exactly one other match.
- Syntax-colored minimap, matching-word highlights from a text selection, clickable color previews, and a full color picker.
- Manual tags, temporary folder filters, saved-file recents across windows, version checkpoints, undo/redo, and protected unsaved drafts.
- Ctrl+click website links or local file references; local images open in the default image application on desktop. Per-file line numbers and a final empty window that stays open.
- System, light, and dark themes; text zoom; optional per-file spelling; configurable 2, 4, or 8-space indentation and local code formatting.

**Ctrl+S** saves to the file's remembered disk location. Recovery saves retain drafts independently. Closing a modified file offers Save, Discard, and Cancel; discarding does not write the edits to disk.

Build **2026.10.26-r5** adds Preferences for theme, indentation, keyboard shortcuts and the personal dictionary. Help contains separate About and Third-Party Licenses dialogs. Shortcuts are editable and saved locally, with conflict detection, clearing and restore-defaults controls. Text selection uses the syntax layer for accurate vertical alignment. Clicking an HTML tag underlines its matching pair. Larger gutter arrows collapse or expand HTML elements, functions, braces, arrays, Python blocks, Bash blocks, and Markdown sections without changing file contents. Expanding a section opens all of its nested sections. View has controls for the current section or all sections; these shortcuts can also be reassigned. Fold state is kept per open file for the session. Navigation into hidden text expands its section, and copying or saving includes the full source. Spellcheck is immediately left of the minimap toggle in the upper-right corner; successful recovery is quiet in the footer. Check **Help → About** to confirm the installed build.

## Build

The checked-in offline editor tools are sufficient for the normal build:

```sh
python3 build.py
```

This generates the self-contained HTML files in `dist/` and the smaller Fedora page plus adjacent compressed workers in `fedora/`. Keep both worker files with the Fedora page when installing or packaging it.

Create versioned HTML, Fedora, source and checksum downloads:

```sh
python3 package_release.py
```

After building the same Windows version, add `--include-windows` to include its installer and portable ZIP. Release outputs go to `dist/`, or to the directory supplied with `--output`. Generated downloads are kept out of Git and can be attached to a GitHub release.

To rebuild the pinned third-party tools, follow [tooling/editor-vendor/README.md](tooling/editor-vendor/README.md). Third-party notices are included with both app versions.

## Checks

Run the JavaScript suites with Node.js and the Python suites with Python 3:

```sh
for check in checks/test_*.cjs; do node "$check" || exit; done
python3 -m unittest discover -s checks -p 'test_*.py'
```

The Fedora window tests use mocked GTK interfaces. Automated tests do not replace native GTK/WebKit or Windows/WebView2 visual testing.

## Windows build

The portable Windows package and single EXE installer are cross-built from pinned, checksum-verified Python and wheel distributions. Install Pillow for the build script and use Zig 0.14.1:

```sh
python3 windows/build_windows.py --zig /path/to/zig
```

The app shares `fedora/notebook_store.py` and `fedora/file_store.py`. Windows keeps recovery data in `%LOCALAPPDATA%\Another Note`, independently of its program folder.

## Build 2026.10.26-r6

Section collapse/expand arrows stay hidden until the pointer is over their line, including its line number or gutter. Only that line's arrow appears. Collapsed sections use the same behavior, and the arrow remains clickable when moving from the text into the gutter. Hover follows the displayed lines when scrolling, wrapping, resizing or changing folds. Keyboard focus also reveals a fold control, and the existing View commands and shortcuts remain available.

Updated deliveries include Fedora and standalone HTML. Windows versions are built only when requested.

## Build 2026.10.26-r7

Color preview squares have extra clear space on the left and right without changing source text or caret positions.

Saved files are checked for outside updates while the editor is active, and again when you return to its window. **Refresh File** loads the latest disk version; **Keep Current Changes** preserves your current text until you save. Escape keeps the current version. A kept version is marked modified against the disk copy. The same disk update is acknowledged once; a later update offers the choice again. Your own saves do not produce change prompts. Reloading rereads the file after your decision and retains a checkpoint of the replaced version. Newer edits, closed tabs, Save As changes and saves in progress are protected. Missing files and unreadable files never replace your text. In the HTML edition, monitoring requires a remembered file handle and granted read access.

On Fedora, Ctrl+clicking relative image links such as `href="./Images/icon.png"` resolves them from the saved source file's folder and opens the image with its default desktop application. Launch errors are displayed. The standalone HTML edition continues to use its isolated browser image view with folder/file access when required.

## Build 2026.10.27-r1

Color previews now have dedicated display-only space rather than sharing a single source whitespace character. The text, caret, wrapping, search and color hit areas use the same projection. Saving, copying, pasting, undo and file links continue to use original source positions; generated spaces never enter a saved file or copied source.

Fold arrows fade in and out over 140 ms. Hovering the 26-pixel fold gutter shows all its arrows; hovering an editor line shows only that line's arrow. Reduced-motion settings disable the fade.

Memory changes:

- Version-history caching has a shared soft budget of 16 MiB and four files. An open history viewer and unsaved checkpoints are protected from eviction. Closing History clears its source preview. Disk history retention is unchanged.
- Fedora automatic checkpoints send one snapshot to the native host and receive a small acknowledgment, avoiding repeated transfers of the entire history. Completed write queues release their references. Failed checkpoints remain recoverable.
- Closing tabs releases their undo data and code records. Undo also has a shared soft 64 MiB text budget while preserving at least one available step in each direction per file. Closing the last tab releases the editor's text/syntax/measurement DOM and caches.
- Idle formatting workers terminate after 60 seconds and load again when needed.

A controlled cache workload (eight files, twelve 256-KiB text versions each) retained about 24 MiB of JavaScript heap before and 6 MiB after garbage collection, roughly 75% less. This measures the history cache, not total process memory or WebKit's baseline. The editor, open files, spelling, rendering and active operations also use memory.

Fedora and HTML builds are supplied by default. Windows builds remain on request.

## Build 2026.10.27-r2

The minimap toggle uses a neutral gray icon and background for both hover and active states in light and dark themes. Its icon, location and toggle behavior remain the same.

Windows installer and portable builds are included for this release on request. They include the current display-only color spacing, fading fold controls with full-gutter hover, memory cleanup, outside-file Refresh/Keep choices, and compact version-history checkpoints. The Windows bridge advertises and handles the updated file-check/checkpoint protocol. Windows builds remain on request for future updates.

## Build 2026.10.27-r3

The hide/expand bar fades in and out as one group over 240 ms. Hovering any line with a fold button reveals all the buttons, including when hovering that line's number or a wrapped continuation. Hovering anywhere in the fold gutter also reveals the bar. The fade stays on the same container when its buttons are rebuilt after a fold, and keyboard focus reveals the full bar. Reduced-motion settings disable the animation.

Updated Fedora and standalone HTML editions are included. Windows builds remain on request.

## Build 2026.10.27-r4

Find, Replace and Find All accept multiline text. Paste a block or use Shift+Enter to insert a line break; the fields grow and shrink with their contents and adapt to window width. Large blocks scroll inside a bounded field so the editor remains reachable. Enter still finds the next match or replaces one match, and Ctrl+Enter in Replace still replaces all. Previous matches remain available through the up button or Shift+F3.

Multiline literal and regex searches support one-at-a-time replacement, Replace All, selection scopes and undo. Find All retains multiline queries copied from the inline bar and accepts short multiline editor selections. Arrow keys move within a multiline Find All query without jumping to the results list. Fedora and standalone HTML are updated; Windows builds remain on request.

Windows installer and portable packages for build 2026.10.27-r4 are also supplied on request, including multiline search and the whole-bar fold fade.

## Build 2026.10.27-r5

Windows installer and portable filenames include the build number. Windows loads a verified editor page with a different filename for each build, checks the page's build during startup, and asks you to close a different running build before opening the new copy. This prevents a new launch from silently reopening an older app. Multiline Find/Replace and all r4 editor changes are included.

## Build 2026.10.27-r6

Selected line breaks have a one-character highlight cell, making selected empty lines visible. A focused selection has an I-shaped caret at its active end. The current line number, row highlight and status-bar position follow that end for forward and backward selections, including wrapped rows. The indicators do not add characters to the file or clipboard. Undo, tab changes and window transfers preserve selection direction.

## Build 2026.10.28-r1

Launching the Fedora app again while it is running opens a separate window with one new blank tab. Existing windows and drafts stay open, and the first launch after closing the app still restores the previous session. The installed app icon has a **New Window** action for opening a window on the current GNOME workspace. GNOME can focus an existing window when its running icon is clicked normally; use **New Window** or Ctrl+click the icon to request another window. File launches continue to open their files in the existing app.

The Windows installer and portable package are also supplied for this build, including the new-window behavior on repeat launches. Future Windows builds remain on request.

## Build 2026.10.28-r2

New Windows application windows open near the mouse on the monitor where you launched them. The launch position is captured before startup and passed to the running instance on repeat launches. Placement uses physical coordinates and the selected monitor’s usable work area, including monitors left of or above the primary display and displays with different scaling. Windows are positioned before they appear; detached tabs keep their explicit drop placement. Existing windows are not repositioned by file-open requests.

## Build 2026.10.28-r3

Windows supplies explicit initial coordinates before the toolkit first shows a native window. It then verifies the actual monitor and bounds after the window appears, correcting placement if startup changed it. Initial coordinates account for the system display scale; final placement uses physical monitor coordinates. Detached tabs retain their drop position.

A small last-launch report is kept locally at `%LOCALAPPDATA%\Another Note\window-placement-2026.10.28-r3.json`. It contains window and monitor geometry and errors, with no note contents. Release checks now include real WinForms and packaged-app launches on a Windows runner. Physical multi-monitor hardware is unavailable in CI.

## Build 2026.10.28-r4

**File → Move All Tabs to This Window** gathers tabs from the other open app windows. It appends them in source order, retains the destination's current tab, and shows all tab tags. Draft text, disk bindings, cursor/selection and bounded undo history use the existing acknowledged transfer path. Identical existing tabs keep their position and local undo stack; conflicting edits, busy dialogs and failed transfers retain the original tabs. Empty source windows close after their tabs finish moving. The command also works between connected standalone HTML windows.

Windows now captures the physical pointer in the native EXE before Python startup and selects per-monitor DPI awareness before creating any editor windows. Three native message-loop checks over the first 800 milliseconds verify placement after Show/Activate and queued startup layout; intentional dragging or resizing cancels those checks. The versioned local placement report includes settled geometry and window DPI awareness. These changes address additional startup paths; the reported physical second-monitor failure has not been reproduced on the single-display Windows runner.

Release validation covers delayed native placement and packaged Windows tab consolidation, drafts, tab order, selection and undo/redo. Fedora's positioning behavior is unchanged.

## Build 2026.10.28-r5

**Preferences → Editor Appearance & Formatting…** opens a preview editor with Apply, Cancel and reset controls. Set colors for text, keywords, strings, numbers, comments, variables, functions, properties, operators and Markdown tokens. Light and dark app themes have separate palettes. Font family, regular/bold/italic style, size and line spacing use matching metrics for text, highlighting and caret measurement. Installed fonts are used locally, with a monospace fallback.

Formatting profiles are saved separately for JavaScript, Java, Python, HTML, CSS, JSON and Bash. Each has indentation, spaces/tabs and preferred line width. Java and JavaScript also support keeping/adding/removing control braces, compact or multiline if bodies, opening control-brace placement and else placement. Removing braces is limited to simple statements; declarations, comments and nested if blocks keep their braces. JavaScript adds quotes, semicolons, trailing commas, arrow parentheses and short-object wrapping. Python adds quotes/trailing-comma handling; HTML adds attribute and whitespace rules; Bash adds continuation, function-brace, case and redirection preferences.

Apply saves preferences without formatting or saving your source files. **Tools → Format File** applies the profile with one-step Undo; selected JSON formatting uses the JSON profile. Formatting preserves selection direction. The sample preview runs the same offline formatter as the file command. Preferences survive restart and stale saves from other windows, and live windows receive updated colors and fonts. An open dialog merges its changed fields into the latest received preferences.

HTML and Fedora downloads are provided. Checks cover all offline formatters, parser-based brace/layout changes, source behavior examples, recovery/persistence and a real Chromium preferences workflow. Native GTK and Windows visual tests were not performed for this build.

## Build 2026.10.28-r6

**Tools → Insert/Edit Table…** opens a table grid at the cursor, or reopens an existing Markdown/HTML table. Type into cells, resize the grid, add/delete rows and columns, choose a header row and column alignment, and review the **Preview** or **Source** tab. Tab moves between cells and adds a row at the end; Enter adds a line break inside a cell. Ctrl+Enter inserts/updates; Escape and Cancel keep the file unchanged. Inserting or updating is one undoable edit, and surrounding file text is retained. Existing unchanged tables keep their exact source; unchanged Markdown cell markup and common HTML table/row/cell attributes are retained when updating other cells.

**Tools → Paste Table…** accepts web/spreadsheet HTML, Markdown, quoted CSV, semicolon-separated data and TSV. Paste a cell rectangle into an existing grid to fill its cells and expand its dimensions. Multiline cells, quotes, pipes, empty cells and Unicode text are retained. Merged cells expand into individual cells with their value in the upper-left cell; the editor reports that conversion. Clipboard markup is read in an inert template, and previews show cell text without running pasted scripts or loading images.

Rich table pastes at blank lines in text/Markdown notes open the grid for review. Tab-separated rows also do this at blank Markdown lines. **Paste Text Instead** preserves the original clipboard text. Ordinary code pastes, Markdown code fences, pastes inside prose and Ctrl+Shift+V keep normal text behavior. Copy Cells exports TSV. A file change in another window while the dialog is open blocks a stale update and retains the editable grid for copying.

The main editor keeps portable Markdown, HTML, CSV or TSV source; use the table dialog to edit or preview the cell layout. File type, saved bindings and line endings remain unchanged. The grid supports up to 200 rows, 40 columns, 4,000 cells and 2 MiB of cell text. Larger pastes can stay as text. HTML and Fedora downloads are provided; all r5 preferences are included.

## Build 2026.10.28-r7

**Preferences → Editor Appearance & Formatting… → Themes** has separate **Dark mode theme** and **Light mode theme** choices. **Follow System** switches between those saved choices automatically. Each preset includes editor, syntax, menu, tab and status colors, with a preview before Apply.

Dark presets: Dracula, Eva Dark, Panda Syntax, Nord, One Monokai, Atom One Dark, Field Lights, ReUI, Visual Studio 2017 Dark (C/C++), and GitHub Dark. Light presets: PowerShell ISE, Atom One Light, Bluloco Light, Grey Light+ Pro, GitHub (Thomas Pink), and Quiet Light for VSC. Another Note's original light and dark themes remain available. The presets adapt the linked VS Code palettes to Another Note's syntax categories and interface; extension features and language-specific scope distinctions are not imported.

Use the mode menu above the preview to view and edit either mode, then change colors on the **Colors** tab. Enter a name on the **Themes** tab and use **Save as New Theme** to add it to **My themes**. Saved themes can be selected, updated, renamed with **Update Saved Theme**, or deleted. **Apply** saves both choices and the theme library locally; Cancel discards the preview. **Restore defaults** keeps My themes. Font and formatting preferences remain separate. Existing custom colors are retained when updating the app.

All themes work offline, persist through restart and use the existing preference synchronization between windows. Theme changes retain source and clipboard text, selection direction, folds and undo history. Theme source versions, palette checksums, mapping code and license notices are included; see [theme sources](tooling/theme-vendor/README.md). HTML and Fedora downloads are provided. Windows builds remain on request. Native GTK and Windows visual testing was not performed for this build.

## Build 2026.10.29-r1

Subtle vertical dividers separate neighboring tabs, using the current theme's border color. The first visible tab has no leading divider. Dividers stay with the tab strip during reordering and do not change tab widths or intercept clicks. HTML and Fedora downloads are provided; Windows builds remain on request.

## Build 2026.10.29-r2

Tab dividers use shorter, rounded strokes with soft ends and a gentler tint of the theme's **Borders** color. Dividers fade beside active, hovered and keyboard-focused tabs, giving the selected tab a clean outline. Reduced-motion settings disable the fade. Tab sizes, click areas, dragging and scrolling retain their existing behavior. HTML and Fedora downloads are provided; Windows builds remain on request.

## Build 2026.10.29-r3

The tab strip follows the supplied reference: flat inactive tabs form a continuous row, with taller, solid vertical separators between them. The selected tab has rounded top corners and curved lower corners that join the strip. Separators stay visible on hover and keyboard focus, and stay hidden beside the selected tab. Colors follow the existing theme settings, including **Borders**, **Inactive tabs** and **Active tab**. Tab sizes, click areas, dragging and scrolling retain their existing behavior. HTML and Fedora downloads are provided; Windows builds remain on request.

## Build 2026.10.29-r4

Longer files open with less display work. Syntax highlighting and fold arrows are drawn around the visible lines, with extra lines above and below for scrolling. Multiline syntax, selections and spelling marks retain their context across the displayed area. The native editor still holds the complete file, including folded text; saving, copying, search, undo, selection direction and display-only color spacing retain their behavior. Fold state stays available for the whole file, and a focused fold control stays focused while scrolling.

On this machine, five alternating native GTK/WebKit launches per build with a synthetic session of 105 saved files, eight open tabs and a 105,000-character active HTML file improved median time to the first painted editor from **1.59 s to 1.23 s** (about **23%**). The window presentation request improved from **1.03 s to 0.69 s**. Three empty-session runs per build stayed around **1.01 s**. These measurements use fresh temporary application caches without clearing OS disk caches; actual launch time depends on the restored files, hardware and desktop session.

All JavaScript and Python suites pass, along with Chromium checks for large-file scrolling, wrapping, Unicode, folds, clipboard text, keyboard focus, native edits, undo, tab switching, font changes and themes. Native GTK/WebKit startup and scroll-alignment checks use isolated synthetic notebooks. Windows visual testing was not performed; Windows builds remain on request. HTML and Fedora downloads are provided.

Reproduce the native measurements with the packaged Fedora page built first:

```sh
python3 checks/benchmark_startup.py --scenario session --runs 5
python3 checks/benchmark_startup.py --scenario session --runs 1 --verify-scroll
python3 checks/benchmark_startup.py --compare /path/to/previous-build --scenario session --runs 5
```

The benchmark uses a separate app identity and temporary data, config and cache directories. It does not open or modify your notebook. `--profile` adds diagnostic JavaScript timings; leave it off when comparing launch times. The large-file Chromium check is `node checks/editor_startup_browser.cjs`, with optional `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` settings.


## Build 2026.10.29-r5

Native startup restores the open tabs first and loads closed files, Trash and removed-file records after the editor's first paint. Every restored tab is visible and usable immediately. The native host retains the complete validated notebook throughout; the smaller initial bridge response never replaces the stored notebook. Initial recovery serialization and saving also wait until after the first paint. Whole-workspace actions and closing wait for any remaining files. Background loading retains edits, undo, folds, cursor direction, tab order, recent files and saved-file baselines. If loading fails, partial saves are blocked and a later operation can retry.

On this machine, five alternating GTK/WebKit launches per build with the same synthetic 105-file, eight-tab session used for the previous benchmark improved median time to the first painted editor from **1.238 s to 1.209 s**, about **2%** beyond build r4. Window presentation requests improved from **0.694 s to 0.676 s**. Three empty-session runs per build measured **0.995 s and 1.036 s**; this change targets restored notebooks, and native WebKit initialization still takes most of the launch time. Measurements use fresh temporary application caches without clearing OS disk caches. They are workload and machine dependent.

The hide/expand controls now fade in when the pointer enters their gutter. Hovering a source row, its wrapped continuation or its line number leaves them hidden. Keyboard focus continues to reveal the controls. Native startup uses a black WebView background and a black page before saved appearance settings arrive, including when the system is light but the app is dark. The saved appearance is applied before the window is presented.

All 43 JavaScript suites and 196 Python tests pass. Delayed-load checks cover usable restored tabs, edits during loading, backward selections, folding, undo, complete recovery journals, failed or invalid loads and retries. Chromium checks cover startup colors, gutter hover, large-file scrolling, themes and preferences. Native GTK/WebKit startup and scroll-alignment checks use temporary synthetic notebooks. Run `node checks/editor_lazy_startup_browser.cjs` for the delayed native-bridge browser check, using the optional browser settings described above. Native Windows visual testing was not performed; Windows packages remain on request. Updated HTML and Fedora downloads are included.


## Build 2026.10.29-r6

Desktop files that are closed in every window now retain a display name and a reopening link instead of their text, saved-text copy, assigned tags and version history. The link also carries the identity, dates and language needed for safe workspace merging and reopening. Existing clean closed files with readable disk locations are converted when the notebook loads. Closed links remain in Open Saved File and Recently Closed Files; their contents are read from disk only when opened or included in a backup.

Files in open tabs keep their full contents, tags, history, saved-file baselines and recovery behavior. This includes files that are open in another window and tabs retained for restoration when the last window closes. Closing another file preserves the active file's native text, folding, backward selection and undo. A reopened file starts a fresh local history; delayed checkpoints from before its closure cannot restore its previous history.

Untitled drafts, documents without a remembered disk location, closed documents containing unsaved recovery text, unavailable disk files and Trash retain their recovery copies. The original disk files are not changed by compaction. Portable backups read linked contents without opening tabs; an incomplete backup containing only file links is rejected before import. The standalone HTML edition keeps its existing browser storage behavior.

All 43 JavaScript suites and 206 Python tests pass. The browser regression `node checks/editor_closed_files_browser.cjs` verifies link-only records, preserving open-tab text/tags/history/undo/folds/selection, reopening current disk text, fresh tags and portable backups. Native GTK/WebKit verification with 105 temporary disk files retained the eight open files and compacted 97 closed files, completed a recovery save and checked scroll alignment. Reproduce it with `python3 checks/benchmark_startup.py --scenario linked-session --runs 1 --verify-scroll`; the linked-session probe includes a recovery flush and is intended for correctness verification. Windows host protocol tests pass; native Windows visual testing was not performed and Windows packages remain on request. Fedora and HTML downloads are updated.


The requested Windows installer and portable ZIP for build **2026.10.29-r6** are also supplied. Publication runs the regression suites, verifies the package hashes and embedded installer payload, and checks actual packaged launches, native placement and tab consolidation on a Windows runner. The runner has one display; physical dual-monitor and mixed-DPI hardware testing is not available. Adding Windows downloads preserves the existing published HTML, Fedora and source downloads and extends their checksum list.


## Build 2026.10.29-r7

The table editor and Preview use a flat grid with clearer thin borders, more cell spacing and column widths based on their contents. The existing font family, size, weight and style are retained. Safe web/email links in table cells appear as links in Preview; pasted scripts and images are not rendered, and source text is kept intact.

Click a column letter in Edit Cells, a heading in Preview, or **Select Column** to select a whole column. **Ctrl+Space** also selects the focused column. Click a cell and **Shift-click** another row to select a range in that column; the range stays in its starting column even if the final click is in a neighboring column. Shift+Up/Down extends an existing range, and Preview cells also support starting a range with those keys. **Copy Column**, **Copy Selection** or **Ctrl+C** copies only the selected cells as tab-separated values. Normal text selections inside a cell retain native copy behavior. Escape clears a column selection; Escape again closes the dialog. Source view retains normal source selection.

Selection and copying do not modify the note or its saved table source. Apply remains one undoable edit, and Cancel retains the original source and backward caret selection. Single-column CSV/TSV copies preserve empty cells, quoted values, whitespace, embedded line breaks and Unicode. The grid supports wide tables and smaller windows without changing font preferences.

All 43 JavaScript suites and 210 Python tests pass. `node checks/editor_table_columns_browser.cjs` verifies the layout, unchanged regular and custom fonts, column/range copying, keyboard navigation, safe previews, exported alignment, source preservation and narrow layouts with browser and simulated native clipboard bridges. The existing table insertion/paste/undo browser regression also passes. Native GTK/Windows visual testing was not performed for this build. Local HTML and Fedora artifacts are generated with `python3 package_release.py`; published downloads above remain at r6 until this build is published. Windows builds remain on request.

## Build 2026.10.29-r8

Tables now appear as bordered grids in the main note area, including Markdown tables in plain text notes. Headers are centered, cells have consistent padding, and inline code uses subtle backgrounds. Your editor font, size, weight and style are retained. Notes containing fenced table examples keep those examples as source. Code documents stay in the source editor.

Click a column heading to select that column, or click a cell and Shift-click another row to select a vertical range in the same column. Ctrl+C copies only those cells as spreadsheet-compatible text. Double-click a cell or right-click and choose **Edit Table** to change it. **Edit Source** returns to the original editable Markdown/HTML; **Table View** restores the grid. Source text, selections, folding and undo are preserved.

Right-click inside the note for Undo, Redo, Cut, Copy, Paste, Select All and **Add Table…**. Table cells also offer column selection and column/table copying. Shift+F10 opens the same menu from the keyboard. **Add Table** inserts a new table without replacing the table under the pointer. Clipboard failures and changes made while a paste is pending never discard edits or paste into another tab.

This build is included in the r9 release. Browser checks cover the main table view, source switching, columns, right-click actions, exact saved text, unchanged custom fonts, undo, small windows, clipboard failures and paste races. Desktop bridge checks use isolated browser/mocked host fixtures; these do not constitute native Windows or GTK visual testing.

## Build 2026.10.29-r9

**Preferences → Editor Appearance & Formatting…** now has four tabs: **Themes**, **Colors**, **Font** and **Formatting**. The tabs use a plain underline for the selected tab instead of a boxed outline.

The preview is a small copy of the app: menu bar, tabs, editor with line numbers, current line, text selection, text cursor and search matches, a panel with input, button, link, selected/hover items, code block, success and error text, and the status bar. Syntax colors the chosen sample language does not use appear in an **Other files** row, so every color setting is visible. The preview updates while you type or drag.

Click any part of the preview to open the **Colors** tab at that setting. Its row is highlighted, scrolled into view and opened in the color picker, and the matching preview parts are outlined. Hover the preview to see which setting a part uses. Click near a border to edit **Borders** or **Subtle borders**.

Colors are grouped as Syntax, Markdown, Editor, Tabs, Menu & status bars, Panels & controls, and Text & accents. Each row has a swatch and a HEX field. The swatch opens an in-app picker with a saturation/brightness area, hue slider, colors from the current theme, **Revert**, and keyboard control. This replaces the platform color dialog, which did not work reliably in the Fedora app. Escape closes the picker without closing Preferences.

Three new colors are available: **Text cursor**, **Search matches** and **Inactive tab text**. Existing themes and saved colors derive them from the editor text, the default search highlight and secondary text, so current themes remain unchanged and are not marked as modified.

All 43 JavaScript suites and 212 Python tests pass. `node checks/editor_theme_preview_browser.cjs` verifies that every color appears in the preview. It also checks click-to-edit for text, marks, borders and interface parts; live picker changes; revert, swatch and keyboard use; the new colors after Apply; and narrow layouts. The existing theme, preferences and startup browser checks also pass. These checks ran in Chromium. The Fedora GTK/WebKit window (WebKitGTK 6.0 2.54) was also tested with real mouse and keyboard input through XWayland, using a temporary notebook. That test covered the picker area, hue slider, theme swatches, Escape, clicking preview parts, typed HEX values, the Font tab, Apply and the underline-only tab focus. Rerun it with `python3 checks/editor_theme_preview_gtk.py` after `python3 build.py`. It opens a visible window, needs `xdotool`, and saves snapshots when `QA_SCREENSHOTS` is set. Windows visual testing was not performed.

## Build 2026.10.29-r10

The window title no longer starts with a dot when a file has unsaved changes. The tab still shows the unsaved marker.

The theme preview now shows an open **Preferences** menu from the menu bar. It covers the dropdown background, border, divider, hovered item, checked item and shortcut text, plus the highlighted menu-bar entry. Click any part of the menu to edit its color, or click its border to edit the border color. The **Menu** button above the preview hides the menu if it covers code you want to click.

All 43 JavaScript suites and 212 Python tests pass, along with the Chromium theme preview, theme, preferences, startup, table and closed-file checks. `python3 checks/editor_theme_preview_gtk.py` passed in the Fedora GTK/WebKit window with real input, including a click on the open menu. Windows visual testing was not performed.

## Build 2026.10.29-r11

Dropdowns in **Editor Appearance & Formatting** now use the app's own menu style. They have the same field look as the text boxes, and the theme list shows **Built-in themes** and **My themes** headings. Escape closes an open dropdown without closing the dialog.

**Font family** is now a dropdown of monospace fonts installed on the computer, with **System monospace (default)** first. A previously typed font that is not installed stays selected and is marked "(not installed)".

On Windows, the WebView2 Runtime message now appears only when the window engine itself fails to start. Opening a new window while the last one is still closing used to show this message by mistake. Now the app waits for the old process to finish and then opens normally. A failed request between windows no longer stops later new-window requests from working.

All 43 JavaScript suites and 216 Python tests pass, along with the Chromium theme preview, theme, preferences, startup, table and closed-file checks. `python3 checks/editor_theme_preview_gtk.py` passed in the Fedora GTK/WebKit window with real input, including opening the font dropdown, choosing a font and closing a dropdown with Escape. The Windows launcher changes are covered by unit tests with a mocked host; Windows visual testing was not performed.

## Build 2026.10.29-r12

Dropdown lists now use the theme's **Hover** color for the item under the pointer or keyboard focus. **Selected items** stays on the checked current choice and on an open dropdown's button, so the two are no longer the same color. This applies to every app dropdown, including the preview's mode and language lists.

All 43 JavaScript suites, 216 Python tests and the Chromium browser checks pass. The theme preview check confirms that hovered items use the Hover color and the current item keeps the Selected color.

## Build 2026.10.29-r13

The Fedora title bar now follows the editor theme instead of the desktop setting. With **Dark** or **Light** chosen in the theme menu, GTK uses that mode for the window and its buttons. The title bar takes the theme's menu bar color and text color, so a dark theme stays dark during a light desktop day. **System** keeps following the desktop.

**Insert Table** now uses the theme throughout. Its **Insert as**, **Separator** and **Column alignment** lists use the app's dropdowns. The number fields no longer show GTK spin buttons; use the arrow keys to step values. The checkbox and tool buttons use theme colors, and the view tabs have a straight underline instead of a focus box. Checkboxes elsewhere in the app also use theme colors.

All 43 JavaScript suites and 218 Python tests pass, along with the Chromium browser checks. `python3 checks/editor_theme_preview_gtk.py` passed in the Fedora GTK/WebKit window with real input. It now also compares the real title bar's pixels and label color with the menu bar in both Dark and Light, and checks the table dialog's controls. Windows visual testing was not performed.
