// fx_editor.js - FX Master Pro Logic
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

function initializeFxIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.KetebeEventBus;
        projectState = window.KetebeProjectState;
        assetManager = window.KetebeAssetManager;
        
        if (eventBus) {
            // Listen for FX requests from skill editor
            eventBus.on('fx:request', (event) => {
                console.log('[FXEditor] FX requested:', event.data.fxId);
            });
            
            // Listen for sprite updates from pixel editor
            eventBus.on('asset:sprite:*', (event) => {
                console.log('[FXEditor] Sprite asset updated, refreshing sprite list');
                loadSpriteList();
            });
            
            console.log('[FXEditor] EventBus connected');
        }
    }
}

function broadcastFxUpdate(fxName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`asset:fx:${action}`, {
            fxId: fxName,
            config: { ...config },
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`assets.fx.${fxName}`, {
            name: fxName,
            mode: config.mode,
            count: config.count,
            lastModified: Date.now()
        });
    }
}

const canvas = document.getElementById('fx-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let lastTime = performance.now();
let sprites = {}; // Cache of Image objects

// Default Config
const config = {
    name: "new_effect",
    mode: "burst",
    count: 50,
    duration: 2.0,
    sprite: "",
    blend: "lighter",
    life: { min: 0.5, max: 1.0 },
    speed: { min: 50, max: 150 },
    size: { start: 10, end: 0 },
    color: { start: "#f1c40f", end: "#e74c3c" },
    physics: {
        gravity: 0,
        drag: 0.95,
        spread: 360
    }
};

class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        
        const angle = (Math.random() * config.physics.spread - config.physics.spread/2 - 90) * (Math.PI / 180);
        const speed = config.speed.min + Math.random() * (config.speed.max - config.speed.min);
        
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        this.lifeMax = config.life.min + Math.random() * (config.life.max - config.life.min);
        this.life = this.lifeMax;
        
        this.active = true;
    }

    update(dt) {
        if (!this.active) return;

        // Physics
        this.vx *= config.physics.drag || 1;
        this.vy *= config.physics.drag || 1;
        this.vy += config.physics.gravity * dt * 100; // Scale gravity

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.life -= dt;
        if (this.life <= 0) {
            this.active = false;
            // Recycle if continuous
            if (config.mode === 'continuous') this.reset();
        }
    }

    draw() {
        if (!this.active) return;

        const progress = 1 - (this.life / this.lifeMax);
        const size = config.size.start + (config.size.end - config.size.start) * progress;
        
        ctx.globalCompositeOperation = config.blend;
        ctx.globalAlpha = Math.max(0, this.life / this.lifeMax);

        if (config.sprite && sprites[config.sprite]) {
            const img = sprites[config.sprite];
            ctx.drawImage(img, this.x - size/2, this.y - size/2, size, size);
        } else {
            // Gradient fill fallback
            ctx.fillStyle = progress < 0.5 ? config.color.start : config.color.end;
            ctx.fillRect(this.x - size/2, this.y - size/2, size, size);
        }
    }
}

// --- INIT ---

async function init() {
    // Initialize integration first
    initializeFxIntegration();
    
    await loadSpriteList();
    await refreshFxList();
    
    // Bind Inputs
    bindInput('p-mode', (v) => { config.mode = v; updateUIState(); });
    bindInput('p-count', (v) => config.count = parseInt(v));
    bindInput('p-duration', (v) => config.duration = parseFloat(v));
    bindInput('p-sprite', (v) => config.sprite = v);
    bindInput('p-blend', (v) => config.blend = v);
    
    bindInput('p-color-start', (v) => config.color.start = v);
    bindInput('p-color-end', (v) => config.color.end = v);
    
    bindInput('p-size-start', (v) => config.size.start = parseInt(v));
    bindInput('p-size-end', (v) => config.size.end = parseInt(v));
    
    bindInput('p-speed', (v) => { config.speed.max = parseInt(v); config.speed.min = parseInt(v) * 0.5; });
    bindInput('p-spread', (v) => config.physics.spread = parseInt(v));
    bindInput('p-gravity', (v) => config.physics.gravity = parseInt(v));
    bindInput('p-drag', (v) => config.physics.drag = 1 - (parseInt(v) / 1000)); // Map 0-100 to 1.0-0.9
    bindInput('p-life', (v) => { config.life.max = parseFloat(v); config.life.min = parseFloat(v) * 0.5; });

    requestAnimationFrame(loop);
}

