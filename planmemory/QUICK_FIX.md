# Quick Fix Applied

## Problem
NPC editor preview was over-engineered with too many safety checks and fallbacks that actually prevented rendering.

## Solution
Simplified `updatePreviewAnimation()` to match the working enemy editor exactly:

1. Removed excessive fallback chains
2. Removed conditional frame counting
3. Kept simple 4-frame cycle
4. Trust that `ensureNewSchema()` already migrated the data correctly

## Test Steps
1. Open http://localhost:3000/npc_editor.html
2. Check if canvas shows sprite
3. Click different NPCs - selection should move
4. Check browser console for any errors

## If Still Not Working
Open `simple_npc_test.html` in browser to debug:
- Verifies sprites load
- Tests schema migration
- Tests canvas rendering
- Shows detailed logs

Run this command from project root:
```bash
npm start
```

Then open browser to:
- http://localhost:3000/simple_npc_test.html (debug test)
- http://localhost:3000/npc_editor.html (actual editor)
