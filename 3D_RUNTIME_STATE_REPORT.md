co# 3D Engine Runtime Problems Report (Current State)

## Executive outcome

The 3D campaign integration is now **runtime-ready for campaign orchestration** after Phases A-F. Adapter lifecycle/completion paths, project-level resolution, platformer lifecycle integrity, and campaign cross-cutting issues are fixed, and validator coverage was extended with runtime smoke contracts.

## Validation snapshot (current)

- `node scripts/validate-3d-campaign.js` -> **pass (67/67)**  
- `npm run --silent engine:lockstep` -> **parity closed** (`missing=0`, `diff=0`, `candidates=0`)

These results now include structural checks **plus runtime smoke contract assertions** for init/load/start/completion callback paths and campaign hand-off wiring.

## Critical runtime blockers (P0) — addressed

| ID | Problem | Impact | Evidence |
|---|---|---|---|
| P0-1 | **TopDown3DAdapter calls wrong lifecycle API** (`engine.initialize(...)`) while TopDown engine implements `init()` | Topdown-3d campaign switch can fail at initialization | `public/engines/topdown-3d/TopDown3DAdapter.js:51`, `public/engines/topdown-3d/main.js:133` |
| P0-2 | **TopDown adapter loop/pause contract mismatch** (`start/stop` + `_paused`) vs engine (`_startLoop/_stopLoop` + `isPaused`) | Start/stop/pause from CampaignController are ineffective | `public/engines/topdown-3d/TopDown3DAdapter.js:86,91,99,103`, `public/engines/topdown-3d/main.js:567,575,82,808` |
| P0-3 | **No reliable 3D level completion signaling to CampaignController** | Campaign flow stalls on 3D levels | Topdown never sets completion true (`public/engines/topdown-3d/main.js:110,499`), FPS adapter has no completion bridge (`public/engines/fps-3d/FPS3DAdapter.js`), Platformer adapter has no bridge to `levelCompleteCallback` (`public/engines/platformer-3d/Platformer3DAdapter.js`) |
| P0-4 | **Project resolution is broken for FPS/Platformer adapters** (`currentProject || ''`) and levelPath is ignored | `/api/levels3d/:project/:level` loads fail when project is unset | `public/engines/fps-3d/FPS3DAdapter.js:55-56`, `public/engines/platformer-3d/Platformer3DAdapter.js:55-56`, `server/routes/levels3d.js:30-42,118-127` |
| P0-5 | **3D test campaign IDs do not match demo assets for all engines** | Test campaign can fail even when adapters are present | Campaign uses `demo_level` for all (`public/dunyalar/definitions/test_3d_campaign.json:20,30,40`), but available files differ (e.g. topdown `demo_level_01`, platformer `level01`) |

## High-severity runtime issues (P1) — addressed

| ID | Problem | Impact | Evidence |
|---|---|---|---|
| P1-1 | Platformer level hydration bypasses normal 3D level lifecycle (`initialize3D(data)` instead of `loadLevel3D`) | Scene/state integration drift; inconsistent behavior with shared adapter base | `public/engines/platformer-3d/main.js:381` |
| P1-2 | Platformer `_levelId` is read in save payload but never assigned | Save/load continuity risk (level restore metadata incomplete) | reads at `public/engines/platformer-3d/main.js:678,692` |
| P1-3 | Platformer loop does not honor `isRunning` flag | `levelComplete()`/`_gameOver()` set `isRunning=false` but RAF loop keeps ticking | loop body `public/engines/platformer-3d/main.js:449-473`; stop intent `:592,598` |
| P1-4 | Shared Engine3DAdapter uses fields not used by current engines (`paletteManager`, `physicsWorld`) | Light/sky/physics config application paths can silently no-op | `public/engines/shared/Engine3DAdapter.js:236,296,313,322-328` |
| P1-5 | Platformer destroy path calls missing cleanup methods (`physics/audio/input.destroy`) | Resource/listener leaks across engine transitions | `public/engines/platformer-3d/main.js:774-776` vs available APIs (`public/engines/shared/Physics3DWorld.js:283`, `public/engines/shared/AudioSpatial3D.js:433`, `public/engines/shared/Input3D.js:384`) |

## Campaign runtime cross-cutting defects (P1/P2) — addressed

| ID | Problem | Impact | Evidence |
|---|---|---|---|
| C-1 | Campaign completion UI assumes wrong data shapes (`campaignData.nodes.length`, `achievements?.size`) | End-screen runtime error/incorrect stats | `public/engines/shared/CampaignController.js:1156,1162` |
| C-2 | Campaign routes use `safeFs` without importing it | Save endpoints can fail at runtime | `server/routes/campaigns.js:33,110,159` |
| C-3 | Campaign validator overstates readiness | False confidence: structure passes while runtime still breaks | `scripts/validate-3d-campaign.js` uses `fileExists/fileContains` checks (`:49-59`, test blocks throughout) |

## Engine-by-engine health

| Engine | Standalone playtest path | Campaign runtime path | Current verdict |
|---|---|---|---|
| topdown-3d | Uses `init()` and can run in its own page flow | Adapter lifecycle + completion + project propagation aligned | **Ready** |
| fps-3d | Core loop and systems initialize | Completion bridge + project/levelPath semantics wired | **Ready** |
| platformer-3d | Core systems initialize and level logic runs | Completion bridge + loop stop + load lifecycle + cleanup APIs aligned | **Ready** |

## Recommended fix order

1. **Adapter/engine contract alignment** (topdown initialize/start/stop/pause and completion signal).  
2. **Campaign level-completion plumbing** for FPS + Platformer adapters.  
3. **Project resolution contract** (controller -> adapter `setProject`, or use `levelPath` consistently).  
4. **Platformer loop/lifecycle correctness** (`isRunning` guard, `loadLevel3D` usage, `_levelId` assignment, cleanup API parity).  
5. **Cross-cutting campaign fixes** (`safeFs` import, completion screen data-shape bugs).  
6. Replace structural validator assertions with at least one **runtime smoke path** per 3D engine (init -> load -> start -> complete callback).

## Bottom line

The codebase is in a **runtime-ready state for 3D campaign flow** with clean mirror parity and enhanced validation coverage. Remaining risk is that smoke checks are still static-contract based (not full browser/E2E simulation), but the previously identified runtime contract breaks are addressed.
