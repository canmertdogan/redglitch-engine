# Ketebe Engine - Tool & Engine Fix Plan (Phase 3)

This plan addresses logical gaps in cross-editor state management, engine-specific combat bugs, and structural inconsistencies in game data handling.

## Phase 9: Cross-Editor State Persistence
**Goal:** Enable real-time state synchronization between different editor windows.
- [ ] **Missing Project State Route:** Implement `GET /api/project/:name/state` and `POST /api/project/:name/state` in `server/routes/projects.js`. This currently blocks `SharedProjectState.js` from persisting undo/redo stacks and session metadata to the server.
- [ ] **State Storage:** Store project state in `projects/:name/data/project_state.json`.

## Phase 10: Engine Combat & Logic Fixes
**Goal:** Fix broken gameplay systems and hardcoded engine values.
- [ ] **TopDown Mana Logic:** Fix `public/engines/shared/TopDownAdapter.js` to use `abilityDef.mana` instead of the non-existent `abilityDef.manaCost`.
- [ ] **Dynamic Tile Size:** Replace hardcoded `48px` tile size in `TopDownAdapter.js` with a dynamic reference to the engine's current tile configuration.
- [ ] **Ability System Fallbacks:** Improve `PlatformerAdapter.js` to actually trigger engine-level attacks when `useAbility('fireball')` is called, rather than just popping text.

## Phase 11: Game Data & API Consistency
**Goal:** Standardize how definitions and profiles are handled across the codebase.
- [ ] **Inconsistent Definitions API:** Standardize `server/routes/gamedata.js` to provide consistent `GET` and `POST` endpoints for all definition types (NPCs, Items, Skills, Enemies, Quests). Currently, some use `/api/:type` and others use `/api/:type-defs`.
- [ ] **Profile Cleanup:** Permanently delete the empty `public/oyuncu_profilleri` directory and update any lingering instructions in `copilot-instructions.md`.
- [ ] **Shared State Integration:** Update `npc_editor.js` and `enemy_editor.js` to prioritize `SharedProjectState` over direct `localStorage` when available.

## Phase 12: Security & Logging Polish
**Goal:** Clean up remaining security risks and console noise.
- [ ] **RPG Engine Security:** Replace `postMessage(..., '*')` in `public/engines/rpg-topdown/main.js` with `window.location.origin`.
- [ ] **Console Quiet Mode:** Remove or gate the frequent "Monitoring..." `setInterval` logs in `TopDownAdapter.js` and `IsoPixelAdapter.js` behind a debug flag to reduce console noise during production playtests.

---
*Created by Gemini CLI after identifying cross-module synchronization gaps.*