# Another Note

A local text and code editor, available as a standalone HTML file and desktop apps for Fedora and Windows. Files and unsaved drafts are kept locally between sessions.

## Downloads

- **HTML:** open `Another-Note-2026.10.28-r1.html` in your browser.
- **Windows:** run `Another-Note-Setup-2026.10.28-r1.exe`, or extract `Another-Note-Windows-2026.10.28-r1.zip` and run `Another-Note.exe` inside it.
- **Fedora:** extract `Another-Note-Fedora-2026.10.28-r1.zip` and run `python3 install.py` inside the extracted folder. Close all Another Note windows before updating.

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
