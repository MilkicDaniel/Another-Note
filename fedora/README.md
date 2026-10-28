# Another Note for Fedora

A compact tabbed editor for text, Bash, JSON, Java, JavaScript, HTML, CSS, Python and Markdown. It uses the blue pixel-art icon, system-themed native controls, and a single editing view. The editor opens before loading spelling and formatting tools.

## Install or update

Close the app before updating. Install the dependencies:

```bash
sudo dnf install python3-gobject python3-cairo gtk4 libadwaita webkitgtk6.0 desktop-file-utils shared-mime-info
```

Extract the complete ZIP and open a terminal in `another-note-fedora`, then run:

```bash
python3 install.py
```

Open **Another Note** from the applications menu, run `~/.local/bin/another-note`, or run `python3 launcher.py` from the extracted folder. Open a file from a terminal with `~/.local/bin/another-note /path/to/file.json`.

The Fedora package includes `spelling-worker.js.gz` and `format-worker.js.gz`. Keep them beside the HTML and launcher when running from the extracted folder; the installer copies them automatically. Their compressed data loads on demand and is cached across windows. Each window has its own workers. An empty file starts without either worker.

Updating keeps the workspace and replaces the previous app icon. The old launch command still works. Editor dropdowns match the app's theme; native file dialogs follow the system theme. **Preferences → Dark / Light / Follow System** changes the editor theme. The window appears after the editor has applied its saved or system theme, with a matching background to avoid a white startup frame.

This update shows only a compact tab while dragging. Its editor stays invisible until you release outside another editor window. Dropping over another window inserts the file there, and Escape cancels the move. Close all app windows, run the installer, then restart so the editor and native launcher update together.

Desktop drops now complete when GTK reports the release, including X11/XWayland desktop drops that never send a destination-finished notification. This fixes the floating tab remaining on screen and the original editor staying locked after release. In-app drops retain their normal destination confirmation; an unconfirmed drop keeps the original file.

This maintenance update reuses syntax colors and measured line positions to reduce scrolling, cursor and search work in larger files. Find now scrolls correctly through wrapped lines. Opening disk files from the desktop reads them in the background; a failed selection reports its error while the other selected files still open. Undo history has a soft 32 MiB text budget per file, retaining at least one step in each available direction, and tab transfers bound their recent undo data before copying it.

When a saved file changes on disk, Another Note asks whether to **Refresh File** or **Keep Current Changes**. Refresh loads the disk copy and keeps a version-history checkpoint of the text it replaces. Keep leaves your current text open and marks it modified against the latest disk copy. Reopening an existing file uses the same choice and keeps its tab identity and tags. Version-history writes merge checkpoints from other windows; opening history and exporting a backup refresh the stored list. Importing a backup also adds its checkpoints when the file already exists with identical contents. Close and restore actions keep newer edits if the contents change while the action is pending; a tag-only update does not interfere with closing.

If a browser recovery update conflicts with a draft you are editing, both versions are kept. Your draft opens as a separate file and asks for a destination when you save it.

## Files and tabs

Click a top menu to open it, then move the pointer over File, Edit, Find, View, Tools or Help to switch menus without clicking again.

