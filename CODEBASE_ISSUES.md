# Codebase Scan Report

Generated: 2026-02-26T20:22:09Z

Summary
-------
This document lists the highest-impact problems discovered from an automated repository scan plus important findings that need human review. The scan focused on common risk patterns (missing endpoints, unsafe exec/eval usage, filesystem write/read issues, path traversal guards, and TODO/FIXME markers).

High-priority issues
--------------------
1. Missing IDE endpoints referenced by client code (breaks editor features)
   - Problem: Client-side code calls endpoints that are not implemented on the server.
   - Evidence / locations:
     - public/ide.js uses `/api/ide/search` (performSearch)
     - public/ide.js uses `/api/ide/terminal` (terminal input handler)
   - Effect: Search and terminal features in the in-browser IDE will fail (network errors, UI showing "Search failed" or terminal requests failing).
   - Suggested fix: Implement `/api/ide/search` and `/api/ide/terminal` on the server or alter client code to gracefully disable those features when endpoints are unavailable.

2. server/routes/assets.js: invalid fs.readdir options (runtime error)
   - Problem: `fs.readdir` is called with `{ recursive: true, withFileTypes: true }`. Node's `fs.readdir` does not accept a `recursive` option and will throw.
   - Evidence / location: server/routes/assets.js (asset scan loop around the `fs.readdir(fullPath, { recursive: true, withFileTypes: true })` call).
   - Effect: Asset scanning endpoint (`POST /api/assets/rebuild`) will fail with an exception when invoked.
   - Suggested fix: Replace with a proper recursive directory walker (use `fs.opendir` or a custom recursive function) or use a library that supports recursive scanning.

3. Path guard edge-case in server/utils/pathGuard.js
   - Problem: resolveUnderRoot() checks `if (!fullPath.startsWith(root + path.sep)) return null;` which rejects when `fullPath === root` (root path equality) and can be brittle across platforms.
   - Evidence / location: server/utils/pathGuard.js
   - Effect: Legitimate requests that target the root directory itself may be denied; Windows path separators and symlink cases might be mishandled.
   - Suggested fix: Accept `fullPath === root` as valid and/or use `path.relative(root, fullPath)` and ensure it does not start with `..`.

4. Many write operations and potential insufficient path validation (audit required)
   - Problem: Numerous server routes write files using `fs.writeFile` / `fs.writeFileSync` (saves, assets, campaigns, game data, projects, etc.). Some routes correctly use resolveUnderRoot/projectService, others build paths from user input or project names. This is a large attack surface if inputs are not validated.
   - Evidence / locations (non-exhaustive):
     - server/routes/ide.js (read/write endpoints)
     - server/routes/assets.js (upload, rebuild, write registry)
     - server/routes/brains.js
     - server/routes/campaigns.js
     - server/routes/gamedata.js
     - server/routes/levels.js
     - server/routes/slots.js
     - server/routes/saves.js
     - scripts/engine-lockstep.js (writes reports)
   - Effect: Potential path traversal or arbitrary file write vulnerabilities if inputs are not strictly validated.
   - Suggested fix: Audit every file-write route to ensure file paths are resolved with a path guard (resolveUnderRoot or projectService.getProjectPath) and sanitize user inputs. Add unit/integration tests for path guard behavior.

Medium-priority issues
----------------------
1. Embedded/minified Monaco loader uses eval/new Function
   - Problem: Vendor files contain `eval(...)` and `new Function(...)` (loader.min.js), which is expected for Monaco but is a security surface when serving third-party code.
   - Evidence / locations: public/lib/monaco/vs/loader.min.js and identical copies under projects/*/lib/monaco
   - Effect: If untrusted content ends up in these scripts or if Electron loads remote versions, this could be an injection vector.
   - Suggested fix: Prefer serving Monaco from a trusted local bundle or a pinned CDN; review where third-party bundles come from and avoid runtime code generation where possible.

2. Inconsistent client DOM IDs / editor element names
   - Problem: Different editor scripts reference different DOM element IDs (`monaco-host` vs `monaco-editor`). If the corresponding HTML does not include the matching ID, editor initialization will fail silently.
   - Evidence / locations: public/script_editor.js uses `monaco-host`; public/ide.js uses `monaco-editor`.
   - Effect: Editor might not initialize if HTML templates don't match expected IDs.
   - Suggested fix: Verify the HTML templates (dashboard/editor pages) include the expected container IDs or unify editor scripts to a single ID and add a robust fallback/error message.

3. Numerous TODO/FIXME/HACK comments
   - Problem: Many files contain TODO/FIXME markers indicating unfinished work.
   - Evidence: Grep across repo found occurrences in multiple public/* editor files, build scripts and plans (examples: public/algorithm_editor.js, many others).
   - Effect: Unfinished features, possible bugs or unhandled edge-cases.
   - Suggested fix: Triage TODOs by priority and convert high-impact TODOs into tracked issues.

Low-priority / informational
----------------------------
- IRAB proxy in server.js uses a hard-coded IRAB_BACKEND and pipes requests via plain http; consider configurable backend URL and better error messages if IRAB backend is not available.
- There are many copies of the Monaco loader inside project templates; consider deduplicating to reduce repo size.
- Several routes return `res.status(500).json({ error: err.message })` which can leak internal errors; consider sanitizing messages in production.

Next steps (recommended)
------------------------
1. Implement or stub `/api/ide/search` and `/api/ide/terminal` to restore IDE features. If terminal endpoint executes shell commands, strictly restrict allowed commands and sandbox execution.
2. Fix server/routes/assets.js to use a correct recursive directory walk. Add tests for `POST /api/assets/rebuild`.
3. Update `resolveUnderRoot` to accept root equality and use a robust check (use `path.relative`). Add unit tests (there is already a pathGuard.test.js — extend it with root-case and Windows-like path scenarios).
4. Audit all `fs.writeFile` occurrences and ensure inputs are sanitized and resolved with path guards; add regression tests.
5. Add a short CI check that runs a small static-scan (grep for TODO/FIXME, eval/new Function in non-vendor code, and spots known dangerous patterns).

Appendix: quick file hits (from scan)
------------------------------------
- Files referencing missing IDE endpoints:
  - public/ide.js (search, terminal)
  - public/script_editor.js (tree/load, project fetch)

- Files with fs.writeFile / unlink usage (non-exhaustive):
  - server/routes/assets.js
  - server/routes/brains.js
  - server/routes/campaigns.js
  - server/routes/gamedata.js
  - server/routes/ide.js
  - server/routes/levels.js
  - server/routes/saves.js
  - server/routes/slots.js
  - scripts/engine-lockstep.js
  - server.js (spritesheet save)

- Files with eval/new Function from vendor bundles: public/lib/monaco/vs/loader.min.js and projects/*/lib/monaco/vs/loader.min.js

If you want, next action can be:
- Implement the two missing IDE endpoints (search + terminal) and add tests, or
- Start a prioritized fix PR for the assets readdir bug and pathGuard fix.

Notes
-----
This report is focused on high-confidence, high-impact findings surfaced by automated pattern search and light inspection. A deeper security/code-quality audit (static analysis, unit tests, and manual code review) is recommended for a complete inventory.


