# Offline editor dependencies

The checked-in bundles and embedded WASM/dictionaries make both editions work offline. `python3 build.py` does not contact a package registry. The standalone HTML embeds compressed workers; the Fedora page loads the adjacent compressed worker files through its native bridge only when needed.

To rebuild the vendor files, use Node.js 20 or newer, then run:

```bash
cd tooling/editor-vendor
npm ci --ignore-scripts --no-audit --no-fund
node rebuild.mjs
cd ../..
python3 build.py
node checks/test_editor_worker.cjs
```

The lockfile pins every dependency. Prettier handles JavaScript, JSON, HTML and CSS; the JHipster Java plugin uses tree-sitter; Ruff formats Python; sh-syntax uses mvdan/sh for Bash. nspell checks US and British dictionaries separately because their affix flag sets are incompatible. Spelling and formatting use independent lazy workers, so spelling never initializes formatters. The tiny bootstrap decompresses each worker off the editor thread using DecompressionStream or the bundled fflate fallback. Opening an empty file creates neither worker. No tool uses network requests or executes the user's source code.

The Java plugin has a narrow adaptation to initialize lazily and read WASM from embedded bytes. The Go/TinyGo browser runtime disables CommonJS host detection to avoid installing a bundler proxy as the worker's `require`. The rebuild script checks the source pattern before applying the adaptation. Upstream notices are retained in the HTML and Fedora package.

`entry.mjs` maps validated per-language preferences to these pinned formatters. `format-style.mjs` uses the Babel/Java parser ranges to add control braces or omit braces around safe single statements, then adjusts known whitespace ranges for control layout. It reparses changed layout, keeps ignored regions unchanged, and does not run user code. The shared `source/editor-style-config.js` sanitizes preferences for both the UI and the worker. Run `node checks/test_format_preferences.cjs` after rebuilding to check literal preservation, parser validity, idempotence and the fixed behavior fixtures.

For the optional browser check, install Playwright 1.56.1 outside the repository and its Chromium browser, then set `PLAYWRIGHT_MODULE` to the installed `playwright` module and run `node checks/editor_preferences_browser.cjs`. `QA_SCREENSHOTS` may name a temporary screenshot directory. Dependency folders and generated vendor caches are excluded from source downloads.
