// enemy_editor.js - Advanced Logic with Directional Support
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

// Initialize integration
function initializeIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.VortexEventBus;
        projectState = window.VortexProjectState;
        assetManager = window.VortexAssetManager;
        
        if (eventBus) {
            // Listen for skill updates (enemies may have skills)
            eventBus.on('skill:updated', (event) => {
                console.log('[EnemyEditor] Skill updated:', event.data.skillId);
            });
            
            // Listen for behavior updates
            eventBus.on('behavior:updated', (event) => {
                console.log('[EnemyEditor] Behavior updated:', event.data.behaviorId);
            });
            
            // Listen for external enemy load requests
            eventBus.on('enemy:load', (event) => {
                if (event.data.enemyId) {
                    const idx = enemies.findIndex(e => e.id === event.data.enemyId);
                    if (idx >= 0) loadEnemy(idx);
                }
            });
            
            console.log('[EnemyEditor] EventBus connected');
        }
    }
}

// Broadcast enemy changes
function broadcastEnemyUpdate(enemy, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`enemy:${action}`, {
            enemyId: enemy.id,
            enemy: enemy,
            timestamp: Date.now()
        });
    }
    
    // Also save to project state
    if (projectState) {
        projectState.set(`enemies.${enemy.id}`, enemy);
    }
}

// Save all enemies to project state
function saveEnemiesToState() {
    if (!projectState) return;
    
    const enemyMap = {};
    enemies.forEach(enemy => {
        enemyMap[enemy.id] = enemy;
    });
    projectState.set('enemies', enemyMap);
}

let enemies = [];
let currentIndex = 0;
let previewTimer = 0;
let previewFrame = 0;
let previewPlaying = true;
let previewZoom = 1.0;
let hasUnsavedChanges = false;
let filteredEnemies = [];
let bulkMode = false;
let selectedEnemies = new Set();

const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

let availableBrains = [];

