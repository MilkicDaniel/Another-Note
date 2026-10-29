Another Note for Windows (64-bit)

INSTALL
Run Another-Note-Setup-2026.10.29-r6.exe. It installs for your user account and adds Another Note to the Start menu. Close all app windows before installing an update, including copies started from a portable folder.

PORTABLE PACKAGE
Extract the entire Another-Note-Windows-2026.10.29-r6.zip into a new folder, then run Another-Note.exe inside the extracted folder. Keep its runtime folder and every accompanying file together. Python is included privately; a system Python installation is not required.

REQUIREMENTS
Windows 10 or Windows 11, x64. Microsoft Edge WebView2 Runtime and .NET Framework 4.8 are required. They are normally present on current Windows installations. Official WebView2 download:
https://developer.microsoft.com/microsoft-edge/webview2/

FILES AND RECOVERY
Workspace, unsaved drafts, personal dictionary, file locations and version checkpoints are stored under:
%LOCALAPPDATA%\Another Note\

Updating or moving the application does not delete that data. Ctrl+S saves the active file to its remembered disk location. Discarding changes does not write those edits to disk. Closing the last window preserves drafts for the next launch.

FEATURES
The Windows app uses the same editor as the HTML and Fedora versions, including syntax coloring, find/replace/regex, Find All, tags and folder filters, minimap, selected-word matches, code formatting, spellcheck, and the color picker. Drag tabs to reorder them, carry them into another window, or release away from the editor to create a window. Keep holding an incoming tab to choose its insertion position. Escape cancels a drag. File drops open files from Explorer. Passing file paths to Another-Note.exe opens them in the existing app instance.

REMOVING THE PROGRAM
Delete the extracted portable folder, or the installed program folder at %LOCALAPPDATA%\Programs\Another Note and its Start menu shortcut. Your recovery data remains in %LOCALAPPDATA%\Another Note.

BUILD STATUS
This Windows build is cross-built on Linux. Editor/backend and package checks are followed by native WinForms and packaged-app placement checks on a Windows runner. Physical dual-monitor and mixed-DPI hardware is not available on that runner.

THIRD-PARTY SOFTWARE
See THIRD_PARTY_LICENSES.txt, runtime/LICENSE.txt and the license files beside each bundled Python package. The application uses the system WebView2 Runtime rather than bundling a separate browser.

EDITOR UPDATES
View > Line Numbers for This File toggles the gutter independently for each file.
The final window stays open when its last tab is closed. Extra empty windows close.
Ctrl+click website links to open the default browser, or local references (CSS, JS,
HTML, etc.) to open them in Another Note. Relative links use the saved source folder.
Existing tabs and their unsaved edits are preserved.

BUILD 2026.10.26-r3
The tab bar moves the actual held tab with a separate slot placeholder. Editor
scrollbars are separate controls with the arrow cursor. Ctrl+click a function
name to jump directly when there is only one other match. Multiple matches
open the usages list. Local image links use the default Windows image app.
Recents only lists saved files closed in all editor windows. Version History
has a heading close button, and the minimap toggle is in the upper-right menu
corner. Help > About shows this build identifier.

BUILD 2026.10.26-r4
Preferences > Keyboard Shortcuts, Help > About and Third-Party Licenses open
separate dialogs. Click a shortcut to record new keys; clear it with Backspace
or the X control, or use Reset / Restore All Defaults. Changes persist locally,
update menu labels and survive saves from other open windows. Conflicts are
reported before a binding changes.

Selections are painted with the syntax text for correct vertical alignment.
Click an HTML tag to underline its matching opening/closing tag. Gutter arrows
collapse and expand tags, functions, brace/array blocks, Python/Bash blocks,
and Markdown sections. View includes current-section and all-section controls.
Default keys: Ctrl+Shift+[ / ] for a section, Ctrl+Alt+Shift+[ / ] for all.
Folding changes only the display. Save and Copy retain hidden source; search
navigation reveals it. Each open file keeps its fold state for the session.

BUILD 2026.10.26-r5
Preferences groups theme, tab size, keyboard shortcuts and the personal dictionary.
File groups file management, pinning and tags. Edit groups editing and spelling;
View contains display/zoom/folding, Tools contains code helpers, and Help has
About and third-party licenses. The spelling toggle is immediately left of the
minimap toggle in the upper-right corner. Successful recovery stays quiet in
the footer; automatic recovery and error reporting continue.

Fold arrows are larger. Expanding a parent also expands every nested section,
including children folded before the parent. Other sections keep their state.