- **Ctrl+N**, **+**, or double-click empty tab-bar space creates a file.
- **Drag files into a window** to open one or several files as tabs. You can drop over the editor, tab bar or native title bar. Files already open reuse their tabs; modified drafts are kept. Dropped files retain their save destinations. If the selected tag filter would hide an opened file, the window switches to All files. Failed selections report an error while other valid files open. In the HTML edition, browsers that expose file handles can remember the original destinations; other browsers ask where to save.
- **Ctrl+O / File → Open Files** opens disk files or imports a portable backup. Select several files with Ctrl-click or Shift-click; each opens in its own tab. Files already open reuse their tabs.
- Unnamed files use their first line of text as the tab and window title, updating as you type. Empty first lines show `untitled`. Saved filenames and names you choose are kept.
- Double-click a tab or press **F2** to rename it.
- Drag tabs to reorder them. Neighbors slide aside when the dragged tab reaches their halfway point, including when an incoming tab makes them narrower. Hold an incoming tab near either end of a crowded tab bar to scroll toward hidden tabs; move away from the edge to stop. Releasing freezes the insertion position. Escape cancels a drag.
- Drag a tab away from the tab bar to carry a compact tab containing its filename and unsaved indicator. The full editor is not shown while the mouse button is held. Move it over another Another Note window to see an incoming tab appear before you release. Keep holding the mouse button to slide the incoming tab along its tab bar; it follows the original grab point while neighbors slide aside. A small vertical slip below the bar still lets you place it. After choosing a position, dropping over the editor keeps that position. Entering the editor body first appends by default. Release away from an editor to keep the file in its own window. Dropping back over the original window during the same drag opens a new window; **Escape** cancels the move. **File → Move File to New Window** also opens a separate window.
- Moving preserves unsaved contents, the save destination, selection, scroll position and recent undo history. It does not save or discard the disk file. The original file stays protected until the destination is ready; a failed move leaves it intact. A window closes after its final tab moves successfully.
- **Ctrl+Tab / Ctrl+Shift+Tab** switches tabs. Switching to a file outside the selected tag or folder returns the filter to **All files**, the first option. A matching file keeps the selected filter; close reviews still reveal hidden files temporarily.
- Scroll anywhere on the tab bar with the mouse wheel, a horizontal trackpad gesture or the arrow buttons at its left. The scrollbar stays hidden. A subtle fade appears at either edge that has more tabs off-screen and disappears when all tabs fit; wheel scrolling over an open menu scrolls that menu. Ctrl+wheel still changes text size. Selecting a tab brings it into view; dragging near the bar's edges still scrolls it.
- **File → Open Saved File** opens the saved-file chooser. The arrow beside the tag button lists only tabs currently open in this window. Its Trash button also gives access to previously trashed files. There is no sidebar.
- **File → Recently Closed Files** opens a submenu of recent files; **Ctrl+Shift+T** reopens the last one. **Clear Recent History** is inside that submenu and clears the list while keeping the files. Use Right/Left arrows to enter/leave the submenu, or hover over it with the pointer.

A colored dot sits in the tab’s close-button position when it has changes since the last successful file save. Hover or focus the tab to reveal the close icon in that same spot. Undoing back to the saved contents clears the dot. Hover hints are disabled throughout the app. Tabs keep accessible file labels.

For stable placement on GNOME, the Fedora launcher prefers X11 through XWayland when it is available. The detached editor is prepared invisibly, then placed with its tab at the release point before it becomes visible. It is not moved continuously while dragging. This changes the app's window backend; your desktop session stays on Wayland. If X11 is unavailable, the launcher falls back to Wayland. An explicit `GDK_BACKEND` setting is respected; when using native Wayland, the compositor controls the final window position.

## Closing files

**× / Ctrl+W** closes a tab. Unchanged files close immediately, even when they contain text. **Close All Saved Files** closes unchanged tabs without a prompt and leaves modified tabs open.

Changed files offer three choices:

- **Close and Save**, with a green save icon/button, writes the file and closes it after the write succeeds. A file without a destination asks where to save. Cancelling the picker, a write error, or editing again while a save is running keeps the tab open.
- **Close Without Saving**, with a red discard icon/button, restores the last saved contents and closes the tab. A new file that has never been saved is discarded. This choice does not write to the original disk file.
- **Cancel** keeps the tab and its edits open.

Deleting all text still counts as a change to an existing file. A new, unchanged empty tab closes silently. Closing an inactive changed tab first selects it so the file is visible behind its prompt.

On Fedora, closing a window while another Another Note window remains open processes tabs from left to right. Each changed file is selected and gets its own Save / Close Without Saving / Cancel prompt. Save or discard affects only that file, closes its tab, then continues. Unchanged tabs close silently. Cancel, a cancelled save picker, or a failed save stops the sequence; completed closes stay closed and the current and remaining tabs stay open.

Closing the final window skips these prompts and keeps all its open tabs, unsaved text, filenames, tab order and saved baselines in recovery. Reopening the app restores the drafts with their unsaved markers intact. This does not write to the original disk files. **File → Close Window** closes the current window using the same rules.