// Enemy Templates
const ENEMY_TEMPLATES = {
    slime: {
        name: "Slime",
        desc: "Weak bouncing enemy",
        data: {
            type: 'enemy',
            name: 'Slime',
            stats: { hp: 20, speed: 40, damage: 5, xp: 10 },
            ai: { type: 'chase', range: 150, attackRange: 30, patrolRadius: 80, cooldown: 1.5, script: '' },
            animations: {
                idle: { down: 'slime_idle', up: 'slime_idle', side: 'slime_idle', speed: 0.2 },
                run: { down: 'slime_move', up: 'slime_move', side: 'slime_move', speed: 0.15 },
                attack: { base: 'slime_attack', speed: 0.1 },
                hit: { base: 'slime_hit', speed: 0.1 },
                death: { base: 'slime_death', speed: 0.2 }
            }
        }
    },
    goblin: {
        name: "Goblin",
        desc: "Standard melee enemy",
        data: {
            type: 'enemy',
            name: 'Goblin',
            stats: { hp: 50, speed: 80, damage: 10, xp: 25 },
            ai: { type: 'patrol', range: 200, attackRange: 40, patrolRadius: 120, cooldown: 1.2, script: '' },
            animations: {
                idle: { down: 'goblin_idle', up: 'goblin_idle', side: 'goblin_idle', speed: 0.2 },
                run: { down: 'goblin_run', up: 'goblin_run', side: 'goblin_run', speed: 0.12 },
                attack: { base: 'goblin_attack', speed: 0.1 },
                hit: { base: 'goblin_hit', speed: 0.1 },
                death: { base: 'goblin_death', speed: 0.2 }
            }
        }
    },
    skeleton: {
        name: "Skeleton",
        desc: "Undead warrior",
        data: {
            type: 'enemy',
            name: 'Skeleton',
            stats: { hp: 75, speed: 70, damage: 15, xp: 35 },
            ai: { type: 'chase', range: 250, attackRange: 50, patrolRadius: 100, cooldown: 1.0, script: '' },
            animations: {
                idle: { down: 'skeleton_idle', up: 'skeleton_idle', side: 'skeleton_idle', speed: 0.2 },
                run: { down: 'skeleton_run', up: 'skeleton_run', side: 'skeleton_run', speed: 0.13 },
                attack: { base: 'skeleton_attack', speed: 0.08 },
                hit: { base: 'skeleton_hit', speed: 0.1 },
                death: { base: 'skeleton_death', speed: 0.25 }
            }
        }
    },
    boss: {
        name: "Boss Enemy",
        desc: "Powerful boss",
        data: {
            type: 'enemy',
            name: 'Boss',
            stats: { hp: 500, speed: 60, damage: 35, xp: 500 },
            ai: { type: 'boss', range: 300, attackRange: 80, patrolRadius: 150, cooldown: 2.5, script: 'boss_ai' },
            animations: {
                idle: { down: 'boss_idle', up: 'boss_idle', side: 'boss_idle', speed: 0.25 },
                run: { down: 'boss_run', up: 'boss_run', side: 'boss_run', speed: 0.2 },
                attack: { base: 'boss_attack', speed: 0.15 },
                hit: { base: 'boss_hit', speed: 0.12 },
                death: { base: 'boss_death', speed: 0.3 }
            }
        }
    },
    flying: {
        name: "Flying Enemy",
        desc: "Airborne attacker",
        data: {
            type: 'enemy',
            name: 'Bat',
            stats: { hp: 30, speed: 120, damage: 8, xp: 20 },
            ai: { type: 'chase', range: 200, attackRange: 35, patrolRadius: 150, cooldown: 0.8, script: '' },
            animations: {
                idle: { down: 'bat_idle', up: 'bat_idle', side: 'bat_idle', speed: 0.15 },
                run: { down: 'bat_fly', up: 'bat_fly', side: 'bat_fly', speed: 0.1 },
                attack: { base: 'bat_attack', speed: 0.08 },
                hit: { base: 'bat_hit', speed: 0.08 },
                death: { base: 'bat_death', speed: 0.2 }
            }
        }
    }
};

window.onload = async () => {
    // Initialize integration first
    initializeIntegration();
    
    await loadFromServer();
    await loadBrains();
    if (enemies.length === 0) addNewEnemy();
    filteredEnemies = [...enemies];
    refreshList();
    loadEnemy(0);
    
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
            window.deleteEnemy();
        }
        // Ctrl+N or Cmd+N to create new
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            addNewEnemy();
        }
        // Ctrl+D or Cmd+D to duplicate
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            window.duplicateEnemy();
        }
        // Arrow keys to navigate list (if not in input)
        if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIdx = Math.min(currentIndex + 1, filteredEnemies.length - 1);
                const actualIdx = enemies.indexOf(filteredEnemies[nextIdx]);
                if (actualIdx >= 0) loadEnemy(actualIdx);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIdx = Math.max(currentIndex - 1, 0);
                const actualIdx = enemies.indexOf(filteredEnemies[prevIdx]);
                if (actualIdx >= 0) loadEnemy(actualIdx);
            }
        }
    });
}

window.filterList = function() {
    const query = document.getElementById('search-filter').value.toLowerCase();
    if (!query) {
        filteredEnemies = [...enemies];
    } else {
        filteredEnemies = enemies.filter(e => 
            (e.id && e.id.toLowerCase().includes(query)) || 
            (e.name && e.name.toLowerCase().includes(query))
        );
    }
    refreshList();
}

function markUnsaved() {
    hasUnsavedChanges = true;
    document.title = '* VILLAIN STUDIO';
}

function markSaved() {
    hasUnsavedChanges = false;
    document.title = 'VILLAIN STUDIO';
}

