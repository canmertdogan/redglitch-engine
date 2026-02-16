# Editor Comparison

## Key Differences

### Enemy Editor (Working)
```javascript
function updatePreviewAnimation() {
    const en = enemies[currentIndex];
    if (!en) return;

    const state = document.getElementById('preview-state').value;
    const dir = document.getElementById('preview-dir').value || 'down';
    
    let animKey = null;
    if (en.animations[state]) {  // NO safety check on en.animations
        if (en.animations[state].base) animKey = en.animations[state].base;
        else animKey = en.animations[state][dir] || en.animations[state]['down'];
    }
```

### NPC Editor (Not Working)
```javascript
function updatePreviewAnimation() {
    const n = npcs[currentIndex];
    if (!n) return;

    const state = document.getElementById('preview-state').value;
    const dir = document.getElementById('preview-dir').value || 'down';
    
    let animKey = null;
    if (n.animations && n.animations[state]) {  // Has safety check
        if (n.animations[state].base) animKey = n.animations[state].base;
        else animKey = n.animations[state][dir] || n.animations[state]['down'] || n.animations[state].sprite;
    }
```

## Hypothesis
The problem might be that the safety check is TOO safe - it prevents even valid NPCs from rendering.
Or the NPC schema is different and always fails the check.

## Solution
Make NPC editor match enemy editor exactly, since enemy editor works.