Automatic recovery protects open files while you work. Only **Save**, **Save As**, or **Close and Save** writes their disk files. Closing without saving also discards the latest draft from the recovery workspace. Earlier version-history checkpoints for saved files remain available.

An extra window closes automatically after its last tab is successfully moved or closed. The final editor window stays open and shows the empty workspace, ready to create or open a file. Cancelled or failed moves keep the original tab and window. Opening the app again with no open files creates a new empty file.

Each window has its own tabs and Find scope. Recovery saves merge files across windows so editing one window does not overwrite changes in another. Closing one of several windows leaves the other windows running.

## Tags and tab filters

The tag filter also includes temporary **Folders** groups for saved files open in this window. Files in the same parent directory share a group, using the saved file paths to identify each folder. A group disappears when its final file closes, moves to another window or moves to a different destination with Save As. Closed-file history does not keep it alive. Files with a saved location still belong to that folder while you edit them; new files without a destination are ignored. These groups never alter permanent tags or mark a file as modified. Creating a file while a folder filter is selected switches to All files so the unsaved file is visible.

Fedora discovers the parent directory automatically when a file opens or is saved. Browsers hide parent paths from ordinary file selections. In the HTML edition, **File → Open Files from Folder…** grants folder access and opens the files directly inside that folder, skipping subfolders. Once a folder is known, supported browsers can also recognize other files opened or saved inside it. A Save As destination outside the known folders clears the previous folder group for that file. Browsers with a folder-upload fallback can label the selected folder but may still ask for a save destination.

Right-click a tab to assign or remove tags. A file can have several tags. **Create tag…** adds a tag to that file and makes it available on other tabs; tag names are case-insensitive. **Shift+F10** opens the same menu when a tab has keyboard focus.

Use the tag button beside the tabs to show **All files**, **Untagged**, or a specific tag. The selected folder or tag has a filled highlight and accent edge in the menu. Clicking it again clears that filter and shows All files. The count shows visible/open files. Filtering keeps every file in its window, and Find in Open Tabs still includes hidden files. If no open files match, a “No files found” page replaces the editor without discarding its contents; use Show All Tabs to return. New files automatically receive the selected tag. With All files or Untagged selected, new files start untagged. Switching the filter back to All files reveals them again. A filter with no matches leaves the window open. Reordering visible tabs retains hidden files in their existing slots.

Save, close, Close All Saved Files, and window closing still process all relevant open files, including hidden ones. A filtered-out file is temporarily shown in the tab bar and editor while its close prompt is being handled. Save, Discard, or Cancel restores the selected filter. The dropdown beside the tag button lists only tabs currently open in this window, in their tab order; saved files and recently closed files remain in their File menus. Tag changes do not modify text, write the original disk file, or mark a clean file as unsaved. Unchecking an assigned tag asks for confirmation before removing it from that file; the tag stays reusable. Choose **Manage tags…** from either tag menu to delete a tag entirely, including unused tags. Deleting asks for confirmation and removes the tag from open, closed and trashed files across all windows while keeping their contents and save states. If that tag was the active filter, the window switches to All files. A deleted name can be created again without restoring its old assignments. Tags are kept in recovery and backups, survive reopening closed files, and travel with tabs between windows. Each window keeps its own filter; detached windows start with All files so their file is visible.

**Manage tags…** also has a **New tag** field and **Create Tag** button. A tag created there starts unassigned and is available for any file or filter. Existing names are reused without duplicates; tag names are case-insensitive. Creating a tag does not change file contents or saved state.

## Save and file type

**Ctrl+S / Save** writes to the remembered location. **Ctrl+Shift+S / Save As** chooses a new destination; subsequent saves use that location. Older workspace files without a remembered location ask for a destination once. Renaming a tab changes its displayed name; Save As chooses a different disk filename.

The selected type and syntax colors update automatically when a file is opened, renamed, or successfully saved with a recognized extension:

| Extension | Type |
| --- | --- |
| `.json` | JSON |
| `.java` | Java |
| `.js`, `.mjs`, `.cjs` | JavaScript |
| `.html`, `.htm` | HTML |
| `.css` | CSS |
| `.py`, `.pyw` | Python |
| `.sh`, `.bash`, `.zsh` | Bash |
| `.md`, `.markdown` | Markdown |
| `.txt`, `.text`, `.log` | Plain Text |

