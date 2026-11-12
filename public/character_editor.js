// character_editor.js - Enhanced Redglitch Hero Studio
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;
let characterId = null; // Current character being edited

// Initialize integration
function initializeIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedglitchEventBus;
        projectState = window.RedglitchProjectState;
        assetManager = window.RedglitchAssetManager;
        
        if (eventBus) {
            // Listen for external character load requests
            eventBus.on('character:load', (event) => {
                if (event.data.characterId) {
                    loadCharacterById(event.data.characterId);
                }
            });
            
            // Listen for skill updates (character may have skills)
            eventBus.on('skill:updated', (event) => {
                console.log('[CharacterEditor] Skill updated:', event.data.skillId);
                // Could refresh skill list UI here
            });
            
            // Listen for item updates (character may have items)
            eventBus.on('item:updated', (event) => {
                console.log('[CharacterEditor] Item updated:', event.data.itemId);
                // Could refresh inventory UI here
            });
            
            console.log('[CharacterEditor] EventBus connected');
        }
        
        if (projectState) {
            // Watch for external character changes
            projectState.watch('characters', (characters) => {
                console.log('[CharacterEditor] Characters state changed');
            }, { deep: true });
        }
    }
}

// Load character from shared state
function loadCharacterById(id) {
    if (!projectState) return;
    
    const character = projectState.get(`characters.${id}`);
    if (character) {
        characterId = id;
        charData = { ...charData, ...character };
        updateUIFromData();
        
        if (eventBus) {
            eventBus.emit('character:loaded', {
                characterId: id,
                character: charData,
                timestamp: Date.now()
            });
        }
        
        console.log(`[CharacterEditor] Loaded character: ${id}`);
    }
}

// Save character to shared state and broadcast
function saveCharacterToState() {
    if (!projectState) return;
    
    updateDataFromUI();
    
    // Generate ID if needed
    if (!characterId) {
        characterId = charData.name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    }
    
    // Save to shared state
    projectState.set(`characters.${characterId}`, {
        ...charData,
        id: characterId,
        lastModified: Date.now()
    });
    
    // Broadcast update
    if (eventBus) {
        eventBus.emit('character:updated', {
            characterId: characterId,
            character: charData,
            timestamp: Date.now()
        });
    }
    
    console.log(`[CharacterEditor] Saved character: ${characterId}`);
}

// Delete character from shared state
function deleteCharacterFromState() {
    if (!projectState || !characterId) return;
    
    const characters = projectState.get('characters', {});
    delete characters[characterId];
    projectState.set('characters', characters);
    
    if (eventBus) {
        eventBus.emit('character:deleted', {
            characterId: characterId,
            timestamp: Date.now()
        });
    }
    
    characterId = null;
    console.log('[CharacterEditor] Character deleted');
}

// Get list of all characters
function getAllCharacters() {
    if (!projectState) return [];
    return Object.values(projectState.get('characters', {}));
}

const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

// State
let charData = {
    name: "Traveler",
    hp: 100,
    stamina: 100,
    mana: 50,
    speed: 250,
    jumpForce: 600,
    glowColor: "#e74c3c",
    segmentCount: 8,
    segmentSpacing: 8,
    tapering: 0.8,
    wobble: 5,
    // Sprites
    headData: null, // Base64
    bodyData: null  // Base64
};

// Preview Engine
let headImg = new Image();
let bodyImg = new Image();
let isMoving = false;
let history = []; // Path history for slither preview
let previewTime = 0;

// Default Sprites (Keys for engine)
const DEFAULT_HEAD_KEY = "caterpillar_head";
const DEFAULT_BODY_KEY = "caterpillar_body";

// --- INIT ---
window.onload = async () => {
    // Initialize integration system first
    initializeIntegration();
    
    // 1. Try load from shared state first, then local storage
    let loaded = false;
    if (projectState) {
        const characters = projectState.get('characters', {});
        const characterIds = Object.keys(characters);
        if (characterIds.length > 0) {
            // Load most recent character
            loadCharacterById(characterIds[characterIds.length - 1]);
            loaded = true;
        }
    }
    
    if (!loaded) {
        const saved = localStorage.getItem('redglitch_character');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                charData = { ...charData, ...parsed };
                loaded = true;
            } catch (e) { console.error("Load failed", e); }
        }
    }

    // Fallback: load persisted hero from the project file
    if (!loaded) {
        try {
            const res = await fetch('/api/ide/read?file=' + encodeURIComponent('data/characters/hero.json'));
            if (res.ok) {
                const parsed = JSON.parse(await res.text());
                charData = { ...charData, ...parsed };
                loaded = true;
            }
        } catch (e) { console.warn('[character_editor] project load failed:', e.message); }
    }

    // 2. Load Images
    if (charData.headData) headImg.src = charData.headData;
    if (charData.bodyData) bodyImg.src = charData.bodyData;

    // 3. Setup UI
    updateUIFromData();
    setupEventListeners();

    // 4. Start Preview Loop
    scheduleCharLoop();
};

