// npc_editor.js - Advanced Logic with Directional Support
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

// Initialize integration
function initializeIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.KetebeEventBus;
        projectState = window.KetebeProjectState;
        assetManager = window.KetebeAssetManager;
        
        if (eventBus) {
            // Listen for character updates (NPCs reference characters)
            eventBus.on('character:updated', (event) => {
                console.log('[NPCEditor] Character updated:', event.data.characterId);
                // Could refresh character dropdown if exists
            });
            
            // Listen for dialogue updates
            eventBus.on('dialogue:updated', (event) => {
                console.log('[NPCEditor] Dialogue updated:', event.data.dialogueId);
            });
            
            // Listen for external NPC load requests
            eventBus.on('npc:load', (event) => {
                if (event.data.npcId) {
                    const idx = npcs.findIndex(n => n.id === event.data.npcId);
                    if (idx >= 0) loadNPC(idx);
                }
            });
            
            console.log('[NPCEditor] EventBus connected');
        }
    }
}

// Broadcast NPC changes
function broadcastNPCUpdate(npc, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`npc:${action}`, {
            npcId: npc.id,
            npc: npc,
            timestamp: Date.now()
        });
    }
    
    // Also save to project state
    if (projectState) {
        projectState.set(`npcs.${npc.id}`, npc);
    }
}

// Save all NPCs to project state
function saveNPCsToState() {
    if (!projectState) return;
    
    const npcMap = {};
    npcs.forEach(npc => {
        npcMap[npc.id] = npc;
    });
    projectState.set('npcs', npcMap);
}

let npcs = [];
let currentIndex = 0;
let previewTimer = 0;
let previewFrame = 0;
let previewPlaying = true;
let previewZoom = 1.0;
let hasUnsavedChanges = false;
let filteredNPCs = [];
let bulkMode = false;
let selectedNPCs = new Set();

const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

let availableBrains = [];

// NPC Templates
const NPC_TEMPLATES = {
    villager: {
        name: "Friendly Villager",
        desc: "Basic friendly NPC",
        data: {
            type: 'npc',
            name: 'Friendly Villager',
            stats: { speed: 50 },
            interaction: { dialogue: 'greeting', range: 60 },
            behavior: { type: 'wander', range: 100, idleTime: 3.0, script: '' },
            animations: {
                idle: { down: 'villager_idle', up: 'villager_idle', side: 'villager_idle', speed: 0.2 },
                walk: { down: 'villager_walk', up: 'villager_walk', side: 'villager_walk', speed: 0.15 },
                talk: { base: 'villager_idle', speed: 0.2 }
            }
        }
    },
    guard: {
        name: "Guard",
        desc: "Stationary guard NPC",
        data: {
            type: 'npc',
            name: 'Guard',
            stats: { speed: 60 },
            interaction: { dialogue: 'guard_greeting', range: 70 },
            behavior: { type: 'static', range: 0, idleTime: 0, script: '' },
            animations: {
                idle: { down: 'guard_idle', up: 'guard_idle', side: 'guard_idle', speed: 0.2 },
                walk: { down: 'guard_walk', up: 'guard_walk', side: 'guard_walk', speed: 0.15 },
                talk: { base: 'guard_idle', speed: 0.2 }
            }
        }
    },
    merchant: {
        name: "Merchant",
        desc: "Shop keeper NPC",
        data: {
            type: 'npc',
            name: 'Merchant',
            stats: { speed: 40 },
            interaction: { dialogue: 'shop_welcome', range: 80 },
            behavior: { type: 'static', range: 0, idleTime: 0, script: '' },
            animations: {
                idle: { down: 'merchant_idle', up: 'merchant_idle', side: 'merchant_idle', speed: 0.2 },
                walk: { down: 'merchant_walk', up: 'merchant_walk', side: 'merchant_walk', speed: 0.15 },
                talk: { base: 'merchant_idle', speed: 0.2 }
            }
        }
    },
    patrol: {
        name: "Patrol Guard",
        desc: "Patrolling guard",
        data: {
            type: 'npc',
            name: 'Patrol Guard',
            stats: { speed: 70 },
            interaction: { dialogue: 'patrol_greeting', range: 60 },
            behavior: { type: 'patrol', range: 200, idleTime: 2.0, script: '' },
            animations: {
                idle: { down: 'guard_idle', up: 'guard_idle', side: 'guard_idle', speed: 0.2 },
                walk: { down: 'guard_walk', up: 'guard_walk', side: 'guard_walk', speed: 0.15 },
                talk: { base: 'guard_idle', speed: 0.2 }
            }
        }
    },
    questgiver: {
        name: "Quest Giver",
        desc: "NPC with quest",
        data: {
            type: 'npc',
            name: 'Quest Giver',
            stats: { speed: 50 },
            interaction: { dialogue: 'quest_intro', range: 70 },
            behavior: { type: 'static', range: 0, idleTime: 0, script: '' },
            animations: {
                idle: { down: 'elder_idle', up: 'elder_idle', side: 'elder_idle', speed: 0.2 },
                walk: { down: 'elder_walk', up: 'elder_walk', side: 'elder_walk', speed: 0.15 },
                talk: { base: 'elder_idle', speed: 0.2 }
            }
        }
    }
};