async function loadBrains() {
    try {
        const res = await fetch('/api/brains/list');
        if (res.ok) {
            availableBrains = await res.json();
            const sel = document.getElementById('enemy-brain');
            // Clear and populate
            sel.innerHTML = '<option value="">None</option>';
            availableBrains.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b; opt.innerText = b;
                sel.appendChild(opt);
            });
        }
    } catch(e) { console.warn("Brains fetch failed"); }
}

function loop() {
    updatePreviewAnimation();
    requestAnimationFrame(loop);
}

function refreshList() {
    const list = document.getElementById('enemy-list');
    list.innerHTML = '';
    filteredEnemies.forEach((en) => {
        const idx = enemies.indexOf(en);
        const div = document.createElement('div');
        div.className = 'list-item';
        if (idx === currentIndex) div.classList.add('active');
        
        if (bulkMode) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'bulk-checkbox';
            checkbox.checked = selectedEnemies.has(idx);
            checkbox.onclick = (e) => {
                e.stopPropagation();
                if (checkbox.checked) selectedEnemies.add(idx);
                else selectedEnemies.delete(idx);
            };
            div.appendChild(checkbox);
        }
        
        const span = document.createElement('span');
        span.innerHTML = `${en.name || en.id} <span style="font-size:0.8em; color:#666;">${en.id}</span>`;
        div.appendChild(span);
        
        div.onclick = () => {
            if (!bulkMode) loadEnemy(idx);
        };
        list.appendChild(div);
    });
}

function loadEnemy(idx) {
    currentIndex = idx;
    const en = ensureNewSchema(enemies[idx]);
    
    // Core
    document.getElementById('enemy-id').value = en.id;
    document.getElementById('enemy-name').value = en.name || en.id;
    document.getElementById('enemy-hp').value = en.stats.hp;
    document.getElementById('enemy-speed').value = en.stats.speed;
    document.getElementById('enemy-damage').value = en.stats.damage;
    document.getElementById('enemy-xp').value = en.stats.xp;
    
    // Loot
    document.getElementById('enemy-gold').value = en.loot?.gold ? en.loot.gold[1] : 10;
    document.getElementById('enemy-drop-chance').value = en.loot?.dropChance || 50;
    updateLootSummary();

    // AI
    document.getElementById('enemy-ai-type').value = en.ai.type;
    document.getElementById('enemy-range').value = en.ai.range;
    document.getElementById('enemy-attack-range').value = en.ai.attackRange;
    document.getElementById('enemy-patrol-radius').value = en.ai.patrolRadius;
    document.getElementById('enemy-cooldown').value = en.ai.cooldown;
    
    // Brain selection
    const brainSelect = document.getElementById('enemy-brain');
    if (en.ai.script) {
        brainSelect.value = en.ai.script;
    } else {
        brainSelect.value = '';
    }
    
    // Category & Tags
    document.getElementById('enemy-category').value = en.category || 'normal';
    document.getElementById('enemy-tags').value = Array.isArray(en.tags) ? en.tags.join(', ') : '';
    
    // Resistances
    const res = en.resistances || {};
    document.getElementById('enemy-resist').value = Array.isArray(res.resist) ? res.resist.join(', ') : '';
    document.getElementById('enemy-weakness').value = Array.isArray(res.weakness) ? res.weakness.join(', ') : '';
    document.getElementById('enemy-armor').value = res.armor || 0;
    document.getElementById('enemy-magic-resist').value = res.magicResist || 0;

    // Visuals (Directional)
    const setVal = (id, val) => document.getElementById(id).value = val || '';
    
    setVal('anim-idle-down', en.animations.idle.down);
    setVal('anim-idle-up', en.animations.idle.up);
    setVal('anim-idle-side', en.animations.idle.side);
    
    setVal('anim-run-down', en.animations.run.down);
    setVal('anim-run-up', en.animations.run.up);
    setVal('anim-run-side', en.animations.run.side);

    setVal('anim-attack-base', en.animations.attack.base || en.animations.attack.down); // Fallback
    setVal('anim-death-base', en.animations.death.base || en.animations.death.down);

    document.getElementById('anim-speed').value = en.animations.idle.speed || 0.15;

    refreshList();
}