These formats include syntax colors for comments, strings, numbers and language tokens. HTML also colors embedded JavaScript, JSON and CSS. Syntax highlighting displays the file as text; it does not execute the code. Markdown fences recognize the new languages, including `js` and `py`.

Code suggestions appear beside the cursor as you type. **Ctrl+Space** requests them explicitly. Use **↑ / ↓**, then **Enter** to insert a suggestion, or click one; **Escape** dismisses the list. Suggestions include descriptions and function signatures. HTML offers tags, attributes, common attribute values and existing class/id names. Closing-tag hints prioritize the innermost open tag. Typing `>` on an opening HTML tag adds its closing tag with the cursor between them; void tags, self-closing tags, comments and existing pairs are respected. Completing a fresh tag inserts its pair in one undo step.

CSS offers properties, values, functions and at-rules. JavaScript offers keywords, built-in functions and methods, common receiver methods, and names/functions from the current file. HTML includes these hints in embedded script/style blocks and inline event/style attributes. JSON offers `true`, `false`, `null` and property names already present in the file. Python, Java and Bash also have keyword/function hints. These are lightweight offline suggestions, not a project-wide type checker or schema service. Comments and ordinary string contents suppress code suggestions. Indexing is bounded and starts only while using hints; no language server or additional startup worker is required.

Extensions are case-insensitive. Renaming or saving without a recognized extension keeps the current type. You can select a type manually at the bottom right. UTF-8 BOMs and LF, CRLF or CR line endings are preserved.

## Color previews and editing

Recognized hex, RGB/RGBA, HSL and named colors have preview squares beside them. Their padded click areas are much larger than the visible square; hovering enlarges the preview. You can also **Ctrl+click anywhere on a color value** to open **Edit Color** (Command+click on macOS). Ordinary clicks in surrounding code still edit text.

The picker includes a large saturation/brightness plane, hue and opacity sliders, original/new previews, RGB and alpha number fields, **HEX / RGB / HSL** output formats, and sixteen quick colors. Drag in the plane or use its arrow keys; Shift makes larger steps. Enter a CSS color directly for exact values. Click **Original · reset** to restore the original value. The picker matches the app theme and scrolls inside smaller windows while **Apply** and **Cancel** remain visible.

**Apply** changes only that literal as one undo step; **Cancel**, Escape and the close button leave it untouched. A color change marks the file as modified until you Save. The picker rejects invalid values and protects newer edits if the file changes while it is open. Transparent HEX, RGB and HSL colors retain their underlying RGB channels.

Swatches occupy available space without shifting code, caret positions or search marks. Compact code uses the line’s end or reserved editor margin; a full-size **+** button opens a chooser when several colors share that space. Only the visible portion is indexed and drawn, including after scrolling through large files. No spelling or formatting worker is started for these previews.

## Find and replace

**Ctrl+F** finds text in the current open file; **Ctrl+H** also shows replacement controls. Matches are highlighted in the editor, including while focus stays in the search or replacement field. The current match has a stronger highlight. Typing a query or editing the file refreshes matches automatically. Closing Find clears its highlights.

- **Regex** switches between literal text and regular expressions. **Match case** controls case sensitivity. Invalid regexes show an error and leave contents unchanged.
- **Selection only** restricts finding and replacing to the selected range. Select text before opening the bar or enabling this option. Toggle it off and on after making a new selection. Its bounds adjust after replacements.
- **Replace** changes one match and advances. Enter in the replacement field does the same.
- **Replace All** changes every match in the current file or selected range. Ctrl+Enter in the replacement field does the same.
- Paste multiple lines or use **Shift+Enter** to add a line in Find or Replace. Both fields grow with new lines and wrapped text, then scroll internally for large blocks. Literal searches match the entered line breaks without enabling Regex.
- **↑ / ↓**, **F3 / Shift+F3**, or Enter in the Find field moves between matches. Search wraps. Escape closes the bar.

Regex mode supports line anchors, lookarounds, captures (`$1`, `$<name>`, `$&`, `$$`) and replacement escapes `\n` / `\t`. Type patterns without surrounding slashes. **Ctrl+Z** undoes a replacement; Replace All is one undo step.

