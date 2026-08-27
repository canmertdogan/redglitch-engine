# Changelog

All notable changes to Redglitch Game Studio are documented here. This project adheres to
`MAJOR.MINOR.PATCH-experimental-alpha` until a public beta is declared.

## [0.1.6-experimental-alpha] - 2026-08-27

### Added
- `public/shared/domSanitize.js` — shared `escapeHtml` helper for editor innerHTML safety.
- Backend `POST /api/ai/config` and `GET /health` routes.
- `public/base_game/sprites.js` and `public/base_game/fxSystem.js` (were 404-ing).

### Fixed
- **Security:** path-traversal containment in `setActiveProject` + sanitized "switch project"
  route + UI-config path validation; unmatched `/api/*` now returns JSON 404.
- **Critical:** unified-3D abilities were no-ops — strategies now bind to the mode and read
  live game state via delegation getters.
- **High:** Python AI event-loop no longer blocks during generation; lazy `sentence_transformers`
  import; campaign runtime CSP tightened.
- **Correctness:** FPS save position serialization (was writing `NaN`); TopDown hero HP save/restore;
  `Unified3DAdapter.isAbilityReady` default `false`; removed stale `?v=` import cache-busters that
  created duplicate module instances; fixed corrupt `item_editor.js` parse error; studio-ui
  `shader_editor.html` / `dashboard.html` links.
- **Hygiene:** JSON error responses in `projects.js`; Python background-future exception logging;
  lock-guarded RAG ingest; untracked stale report + screenshots; corrected README clone URL.

### Changed
- Backend tests now target real endpoints (`/health`, `/api/ai/chat`, `/api/ai/rag/reindex`).

## [0.1.5-experimental-alpha]
- Previous experimental alpha baseline. (See git history for details.)
