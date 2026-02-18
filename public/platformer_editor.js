// platformer_editor.js - Platformer Level Editor Logic (Enhanced with RPG-Level Features)

const COLLISION_TYPES = {
    0: { name: 'Passable', color: 'transparent', key: '0' },
    1: { name: 'Solid (Shadowed)', color: 'rgba(231, 76, 60, 0.3)', key: '1' },
    2: { name: 'Shadowless Wall', color: 'rgba(52, 152, 219, 0.3)', key: '2' },
    3: { name: 'Half-Height', color: 'rgba(241, 196, 15, 0.3)', key: '3' },
    4: { name: 'One-Way Up', color: 'rgba(46, 204, 113, 0.3)', arrow: '↑', key: '4' },
    5: { name: 'One-Way Down', color: 'rgba(46, 204, 113, 0.3)', arrow: '↓', key: '5' },
    6: { name: 'One-Way Left', color: 'rgba(46, 204, 113, 0.3)', arrow: '←', key: '6' },
    7: { name: 'One-Way Right', color: 'rgba(46, 204, 113, 0.3)', arrow: '→', key: '7' },
    8: { name: 'Trigger Zone', color: 'rgba(155, 89, 182, 0.3)', dashed: true, key: '8' },
    9: { name: 'Slope 45° R', color: 'rgba(230, 126, 34, 0.3)', shape: 'slope-r', key: '9' },
    10: { name: 'Slope 45° L', color: 'rgba(230, 126, 34, 0.3)', shape: 'slope-l', key: '0' }
};

