# Another Note project instructions

- Keep the current application build in `VERSION`. Read it through `release_config.py`; do not hardcode a different build in a packaging script.
- Bump `VERSION` before shipping changes to app behavior or packaged runtime code. Renaming existing downloads may retain their verified app build.
- Every user-facing download or release artifact must include the exact application version in its filename. This includes standalone HTML, Fedora ZIP, Windows EXE/ZIP, source archives, checksum lists, and any additional exported release files.
- Generate downloads with `python3 package_release.py`. Use `--include-windows` only when the current Windows build has been requested and built. Windows downloads are otherwise optional.
- Keep internal source filenames and installed runtime entry points stable. They are not separately distributed downloads.
- Keep generated downloads and build caches out of Git. Publish downloads as release assets; commit source, pinned vendor inputs, build instructions and meaningful checks.
- Do not commit user notebooks, drafts, version histories, private runtime data, credentials, temporary files or machine-specific paths.
- Preserve native editing, original saved/clipboard text, selection direction, folding and display-only color spacing when changing the editor.
- Do not claim native Windows or GTK visual testing unless it was actually performed.