function updateUIFromData() {
    document.getElementById('char-name').value = charData.name;
    document.getElementById('stat-hp').value = charData.hp;
    document.getElementById('stat-stamina').value = charData.stamina;
    document.getElementById('stat-mana').value = charData.mana;
    document.getElementById('stat-speed').value = charData.speed;
    document.getElementById('stat-jump').value = charData.jumpForce || 600;
    document.getElementById('glow-color').value = charData.glowColor;
    
    document.getElementById('cfg-segments').value = charData.segmentCount;
    document.getElementById('cfg-spacing').value = charData.segmentSpacing;
    document.getElementById('cfg-taper').value = charData.tapering * 100;
    document.getElementById('cfg-wobble').value = charData.wobble;

    updateLabelValues();
}

function updateDataFromUI() {
    charData.name = document.getElementById('char-name').value;
    charData.hp = parseInt(document.getElementById('stat-hp').value, 10) || 100;
    charData.stamina = parseInt(document.getElementById('stat-stamina').value, 10) || 100;
    charData.mana = parseInt(document.getElementById('stat-mana').value, 10) || 0;
    charData.speed = parseInt(document.getElementById('stat-speed').value, 10) || 250;
    charData.jumpForce = parseInt(document.getElementById('stat-jump').value, 10) || 600;
    charData.glowColor = document.getElementById('glow-color').value;
    
    charData.segmentCount = parseInt(document.getElementById('cfg-segments').value, 10) || 1;
    charData.segmentSpacing = parseInt(document.getElementById('cfg-spacing').value, 10) || 8;
    charData.tapering = (parseInt(document.getElementById('cfg-taper').value, 10) || 0) / 100;
    charData.wobble = parseInt(document.getElementById('cfg-wobble').value, 10) || 0;

    updateLabelValues();
}

function updateLabelValues() {
    document.getElementById('val-segments').innerText = charData.segmentCount;
    document.getElementById('val-spacing').innerText = charData.segmentSpacing;
}

function setupEventListeners() {
    // Standard inputs
    document.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', updateDataFromUI);
    });

    // File inputs
    document.getElementById('head-input').addEventListener('change', (e) => handleFile(e, 'head'));
    document.getElementById('body-input').addEventListener('change', (e) => handleFile(e, 'body'));
}

function handleFile(e, target) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const data = ev.target.result;
        if (target === 'head') {
            charData.headData = data;
            headImg.src = data;
        } else {
            charData.bodyData = data;
            bodyImg.src = data;
        }
    };
    reader.readAsDataURL(file);
}

window.resetSprite = function(target) {
    if (target === 'head') {
        charData.headData = null;
        headImg.src = ""; // Clear current image
    } else {
        charData.bodyData = null;
        bodyImg.src = "";
    }
};

// Helper to draw either custom image or engine sprite
function renderSprite(ctx, key, img, x, y, w, h) {
    if (img.src && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, img.width, img.height, x, y, w, h);
    } else {
        const sprite = window.createPixelImage(key);
        if (sprite) {
            ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, x, y, w, h);
        }
    }
}

// --- TAB LOGIC ---
window.showTab = function(tabId, btnEl) {
    document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) targetTab.style.display = 'block';

    document.querySelectorAll('.list-item').forEach(i => i.classList.remove('active'));
    const activeBtn = btnEl || document.querySelector(`.list-item[data-tab="${CSS.escape(tabId)}"]`);
    if (activeBtn) activeBtn.classList.add('active');
};

window.togglePreviewPanel = function() {
    const panel = document.getElementById('preview-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
};

// --- PREVIEW LOGIC ---
window.setPreviewState = function(state) {
    isMoving = (state === 'move');
    document.querySelectorAll('.anim-btn').forEach(b => b.classList.remove('active'));
    const btns = document.querySelectorAll('.anim-btn');
    if (isMoving) btns[1].classList.add('active');
    else btns[0].classList.add('active');
};

window.__studioPaused = false;
var _charRaf = null;
var _lastCharDraw = -120;
function scheduleCharLoop() {
    if (!_charRaf && !window.__studioPaused && !document.hidden) {
        _charRaf = requestAnimationFrame(renderLoop);
    }
}
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'studio:visibility') {
        window.__studioPaused = !e.data.visible;
        if (e.data.visible) {
            _lastCharDraw = -120;
            scheduleCharLoop();
        } else if (_charRaf) {
            cancelAnimationFrame(_charRaf);
            _charRaf = null;
        }
    }
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (_charRaf) {
            cancelAnimationFrame(_charRaf);
            _charRaf = null;
        }
    } else {
        _lastCharDraw = -120;
        scheduleCharLoop();
    }
});

