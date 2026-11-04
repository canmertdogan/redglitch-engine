# Tool Rescue — Baseline (2026-11-04)

Branch: `rescue/tool-fixes` (cut from `main` @ e916c35)

## Working tree
- Was dirty (52 entries: security hardening, AI fixes, engine/save fixes,
  studio-ui fixes + dist rebuild).
- User decision 2026-11-04: commit as-is, **except** the `permission-gate.js`
  redaction-regex hunk (removed `content|code` from redact keys), which was
  reverted to HEAD per user choice.
  - The user's uncommitted hunk is preserved at:
    `/private/var/folders/x3/ysmvvpws5b59hfwlpdxkyy4r0000gn/T/opencode/permission-gate-redact.patch`
- Commit: `e916c35 Tool rescue baseline: security hardening, v2 fixes, dist rebuild` (49 files)
- `git status` after commit: clean. `studio:build` re-run afterwards produced zero diff (dist in sync).

## Verified green (on e916c35)
- `npm test` — test:ai + test:server + test:engines chain: **all pass**
  (engines suite 396/396, incl. new `flow_while`/`Max LOOP_ITER` cases; ai/server suites pass as
  they short-circuit the `&&` chain before engines).
- `npm run tools:audit` — exit 0; "No missing endpoint matches found. No missing editor files found."
- `npm run studio:build` — OK ("✓ built in 763ms"), working tree remained clean afterwards.

## Node / toolchain
- `node v22.23.3` (repo engines: `^20.19.0 || >=22.12.0`)
- Server binds `127.0.0.1:3000` by default; `PORT` env override supported (used for smoke runs).

## Notes
- `docs/*.md` is gitignored (except RELEASE-*.md / CHANGELOG.md) — this file is local-only.
- `.github/workflows/ci.yml` does not (yet) run GUI smoke tests — see Faz 4.
