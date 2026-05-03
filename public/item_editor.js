// item_editor.js
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
            // Listen for skill updates (items may grant skills)
            eventBus.on('skill:updated', (event) => {
                console.log('[ItemEditor] Skill updated:', event.data.skillId);
            });
            
            // Listen for external item load requests
            eventBus.on('item:load', (event) => {
                if (event.data.itemId) {
                    const idx = items.findIndex(i => i.id === event.data.itemId);
                    if (idx >= 0) loadItem(idx);
                }
            });
            
            console.log('[ItemEditor] EventBus connected');
        }
    }
}

// Broadcast item changes
function broadcastItemUpdate(item, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`item:${action}`, {
            itemId: item.id,
            item: item,
            timestamp: Date.now()
        });
    }
    
    // Also save to project state
    if (projectState) {
        projectState.set(`items.${item.id}`, item);
    }
}

// Save all items to project state
function saveItemsToState() {
    if (!projectState) return;
    
    const itemMap = {};
    items.forEach(item => {
        itemMap[item.id] = item;
    });
    projectState.set('items', itemMap);
}

let items = [
    { 
        id: 'scroll_mana', 
        name: 'Mana Scroll', 
        sprite: 'irab_dhammah', 
        type: 'consumable', 
        value: 25, 
        desc: 'Restores 25 Irab Power.',
        // New fields for Campaign Runtime compatibility
        icon: 'irab_dhammah',
        description: 'Restores 25 Irab Power.',
        rarity: 'common',
        stackable: true,
        maxStack: 99,
        properties: { manaAmount: 25 }
    }
];
let currentIndex = 0;

const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

window.onload = async () => {
    // Initialize integration first
    initializeIntegration();
    
    populateSpriteSelect();
    await loadFromServer();
    refreshList();
    loadItem(0);

    // Click to Edit Sprite
    document.getElementById('sprite-preview').onclick = () => {
        const spriteKey = items[currentIndex].sprite;
        if (window.parent && window.parent.editSpriteInStudio) {
            window.parent.editSpriteInStudio(spriteKey);
        }
    };
};

async function populateSpriteSelect() {
    const sel = document.getElementById('item-sprite');
    if (!sel) return;
    
    // 1. Add Pixel Art Sprites
    if (window.SPRITES) {
        Object.keys(window.SPRITES).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.innerText = `[PIXEL] ${key.toUpperCase()}`;
            sel.appendChild(opt);
        });
    }

    // 2. Add Pixel Mart PNGs (from the list we generated)
    try {
        const res = await fetch('/dunyalar/definitions/items.json');
        if (res.ok) {
            const items = await res.json();
            // Filter unique sprites that are PNGs
            const pngs = [...new Set(items.filter(i => i.sprite.endsWith('.png')).map(i => i.sprite))];
            pngs.forEach(png => {
                const opt = document.createElement('option');
                opt.value = png;
                opt.innerText = `[MART] ${png}`;
                sel.appendChild(opt);
            });
        }
    } catch (e) {}
}

function refreshList() {
    const list = document.getElementById('item-list');
    list.innerHTML = '';
    items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        if (idx === currentIndex) div.classList.add('active');
        div.innerText = item.name.toUpperCase();
        div.onclick = () => loadItem(idx);
        list.appendChild(div);
    });
}

function loadItem(idx) {
    currentIndex = idx;
    const item = items[idx];
    
    // Existing fields
    document.getElementById('item-id').value = item.id;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-sprite').value = item.sprite;
    document.getElementById('item-type').value = item.type;
    document.getElementById('item-value').value = item.value || 0;
    document.getElementById('item-desc').value = item.desc || item.description || '';
    
    // New fields (with defaults for old items)
    document.getElementById('item-rarity').value = item.rarity || 'common';
    document.getElementById('item-icon').value = item.icon || item.sprite;
    document.getElementById('item-stackable').value = item.stackable !== false ? 'true' : 'false';
    document.getElementById('item-maxstack').value = item.maxStack || 99;
    
    // Properties as formatted JSON
    const properties = item.properties || {};
    document.getElementById('item-properties').value = JSON.stringify(properties, null, 2);
    
    refreshList();
    renderPreview();
}

