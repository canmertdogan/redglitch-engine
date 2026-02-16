// skill_editor.js
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

window.onload = async () => {
    // Initialize integration first
    initializeIntegration();
    
    populateSpriteSelect();
    await loadFromServer();
    refreshList();
    loadSkill(0);

    // Click to Edit Sprite
    document.getElementById('sprite-preview').onclick = () => {
        const spriteKey = skills[currentIndex].sprite;
        if (window.parent && window.parent.editSpriteInStudio) {
            window.parent.editSpriteInStudio(spriteKey);
        }
    };
};

async function populateSpriteSelect() {
    const sel = document.getElementById('skill-sprite');
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

    // 2. Add Pixel Mart PNGs
    try {
        const res = await fetch('/dunyalar/definitions/items.json');
        if (res.ok) {
            const items = await res.json();
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
    const list = document.getElementById('skill-list');
    list.innerHTML = '';
    skills.forEach((s, idx) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        if (idx === currentIndex) div.classList.add('active');
        div.innerText = s.name.toUpperCase();
        div.onclick = () => loadSkill(idx);
        list.appendChild(div);
    });
}

function loadSkill(idx) {
    currentIndex = idx;
    const s = skills[idx];
    document.getElementById('skill-id').value = s.id;
    document.getElementById('skill-name').value = s.name;
    document.getElementById('skill-sprite').value = s.sprite;
    document.getElementById('skill-mana').value = s.mana;
    document.getElementById('skill-cooldown').value = s.cooldown;
    document.getElementById('skill-type').value = s.type;
    document.getElementById('skill-desc').value = s.desc;
    
    refreshList();
    renderPreview();
}

function addNewSkill() {
    const id = "new_skill_" + Date.now().toString().slice(-4);
    skills.push({ id, name: 'New Skill', sprite: 'target', mana: 10, cooldown: 0.5, type: 'projectile', desc: '' });
    loadSkill(skills.length - 1);
}

document.querySelectorAll('input, select').forEach(el => {
    el.onchange = () => {
        const s = skills[currentIndex];
        s.id = document.getElementById('skill-id').value;
        s.name = document.getElementById('skill-name').value;
        s.sprite = document.getElementById('skill-sprite').value;
        s.mana = parseInt(document.getElementById('skill-mana').value);
        s.cooldown = parseFloat(document.getElementById('skill-cooldown').value);
        s.type = document.getElementById('skill-type').value;
        s.desc = document.getElementById('skill-desc').value;
        refreshList();
        renderPreview();
    };
});

function renderPreview() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const spriteKey = skills[currentIndex].sprite;
    const img = window.createPixelImage(spriteKey);

    const draw = (source) => {
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
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(16, 16, 32, 32);
    }
}

async function saveToServer() {
    try {
        const response = await fetch('/api/skill-defs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(skills)
        });
        if (response.ok) {
            // Save to shared state and broadcast
            saveSkillsToState();
            skills.forEach(skill => broadcastSkillUpdate(skill, 'updated'));
            alert("Skill definitions saved to server!");
        }
    } catch (e) {
        console.error(e);
        alert("Save failed.");
    }
}

async function loadFromServer() {
    try {
        const response = await fetch('/dunyalar/definitions/skills.json');
        if (response.ok) {
            skills = await response.json();
        }
    } catch (e) {
        console.warn("No skill defs found on server.");
    }
}