window.onload = async () => {
    // Initialize integration first
    initializeIntegration();
    
    await loadFromServer();
    await loadBrains();
    if (npcs.length === 0) addNewNPC();
    filteredNPCs = [...npcs];
    refreshList();
    loadNPC(0);
    
    // Start Preview Loop
    loop();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Warn before closing with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
        }
    });
};

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+S or Cmd+S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveToServer();
        }
        // Delete key to delete (only if not focused on input)
        if (e.key === 'Delete' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
            e.preventDefault();
            window.deleteNPC();
        }
        // Ctrl+N or Cmd+N to create new
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            addNewNPC();
        }
        // Ctrl+D or Cmd+D to duplicate
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            window.duplicateNPC();
        }
        // Arrow keys to navigate list (if not in input)
        if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIdx = Math.min(currentIndex + 1, filteredNPCs.length - 1);
                const actualIdx = npcs.indexOf(filteredNPCs[nextIdx]);
                if (actualIdx >= 0) loadNPC(actualIdx);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIdx = Math.max(currentIndex - 1, 0);
                const actualIdx = npcs.indexOf(filteredNPCs[prevIdx]);
                if (actualIdx >= 0) loadNPC(actualIdx);
            }
        }
    });
}

window.filterList = function() {
    const query = document.getElementById('search-filter').value.toLowerCase();
    if (!query) {
        filteredNPCs = [...npcs];
    } else {
        filteredNPCs = npcs.filter(n => 
            (n.id && n.id.toLowerCase().includes(query)) || 
            (n.name && n.name.toLowerCase().includes(query))
        );
    }
    refreshList();
}

function markUnsaved() {
    hasUnsavedChanges = true;
    document.title = '* NPC STUDIO';
}

function markSaved() {
    hasUnsavedChanges = false;
    document.title = 'NPC STUDIO';
}

async function loadBrains() {
    try {
        const res = await fetch('/api/brains/list');
        if (res.ok) {
            availableBrains = await res.json();
            const sel = document.getElementById('npc-brain');
            // Keep first option
            while (sel.options.length > 1) sel.remove(1);
            availableBrains.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b; opt.innerText = b;
                sel.appendChild(opt);
            });
        }
    } catch(e) { console.warn("Brains fetch failed"); }
}

window.editBrain = function() {
    const val = document.getElementById('npc-brain').value;
    if (val) window.open(`behavior_editor.html?script=${val}`, '_blank');
    else alert("Select a brain to edit or create new.");
}

window.newBrain = function() {
    const name = prompt("New Brain ID:");
    if (name) window.open(`behavior_editor.html?script=${name}`, '_blank');
}

function loop() {
    updatePreviewAnimation();
    requestAnimationFrame(loop);
}

