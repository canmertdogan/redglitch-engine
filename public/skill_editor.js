// skill_editor.js
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

// Initialize integration
function initializeIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedglitchEventBus;
        projectState = window.RedglitchProjectState;
        assetManager = window.RedglitchAssetManager;
        
        if (eventBus) {
            // Listen for FX updates (skills use visual effects)
            eventBus.on('fx:updated', (event) => {
                console.log('[SkillEditor] FX updated:', event.data.fxId);
            });
            
            // Listen for external skill load requests
            eventBus.on('skill:load', (event) => {
                if (event.data.skillId) {
                    const idx = skills.findIndex(s => s.id === event.data.skillId);
                    if (idx >= 0) loadSkill(idx);
                }
            });
            
            console.log('[SkillEditor] EventBus connected');
        }
    }
}

// Broadcast skill changes
function broadcastSkillUpdate(skill, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`skill:${action}`, {
            skillId: skill.id,
            skill: skill,
            timestamp: Date.now()
        });
    }
    
    // Also save to project state
    if (projectState) {
        projectState.set(`skills.${skill.id}`, skill);
    }
}

// Save all skills to project state
function saveSkillsToState() {
    if (!projectState) return;
    
    const skillMap = {};
    skills.forEach(skill => {
        skillMap[skill.id] = skill;
    });
    projectState.set('skills', skillMap);
}

let skills = [
    { id: 'fire_letter', name: 'Arabic Fire', sprite: 'irab_fathah', mana: 10, cooldown: 0.5, type: 'projectile', desc: 'Default burning letter shot.' }
];
let currentIndex = 0;

const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

function showToast(msg, isError = false) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:16px;right:16px;z-index:10000;padding:8px 14px;background:${isError ? '#3a0d0d' : '#0b2416'};color:${isError ? '#ff8a8a' : '#7ef2a6'};border:1px solid ${isError ? '#ff4444' : '#2ecc71'};font-family:inherit;font-size:0.95rem;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

window.togglePreviewPanel = function() {
    const panel = document.getElementById('preview-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
};

window.onload = async () => {
    // Initialize integration first
    initializeIntegration();
    
    await populateSpriteSelect();
    await loadFromServer();
    refreshList();
    if (skills.length > 0) loadSkill(0);

    // Click to Edit Sprite in Pixel Art Studio
    document.getElementById('preview-box').onclick = () => {
        const spriteKey = skills[currentIndex]?.sprite || '';
        if (window.parent && typeof window.parent.openTool === 'function') {
            window.parent.openTool('pixel', spriteKey ? { sprite: spriteKey } : {});
        } else if (window.parent && typeof window.parent.openWindow === 'function' && Array.isArray(window.parent.tools)) {
            const pixelTool = window.parent.tools.find(t => t.id === 'pixel');
            if (pixelTool) {
                const sep = pixelTool.src.includes('?') ? '&' : '?';
                const nextSrc = spriteKey ? `${pixelTool.src}${sep}sprite=${encodeURIComponent(spriteKey)}` : pixelTool.src;
                window.parent.openWindow({ ...pixelTool, src: nextSrc });
            }
        } else {
            const targetUrl = spriteKey ? `pixel_editor.html?sprite=${encodeURIComponent(spriteKey)}` : 'pixel_editor.html';
            window.location.href = targetUrl;
        }
    };
};

async function populateSpriteSelect() {
    const sel = document.getElementById('skill-sprite');
    if (!sel) return;
    sel.innerHTML = '';
    
    // 1. Add Pixel Art Sprites
    if (window.SPRITES) {
        Object.keys(window.SPRITES).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.innerText = `[PIXEL] ${key.toUpperCase()}`;
            sel.appendChild(opt);
        });
    }

    // 2. Add Pixel Mart PNGs
    try {
        const res = await fetch('/dunyalar/definitions/items.json');
        if (res.ok) {
            const items = await res.json();
            const pngs = [...new Set(
                (Array.isArray(items) ? items : [])
                    .filter(i => i?.sprite?.endsWith?.('.png'))
                    .map(i => i.sprite)
            )];
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
    const list = document.getElementById('skill-list');
    list.innerHTML = '';
    skills.forEach((s, idx) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        if (idx === currentIndex) div.classList.add('active');
        div.innerText = (s.name || s.id || 'Unnamed').toUpperCase();
        div.onclick = () => loadSkill(idx);
        list.appendChild(div);
    });
}