function ensureNewSchema(en) {
    // Migration Logic: Flat -> Object -> Directional Object
    if (!en.animations || !en.animations.idle.down) {
        const oldSprite = (en.animations && en.animations.idle) ? en.animations.idle.sprite : (en.sprite || 'monster');
        
        return {
            id: en.id,
            name: en.name || en.id,
            type: 'enemy',
            stats: en.stats || { hp: 50, speed: 80, damage: 10, xp: 20 },
            ai: en.ai || { type: 'patrol', range: 250, attackRange: 40, patrolRadius: 100, cooldown: 1.5, script: '' },
            loot: en.loot || { gold: [0, 10], items: [], dropChance: 50 },
            category: en.category || 'normal',
            tags: en.tags || [],
            resistances: en.resistances || { resist: [], weakness: [], armor: 0, magicResist: 0 },
            animations: {
                idle: { down: oldSprite, up: oldSprite, side: oldSprite, speed: 0.15 },
                run: { down: oldSprite, up: oldSprite, side: oldSprite, speed: 0.15 },
                attack: { base: oldSprite, speed: 0.15 },
                hit: { base: oldSprite, speed: 0.15 },
                death: { base: oldSprite, speed: 0.15 }
            }
        };
    }
    // Ensure new fields exist
    if (!en.loot) en.loot = { gold: [0, 10], items: [], dropChance: 50 };
    if (!en.category) en.category = 'normal';
    if (!en.tags) en.tags = [];
    if (!en.resistances) en.resistances = { resist: [], weakness: [], armor: 0, magicResist: 0 };
    
    return en;
}

function addNewEnemy() {
    const id = "enemy_" + Date.now().toString().slice(-4);
    enemies.push(ensureNewSchema({ id: id }));
    filteredEnemies = [...enemies]; // Reset filter
    markUnsaved();
    loadEnemy(enemies.length - 1);
}

window.duplicateEnemy = function() {
    if (enemies.length === 0) return;
    
    const current = enemies[currentIndex];
    const clone = JSON.parse(JSON.stringify(current)); // Deep clone
    clone.id = current.id + "_copy_" + Date.now().toString().slice(-4);
    clone.name = (current.name || current.id) + " (Copy)";
    
    enemies.push(ensureNewSchema(clone));
    filteredEnemies = [...enemies]; // Reset filter
    markUnsaved();
    loadEnemy(enemies.length - 1);
    showSuccessNotification(`Duplicated as "${clone.id}"`);
}

// Template System
window.showTemplateMenu = function() {
    const menu = document.getElementById('template-menu');
    const overlay = document.getElementById('modal-overlay');
    const list = document.getElementById('template-list');
    
    list.innerHTML = '';
    Object.keys(ENEMY_TEMPLATES).forEach(key => {
        const template = ENEMY_TEMPLATES[key];
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
    closeLootEditor();
}

// Loot Table Editor
window.openLootEditor = function() {
    const editor = document.getElementById('loot-editor');
    const overlay = document.getElementById('modal-overlay');
    
    renderLootItems();
    
    overlay.classList.add('active');
    editor.classList.add('active');
}

window.closeLootEditor = function() {
    document.getElementById('loot-editor').classList.remove('active');
    if (!document.getElementById('template-menu').classList.contains('active') && 
        !document.getElementById('sprite-library').classList.contains('active')) {
        document.getElementById('modal-overlay').classList.remove('active');
    }
    updateLootSummary();
}

function renderLootItems() {
    const en = enemies[currentIndex];
    if (!en.loot) en.loot = { gold: [0, 10], items: [], dropChance: 50 };
    
    const list = document.getElementById('loot-items-list');
    list.innerHTML = '';
    
    if (en.loot.items.length === 0) {
        list.innerHTML = '<div style="color:#666; padding:20px; text-align:center;">No loot items. Click "Add Loot Item" to start.</div>';
        return;
    }
    
    en.loot.items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'loot-item';
        div.innerHTML = `
            <div style="flex:1;">
                <div style="color:var(--accent);">${item.id}</div>
                <div style="font-size:0.8rem; color:#888;">Chance: ${item.chance}% | Qty: ${item.min}-${item.max}</div>
            </div>
            <button class="tool-btn" onclick="removeLootItem(${idx})" style="color:#e74c3c;">
                <i class="fas fa-trash"></i>
            </button>
        `;
        list.appendChild(div);
    });
}