Search and replacement calculations run in background workers. **Cancel Search** stops a pending calculation without applying a replacement. Expensive searches stop after ten seconds. Changed file contents or search settings invalidate pending calculations.

## Find in open tabs

**Ctrl+Shift+F / Find → Find in Open Tabs** opens the bottom results panel. It searches only open tabs. Closed files, Trash and discarded files are excluded. Results update as you type, edit, open or close tabs. Search controls keep their dimensions while typing, searching, showing a count or displaying a regex error; long status messages are available in their hover tooltips. You can narrow the scope to the current file or a selected range.

Results are grouped by file, with highlighted snippets, line/column positions and a nearby source excerpt. Clicking a result jumps to its match and highlights matches in the editor. **F3 / Shift+F3** or **Ctrl+Alt+↓ / Ctrl+Alt+↑** navigates between results. **↑ / ↓** moves through the list; **Enter / F4** jumps to the selected source. Escape closes the panel when it has focus. Drag its top edge to resize it.

Large result lists display in batches. The total counts every match; navigation retains the first 100,000. Narrow the query or scope to reach later matches. Replace All processes every occurrence in its current file or selection.

## Editing and text size

**Ctrl++ / Ctrl+−**, **Ctrl+mouse wheel**, or scrolling over the bottom text-size indicator changes text size. Clicking the indicator resets it to 15 px. The saved range is 8–72 px. **Word Wrap** is available in View.

Text and all supported code formats are colored as you type. **Tab / Shift+Tab** indents/unindents the complete current line or every selected line by the selected tab size (2, 4 or 8 spaces), even from the middle of a line. A selection ending at the beginning of the next line leaves that next line untouched. The caret and selection stay with the text, and each command is one undo step. Unindent removes up to the selected number of leading spaces or one leading tab. Tab always indents, including while hints are open; Enter accepts a code suggestion. Ctrl+Tab and Ctrl+Shift+Tab still switch files. **Ctrl+Z / Ctrl+Shift+Z** undoes/redoes text changes within the session. **Ctrl+P / File → Print** prints the file.

**Ctrl+/ / Tools → Toggle Comment** comments or uncomments the current line or selected lines. Java and JavaScript use `//`; Bash and Python use `#`. HTML and CSS wrap the complete affected lines in their block-comment markers. A partial selection on two lines comments both whole lines in every programming type. JSON has no comments. Selecting through the start of the next line leaves that next line untouched. Each command is one undo step.

**Ctrl+Shift+L / Tools → Format File** formats Java, JavaScript, JSON, HTML, CSS, Python and Bash. It adjusts indentation, spacing and line breaks with the appropriate parser. Invalid syntax is reported and left unchanged. Formatting stays in the editor until you Save; one Ctrl+Z restores the previous contents. A result is discarded if the file changes while the formatter is working. **Format Selected JSON / Block** also formats a JSON selection or the fenced JSON block under the cursor. Tools can insert code blocks.

## Spelling and personal dictionary

Offline English spellcheck accepts American and British spellings. Possible errors have a red wavy underline. It splits identifiers such as `camelCase`, `HTTPServer`, `snake_case` and `kebab-case`, ignores URLs and email addresses, and skips common programming keywords, markup attributes such as `doctype` and `charset`, file extensions such as `.txt`, `.avif` and `.toml`, and code acronyms. A misspelled filename stem or property name is still checked. It checks word components without changing the identifier separators.

Spellcheck starts **off for every file**. **F6**, **Edit → Spellcheck This File**, or the **ABC Off / ABC** button beside the upper-right minimap toggle toggles only the active file. Switching tabs remembers each file's choice for the current window session; reopening the app resets them to off. Toggling does not change the file, mark it modified, save to disk, or persist a setting. In programming files, hex colors (`#fff`, `#aabbcc`, including alpha), CSS color functions (`rgb`, `rgba`, `hsl`, etc.), font formats (`.ttf`, `truetype`, `woff`), `@keyframes`, and dimensions such as `12px` or `1.5rem` are accepted.