BUILD 2026.10.27-r2
The minimap toggle uses a neutral gray highlight in both themes. This package
also includes the recent Fedora/HTML editor updates: dedicated display-only
space for color boxes, fading fold arrows and full-gutter hover, memory cache
limits, closed-tab cleanup and idle formatter release.

When a saved file changes outside the app, choose Refresh File to reload or
Keep Current Changes to retain the editor version. The same choice appears
when reopening a changed file. Kept text is marked modified against the disk
copy. Reloading retains a checkpoint and protects newer concurrent edits.

Automatic checkpoints send one version and receive a small acknowledgment;
older history stays on disk. The history cache has a shared soft 16 MiB/four-file
budget, with open History views and unsaved checkpoints protected. Save/Copy
use original source positions and do not include generated color-widget spaces.

BUILD 2026.10.27-r4
Find, Replace and Find All accept multiple lines. Paste a block or press
Shift+Enter for a new line. The fields expand and shrink with their contents;
large blocks scroll inside the field. Enter finds the next match or replaces
one match. Ctrl+Enter in Replace applies Replace All. Shift+F3 or the up button
finds the previous match. Literal and regex multiline replacement, selection
scopes and undo are supported.

The entire hide/expand bar fades in and out together over 240 ms. Hover any
line with an arrow, its line number, or the fold gutter to reveal all buttons.
Reduced-motion settings disable the fade. The minimap highlight stays gray.

BUILD 2026.10.27-r5
Download filenames include the exact build number. Help > About displays the
same build number as the package. It includes multiline Find/Replace.
Windows loads a separate editor page for each build and verifies the page
before opening it. An older cached page cannot become the current editor.

If another build is already running, launching this copy asks you to close all
Another Note windows instead of silently switching to that older copy. Save
or keep your drafts when closing, then start this build again. Updating does
not delete workspace recovery or version history.

BUILD 2026.10.27-r6
Selected line breaks show a one-character highlight cell, including empty lines.
While the editor has focus, an I-shaped caret marks the active selection end.
The current line number, row highlight and status position follow that end,
including backward selections and wrapped rows. These marks do not change
saved or copied text. Undo, tab changes and window transfers retain direction.
Help > About should display 2026.10.27-r6.

BUILD 2026.10.28-r1
Opening Another Note again without file arguments creates a new window with
one blank tab. Existing windows and drafts stay open. The first launch after
closing the app still restores its previous session. File arguments continue
to open in the existing app. Help > About should display 2026.10.28-r1.

BUILD 2026.10.28-r2
New app windows open near the mouse on the monitor where you launch them,
including repeat launches. Placement keeps the window inside that monitor's
usable area and supports monitors left of or above the primary monitor and
mixed display scaling. The launch position is remembered while the editor
loads. Moving a detached tab keeps its drop placement. Opening files in an
existing window does not reposition that window. Help > About shows 2026.10.28-r2.

BUILD 2026.10.28-r3
The mouse-monitor position is supplied at native window creation and checked
again after showing the window. If startup changes the position, the host
corrects it. A last-launch report with window/monitor geometry is written to:
%LOCALAPPDATA%\Another Note\window-placement-2026.10.28-r3.json
It contains geometry and errors without note contents. Help > About shows r3.

BUILD 2026.10.28-r4
File > Move All Tabs to This Window collects tabs from other app windows in
order, retaining drafts, file bindings, selections and undo history. Existing
tabs keep their order and the current tab stays selected. Empty source
windows close. Busy windows and failed/conflicting moves keep their tabs.
The EXE captures the physical pointer before Python starts. The Windows host
selects per-monitor display scaling before creating its windows and rechecks
placement from the native message loop for the first 800 milliseconds.
Dragging or resizing cancels those remaining startup checks. The last report
now includes settled geometry and DPI mode:
%LOCALAPPDATA%\Another Note\window-placement-2026.10.28-r4.json
Physical multi-monitor hardware remains untested. Help > About shows r4.


BUILD 2026.10.29-r6
Includes the 16 offline theme presets, independent light/dark theme choices and
saved custom themes. Tab dividers and the selected-tab shape follow the theme.
Startup restores open tabs first and limits large-file display work to visible
lines. Fold controls appear on gutter hover, with keyboard access retained.
Native startup uses a black background while appearance settings load.

Clean disk-backed files closed in every window retain a reopening link instead
of text copies, assigned tags and version history. Reopening reads the current
disk file. Open tabs retain their text, tags, history, undo and recovery. Drafts,
unsaved recovery text, unavailable files and Trash keep their recovery copies.
Closing the final window still retains its open tabs for restoration.