class PlatformerEditor {
    constructor() {
        this.canvas = document.getElementById('level-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        
        // Level data
        this.width = 40;
        this.height = 20;
        this.tilesetPath = 'WORLD_PIXEL_ART';
        this.layers = [new Array(40 * 20).fill(0)]; 
        this.collision = new Array(this.width * this.height).fill(0);
        this.decorations = []; // Non-collision decorative tiles
        this.entities = [];
        this.collectibles = [];
        this.checkpoints = [];
        this.spawn = { x: 2, y: 12 };
        this.goal = { x: 35, y: 12 };
        this.levelName = "Untitled Level";
        this.levelId = "level1";
        this.background = ''; // Background image or CSS
        this.weather = 'none';
        this.lighting = 'day';
        this.shader = 'default';
        
        // Editor state
        this.tileSize = 32;
        this.sourceTileSize = 16; // Source tiles are 16x16
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.currentTool = 'paint';
        this.currentMode = 'decoration'; 
        this.activeLayer = 0;
        this.selectedTile = 1;
        this.selectedDecoTile = 1;
        this.selectedEntity = null;
        this.isDragging = false;
        this.isPanning = false;
        this.lastX = 0;
        this.lastY = 0;
        this.showGrid = true;
        this.showCollision = true;
        this.currentProject = null;
        
        // History
        this.history = [];
        this.historyIndex = -1;
        this.selectedCollisionType = 1;
        
        // Prefabs
        this.prefabCache = {};
        this.selectedPrefab = null;

        // Tileset
        this.tileset = new Image();
        this.tilesetReady = false;
        
        // Colors for collision debugging
        this.colors = {
            0: 'transparent',
            1: '#654321', 
            2: '#8B4513', 
            3: '#FF0000' 
        };
        
        this.init();
    }
    
    async init() {
        this.setupCanvas();
        this.setupEventListeners();
        await this.loadTileset();
        await this.loadProjects();
        this.initPalette();
        this.loadWorlds();
        this.loadPrefabs();
        this.render();
        
        console.log('[PlatformerEditor] Initialized');
    }

    async loadWorlds() {
        if (!this.currentProject) return;
        
        try {
            const res = await fetch(`/api/platformer-levels/${encodeURIComponent(this.currentProject)}`);
            if (res.ok) {
                const files = await res.json();
                const container = document.getElementById('worlds-list');
                if (!container) return;
                
                container.innerHTML = '';
                files.forEach(f => {
                    const levelId = f.replace('.json', '');
                    const div = document.createElement('div');
                    div.style.cssText = 'padding: 5px; cursor: pointer; border-bottom: 1px solid #222; font-size: 0.9rem; color: #aaa;';
                    div.innerHTML = `<i class="fas fa-file"></i> ${levelId}`;
                    div.onclick = () => this.loadLevelById(levelId);
                    div.onmouseover = () => { div.style.color = '#fff'; div.style.background = '#111'; };
                    div.onmouseout = () => { div.style.color = '#aaa'; div.style.background = 'transparent'; };
                    container.appendChild(div);
                });
            }
        } catch (e) {
            console.error('Failed to load worlds:', e);
        }
    }

    async loadLevelById(levelId) {
        if (!this.currentProject) return;
        
        try {
            const path = `/projects/${this.currentProject}/dunyalar/platformer/${levelId}.json`;
            const res = await fetch(path);
            
            if (!res.ok) {
                throw new Error(`Failed to load level: ${res.status}`);
            }
            
            const data = await res.json();
            this.applyLevelData(data, levelId);
        } catch (e) {
            alert('Failed to load level: ' + e.message);
        }
    }

    applyLevelData(data, levelId) {
        this.width = data.width;
        this.height = data.height;
        this.tilesetPath = data.tilesetPath || 'WORLD_PIXEL_ART';
        this.layers = data.layers || [new Array(this.width * this.height).fill(0)];
        this.collision = data.collision || new Array(this.width * this.height).fill(0);
        this.decorations = data.decorations || [];
        this.spawn = data.spawn || { x: 2, y: 12 };
        this.goal = data.goal || { x: 35, y: 12 };
        this.collectibles = data.collectibles || [];
        this.checkpoints = data.checkpoints || [];
        this.entities = data.entities || [];
        this.levelName = data.name || 'Untitled Level';
        this.levelId = levelId;
        this.background = data.background || '';
        this.weather = data.weather || 'none';
        this.lighting = data.lighting || 'day';
        this.shader = data.shader || 'default';
        
        // Update UI
        document.getElementById('prop-name').value = this.levelName;
        document.getElementById('prop-id').value = this.levelId;
        document.getElementById('level-width').value = this.width;
        document.getElementById('level-height').value = this.height;
        document.getElementById('spawn-x').value = this.spawn.x;
        document.getElementById('spawn-y').value = this.spawn.y;
        document.getElementById('goal-x').value = this.goal.x;
        document.getElementById('goal-y').value = this.goal.y;
        
        const bgInput = document.getElementById('prop-background');
        if (bgInput) bgInput.value = this.background;
        
        const weatherSel = document.getElementById('prop-weather');
        if (weatherSel) weatherSel.value = this.weather;
        
        const lightingSel = document.getElementById('prop-lighting');
        if (lightingSel) lightingSel.value = this.lighting;
        
        const shaderSel = document.getElementById('prop-shader');
        if (shaderSel) shaderSel.value = this.shader;
        
        this.render();
        this.setStatus(`Loaded: ${levelId}`);
    }
    
    async loadTileset() {
        if (this.tilesetPath === 'WORLD_PIXEL_ART') {
            this.tileset = await this.combineWorldPixelArt();
            this.tilesetReady = true;
        } else {
            return new Promise((resolve) => {
                this.tileset.onload = () => {
                    this.tilesetReady = true;
                    resolve();
                };
                this.tileset.src = this.tilesetPath;
            });
        }
    }
    
    async combineWorldPixelArt() {
        const canvas = document.createElement('canvas');
        const tSize = 16;
        const cols = 16;
        const totalTiles = 600;
        const rows = Math.ceil(totalTiles / cols);
        canvas.width = cols * tSize;
        canvas.height = rows * tSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        let loadedCount = 0;
        const promises = [];
        for (let i = 1; i <= totalTiles; i++) {
            promises.push(new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const x = ((i - 1) % cols) * tSize;
                    const y = Math.floor((i - 1) / cols) * tSize;
                    ctx.drawImage(img, x, y, tSize, tSize);
                    loadedCount++;
                    resolve();
                };
                img.onerror = () => resolve();
                // Ensure absolute path from root
                img.src = `/sprite-art/worldpixelart/texture_16px ${i}.png`;
            }));
        }
        await Promise.all(promises);

        // Save combined spritesheet to server to keep it synced
        try {
            const dataUrl = canvas.toDataURL('image/png');
            fetch('/api/save-spritesheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: dataUrl }),
            });
        } catch (e) { console.warn('[PlatformerEditor] Could not save spritesheet to server', e); }

        return canvas;
    }
    
    async loadPrefabs() {
        try {
            let assetsRes = await fetch('/api/assets/list?t=' + Date.now());
            let assets = await assetsRes.json();
            const prefabs = assets.filter(a => {
                const p = a.path.toLowerCase();
                const n = a.name.toLowerCase();
                return n.endsWith('.json') && p.includes('definitions');
            });
            const list = document.getElementById('prefab-list');
            if(list) {
                list.innerHTML = '';
                prefabs.forEach(p => {
                    const div = document.createElement('div');
                    div.style.cssText = "padding:8px; border-bottom:1px solid #333; cursor:pointer; color:#ccc;";
                    div.innerHTML = `<i class="fas fa-cube"></i> ${p.name.replace('.json','')}`;
                    div.onclick = () => {
                         this.selectedPrefab = p.name;
                         this.loadPrefabData(p.name);
                         Array.from(list.children).forEach(c => c.style.background = 'transparent');
                         div.style.background = '#222';
                         this.currentTool = 'prefab';
                         this.currentMode = 'prefabs';
                    };
                    list.appendChild(div);
                });
            }
        } catch(e) {}
    }
    
    async loadPrefabData(filename) {
        if (!this.prefabCache[filename]) {
            try {
                const res = await fetch(`dunyalar/definitions/${filename}`);
                if(res.ok) this.prefabCache[filename] = await res.json();
            } catch(e) {}
        }
    }
    
    initPalette() {
        if (!this.tilesetReady) return;
        const paletteContainer = document.getElementById('tile-palette');
        if (!paletteContainer) return;
        paletteContainer.innerHTML = '';
        const cols = 16;
        for (let i = 0; i < 600; i++) {
            const tileDiv = document.createElement('div');
            tileDiv.className = 'palette-tile';
            tileDiv.style.width = '100%';
            tileDiv.style.aspectRatio = '1/1';
            tileDiv.style.border = '1px solid #444';
            tileDiv.style.cursor = 'pointer';
            tileDiv.style.imageRendering = 'pixelated';
            const canvas = document.createElement('canvas');
            canvas.width = 32; canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const sx = (i % cols) * this.sourceTileSize;
            const sy = Math.floor(i / cols) * this.sourceTileSize;
            ctx.drawImage(this.tileset, sx, sy, this.sourceTileSize, this.sourceTileSize, 0, 0, 32, 32);
            tileDiv.appendChild(canvas);
            tileDiv.onclick = () => {
                if (this.currentMode === 'collision') this.setMode('decoration');
                this.selectedTile = i + 1;
                document.querySelectorAll('.palette-tile').forEach(t => t.style.border = '1px solid #444');
                tileDiv.style.border = '2px solid #f1c40f';
                this.currentTool = 'paint';
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.tool-btn[data-tool="paint"]')?.classList.add('active');
            };
            paletteContainer.appendChild(tileDiv);
        }
    }
    
    setupCanvas() {
        const container = document.getElementById('canvas-container');
        if (!container || !this.canvas) return;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        window.addEventListener('resize', () => this.setupCanvas());
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.saveLevel(); }
            if (this.currentMode === 'collision' && e.key >= '0' && e.key <= '8') {
                 this.selectedCollisionType = parseInt(e.key);
                 this.updateCollisionUI();
            }
        });
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                if (['paint', 'erase', 'fill'].includes(this.currentTool) && this.currentMode === 'prefabs') this.setMode('decoration');
            });
        });
        document.querySelectorAll('.entity-tool').forEach(tool => {
            tool.addEventListener('click', () => {
                document.querySelectorAll('.entity-tool').forEach(t => t.classList.remove('active'));
                tool.classList.add('active');
                this.selectedEntity = tool.dataset.entity;
                this.currentTool = 'entity';
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.tool-btn[data-tool="entity"]')?.classList.add('active');
            });
        });
        document.getElementById('zoom-slider').addEventListener('input', (e) => { this.zoom = parseFloat(e.target.value); this.render(); });
        document.getElementById('level-width').addEventListener('change', (e) => { this.width = parseInt(e.target.value); });
        document.getElementById('level-height').addEventListener('change', (e) => { this.height = parseInt(e.target.value); });
        document.getElementById('prop-name').addEventListener('change', (e) => { this.levelName = e.target.value; });
        document.getElementById('prop-id').addEventListener('change', (e) => { this.levelId = e.target.value; });
        document.getElementById('spawn-x').addEventListener('change', (e) => { this.spawn.x = parseInt(e.target.value); this.render(); });
        document.getElementById('spawn-y').addEventListener('change', (e) => { this.spawn.y = parseInt(e.target.value); this.render(); });
        document.getElementById('goal-x').addEventListener('change', (e) => { this.goal.x = parseInt(e.target.value); this.render(); });
        document.getElementById('goal-y').addEventListener('change', (e) => { this.goal.y = parseInt(e.target.value); this.render(); });
        document.getElementById('prop-project').addEventListener('change', (e) => { this.currentProject = e.target.value; });
        document.getElementById('prop-background').addEventListener('change', (e) => { this.background = e.target.value; this.render(); });
        document.getElementById('prop-weather').addEventListener('change', (e) => { this.weather = e.target.value; });
        document.getElementById('prop-lighting').addEventListener('change', (e) => { this.lighting = e.target.value; });
        document.getElementById('prop-shader').addEventListener('change', (e) => { this.shader = e.target.value; });
        document.getElementById('show-collision').addEventListener('change', (e) => { this.showCollision = e.target.checked; this.render(); });
    }
    
    async loadProjects() {
        try {
            const res = await fetch('/api/projects');
            if (res.ok) {
                const projects = await res.json();
                const select = document.getElementById('prop-project');
                select.innerHTML = '';
                projects.forEach(proj => {
                    const projectName = typeof proj === 'string' ? proj : proj.name;
                    const opt = document.createElement('option');
                    opt.value = projectName; opt.textContent = projectName;
                    select.appendChild(opt);
                });
                if (projects.length > 0) {
                    this.currentProject = typeof projects[0] === 'string' ? projects[0] : projects[0].name;
                    select.value = this.currentProject;
                }
            }
        } catch (e) {}
    }
    
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (e.button === 1 || e.button === 2) {
            this.isPanning = true; this.lastX = mx; this.lastY = my;
            this.canvas.style.cursor = 'grabbing'; return;
        }
        this.isDragging = true; this.pushHistory(); this.paint(mx, my);
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const tx = Math.floor((mx / this.zoom - this.offsetX) / this.tileSize);
        const ty = Math.floor((my / this.zoom - this.offsetY) / this.tileSize);
        document.getElementById('cursor-pos').textContent = `X: ${tx}, Y: ${ty}`;
        if (this.isPanning) {
            this.offsetX += (mx - this.lastX) / this.zoom;
            this.offsetY += (my - this.lastY) / this.zoom;
            this.lastX = mx; this.lastY = my; this.render(); return;
        }
        if (this.isDragging) this.paint(mx, my);
    }
    
    handleMouseUp() { this.isDragging = false; this.isPanning = false; this.canvas.style.cursor = 'crosshair'; }
    handleWheel(e) {
        e.preventDefault();
        this.zoom = Math.max(0.25, Math.min(3, this.zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
        document.getElementById('zoom-slider').value = this.zoom; this.render();
    }
    
    paint(mx, my) {
        try {
            const tx = Math.floor((mx / this.zoom - this.offsetX) / this.tileSize);
            const ty = Math.floor((my / this.zoom - this.offsetY) / this.tileSize);
            if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return;
            const idx = ty * this.width + tx;
            if (this.currentMode === 'collision') {
                this.collision[idx] = this.currentTool === 'erase' ? 0 : this.selectedCollisionType;
            } else if (this.currentTool === 'paint') {
                if (!this.layers[0]) this.layers[0] = new Array(this.width * this.height).fill(0);
                this.layers[0][idx] = this.selectedTile;
            } else if (this.currentTool === 'erase') {
                if (this.layers[0]) this.layers[0][idx] = 0;
            } else if (this.currentTool === 'entity') {
                this.placeEntity(tx, ty);
            } else if (this.currentTool === 'prefab' && this.selectedPrefab) {
                this.decorations = this.decorations.filter(d => d.x !== tx || d.y !== ty);
                this.decorations.push({ x: tx, y: ty, type: 'prefab', data: this.selectedPrefab });
            }
            this.render();
        } catch (e) {}
    }
    
    placeEntity(tx, ty) {
        if (!this.selectedEntity) return;
        if (this.selectedEntity === 'spawn') { this.spawn = { x: tx, y: ty }; document.getElementById('spawn-x').value = tx; document.getElementById('spawn-y').value = ty; }
        else if (this.selectedEntity === 'goal') { this.goal = { x: tx, y: ty }; document.getElementById('goal-x').value = tx; document.getElementById('goal-y').value = ty; }
        else if (this.selectedEntity === 'coin') this.collectibles.push({ x: tx, y: ty, type: 'coin' });
        else if (this.selectedEntity === 'checkpoint') this.checkpoints.push({ x: tx, y: ty });
        else if (this.selectedEntity === 'enemy') this.entities.push({ x: tx, y: ty, type: 'enemy', behavior: 'patrol', w: 24, h: 32, color: '#e74c3c' });
        this.render();
    }
    
    render() {
        const ctx = this.ctx; if (!ctx) return;
        ctx.fillStyle = (this.background && this.background.startsWith('#')) ? this.background : '#87CEEB';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.save();
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(this.offsetX, this.offsetY);
        if (this.tilesetReady && this.layers) {
            this.layers.forEach(layer => {
                if (!layer) return;
                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        const tileId = layer[y * this.width + x];
                        if (tileId > 0) {
                            const tid = tileId - 1;
                            ctx.drawImage(this.tileset, (tid % 16) * 16, Math.floor(tid / 16) * 16, 16, 16, x * 32, y * 32, 32, 32);
                        }
                    }
                }
            });
        }
        if (this.showCollision || this.currentMode === 'collision') {
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const tile = this.collision[y * this.width + x];
                    if (tile > 0) {
                        const typeInfo = COLLISION_TYPES[tile];
                        ctx.fillStyle = typeInfo?.color || 'rgba(255,0,0,0.3)';
                        ctx.fillRect(x * 32, y * 32, 32, 32);
                        if (typeInfo?.arrow) {
                            ctx.fillStyle = '#fff'; ctx.font = '16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                            ctx.fillText(typeInfo.arrow, x * 32 + 16, y * 32 + 16);
                        }
                    }
                    if (this.showGrid) { ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.strokeRect(x * 32, y * 32, 32, 32); }
                }
            }
        }
        this.decorations.forEach(deco => {
            if (deco.type === 'prefab') {
                const data = this.prefabCache[deco.data];
                if (data && data.sprite) {
                    const img = window.createPixelImage(data.sprite);
                    if (img) ctx.drawImage(img, deco.x * 32, deco.y * 32, 32, 32);
                }
            }
        });
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.spawn.x * 32 + 4, this.spawn.y * 32 + 4, 24, 24);
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(this.goal.x * 32 + 4, this.goal.y * 32 + 4, 24, 24);
        ctx.restore();
    }
    
    newLevel() { if (confirm('Clear?')) { this.collision.fill(0); this.layers = [new Array(this.width * this.height).fill(0)]; this.render(); } }
    async loadLevel() { const id = prompt('Level ID:'); if (id) this.loadLevelById(id); }
    async saveLevel() {
        const levelData = { width: this.width, height: this.height, type: 'platformer-2d', layers: this.layers, collision: this.collision, decorations: this.decorations, spawn: this.spawn, goal: this.goal, background: this.background, name: this.levelName };
        const res = await fetch(`/api/levels/${this.levelId}.json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(levelData) });
        if (res.ok) alert('Saved!');
    }
    setMode(mode) { 
        this.currentMode = mode; 
        document.getElementById('panel-collision-types').style.display = mode === 'collision' ? 'block' : 'none';
        document.getElementById('panel-prefabs').style.display = mode === 'prefabs' ? 'block' : 'none';
        this.render(); 
    }
    setStatus(msg) { document.getElementById('status-text').textContent = msg; }
    pushHistory() { this.history.push(JSON.stringify({ layers: this.layers, collision: this.collision })); if (this.history.length > 50) this.history.shift(); this.historyIndex = this.history.length - 1; }
    undo() { if (this.historyIndex > 0) { const state = JSON.parse(this.history[--this.historyIndex]); this.layers = state.layers; this.collision = state.collision; this.render(); } }
    updateCollisionUI() { document.querySelectorAll('.collision-type-btn').forEach(btn => btn.classList.toggle('active', btn.id === `collision-type-${this.selectedCollisionType}`)); }
    generateLevel() {
        this.pushHistory();
        const data = window.SmartGenerator.generate({ width: this.width, height: this.height, theme: document.getElementById('gen-theme').value, difficulty: document.getElementById('gen-complexity').value });
        this.collision = data.collision; this.layers = data.layers; this.spawn = data.spawn; this.goal = data.goal; this.render();
    }
    testLevel() { window.open(`/engines/platformer-2d/index.html?level=${this.levelId}&project=${this.currentProject}`, '_blank'); }
}
window.editor = new PlatformerEditor();