function refreshList() {
    const list = document.getElementById('npc-list');
    list.innerHTML = '';
    filteredNPCs.forEach((n) => {
        const idx = npcs.indexOf(n);
        const div = document.createElement('div');
        div.className = 'list-item';
        if (idx === currentIndex) div.classList.add('active');
        
        if (bulkMode) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'bulk-checkbox';
            checkbox.checked = selectedNPCs.has(idx);
            checkbox.onclick = (e) => {
                e.stopPropagation();
                if (checkbox.checked) selectedNPCs.add(idx);
                else selectedNPCs.delete(idx);
            };
            div.appendChild(checkbox);
        }
        
        const span = document.createElement('span');
        span.innerHTML = `${n.name || n.id} <span style="font-size:0.8em; color:#666;">${n.id}</span>`;
        div.appendChild(span);
        
        div.onclick = () => {
            if (!bulkMode) loadNPC(idx);
        };
        list.appendChild(div);
    });
}

function loadNPC(idx) {
    currentIndex = idx;
    const n = ensureNewSchema(npcs[idx]);
    
    // Update the NPC in the array with migrated schema
    npcs[idx] = n;
    
    // Core
    document.getElementById('npc-id').value = n.id;
    document.getElementById('npc-name').value = n.name || n.id;
    document.getElementById('npc-dialogue').value = n.interaction.dialogue;
    document.getElementById('npc-range').value = n.interaction.range;
    document.getElementById('npc-speed').value = n.stats.speed;

    // Behavior
    document.getElementById('npc-ai-type').value = n.behavior.type;
    document.getElementById('npc-wander-radius').value = n.behavior.range;
    document.getElementById('npc-idle-time').value = n.behavior.idleTime;
    
    // Select the correct brain in dropdown
    const brainSelect = document.getElementById('npc-brain');
    if (n.behavior.script) {
        brainSelect.value = n.behavior.script;
    } else {
        brainSelect.value = '';
    }

    // Visuals (Directional)
    const setVal = (id, val) => document.getElementById(id).value = val || '';
    
    setVal('anim-idle-down', n.animations.idle.down);
    setVal('anim-idle-up', n.animations.idle.up);
    setVal('anim-idle-side', n.animations.idle.side);
    
    setVal('anim-walk-down', n.animations.walk.down);
    setVal('anim-walk-up', n.animations.walk.up);
    setVal('anim-walk-side', n.animations.walk.side);

    setVal('anim-talk-base', n.animations.talk.base || n.animations.talk.down);

    document.getElementById('anim-speed').value = n.animations.idle.speed || 0.2;

    refreshList();
    // Trigger preview update
    updatePreviewAnimation();
}

function ensureNewSchema(n) {
    // Migration Logic
    if (!n.animations || !n.animations.idle || !n.animations.idle.down) {
        const oldSprite = (n.animations && n.animations.idle) ? n.animations.idle.sprite : (n.sprite || 'player');
        
        return {
            id: n.id,
            name: n.name || n.id,
            type: 'npc',
            stats: n.stats || { speed: 50 },
            interaction: n.interaction || { dialogue: 'demo', range: 60 },
            behavior: n.behavior || { type: 'wander', range: 100, idleTime: 3.0, script: '' },
            animations: {
                idle: { down: oldSprite, up: oldSprite, side: oldSprite, speed: 0.2 },
                walk: { down: oldSprite, up: oldSprite, side: oldSprite, speed: 0.15 },
                talk: { base: oldSprite, speed: 0.2 }
            }
        };
    }
    
    // Ensure talk animation exists even if other schema is valid
    if (n.animations && !n.animations.talk) {
        const fallback = (n.animations.idle && n.animations.idle.down) ? n.animations.idle.down : 'player';
        n.animations.talk = { base: fallback, speed: 0.2 };
    }

    return n;
}

function addNewNPC() {
    const id = "npc_" + Date.now().toString().slice(-4);
    npcs.push(ensureNewSchema({ id: id, name: "New Villager" }));
    filteredNPCs = [...npcs]; // Reset filter
    markUnsaved();
    loadNPC(npcs.length - 1);
}