function bindInput(id, callback) {
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = (e) => callback(e.target.value);
}

async function loadSpriteList() {
    try {
        // We use the asset API to find sprites
        const res = await fetch('/api/assets/list');
        const assets = await res.json();
        const sel = document.getElementById('p-sprite');
        
        assets.filter(a => a.type === 'sprite').forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.path; // Use path or name? Usually we map names.
            // Let's use name if it looks like an ID, else path
            opt.value = a.name.split('.')[0]; 
            opt.innerText = a.name;
            sel.appendChild(opt);
            
            // Preload
            const img = new Image();
            img.src = a.path.startsWith('http') ? a.path : `/${a.path}`; // Adjust path logic
            // Actually paths from API are relative to active project or public. 
            // We need a way to resolve them. 
            // Let's rely on /base_game/sprites.js map if possible, but that's complex.
            // Simple approach: Use the /api/assets/scan paths which are web-accessible.
            img.src = a.path;
            sprites[opt.value] = img;
        });
    } catch(e) { console.error("Sprite load failed", e); }
}

async function refreshFxList() {
    try {
        const res = await fetch('/api/fx/list');
        const files = await res.json();
        const sel = document.getElementById('fx-list');
        sel.innerHTML = files.map(f => `<option value="${f}">${f}</option>`).join('');
    } catch(e) {}
}

// --- LOGIC ---

function triggerBurst() {
    // Rebuild pool
    particles = [];
    const count = config.mode === 'burst' ? config.count : 1; 
    // For burst, we spawn all at once. For continuous, we spawn over time in loop.
    // In Editor, "Trigger Burst" simulates one shot.
    
    for(let i=0; i<config.count; i++) {
        particles.push(new Particle());
    }
}

function clearParticles() {
    particles = [];
}

function updateUIState() {
    const btn = document.querySelector('#preview-controls button');
    if (config.mode === 'continuous') {
        btn.innerText = "▶ RESTART LOOP";
    } else {
        btn.innerText = "▶ TRIGGER BURST";
    }
}

function loop(timestamp) {
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Continuous Emitter Logic
    if (config.mode === 'continuous') {
        // Ensure pool size
        if (particles.length < config.count) {
            const needed = Math.ceil(config.count * dt); // particles per second? 
            // Actually count is total active particles usually.
            // Let's just fill up to count.
            for(let i=0; i<2; i++) { // Spawn rate limit
                if (particles.length < config.count) particles.push(new Particle());
            }
        }
    }

    // Update & Draw
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update(dt);
        p.draw();
        if (!p.active && config.mode === 'burst') {
            particles.splice(i, 1);
        }
    }

    requestAnimationFrame(loop);
}

// --- IO ---

async function saveEffect() {
    const name = prompt("Effect Name:", config.name);
    if (!name) return;
    config.name = name;
    
    await fetch('/api/fx/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, config })
    });
    alert("Saved!");
    refreshFxList();
}

async function loadEffect() {
    const name = document.getElementById('fx-list').value;
    if (!name) return;
    const res = await fetch(`/api/fx/${name}`);
    const data = await res.json();
    Object.assign(config, data);
    
    // Sync UI (Manual... tedious but necessary without framework)
    document.getElementById('p-mode').value = config.mode;
    document.getElementById('p-count').value = config.count;
    document.getElementById('p-duration').value = config.duration;
    document.getElementById('p-sprite').value = config.sprite;
    document.getElementById('p-blend').value = config.blend;
    document.getElementById('p-color-start').value = config.color.start;
    document.getElementById('p-color-end').value = config.color.end;
    document.getElementById('p-size-start').value = config.size.start;
    document.getElementById('p-size-end').value = config.size.end;
    
    // Derived values
    document.getElementById('p-speed').value = config.speed.max;
    document.getElementById('p-spread').value = config.physics.spread;
    document.getElementById('p-gravity').value = config.physics.gravity;
    // drag inverse logic ... ignored for load simplicity or approximate
    document.getElementById('p-life').value = config.life.max;
    
    updateUIState();
    triggerBurst();
}

init();