function loadSkill(idx) {
    if (!skills[idx]) return;
    currentIndex = idx;
    const s = skills[idx];
    document.getElementById('skill-id').value = s.id || '';
    document.getElementById('skill-name').value = s.name || '';
    const spriteSel = document.getElementById('skill-sprite');
    if (spriteSel) {
        if (s.sprite && !Array.from(spriteSel.options).some(o => o.value === s.sprite)) {
            const opt = document.createElement('option');
            opt.value = s.sprite;
            opt.innerText = s.sprite;
            spriteSel.appendChild(opt);
        }
        spriteSel.value = s.sprite || '';
    }
    document.getElementById('skill-mana').value = s.mana ?? 0;
    document.getElementById('skill-cooldown').value = s.cooldown ?? 0;
    document.getElementById('skill-type').value = s.type || 'projectile';
    document.getElementById('skill-desc').value = s.description ?? s.desc ?? '';
    
    refreshList();
    renderPreview();
}

function addNewSkill() {
    const id = "new_skill_" + Date.now().toString().slice(-4);
    skills.push({ id, name: 'New Skill', sprite: 'target', mana: 10, cooldown: 0.5, type: 'projectile', description: '', desc: '' });
    loadSkill(skills.length - 1);
}

function deleteCurrentSkill() {
    if (!skills[currentIndex]) return;
    const target = skills[currentIndex];
    if (!confirm(`Delete skill "${target.name || target.id}"?`)) return;

    skills.splice(currentIndex, 1);
    if (eventBus) {
        eventBus.emit('skill:deleted', { skillId: target.id, timestamp: Date.now() });
    }
    saveSkillsToState();

    if (skills.length === 0) {
        currentIndex = 0;
        refreshList();
        document.getElementById('skill-id').value = '';
        document.getElementById('skill-name').value = '';
        document.getElementById('skill-mana').value = '';
        document.getElementById('skill-cooldown').value = '';
        document.getElementById('skill-desc').value = '';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        loadSkill(Math.min(currentIndex, skills.length - 1));
    }
    showToast(`DELETED: ${target.name || target.id}`);
}

document.querySelectorAll('input, select, textarea').forEach(el => {
    el.onchange = () => {
        const s = skills[currentIndex];
        if (!s) return;
        s.id = document.getElementById('skill-id').value;
        s.name = document.getElementById('skill-name').value;
        s.sprite = document.getElementById('skill-sprite').value;
        s.mana = parseInt(document.getElementById('skill-mana').value, 10) || 0;
        s.cooldown = parseFloat(document.getElementById('skill-cooldown').value) || 0;
        s.type = document.getElementById('skill-type').value;
        const descText = document.getElementById('skill-desc').value;
        s.description = descText;
        s.desc = descText;
        refreshList();
        renderPreview();
    };
});

function renderPreview() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const spriteKey = skills[currentIndex]?.sprite;
    if (!spriteKey || typeof window.createPixelImage !== 'function') return;
    const img = window.createPixelImage(spriteKey);

    const draw = (source) => {
        if (!source || !source.width || !source.height) return;
        ctx.imageSmoothingEnabled = false;
        const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
        const dw = source.width * scale;
        const dh = source.height * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(source, dx, dy, dw, dh);
    };

    if (img instanceof HTMLCanvasElement) {
        draw(img);
    } else if (img instanceof HTMLImageElement) {
        if (img.complete) {
            draw(img);
        } else {
            img.onload = () => draw(img);
        }
    } else {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(16, 16, 32, 32);
    }
}

async function saveToServer(options = {}) {
    const silent = Boolean(options && options.silent);
    try {
        const response = await fetch('/api/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(skills)
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        // Save to shared state and broadcast
        saveSkillsToState();
        skills.forEach(skill => broadcastSkillUpdate(skill, 'updated'));
        if (silent) showToast("Skills auto-saved.");
        else showToast("Skill definitions saved to server!");
    } catch (e) {
        console.error(e);
        if (silent) showToast("Skill save failed.", true);
        else alert("Save failed.");
    }
}

window.save = saveToServer;
window.saveToServer = saveToServer;
window.addNewSkill = addNewSkill;
window.deleteCurrentSkill = deleteCurrentSkill;

async function loadFromServer() {
    try {
        const response = await fetch('/api/skills');
        if (response.ok) {
            skills = await response.json();
        }
    } catch (e) {
        console.warn("No skill defs found on server.");
    }
}