window.addLootItem = function() {
    const en = enemies[currentIndex];
    if (!en.loot) en.loot = { gold: [0, 10], items: [], dropChance: 50 };
    
    const itemId = prompt('Enter item ID:');
    if (!itemId) return;
    
    const chance = parseInt(prompt('Drop chance % (0-100):', '25') || '25');
    const min = parseInt(prompt('Min quantity:', '1') || '1');
    const max = parseInt(prompt('Max quantity:', '1') || '1');
    
    en.loot.items.push({ id: itemId, chance, min, max });
    markUnsaved();
    renderLootItems();
    updateLootSummary();
}

window.removeLootItem = function(idx) {
    const en = enemies[currentIndex];
    if (confirm('Remove this loot item?')) {
        en.loot.items.splice(idx, 1);
        markUnsaved();
        renderLootItems();
        updateLootSummary();
    }
}

function updateLootSummary() {
    const en = enemies[currentIndex];
    if (!en || !en.loot || en.loot.items.length === 0) {
        document.getElementById('loot-summary').textContent = 'No loot items configured';
        return;
    }
    
    const summary = en.loot.items.map(item => 
        `${item.id} (${item.chance}%)`
    ).join(', ');
    
    document.getElementById('loot-summary').textContent = `${en.loot.items.length} items: ${summary}`;
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
    const en = enemies[currentIndex];
    if (!en) return;
    
    const spriteName = `${en.id}_custom_${Date.now().toString().slice(-4)}`;
    
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

// Brain Editor Integration
window.editBrain = function() {
    const val = document.getElementById('enemy-brain').value;
    if (val) {
        if (window.opener && window.opener.openBehaviorEditor) {
            window.opener.openBehaviorEditor(val);
        } else if (window.parent && window.parent !== window && window.parent.openBehaviorEditor) {
            window.parent.openBehaviorEditor(val);
        } else {
            window.open(`behavior_editor.html?script=${val}`, '_blank');
        }
    } else {
        showValidationError('Select a brain to edit');
    }
}

window.newBrain = function() {
    const en = enemies[currentIndex];
    if (!en) return;
    
    const brainName = `${en.id}_ai`;
    
    if (window.opener && window.opener.openBehaviorEditor) {
        window.opener.openBehaviorEditor(brainName);
    } else if (window.parent && window.parent !== window && window.parent.openBehaviorEditor) {
        window.parent.openBehaviorEditor(brainName);
    } else {
        window.open(`behavior_editor.html?script=${brainName}`, '_blank');
    }
    
    showSuccessNotification(`Creating brain: ${brainName}`);
}

function createFromTemplate(templateKey) {
    const template = ENEMY_TEMPLATES[templateKey];
    const newEnemy = JSON.parse(JSON.stringify(template.data)); // Deep clone
    newEnemy.id = templateKey + "_" + Date.now().toString().slice(-4);
    
    enemies.push(ensureNewSchema(newEnemy));
    filteredEnemies = [...enemies];
    markUnsaved();
    hideTemplateMenu();
    loadEnemy(enemies.length - 1);
    showSuccessNotification(`Created ${template.name}`);
}

// Import/Export
window.exportEnemy = function() {
    if (enemies.length === 0) return;
    
    const current = enemies[currentIndex];
    const dataStr = JSON.stringify(current, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.id}.enemy.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccessNotification(`Exported ${current.id}`);
}

window.importEnemy = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.enemy.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                
                // Check if ID already exists
                if (enemies.some(e => e.id === imported.id)) {
                    imported.id = imported.id + "_imported_" + Date.now().toString().slice(-4);
                }
                
                enemies.push(ensureNewSchema(imported));
                filteredEnemies = [...enemies];
                markUnsaved();
                loadEnemy(enemies.length - 1);
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
    selectedEnemies.clear();
    
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
        <button class="tool-btn" onclick="selectAllEnemies()" title="Select All"><i class="fas fa-check-double"></i></button>
        <button class="tool-btn" onclick="deselectAllEnemies()" title="Deselect All"><i class="fas fa-times"></i></button>
        <div class="tool-sep"></div>
        <button class="tool-btn" style="color:#e74c3c;" onclick="bulkDeleteEnemies()" title="Delete Selected"><i class="fas fa-trash"></i></button>
        <span id="bulk-count" style="margin-left:auto; color:#888; font-size:0.9rem;">0 selected</span>
    `;
    toolbar.after(bulkBar);
}

function hideBulkActions() {
    const existing = document.getElementById('bulk-actions');
    if (existing) existing.remove();
}

window.selectAllEnemies = function() {
    filteredEnemies.forEach(e => {
        const idx = enemies.indexOf(e);
        selectedEnemies.add(idx);
    });
    refreshList();
    updateBulkCount();
}

window.deselectAllEnemies = function() {
    selectedEnemies.clear();
    refreshList();
    updateBulkCount();
}

window.bulkDeleteEnemies = function() {
    if (selectedEnemies.size === 0) {
        showValidationError('No enemies selected');
        return;
    }
    
    const confirm = window.confirm(`Delete ${selectedEnemies.size} enemy/enemies?\n\nThis action cannot be undone.`);
    if (!confirm) return;
    
    // Delete in reverse order to maintain indices
    const toDelete = Array.from(selectedEnemies).sort((a, b) => b - a);
    toDelete.forEach(idx => {
        enemies.splice(idx, 1);
    });
    
    selectedEnemies.clear();
    filteredEnemies = [...enemies];
    
    if (enemies.length === 0) {
        addNewEnemy();
    } else {
        if (currentIndex >= enemies.length) currentIndex = enemies.length - 1;
        refreshList();
        loadEnemy(currentIndex);
    }
    
    markUnsaved();
    showSuccessNotification(`Deleted ${toDelete.length} enemy/enemies`);
}

function updateBulkCount() {
    const countEl = document.getElementById('bulk-count');
    if (countEl) countEl.textContent = `${selectedEnemies.size} selected`;
}

// Update bulk count on selection changes
setInterval(() => {
    if (bulkMode) updateBulkCount();
}, 100);

// UI Handlers
document.querySelectorAll('input, select').forEach(el => {
    el.onchange = (e) => {
        markUnsaved(); // Mark as having unsaved changes
        
        const en = enemies[currentIndex];
        const id = e.target.id;
        const val = e.target.value;

        if (id.startsWith('enemy-')) {
            if (id === 'enemy-id') {
                // Check for duplicate ID
                if (checkDuplicateID(val, en)) {
                    showValidationError('ID already exists! Please choose a unique ID.');
                    e.target.value = en.id; // Revert
                    return;
                }
                // Validate ID format
                if (!/^[a-zA-Z0-9_]{3,32}$/.test(val)) {
                    showValidationError('ID must be 3-32 characters (letters, numbers, underscore only)');
                    e.target.value = en.id; // Revert
                    return;
                }
                en.id = val;
            }
            else if (id === 'enemy-name') {
                if (val.length > 64) {
                    showValidationError('Name must be 64 characters or less');
                    return;
                }
                en.name = val;
            }
            else if (id === 'enemy-hp') {
                const hp = parseInt(val);
                if (hp <= 0) {
                    showValidationError('HP must be greater than 0');
                    return;
                }
                en.stats.hp = hp;
            }
            else if (id === 'enemy-speed') {
                const speed = parseInt(val);
                if (speed < 1 || speed > 500) {
                    showValidationError('Speed must be between 1 and 500');
                    return;
                }
                en.stats.speed = speed;
            }
            else if (id === 'enemy-damage') {
                const damage = parseInt(val);
                if (damage < 0) {
                    showValidationError('Damage cannot be negative');
                    return;
                }
                en.stats.damage = damage;
            }
            else if (id === 'enemy-xp') en.stats.xp = parseInt(val);
            else if (id === 'enemy-gold') {
                if (!en.loot) en.loot = { gold: [0, 10], items: [], dropChance: 50 };
                en.loot.gold = [0, parseInt(val)];
            }
            else if (id === 'enemy-drop-chance') {
                if (!en.loot) en.loot = { gold: [0, 10], items: [], dropChance: 50 };
                en.loot.dropChance = parseInt(val);
            }
            else if (id === 'enemy-ai-type') en.ai.type = val;
            else if (id === 'enemy-range') {
                const range = parseInt(val);
                if (range < 1) {
                    showValidationError('Detect range must be positive');
                    return;
                }
                en.ai.range = range;
            }
            else if (id === 'enemy-attack-range') {
                const aRange = parseInt(val);
                if (aRange < 1) {
                    showValidationError('Attack range must be positive');
                    return;
                }
                en.ai.attackRange = aRange;
            }
            else if (id === 'enemy-patrol-radius') en.ai.patrolRadius = parseInt(val);
            else if (id === 'enemy-cooldown') en.ai.cooldown = parseFloat(val);
            else if (id === 'enemy-brain') {
                en.ai.script = val;
            }
            else if (id === 'enemy-category') en.category = val;
            else if (id === 'enemy-tags') {
                en.tags = val.split(',').map(t => t.trim()).filter(t => t);
            }
            else if (id === 'enemy-resist') {
                if (!en.resistances) en.resistances = {};
                en.resistances.resist = val.split(',').map(t => t.trim()).filter(t => t);
            }
            else if (id === 'enemy-weakness') {
                if (!en.resistances) en.resistances = {};
                en.resistances.weakness = val.split(',').map(t => t.trim()).filter(t => t);
            }
            else if (id === 'enemy-armor') {
                if (!en.resistances) en.resistances = {};
                en.resistances.armor = parseInt(val);
            }
            else if (id === 'enemy-magic-resist') {
                if (!en.resistances) en.resistances = {};
                en.resistances.magicResist = parseInt(val);
            }
        }
        else if (e.target.classList.contains('anim-input')) {
            const state = e.target.dataset.state;
            const dir = e.target.dataset.dir;
            if (en.animations[state]) {
                en.animations[state][dir] = val;
            }
        }
        else if (id === 'anim-speed') {
            const speed = parseFloat(val);
            Object.values(en.animations).forEach(a => a.speed = speed);
        }
        
        if (id === 'enemy-name' || id === 'enemy-id') refreshList();
    };
});

window.openPixelEditor = function(inputId) {
    const input = document.getElementById(inputId);
    let key = input.value;
    
    if (!key) {
        // Generate new key: id_state_dir
        const en = enemies[currentIndex];
        const state = input.dataset.state;
        const dir = input.dataset.dir;
        key = `${en.id}_${state}_${dir}`;
        input.value = key;
        
        // Trigger change event to save to memory
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
    if (!opened && window.VortexAssetManager) {
        try {
            window.VortexAssetManager.openSpriteEditor(key);
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
    const en = enemies[currentIndex];
    if (!en) return;

    const state = document.getElementById('preview-state').value;
    const dir = document.getElementById('preview-dir').value || 'down';
    
    let animKey = null;
    if (en.animations[state]) {
        // Handle Base vs Directional
        if (en.animations[state].base) animKey = en.animations[state].base;
        else animKey = en.animations[state][dir] || en.animations[state]['down'];
    }
    
    // Update frame counter if playing
    if (previewPlaying) {
        const speed = en.animations[state] ? (en.animations[state].speed || 0.15) : 0.15;
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
    renderPreview();
}

async function saveToServer() {
    // Validate all enemies before saving
    let hasErrors = false;
    enemies.forEach((enemy, idx) => {
        const errors = validateEnemy(enemy);
        if (errors.length > 0) {
            console.error(`Enemy ${idx + 1} (${enemy.id}) has errors:`, errors);
            hasErrors = true;
        }
    });
    
    if (hasErrors) {
        showValidationError('Some enemies have validation errors. Check console for details.');
        return;
    }
    
    try {
        const response = await fetch('/api/enemy-defs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(enemies)
        });
        if (response.ok) {
            // Save to shared state and broadcast
            saveEnemiesToState();
            enemies.forEach(enemy => broadcastEnemyUpdate(enemy, 'updated'));
            markSaved();
            showSuccessNotification("Enemies saved successfully!");
        } else {
            throw new Error(`Server returned ${response.status}`);
        }
    } catch (e) {
        console.error('Save error:', e);
        showValidationError(`Save failed: ${e.message}`);
    }
}

async function loadFromServer() {
    try {
        const response = await fetch('/dunyalar/definitions/enemies.json');
        if (response.ok) {
            let data = await response.json();
            enemies = data.map(ensureNewSchema);
        }
    } catch (e) {
        console.warn("No enemy defs found.");
    }
}

window.deleteEnemy = function() {
    if (enemies.length === 0) return;
    
    const en = enemies[currentIndex];
    const confirm = window.confirm(`Delete "${en.name || en.id}"?\n\nThis action cannot be undone.`);
    
    if (!confirm) return;
    
    // Broadcast deletion
    if (eventBus) {
        eventBus.emit('enemy:deleted', {
            enemyId: en.id,
            timestamp: Date.now()
        });
    }
    
    // Remove from array
    enemies.splice(currentIndex, 1);
    
    // Update state
    if (projectState) {
        projectState.delete(`enemies.${en.id}`);
    }
    
    // Adjust current index
    if (currentIndex >= enemies.length) currentIndex = enemies.length - 1;
    if (currentIndex < 0) currentIndex = 0;
    
    // Refresh UI
    if (enemies.length === 0) {
        addNewEnemy();
    } else {
        refreshList();
        loadEnemy(currentIndex);
    }
}

function validateEnemy(enemy) {
    const errors = [];
    
    // ID validation
    if (!enemy.id || enemy.id.trim() === '') {
        errors.push('ID is required');
    } else if (!/^[a-zA-Z0-9_]{3,32}$/.test(enemy.id)) {
        errors.push('ID must be 3-32 characters (letters, numbers, underscore only)');
    }
    
    // Name validation
    if (!enemy.name || enemy.name.trim() === '') {
        errors.push('Name is required');
    } else if (enemy.name.length > 64) {
        errors.push('Name must be 64 characters or less');
    }
    
    // Stats validation
    if (enemy.stats.hp <= 0) {
        errors.push('HP must be greater than 0');
    }
    if (enemy.stats.speed < 1 || enemy.stats.speed > 500) {
        errors.push('Speed must be between 1 and 500');
    }
    if (enemy.stats.damage < 0) {
        errors.push('Damage cannot be negative');
    }
    if (enemy.stats.xp < 0) {
        errors.push('XP reward cannot be negative');
    }
    
    // Range validation
    if (enemy.ai.range < 1) {
        errors.push('Detect range must be positive');
    }
    if (enemy.ai.attackRange < 1) {
        errors.push('Attack range must be positive');
    }
    
    return errors;
}

function checkDuplicateID(id, currentEnemy) {
    return enemies.some(e => e.id === id && e !== currentEnemy);
}

function showValidationError(message) {
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
    `;
    notification.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
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