# Placeholder State Technologies

Placeholder technologies are stub, skeleton, or otherwise unimplemented features that exist in the codebase as scaffolding for future work. They may return hardcoded values, log TODO messages, or be entirely disabled.

## Engine Ability Systems

| Placeholder | File | Status |
|---|---|---|
| `FPS3DStrategy.useAbility()` | `public/engines/3d/systems/FPS3DStrategy.js:161` | Stub — always returns `false`, logs "not yet implemented" |
| `FPS3DStrategy.isAbilityReady()` | `public/engines/3d/systems/FPS3DStrategy.js:175` | Stub — always returns `true`, cooldowns not tracked |
| `FPS3DStrategy.getCooldownFraction()` | `public/engines/3d/systems/FPS3DStrategy.js:185` | Stub — always returns `0`, cooldowns not tracked |
| `Platformer3DStrategy.useAbility()` | `public/engines/3d/systems/Platformer3DStrategy.js:132` | Stub — always returns `false`, logs "not yet implemented" |
| `Platformer3DStrategy.isAbilityReady()` | `public/engines/3d/systems/Platformer3DStrategy.js:144` | Stub — always returns `true`, cooldowns not tracked |
| `Platformer3DStrategy.getCooldownFraction()` | `public/engines/3d/systems/Platformer3DStrategy.js:154` | Stub — always returns `0`, cooldowns not tracked |

## Interactive Cutscene Engine

| Placeholder | File | Status |
|---|---|---|
| `connectToAlgorithmStudio()` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:294` | TODO: Phase 6 — Algorithm Studio integration |
| `connectToCampaignEditor()` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:299` | TODO: Phase 7 — Campaign Editor integration |
| `InteractiveCutsceneTimeline.init()` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:314` | TODO: Timeline rendering system |
| `InteractiveCutsceneTimeline.update()` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:318` | TODO: Timeline animations, audio |
| `InteractiveCutsceneTimeline.switchBranch()` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:323` | TODO: Switch timeline tracks to new branch |
| `InteractiveCutsceneDialogue.loadDialogue()` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:364` | TODO: Load dialogue from definitions |
| `InteractiveCutsceneDialogue.update()` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:368` | TODO: Dialogue animations, text effects |
| `InteractiveCutsceneChoices.update()` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:441` | TODO: Choice animations, timers |
| `InteractiveCutsceneState.checkCondition()` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:476` | TODO: Condition checking system |

## Weather & Atmosphere

| Placeholder | File | Status |
|---|---|---|
| `WeatherSystem` | `public/engines/rpg-topdown/WeatherSystem.js` | Minimal (11 lines). Only ash particles + heat ripple distortion. No rain, snow, fog, or storms. |
| `AtmosphereSystem` | `public/shared/AtmosphereSystem.js` | Entirely disabled — canvas hidden, `animate()` is a no-op. |

## Server Routes

| Placeholder | File | Status |
|---|---|---|
| `GET /abilities` | `server/routes/abilities.js:16` | Labeled "placeholder for future implementation" |
| `POST /abilities` | `server/routes/abilities.js:30` | Labeled "placeholder for future implementation" |

## Visual Script Logic Graphs (VSL)

| Placeholder | File | Status |
|---|---|---|
| `engine_physics.json` | `data/logic/engine_physics.json` | Uses `eng_log` nodes to describe AABB physics steps instead of computing them |
| `system_init.json` | `data/logic/system_init.json` | Uses `eng_log` nodes to log init steps instead of performing them |
| `ui_master.json` | `data/logic/ui_master.json` | Uses `eng_log` nodes to log render steps instead of rendering |
| `start_game.js` | `data/logic/start_game.js` | 4-line stub delegating to `ui.handleAction()` |
| `open_engine.js` | `data/logic/open_engine.js` | 4-line stub delegating to `ui.handleAction()` |
| `confirm_skills_and_start.js` | `data/logic/confirm_skills_and_start.js` | 4-line stub delegating to `ui.handleAction()` |
| `start_skill_selector.js` | `data/logic/start_skill_selector.js` | 5-line stub showing a screen |

## Empty Data Directories

| Placeholder | Path | Intended For |
|---|---|---|
| `data/fx/` | `data/fx/` | VFX / particle effect definitions |
| `data/shaders/` | `data/shaders/` | Custom shader definitions |

## Backend Tests

| Placeholder | File | Status |
|---|---|---|
| `test_basic` | `backend/tests/test_basic.py` | `def test_basic(): assert True` — placeholder test |

## Sound System

| Placeholder | File | Status |
|---|---|---|
| `SoundManager._generateSynthetic()` | `public/shared/SoundManager.js:536` | Generates placeholder beep/chime/thud when audio asset fails to load |

## AI Assistant

| Placeholder | File | Status |
|---|---|---|
| `changeBackground()` | `public/ai/msn-bridge.js:506` | Returns "Feature coming soon!" |
| Mouse tracking | `public/ai/avatar/renderer.js:168` | TODO: Mouse tracking |

## Project Editor Stubs

| Placeholder | File | Status |
|---|---|---|
| Placeholder canvas renderer | `projects/Default Project/fps_editor.js:440` | Fallback when WebGL unavailable |
| `collapseHierarchy()` | `projects/Default Project/platformer3d_editor.js:1023` | Stub — all sections visible |

## NPC Brains

| Placeholder | File | Status |
|---|---|---|
| `test_wander.js` | `data/brains/test_wander.js` | Minimal auto-generated brain — 21 lines, greets and wanders |
