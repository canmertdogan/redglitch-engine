# NPC Studio UI Fixes - Canvas & Selection Issues

## Additional Problems Fixed

### Problem 1: Canvas Preview Not Rendering
**Symptoms:**
- Preview canvas in NPC Studio shows blank or "NOT FOUND"
- Sprite preview doesn't update when changing NPCs
- No visual feedback in the preview panel

**Root Causes:**
1. **Unsafe schema access** in `updatePreviewAnimation()` (line 873)
   - Code: `if (n.animations[state])` - crashes if `n.animations` is undefined
   - Missing fallback to `sprite` property for old schema NPCs

2. **Missing sprite key for old NPCs** (line 875)
   - Only checked `down` property, ignored flat `sprite` property
   - Old NPCs from `npcs.json` couldn't find their sprites

3. **zoomPreview calling wrong function** (line 938)
   - Called `renderPreview()` without parameters
   - Should call `updatePreviewAnimation()` to get current sprite key

4. **No re-render trigger** in `loadNPC()`
   - Changing NPCs didn't trigger preview update
   - Canvas stayed showing previous NPC's sprite

**Solutions:**

**Fix 1: Safe schema access in updatePreviewAnimation()**
```javascript
// Before
if (n.animations[state]) {
    // ... could crash if n.animations is undefined
}

// After
if (n.animations && n.animations[state]) {
    // ... safely checks both levels
    // Also checks for .sprite property (old schema)
    animKey = n.animations[state][dir] || 
              n.animations[state]['down'] || 
              n.animations[state].sprite;
}

// Fallback to idle
if (!animKey && n.animations && n.animations.idle) {
    animKey = n.animations.idle[dir] || 
              n.animations.idle.down || 
              n.animations.idle.sprite;
}
```

**Fix 2: Better frame counting**
```javascript
// Before
previewFrame = (previewFrame + 1) % 4; // Always assumes 4 frames

// After
const sprite = window.SPRITES[animKey];
const frameCount = sprite ? Math.floor(sprite.width / 16) : 4;
previewFrame = (previewFrame + 1) % Math.max(1, frameCount);
```

**Fix 3: Fixed zoom function**
```javascript
// Before
window.zoomPreview = function(delta) {
    previewZoom = Math.max(0.5, Math.min(3.0, previewZoom + delta));
    renderPreview(); // Missing sprite key parameter!
}

// After
window.zoomPreview = function(delta) {
    previewZoom = Math.max(0.5, Math.min(3.0, previewZoom + delta));
    updatePreviewAnimation(); // Gets sprite key automatically
}
```

**Fix 4: Trigger preview on NPC load**
```javascript
function loadNPC(idx) {
    currentIndex = idx;
    const n = ensureNewSchema(npcs[idx]);
    
    // Update NPC in array with migrated schema
    npcs[idx] = n;
    
    // ... load all form fields ...
    
    refreshList();
    updatePreviewAnimation(); // NEW: Trigger preview update
}
```

**Fix 5: Updated HTML event handlers**
```html
<!-- Before -->
<select id="preview-state" onchange="renderPreview()">

<!-- After -->
<select id="preview-state" onchange="updatePreviewAnimation()">
```

### Problem 2: Selection Indicator Not Moving ("Sarı Seçim İşaretçisi")
**Symptoms:**
- Yellow selection indicator stays on first NPC
- Clicking different NPCs loads their data but visual indicator doesn't move
- Active class not applying correctly

**Root Cause:**
The issue was NOT in the selection logic itself (that was working), but in the **schema migration** causing the NPC data to be inconsistent.

**Solution: Fixed ensureNewSchema()**
```javascript
// Before
if (!n.animations || !n.animations.idle.down) {
    // This could crash if n.animations.idle doesn't exist!
}

// After
if (!n.animations || !n.animations.idle || !n.animations.idle.down) {
    // Safely checks all levels
}
```

**Additional fix: Update NPC in array**
```javascript
function loadNPC(idx) {
    currentIndex = idx;
    const n = ensureNewSchema(npcs[idx]);
    
    // NEW: Update the NPC in array with migrated schema
    // This ensures subsequent operations use consistent data
    npcs[idx] = n;
    
    // ... rest of loading ...
}
```

## Files Modified

### 1. `public/npc_editor.js`
- **Line 366**: Fixed `ensureNewSchema()` to safely check nested properties
- **Line 376**: Added `script: ''` to behavior object (consistency)
- **Line 325**: Store migrated NPC back into array
- **Line 865**: Rewrote `updatePreviewAnimation()` with safe access and fallbacks
- **Line 938**: Fixed `zoomPreview()` to call correct function
- **Line 362**: Added `updatePreviewAnimation()` call at end of `loadNPC()`

### 2. `public/npc_editor.html`
- **Lines 456, 464**: Changed `onchange="renderPreview()"` to `onchange="updatePreviewAnimation()"`

## Testing Checklist

### Canvas Rendering Test
1. ✅ Open NPC Studio
2. ✅ Preview canvas shows sprite (not blank or "NOT FOUND")
3. ✅ Click different NPCs - preview updates
4. ✅ Change State dropdown (Idle/Walk/Talk) - preview updates
5. ✅ Change Direction dropdown (Front/Back/Side) - preview updates
6. ✅ Click zoom in/out buttons - sprite scales correctly
7. ✅ Animation plays (frames cycle if animated sprite)

### Selection Indicator Test
1. ✅ Open NPC Studio with multiple NPCs
2. ✅ Yellow indicator on first NPC initially
3. ✅ Click second NPC - indicator moves down
4. ✅ Click third NPC - indicator moves down again
5. ✅ Click first NPC - indicator moves back up
6. ✅ Form fields update to show correct NPC data
7. ✅ Preview shows correct sprite for selected NPC

### Schema Compatibility Test
1. ✅ Old NPCs (with `sprite` property) load and preview correctly
2. ✅ New NPCs (with directional sprites) load and preview correctly
3. ✅ Can edit and save both types without corruption
4. ✅ Migration happens automatically and transparently

## Quick Test
Open `test_npc_studio.html` in browser to verify:
- ✅ Sprites load
- ✅ Schema migration works
- ✅ Canvas rendering works
- ✅ Selection highlighting works

## Why This Happened

The NPC editor was built with the **new directional schema** in mind, but the actual NPCs in `npcs.json` still use the **old flat schema**. The migration code existed but had bugs:

1. **Unsafe property access** - didn't check if intermediate objects existed
2. **Missing fallbacks** - didn't try old `sprite` property when directional sprites missing
3. **No re-render triggers** - preview didn't update when changing selections
4. **Incomplete migration** - migrated NPCs weren't stored back in array

These fixes make the editor **fully backward compatible** while supporting the new features.

---

**Status:** ✅ Fixed  
**Backward Compatibility:** ✅ Fully compatible  
**Files Changed:** 2 (npc_editor.js, npc_editor.html)  
**Breaking Changes:** None  
**Date:** 2026-02-07