function renderLoop(timestamp) {
    _charRaf = null;
    if (window.__studioPaused || document.hidden) return;
    const now = timestamp || performance.now();
    if (!isMoving && now - _lastCharDraw < 66) {
        scheduleCharLoop();
        return;
    }
    _lastCharDraw = now;
    previewTime += 0.016;
    
    // 1. Simulate Slither Movement for preview
    let headX, headY;
    if (isMoving) {
        // Move in a circle
        headX = canvas.width/2 + Math.cos(previewTime * 2) * 80;
        headY = canvas.height/2 + Math.sin(previewTime * 4) * 40;
    } else {
        headX = canvas.width/2;
        headY = canvas.height/2;
    }

    // Update path history
    history.unshift({ x: headX, y: headY, dir: Math.sin(previewTime*2) > 0 ? 1 : -1 });
    if (history.length > 500) history.pop();

    // 2. Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const scale = 3;
    const baseW = 16 * scale;
    const baseH = 16 * scale;

    // --- DRAW BODY ---
    ctx.shadowColor = charData.glowColor;
    ctx.shadowBlur = isMoving ? 10 : 25;

    for (let i = charData.segmentCount; i > 0; i--) {
        const hIdx = i * charData.segmentSpacing;
        const pos = history[hIdx] || history[history.length - 1];
        if (!pos) continue;

        const t = 1.0 - (i / (charData.segmentCount + 2)) * charData.tapering;
        const sw = baseW * t;
        const sh = baseH * t;

        const wobble = isMoving ? Math.sin(previewTime * 10 + i * 0.5) * charData.wobble : 0;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.scale(pos.dir, 1);
        
        renderSprite(ctx, DEFAULT_BODY_KEY, bodyImg, -sw/2, -sh/2 + wobble, sw, sh);
        ctx.restore();
    }

    // --- DRAW HEAD ---
    ctx.save();
    ctx.translate(headX, headY);
    const headDir = history[0] ? history[0].dir : 1;
    ctx.scale(headDir, 1);
    
    renderSprite(ctx, DEFAULT_HEAD_KEY, headImg, -baseW/2, -baseH/2, baseW, baseH);
    ctx.restore();

    ctx.shadowBlur = 0;

    scheduleCharLoop();
}

// --- IO ---
function persistToProject() {
    return fetch('/api/ide/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            file: 'data/characters/hero.json',
            content: JSON.stringify(charData, null, 2)
        })
    }).then(r => { if (!r.ok) throw new Error('project save failed'); });
}

function showToast(msg, isError = false) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:16px;right:16px;z-index:10000;padding:8px 14px;background:${isError ? '#3a0d0d' : '#0b2416'};color:${isError ? '#ff8a8a' : '#7ef2a6'};border:1px solid ${isError ? '#ff4444' : '#2ecc71'};font-family:inherit;font-size:0.95rem;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

window.saveToBrowser = async function(options = {}) {
    const silent = Boolean(options && options.silent);
    updateDataFromUI();
    localStorage.setItem('redglitch_character', JSON.stringify(charData));
    
    // Also save to shared state
    saveCharacterToState();

    // Persist to the project so the hero survives across sessions
    try {
        await persistToProject();
        if (!silent) showToast("SYSTEM UPDATED: HERO CONFIG SAVED.");
    } catch (e) {
        console.warn('[character_editor] project save failed:', e.message);
        if (!silent) showToast("HERO SAVED LOCALLY (PROJECT WRITE FAILED)", true);
    }
};
window.save = window.saveToBrowser;

window.downloadJSON = function() {
    updateDataFromUI();
    const blob = new Blob([JSON.stringify(charData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hero_${charData.name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// New character function
window.newCharacter = function() {
    characterId = null;
    charData = {
        name: "New Hero",
        hp: 100,
        stamina: 100,
        mana: 50,
        speed: 250,
        jumpForce: 600,
        glowColor: "#e74c3c",
        segmentCount: 8,
        segmentSpacing: 8,
        tapering: 0.8,
        wobble: 5,
        headData: null,
        bodyData: null
    };
    headImg.src = "";
    bodyImg.src = "";
    const headIn = document.getElementById('head-input');
    const bodyIn = document.getElementById('body-input');
    if (headIn) headIn.value = '';
    if (bodyIn) bodyIn.value = '';
    updateUIFromData();
    
    if (eventBus) {
        eventBus.emit('character:new', { timestamp: Date.now() });
    }
    showToast("NEW HERO PROFILE CREATED");
};

// Load character list
window.showCharacterList = function() {
    const characters = getAllCharacters();
    if (characters.length === 0) {
        showToast('NO SAVED CHARACTERS IN PROJECT STATE');
        return;
    }
    
    const list = characters.map((c, idx) => `${idx + 1}. ${c.name} (${c.id})`).join('\n');
    const selected = prompt(`SELECT CHARACTER:\n\n${list}\n\nEnter character name or number:`);
    
    if (selected) {
        const trimmed = selected.trim();
        const byNum = Number(trimmed);
        let char = null;
        if (Number.isInteger(byNum) && byNum >= 1 && byNum <= characters.length) {
            char = characters[byNum - 1];
        } else {
            char = characters.find(c => (c.name || '').toLowerCase() === trimmed.toLowerCase() || c.id === trimmed);
        }
        if (char) {
            loadCharacterById(char.id);
            if (charData.headData) headImg.src = charData.headData; else headImg.src = '';
            if (charData.bodyData) bodyImg.src = charData.bodyData; else bodyImg.src = '';
            showToast(`LOADED: ${char.name}`);
        } else {
            showToast('CHARACTER NOT FOUND', true);
        }
    }
};
