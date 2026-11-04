# Manual QA Checklist — Studio Tool Rescue

Smoke audit proves "page loads, no console errors, no failed requests". This checklist proves "tool actually works end-to-end" for the high-risk tools. Run it once per tool (≈5 min each), in a clean app start (`npm start`).

Record pass/fail inline. Any failure = P1, revert to the tool's last-green state and log an issue.

## Batch A — Level / 3D editors

### 1. Level Editor (`editor.html`)
- [ ] Opens; tile palette populates (no 0-texture atlas, no missing PNG 500s in devtools Network tab)
- [ ] Paint 3 tiles on layer 0
- [ ] Save (Ctrl+S or Save button) → no error toast; `dunyalar/` file reflects the change
- [ ] Close and reopen → painted tiles are still there
- [ ] Playtest (▶ button) → game window opens and the map is playable (WASD moves, no console errors)

### 2. 3D Studio (`editor3d.html`)
- [ ] Opens; 3D viewport renders (not black); camera orbit works with mouse drag
- [ ] Place one prop from the asset panel → appears in scene
- [ ] Save → reload → prop persists
- [ ] Switch mode (FPS / Platformer / Top-Down via toolbar) → mode changes without errors

### 3. IsoPixel Studio (`iso_editor.html`)
- [ ] Opens; isometric grid renders; sprites load
- [ ] Place one tile → save → reload → persists
- [ ] "Playtest" opens `iso_play.html` with the current map

### 4. Platformer Studio (`platformer_editor.html`)
- [ ] Opens; level list loads (GET /api/levels)
- [ ] Place/erase platforms; save → `dunyalar/<name>.json` written
- [ ] Reload → level reloads identical
- [ ] Playtest → platformer runtime opens, character spawns

### 5. Campaign Flow (`campaign_editor.html`)
- [ ] Opens; campaign graph renders with nodes
- [ ] Add a node → connect it → save → reload → graph intact
- [ ] Global variables panel edits persist

### 6. Dashboard (`dashboard.html` → Studio shell)
- [ ] Launch Studio → "NEW BUILDS" dropdown lists exactly 16 React builds with canonical names (no "(New)")
- [ ] Legacy duplicates are NOT listed anywhere (files remain in `git` history)
- [ ] Open each of the 16 — each loads without console errors

## Batch C — Entity editors (spot check 3 of 16)

### Item Database (v2, `studio-dist/item_editor.html`)
- [ ] Item list loads from `/api/items` (154 items in Default Project)
- [ ] Edit one field → save → reload → change persisted

### Quest Designer (v2, `studio-dist/quest_editor.html`)
- [ ] Quest list loads (10 quests); edit one quest → save → reload → persisted

### Dialogue Studio (v2, `studio-dist/dialogue_editor.html`)
- [ ] Characters + conversations load; edit a line → save → reload → persisted; engine format stays `nodes[]`

## Player golden path (optional but recommended)

- [ ] `npm start` → main menu renders (VT323 font visible, background image loads)
- [ ] Launch a campaign → runtime boots → one room is completable → quit to menu without errors

## Triage outcomes

| Tool | Result | Notes |
|---|---|---|
| editor.html | | |
| editor3d.html | | |
| iso_editor.html | | |
| platformer_editor.html | | |
| campaign_editor.html | | |

Any ✗ → the file is a P1 candidate; decision goes to the triage gate (fix / hide / keep).