window.duplicateNPC = function() {
    if (npcs.length === 0) return;
    
    const current = npcs[currentIndex];
    const clone = JSON.parse(JSON.stringify(current)); // Deep clone
    clone.id = current.id + "_copy_" + Date.now().toString().slice(-4);
    clone.name = (current.name || current.id) + " (Copy)";
    
    npcs.push(ensureNewSchema(clone));
    filteredNPCs = [...npcs]; // Reset filter
    markUnsaved();
    loadNPC(npcs.length - 1);
    showSuccessNotification(`Duplicated as "${clone.id}"`);
}

// Template System
window.showTemplateMenu = function() {
    const menu = document.getElementById('template-menu');
    const overlay = document.getElementById('modal-overlay');
    const list = document.getElementById('template-list');
    
    list.innerHTML = '';
    Object.keys(NPC_TEMPLATES).forEach(key => {
        const template = NPC_TEMPLATES[key];
        const item = document.createElement('div');
        item.className = 'template-item';
        item.innerHTML = `
            <div>
                <div class="template-name">${template.name}</div>
                <div class="template-desc">${template.desc}</div>
            </div>
            <i class="fas fa-chevron-right"></i>
        `;
        item.onclick = () => createFromTemplate(key);
        list.appendChild(item);
    });
    
    overlay.classList.add('active');
    menu.classList.add('active');
}

window.hideTemplateMenu = function() {
    document.getElementById('template-menu').classList.remove('active');
    document.getElementById('modal-overlay').classList.remove('active');
}

window.closeAllModals = function() {
    hideTemplateMenu();
    closeSpriteLibrary();
}

// Sprite Library
let currentSpriteInput = null;