Right-click an underlined word for suggestions or **Add to Dictionary**. The menu lists corrections without repeating the misspelled word. A suggestion replaces just that component and can be undone. **Edit → Personal Dictionary…** lets you add words or complete identifiers, and remove entries with the trash button. Removing a personal word checks it again; the built-in dictionaries stay available. Accepted words are shared between windows, survive restarts and travel in workspace backups. Dictionary changes do not change a file's saved state.

**Edit → Check Spelling…** enables spelling for the current file if necessary and lists possible errors. Click one to jump to it and see suggestions. Large files show at most 2,000 possible errors, with the first 200 available in the review list. Spelling and formatting use separate background workers without uploading contents or executing the file. Neither starts until requested. Compressed tools are unpacked inside the worker, so this work does not block the editor. All dictionaries, parsers and formatters are included; no network or extra Fedora packages are needed. Their notices are available under **Help → Third-Party Licenses…**.

## Version history and backups

**File → Version History** previews and restores earlier contents. Checkpoints are kept before edits, after typing pauses, on saves, and before a restore. **Create Checkpoint** adds a manual restore point when contents have changed. History survives restarts, with up to 30 versions and a soft 32 MiB text limit per file; at least the two newest versions are retained. While typing, checkpoints before changes are spaced at least 30 seconds apart.

Restoring protects the current contents first, then changes the editor. **Save** writes a restored version to disk. Closing saved files or moving them to Trash keeps history. **Delete Forever** removes the workspace copy and history; previously saved disk files stay on disk. Discarding a new unsaved file removes its recovery copy and history.

**Back Up All Files** exports a portable JSON backup with available history and saved baselines. Backups omit disk paths and write permissions. Import adds files without replacing existing workspace contents. Older `.vnotes` backups remain supported.

The Fedora recovery workspace remains at `~/.local/share/vista-notes/notebook/notes.json`, or under `$XDG_DATA_HOME` when set. Remembered locations are in `file-links.json`, with history in `versions`. Recovery and disk saves are atomic; a previous valid workspace copy is kept. Updating does not modify this data folder.

## HTML edition

Open the standalone `Another-Note.html` download in a browser. It includes compressed tools, stays self-contained, works offline, uses the same blue favicon, and saves recovery data in that browser profile. Replace an existing HTML edition at the same location when updating; its previous filename can be kept.

Dragging uses a compact tab-shaped cursor rather than opening a preview window. A new editor window opens only after release outside the other editors; its position accounts for the tab grab point. Browsers control custom cursors outside their content area and may show the normal cursor near their toolbar or window boundary. Other open editor windows preview the incoming tab during the drag and retain its position until the transfer arrives. Browsers can restrict pop-ups and programmatic window movement; allow pop-ups for the file or use **File → Move File to New Window** if needed. A blocked or failed pop-out keeps the original tab. Refreshing a detached window keeps that window's tabs when session storage is available. Tabs can also move back into another open editor window. Extra app-created popup windows close automatically when their last file is removed; the final editor window stays open. Some browsers prevent closing manually opened windows automatically; those windows show a reminder to close them. The browser decides whether a requested window opens as a separate window or tab.

Browsers supporting file access remember file handles and save in place, sometimes requesting permission again. Other browsers use uploads and downloads. A download keeps the modified marker because its completion cannot be confirmed; **Close and Save** therefore leaves that tab open. After keeping the downloaded copy, **Close Without Saving** can discard the recovery draft. Use **File → Close Window** for the same per-tab closing sequence in the HTML edition. The final editor window keeps its drafts and closes without an app confirmation once recovery is complete. The browser's own close button uses its built-in confirmation when other editor windows remain open or a recovery write is still pending. Browsers may require manually closing windows that were not opened by the app.

Private browsing or clearing browser data can remove recovery files. Fedora and browser editions use separate workspaces; export/import a backup to transfer them. The app does not upload file contents or execute code.

## Code references and picker controls

Right-click a class, ID or function name and choose **Find Usages**, or use **Alt+F7**. **Ctrl+click** jumps directly when there is exactly one other match in the open tabs; multiple matches open the usages list. **Alt+F7** and **Find → Find Usages at Cursor** use the caret. Locations appear in the existing bottom results panel, grouped by open file, with exact line/column positions and highlighted source. Click a result to open that tab and select the name; **F3 / Shift+F3** steps through locations. Hidden tagged tabs are included. Selecting one switches the tag/folder filter to **All files** so the destination tab is visible. The list refreshes when open source files change. **Text Search…** returns to ordinary Find.