function addNewItem() {
    const id = "item_" + Date.now().toString().slice(-6);
    items.push({ 
        id, 
        name: 'New Item', 
        sprite: 'target', 
        type: 'consumable', 
        value: 10, 
        desc: '',
        // New fields with defaults
        icon: 'target',
        description: '',
        rarity: 'common',
        stackable: true,
        maxStack: 99,
        properties: {}
    });
    loadItem(items.length - 1);
}

document.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => {
        const item = items[currentIndex];
        
        // Existing fields
        item.id = document.getElementById('item-id').value;
        item.name = document.getElementById('item-name').value;
        item.sprite = document.getElementById('item-sprite').value;
        item.type = document.getElementById('item-type').value;
        item.value = parseFloat(document.getElementById('item-value').value) || 0;
        item.desc = document.getElementById('item-desc').value;
        
        // New fields
        item.rarity = document.getElementById('item-rarity').value;
        item.icon = document.getElementById('item-icon').value || item.sprite;
        item.description = item.desc; // Keep both for compatibility
        item.stackable = document.getElementById('item-stackable').value === 'true';
        item.maxStack = parseInt(document.getElementById('item-maxstack').value) || 99;
        
        // Parse JSON properties with validation
        try {
            const propsText = document.getElementById('item-properties').value.trim();
            item.properties = propsText ? JSON.parse(propsText) : {};
            
            // Remove error styling if present
            document.getElementById('item-properties').style.borderColor = '#444';
        } catch (e) {
            // Invalid JSON - show error but don't crash
            document.getElementById('item-properties').style.borderColor = '#e74c3c';
            console.warn('Invalid properties JSON:', e.message);
        }
        
        renderPreview();
        broadcastItemUpdate(item, 'updated');
    });
});

function renderPreview() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const item = items[currentIndex];
    const spriteKey = item.sprite;
    const img = window.createPixelImage(spriteKey);

    const draw = (source) => {
        ctx.imageSmoothingEnabled = false;
        const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
        const dw = source.width * scale;
        const dh = source.height * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(source, dx, dy, dw, dh);
        
        // Draw rarity border
        const rarityColors = {
            common: '#fff',
            uncommon: '#2ecc71',
            rare: '#3498db',
            epic: '#9b59b6',
            legendary: '#ffd700'
        };
        const rarityColor = rarityColors[item.rarity] || '#fff';
        
        ctx.strokeStyle = rarityColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        
        // Show stackable indicator
        if (item.stackable) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 16px VT323';
            ctx.fillText(`MAX: ${item.maxStack}`, 10, canvas.height - 10);
        }
        
        // Show rarity name
        ctx.fillStyle = rarityColor;
        ctx.font = 'bold 14px VT323';
        ctx.textAlign = 'right';
        ctx.fillText((item.rarity || 'common').toUpperCase(), canvas.width - 10, 20);
        ctx.textAlign = 'left';
    };

    if (img) {
        if (img.complete) {
            draw(img);
        } else {
            img.onload = () => draw(img);
        }
    }
}
async function saveToServer() {
    try {
        const response = await fetch('/api/item-defs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        if (response.ok) {
            // Save to shared state and broadcast
            saveItemsToState();
            items.forEach(item => broadcastItemUpdate(item, 'updated'));
            alert("Item definitions saved to server!");
        }
    } catch (e) {
        console.error(e);
        alert("Save failed.");
    }
}

async function loadFromServer() {
    try {
        const response = await fetch('/dunyalar/definitions/items.json');
        if (response.ok) {
            items = await response.json();
        }
    } catch (e) {
        console.warn("No item defs found on server.");
    }
}