window.openSpriteLibrary = function() {
    const library = document.getElementById('sprite-library');
    const overlay = document.getElementById('modal-overlay');
    const grid = document.getElementById('sprite-grid');
    
    currentSpriteInput = null; // Opening in browse mode
    
    // Populate sprite grid
    grid.innerHTML = '';
    if (window.SPRITES) {
        Object.keys(window.SPRITES).forEach(key => {
            const sprite = window.SPRITES[key];
            const item = document.createElement('div');
            item.className = 'sprite-item';
            
            // Render sprite to canvas
            const canvas = document.createElement('canvas');
            canvas.width = sprite.width;
            canvas.height = sprite.height;
            const ctx = canvas.getContext('2d');
            sprite.data.forEach((row, y) => {
                for (let x = 0; x < row.length; x++) {
                    const color = sprite.palette[row[x]];
                    if (color) {
                        ctx.fillStyle = color;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            });
            
            item.appendChild(canvas);
            const name = document.createElement('div');
            name.className = 'sprite-name';
            name.textContent = key;
            item.appendChild(name);
            
            item.onclick = () => selectSpriteFromLibrary(key);
            item.dataset.spriteName = key.toLowerCase();
            
            grid.appendChild(item);
        });
    } else {
        grid.innerHTML = '<div style="color:#888; text-align:center; padding:20px;">No sprites loaded</div>';
    }
    
    overlay.classList.add('active');
    library.classList.add('active');
}

function selectSpriteFromLibrary(spriteKey) {
    if (currentSpriteInput) {
        // Apply to specific input
        document.getElementById(currentSpriteInput).value = spriteKey;
        document.getElementById(currentSpriteInput).dispatchEvent(new Event('change'));
    }
    closeSpriteLibrary();
    showSuccessNotification(`Selected sprite: ${spriteKey}`);
}

window.closeSpriteLibrary = function() {
    document.getElementById('sprite-library').classList.remove('active');
    if (!document.getElementById('template-menu').classList.contains('active')) {
        document.getElementById('modal-overlay').classList.remove('active');
    }
}

window.filterSprites = function() {
    const query = document.getElementById('sprite-search').value.toLowerCase();
    const items = document.querySelectorAll('.sprite-item');
    items.forEach(item => {
        const name = item.dataset.spriteName;
        if (name.includes(query)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

window.createNewSprite = function() {
    const n = npcs[currentIndex];
    if (!n) return;
    
    const spriteName = `${n.id}_custom_${Date.now().toString().slice(-4)}`;
    
    // Try different methods to open pixel editor
    if (window.opener && window.opener.openPixelEditor) {
        window.opener.openPixelEditor(spriteName);
    } else if (window.parent && window.parent !== window && window.parent.openPixelEditor) {
        window.parent.openPixelEditor(spriteName);
    } else {
        // Open in new window as fallback
        window.open(`pixel_editor.html?sprite=${spriteName}`, '_blank', 'width=1200,height=800');
    }
    
    showSuccessNotification(`Opening pixel editor for: ${spriteName}`);
}

// Dialogue Editor Integration
window.openDialogueEditor = function() {
    const dialogueId = document.getElementById('npc-dialogue').value;
    if (dialogueId) {
        // Try to open in parent/opener, fallback to new window
        if (window.opener && window.opener.openDialogueEditor) {
            window.opener.openDialogueEditor(dialogueId);
        } else if (window.parent && window.parent !== window && window.parent.openDialogueEditor) {
            window.parent.openDialogueEditor(dialogueId);
        } else {
            window.open(`dialogue_editor.html?id=${dialogueId}`, '_blank');
        }
    } else {
        showValidationError('Enter a dialogue ID first');
    }
}

window.createNewDialogue = function() {
    const n = npcs[currentIndex];
    if (!n) return;
    
    const dialogueId = `${n.id}_dialogue`;
    document.getElementById('npc-dialogue').value = dialogueId;
    document.getElementById('npc-dialogue').dispatchEvent(new Event('change'));
    
    // Try to open in parent/opener, fallback to new window
    if (window.opener && window.opener.openDialogueEditor) {
        window.opener.openDialogueEditor(dialogueId);
    } else if (window.parent && window.parent !== window && window.parent.openDialogueEditor) {
        window.parent.openDialogueEditor(dialogueId);
    } else {
        window.open(`dialogue_editor.html?id=${dialogueId}`, '_blank');
    }
    
    showSuccessNotification(`Created dialogue: ${dialogueId}`);
}

function createFromTemplate(templateKey) {
    const template = NPC_TEMPLATES[templateKey];
    const newNPC = JSON.parse(JSON.stringify(template.data)); // Deep clone
    newNPC.id = templateKey + "_" + Date.now().toString().slice(-4);
    
    npcs.push(ensureNewSchema(newNPC));
    filteredNPCs = [...npcs];
    markUnsaved();
    hideTemplateMenu();
    loadNPC(npcs.length - 1);
    showSuccessNotification(`Created ${template.name}`);
}

// Import/Export
window.exportNPC = function() {
    if (npcs.length === 0) return;
    
    const current = npcs[currentIndex];
    const dataStr = JSON.stringify(current, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.id}.npc.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccessNotification(`Exported ${current.id}`);
}

window.importNPC = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.npc.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                
                // Check if ID already exists
                if (npcs.some(n => n.id === imported.id)) {
                    imported.id = imported.id + "_imported_" + Date.now().toString().slice(-4);
                }
                
                npcs.push(ensureNewSchema(imported));
                filteredNPCs = [...npcs];
                markUnsaved();
                loadNPC(npcs.length - 1);
                showSuccessNotification(`Imported ${imported.name || imported.id}`);
            } catch (err) {
                showValidationError(`Import failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// Bulk Operations
window.toggleBulkMode = function() {
    bulkMode = !bulkMode;
    selectedNPCs.clear();
    
    const btn = document.getElementById('bulk-btn');
    if (bulkMode) {
        btn.classList.add('active');
        showBulkActions();
    } else {
        btn.classList.remove('active');
        hideBulkActions();
    }
    
    refreshList();
}

function showBulkActions() {
    const toolbar = document.getElementById('toolbar');
    const existing = document.getElementById('bulk-actions');
    if (existing) existing.remove();
    
    const bulkBar = document.createElement('div');
    bulkBar.id = 'bulk-actions';
    bulkBar.style.cssText = 'height:44px; background:#1a1a1a; border-bottom:1px solid var(--border); display:flex; align-items:center; padding:0 10px; gap:8px;';
    bulkBar.innerHTML = `
        <span style="color:var(--accent); margin-right:10px;">BULK MODE:</span>
        <button class="tool-btn" onclick="selectAllNPCs()" title="Select All"><i class="fas fa-check-double"></i></button>
        <button class="tool-btn" onclick="deselectAllNPCs()" title="Deselect All"><i class="fas fa-times"></i></button>
        <div class="tool-sep"></div>
        <button class="tool-btn" style="color:#e74c3c;" onclick="bulkDeleteNPCs()" title="Delete Selected"><i class="fas fa-trash"></i></button>
        <span id="bulk-count" style="margin-left:auto; color:#888; font-size:0.9rem;">0 selected</span>
    `;
    toolbar.after(bulkBar);
}

function hideBulkActions() {
    const existing = document.getElementById('bulk-actions');
    if (existing) existing.remove();
}

window.selectAllNPCs = function() {
    filteredNPCs.forEach(n => {
        const idx = npcs.indexOf(n);
        selectedNPCs.add(idx);
    });
    refreshList();
    updateBulkCount();
}

window.deselectAllNPCs = function() {
    selectedNPCs.clear();
    refreshList();
    updateBulkCount();
}

window.bulkDeleteNPCs = function() {
    if (selectedNPCs.size === 0) {
        showValidationError('No NPCs selected');
        return;
    }
    
    const confirm = window.confirm(`Delete ${selectedNPCs.size} NPC(s)?\n\nThis action cannot be undone.`);
    if (!confirm) return;
    
    // Delete in reverse order to maintain indices
    const toDelete = Array.from(selectedNPCs).sort((a, b) => b - a);
    toDelete.forEach(idx => {
        npcs.splice(idx, 1);
    });
    
    selectedNPCs.clear();
    filteredNPCs = [...npcs];
    
    if (npcs.length === 0) {
        addNewNPC();
    } else {
        if (currentIndex >= npcs.length) currentIndex = npcs.length - 1;
        refreshList();
        loadNPC(currentIndex);
    }
    
    markUnsaved();
    showSuccessNotification(`Deleted ${toDelete.length} NPC(s)`);
}

function updateBulkCount() {
    const countEl = document.getElementById('bulk-count');
    if (countEl) countEl.textContent = `${selectedNPCs.size} selected`;
}

// Update bulk count on selection changes
setInterval(() => {
    if (bulkMode) updateBulkCount();
}, 100);

// UI Handlers
document.querySelectorAll('input, select').forEach(el => {
    el.onchange = (e) => {
        markUnsaved(); // Mark as having unsaved changes
        
        const n = npcs[currentIndex];
        const id = e.target.id;
        const val = e.target.value;

        if (id.startsWith('npc-')) {
            if (id === 'npc-id') {
                // Check for duplicate ID
                if (checkDuplicateID(val, n)) {
                    showValidationError('ID already exists! Please choose a unique ID.');
                    e.target.value = n.id; // Revert
                    return;
                }
                // Validate ID format
                if (!/^[a-zA-Z0-9_]{3,32}$/.test(val)) {
                    showValidationError('ID must be 3-32 characters (letters, numbers, underscore only)');
                    e.target.value = n.id; // Revert
                    return;
                }
                n.id = val;
            }
            else if (id === 'npc-name') {
                if (val.length > 64) {
                    showValidationError('Name must be 64 characters or less');
                    return;
                }
                n.name = val;
            }
            else if (id === 'npc-dialogue') n.interaction.dialogue = val;
            else if (id === 'npc-range') {
                const range = parseInt(val);
                if (range < 1) {
                    showValidationError('Range must be positive');
                    return;
                }
                n.interaction.range = range;
            }
            else if (id === 'npc-speed') {
                const speed = parseInt(val);
                if (speed < 1 || speed > 500) {
                    showValidationError('Speed must be between 1 and 500');
                    return;
                }
                n.stats.speed = speed;
            }
            else if (id === 'npc-ai-type') n.behavior.type = val;
            else if (id === 'npc-wander-radius') n.behavior.range = parseInt(val);
            else if (id === 'npc-idle-time') n.behavior.idleTime = parseFloat(val);
            else if (id === 'npc-brain') n.behavior.script = val;
        }
        else if (e.target.classList.contains('anim-input')) {
            const state = e.target.dataset.state;
            const dir = e.target.dataset.dir;
            if (n.animations[state]) {
                n.animations[state][dir] = val;
            }
        }
        else if (id === 'anim-speed') {
            const speed = parseFloat(val);
            Object.values(n.animations).forEach(a => a.speed = speed);
        }
        
        if (id === 'npc-name' || id === 'npc-id') refreshList();
    };
});

window.openPixelEditor = function(inputId) {
    const input = document.getElementById(inputId);
    let key = input.value;
    
    if (!key) {
        // Generate new key: id_state_dir
        const n = npcs[currentIndex];
        const state = input.dataset.state;
        const dir = input.dataset.dir;
        key = `${n.id}_${state}_${dir}`;
        input.value = key;
        input.dispatchEvent(new Event('change'));
    }

    // Store current input for sprite library
    currentSpriteInput = inputId;
    
    // Multiple fallback methods
    let opened = false;
    
    // Method 1: Parent window
    if (window.parent && window.parent !== window && window.parent.editSpriteInStudio) {
        try {
            window.parent.editSpriteInStudio(key);
            opened = true;
        } catch(e) {}
    }
    
    // Method 2: Opener window
    if (!opened && window.opener && window.opener.editSpriteInStudio) {
        try {
            window.opener.editSpriteInStudio(key);
            opened = true;
        } catch(e) {}
    }
    
    // Method 3: Direct API call (if available)
    if (!opened && window.KetebeAssetManager) {
        try {
            window.KetebeAssetManager.openSpriteEditor(key);
            opened = true;
        } catch(e) {}
    }
    
    // Method 4: New window fallback
    if (!opened) {
        window.open(`pixel_editor.html?sprite=${key}`, '_blank', 'width=1200,height=800');
        opened = true;
    }
    
    if (opened) {
        showSuccessNotification(`Opening sprite editor for: ${key}`);
    }
};

function updatePreviewAnimation() {
    const n = npcs[currentIndex];
    if (!n) return;

    const state = document.getElementById('preview-state').value;
    const dir = document.getElementById('preview-dir').value || 'down';
    
    let animKey = null;
    if (n.animations && n.animations[state]) {
        // Handle Base vs Directional
        if (n.animations[state].base) animKey = n.animations[state].base;
        else animKey = n.animations[state][dir] || n.animations[state]['down'];
    }
    
    // Update frame counter if playing
    if (previewPlaying) {
        const speed = (n.animations && n.animations[state]) ? (n.animations[state].speed || 0.2) : 0.2;
        previewTimer += 1/60; // Assuming 60fps
        if (previewTimer >= speed) {
            previewTimer = 0;
            previewFrame = (previewFrame + 1) % 4; // Cycle through 4 frames
        }
    }
    
    renderPreview(animKey);
}

function renderPreview(spriteKey) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (window.SPRITES && window.SPRITES[spriteKey]) {
        const sprite = window.SPRITES[spriteKey];
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sprite.width;
        tempCanvas.height = sprite.height;
        const tCtx = tempCanvas.getContext('2d');
        sprite.data.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const color = sprite.palette[row[x]];
                if (color) { tCtx.fillStyle = color; tCtx.fillRect(x, y, 1, 1); }
            }
        });
        
        ctx.imageSmoothingEnabled = false;
        const baseScale = Math.min(canvas.width / sprite.width, canvas.height / sprite.height) * 0.8;
        const scale = baseScale * previewZoom;
        const dw = sprite.width * scale;
        const dh = sprite.height * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        
        ctx.drawImage(tempCanvas, dx, dy, dw, dh);
        
        // Update info
        document.getElementById('sprite-dims').textContent = `${sprite.width}x${sprite.height}`;
        document.getElementById('sprite-frame').textContent = previewFrame;
    } else {
        ctx.fillStyle = '#444';
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(spriteKey ? "NOT FOUND" : "NO SPRITE", canvas.width/2, canvas.height/2);
        document.getElementById('sprite-dims').textContent = '-';
        document.getElementById('sprite-frame').textContent = '0';
    }
}

window.togglePreviewPlay = function() {
    previewPlaying = !previewPlaying;
    const btn = document.getElementById('preview-play');
    btn.innerHTML = previewPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

window.zoomPreview = function(delta) {
    previewZoom = Math.max(0.5, Math.min(3.0, previewZoom + delta));
    // Trigger re-render with current sprite
    updatePreviewAnimation();
}

async function saveToServer() {
    // Validate all NPCs before saving
    let hasErrors = false;
    npcs.forEach((npc, idx) => {
        const errors = validateNPC(npc);
        if (errors.length > 0) {
            console.error(`NPC ${idx + 1} (${npc.id}) has errors:`, errors);
            hasErrors = true;
        }
    });
    
    if (hasErrors) {
        showValidationError('Some NPCs have validation errors. Check console for details.');
        return;
    }
    
    try {
        const response = await fetch('/api/npc-defs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(npcs)
        });
        if (response.ok) {
            // Save to shared state and broadcast
            saveNPCsToState();
            npcs.forEach(npc => broadcastNPCUpdate(npc, 'updated'));
            markSaved();
            showSuccessNotification("NPCs saved successfully!");
        } else {
            throw new Error(`Server returned ${response.status}`);
        }
    } catch (e) {
        console.error('Save error:', e);
        showValidationError(`Save failed: ${e.message}`);
    }
}

function showSuccessNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 15px 20px;
        border-radius: 4px;
        font-family: 'VT323', monospace;
        font-size: 1.1rem;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;
    notification.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 2000);
}

async function loadFromServer() {
    try {
        const response = await fetch('/api/npcs');
        if (response.ok) {
            let data = await response.json();
            npcs = data.map(ensureNewSchema);
        }
    } catch (e) {
        console.warn("No npc defs found.");
    }
}

window.deleteNPC = function() {
    if (npcs.length === 0) return;
    
    const n = npcs[currentIndex];
    const confirm = window.confirm(`Delete "${n.name || n.id}"?\n\nThis action cannot be undone.`);
    
    if (!confirm) return;
    
    // Broadcast deletion
    if (eventBus) {
        eventBus.emit('npc:deleted', {
            npcId: n.id,
            timestamp: Date.now()
        });
    }
    
    // Remove from array
    npcs.splice(currentIndex, 1);
    
    // Update state
    if (projectState) {
        projectState.delete(`npcs.${n.id}`);
    }
    
    // Adjust current index
    if (currentIndex >= npcs.length) currentIndex = npcs.length - 1;
    if (currentIndex < 0) currentIndex = 0;
    
    // Refresh UI
    if (npcs.length === 0) {
        addNewNPC();
    } else {
        refreshList();
        loadNPC(currentIndex);
    }
}

function validateNPC(npc) {
    const errors = [];
    
    // ID validation
    if (!npc.id || npc.id.trim() === '') {
        errors.push('ID is required');
    } else if (!/^[a-zA-Z0-9_]{3,32}$/.test(npc.id)) {
        errors.push('ID must be 3-32 characters (letters, numbers, underscore only)');
    }
    
    // Name validation
    if (!npc.name || npc.name.trim() === '') {
        errors.push('Name is required');
    } else if (npc.name.length > 64) {
        errors.push('Name must be 64 characters or less');
    }
    
    // Speed validation
    if (npc.stats.speed < 1 || npc.stats.speed > 500) {
        errors.push('Speed must be between 1 and 500');
    }
    
    // Range validation
    if (npc.interaction.range < 1) {
        errors.push('Interaction range must be positive');
    }
    
    return errors;
}

function checkDuplicateID(id, currentNPC) {
    return npcs.some(n => n.id === id && n !== currentNPC);
}

function showValidationError(message) {
    // Create a temporary error notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50px;
        right: 20px;
        background: #c0392b;
        color: white;
        padding: 15px 20px;
        border-radius: 4px;
        font-family: 'VT323', monospace;
        font-size: 1.1rem;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
});
    }, 3000);
}