HTML/CSS class and ID references include attributes, selectors, embedded styles/scripts, common JavaScript selector APIs, classList methods and className/id assignments. Functions and programming class names include declarations, calls and identifier references in JavaScript, Java, Python and Bash, including callbacks. This is a lexical name lookup across the current window’s open tabs: different scopes with the same name can appear together; closed files and external project folders are not indexed. Comments, ordinary strings, JSON and prose are excluded. Escaped CSS names and dynamically constructed names may need ordinary text search. Scans run in the cancellable search worker on demand, with no startup index.

Color preview squares keep the larger click target, while their hover/focus outline now follows the square itself. The Format and grouped-color dropdowns use the same themed controls as the editor; their text is vertically centered and the menus stay above the color dialog in compact Fedora windows.

## File overview and code previews

The right-hand **File Minimap** shows a compact, syntax-colored overview without a surrounding frame. Click to jump, drag to scroll, or use arrow keys, Page Up/Down, Home and End while it has focus. The minimap button in the upper-right corner and **View → File Minimap** show or hide it; the choice is remembered. Hiding it restores the editor width and stops map painting. The canvas draws only the current map section and reuses unchanged syntax, with bounded work for large files.

Search result snippets and the source-preview pane now use the same syntax colors as the editor, including the Usages panel. Match highlights remain visible without replacing the token colors. Text is escaped and previewing never edits or saves the source file.

Color squares have padding on both sides inside their larger click targets. An inline gap is used only if it has enough room for the square and padding; narrower gaps use a padded position after the line or in the reserved edge. These are visual controls and do not insert spaces into file contents. Ctrl+click on the color value still opens the picker.

**Ctrl+Shift+L** is now the Format File shortcut, replacing Ctrl+Alt+L. Tools and Help show the new shortcut.

Once a tab has been dragged out of its tab bar, releasing it over its source window—including its editor or tab bar—opens it in a new window. The source does not show an incoming placeholder for that same gesture. Dropping into a different window still attaches there; a later, separate drag can move the tab back to the earlier window. Escape cancels the gesture and retains the source tab. The original contents and save binding remain protected until the destination acknowledges the move, and an emptied source window closes after the acknowledged transfer.

## Selected-word highlights

Select text with the mouse or keyboard, or double-click a word, to highlight exact, case-sensitive whole-word matches throughout the current file, including strings and comments. Syntax colors remain visible. Matching words are marked in the minimap, with small position ticks for matches across the whole file. The minimap shades the visible content area and has no surrounding hover/focus frame. Selecting different text updates the matches. Collapsing the selection, typing, switching files or pressing Escape clears these transient highlights. Clicking/scrolling the minimap or changing its visibility keeps the current matches. The feature uses the cancellable search worker only when requested and keeps source text, file save state, and Find/Replace settings unchanged. As with Find, highlight ranges are bounded to the first 100,000 matches.

Tab size is available in Preferences and the status bar: 2, 4 or 8 spaces. It controls indentation, tab-character display, JSON auto-indent and formatting, and is remembered across sessions. Changing it does not rewrite file contents. Selecting a tag or folder opens its first tab if the current file does not match; right-clicking the tag filter returns to All files.

## Per-file line numbers and links

Use **View → Line Numbers for This File** to show or hide the gutter in the current file. This is remembered with that file in recovery and follows it between windows. Other files keep their own setting. It does not modify or save file contents.

**Ctrl+click** a website address to open it in the default browser. Ctrl+click a local file reference in HTML, CSS, JavaScript, Markdown or plain text to open the file in another editor tab. This includes `href`, `src`, `url()`, imports, absolute paths and `file://` links. Relative references resolve from the current file’s saved folder; save a new draft first. Query strings and fragments are ignored for local file lookup. Already-open files reuse their tab and keep unsaved edits. Links never execute local programs.

The standalone HTML edition can reuse open files and resolve linked files inside a folder you grant access to. If the browser has not been given a suitable folder, it asks you to select one. Browsers without directory access require files to be opened through **File → Open Files** first.

Color squares stay beside their own literal, including multiple colors on one line. Tight gradients and JSON use a compact preview at the value’s trailing edge in the gap between text rows. Previews never insert spacing into the file or cover source text. Ctrl+click on the value also opens its picker. Scrollbar hover and dragging use the normal arrow cursor.

## Build 2026.10.26-r3

The active tab is lifted as the original element while a transparent placeholder holds its slot. Neighbors animate around the placeholder; the held tab is never rebuilt during reordering. The editor uses independent vertical and horizontal scrollbar controls with the arrow cursor, mouse dragging, wheel scrolling and keyboard controls. Text selection and Ctrl+wheel zoom keep their normal behavior.

The minimap toggle is at the upper-right corner of the menu bar. Version History has a close button in its heading and a Close button in its footer. Recently Closed Files lists only previously saved files that are no longer open in any editor window. Closing an unsaved draft does not add it; reopening a file removes it from the visible list. History is shared across windows, and Clear Recent History stays cleared when an older window saves.

Ctrl+click local image links opens the system’s default image application. Web links use the browser. In the standalone HTML edition, local images open in an isolated browser image view after the required folder/file permission. Help → About shows the build identifier so installed copies can be distinguished from older downloads.

## Build 2026.10.26-r4

**Preferences → Keyboard Shortcuts**, **Help → About Another Note**, and **Help → Third-Party Licenses** have separate dialogs. In Keyboard Shortcuts, click a binding and press a new combination. Escape cancels recording, Backspace or the × control clears a binding, and Reset restores its defaults. Conflicting bindings are rejected. Restore All Defaults resets every binding. Changes are saved locally and shared across editor windows; menu labels follow your choices. Ctrl+click and Ctrl+wheel remain mouse gestures, and Enter/Escape keep their usual roles in menus and search fields.

Text selection is painted with the syntax text so the highlight is centered on its characters. Clicking inside an opening or closing HTML tag underlines both matching names, respecting nested elements, comments, void tags and embedded scripts.

Use the gutter arrows to collapse or expand HTML elements, functions and other brace blocks, JSON arrays, Python indentation and docstrings, Bash blocks, and Markdown headings/code fences. **View → Collapse Section / Expand Section** and **Collapse All Sections / Expand All Sections** provide the same controls. Default shortcuts are Ctrl+Shift+[ / ] for a section and Ctrl+Alt+Shift+[ / ] for all sections; they are editable. Folding is per open file for the current session and only changes the display. Original line numbers remain visible, and hidden contents are retained when saving, copying, searching, replacing or moving files between windows. Navigating to hidden text expands its section.

## Build 2026.10.26-r5

Menus are grouped by purpose: **File** contains opening/saving, file management, pinning and tags; **Edit** contains undo/redo, copying, indentation, comments and spelling; **Find** contains searching and usages; **View** contains display, zoom and folding; **Tools** contains formatting, suggestions and code-block insertion; **Preferences** contains theme, tab size, keyboard shortcuts and the personal dictionary; **Help** contains About and third-party licenses.

Fold controls now use larger 16-pixel arrows in 26-pixel targets. Expanding a parent with its arrow or Expand Section also expands every nested section, including children that were collapsed before the parent was hidden. Other sections keep their current fold state. The per-file spelling toggle is immediately left of the minimap toggle in the upper-right corner. Successful recovery saves no longer display text in the footer; automatic recovery continues, and failures remain visible.

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

## Build 2026.10.27-r5

This release adds versioned Windows download names and protects Windows launches against loading an older editor page or switching to a different running build. The shared editor reports its build to the desktop host during startup. Fedora and HTML retain the multiline Find/Replace and r4 editor behavior.

## Build 2026.10.27-r6

Selected line breaks have a one-character highlight cell, making selected empty lines visible. A focused selection has an I-shaped caret at its active end. The current line number, row highlight and status-bar position follow that end for forward and backward selections, including wrapped rows. The indicators do not add characters to the file or clipboard. Undo, tab changes and window transfers preserve selection direction.
