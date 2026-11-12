// platformer_editor.js - Platformer Level Editor Logic (Enhanced with RPG-Level Features)
const _escapeHtml = window.escapeHtml || function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

const COLLISION_TYPES = {
    0: { name: 'Passable', color: 'transparent', key: '0' },
    1: { name: 'Solid (Shadowed)', color: 'rgba(231, 76, 60, 0.3)', key: '1' },
    2: { name: 'Shadowless Wall', color: 'rgba(52, 152, 219, 0.3)', key: '2' },
    3: { name: 'Half-Height', color: 'rgba(255, 0, 0, 0.3)', key: '3' },
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
        
        // Keyboard State for smooth navigation
        this.keys = {};
        
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
        this.startMovementLoop();
    }

    startMovementLoop() {
        const move = () => {
            // Don't move if typing in an input
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                requestAnimationFrame(move);
                return;
            }

            let moved = false;
            const speed = 10 / this.zoom;
            if (this.keys['ArrowLeft'] || this.keys['KeyA']) { this.offsetX += speed; moved = true; }
            if (this.keys['ArrowRight'] || this.keys['KeyD']) { this.offsetX -= speed; moved = true; }
            if (this.keys['ArrowUp'] || this.keys['KeyW']) { this.offsetY += speed; moved = true; }
            if (this.keys['ArrowDown'] || this.keys['KeyS']) { this.offsetY -= speed; moved = true; }
            
            if (moved) this.render();
            requestAnimationFrame(move);
        };
        move();
    }
    
    async init() {
        this.setupCanvas();
        this.setupEventListeners();
        await Promise.all([
            this.loadTileset(),
            this.loadProjects()
        ]);
        this.initPalette();
        this.loadWorlds();
        this.loadPrefabs();
        this.render();
        this.history = [];
        this.historyIndex = -1;
        this.pushHistory();

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
                    const levelId = f.replace(/\.json$/i, '');
                    const div = document.createElement('div');
                    div.style.cssText = 'padding: 5px; border-bottom: 1px solid #222; font-size: 0.9rem; color: #aaa; display: flex; align-items: center; gap: 6px;';

                    const nameEl = document.createElement('span');
                    nameEl.style.cssText = 'flex: 1; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                    nameEl.innerHTML = `<i class="fas fa-file"></i> ${_escapeHtml(levelId)}`;
                    nameEl.onclick = () => this.loadLevelById(levelId);

                    const delBtn = document.createElement('button');
                    delBtn.className = 'btn small';
                    delBtn.style.cssText = 'width: auto; margin-top: 0; padding: 2px 6px; font-size: 0.75rem; border-color: #c0392b; color: #e74c3c;';
                    delBtn.title = 'Delete Level';
                    delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                    delBtn.onclick = (ev) => {
                        ev.stopPropagation();
                        this.deleteLevel(levelId);
                    };

                    div.appendChild(nameEl);
                    div.appendChild(delBtn);
                    div.onmouseover = () => { div.style.color = '#fff'; div.style.background = '#111'; };
                    div.onmouseout = () => { div.style.color = '#aaa'; div.style.background = 'transparent'; };
                    container.appendChild(div);
                });
            }
        } catch (e) {
            console.error('Failed to load worlds:', e);
        }
    }

    async deleteLevel(levelId) {
        if (!this.currentProject || !levelId) return;
        const cleanId = String(levelId).replace(/\.json$/i, '');
        if (!confirm(`Delete level '${cleanId}' from project '${this.currentProject}'? This cannot be undone.`)) {
            return;
        }
        try {
            const res = await fetch('/api/delete-level', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: this.currentProject, levelId: cleanId })
            });
            if (res.ok) {
                this.setStatus(`Deleted: ${cleanId}`);
                await this.loadWorlds();
            } else {
                const err = await res.json().catch(() => ({}));
                alert('Failed to delete level: ' + (err.error || `HTTP ${res.status}`));
            }
        } catch (e) {
            alert('Error deleting level: ' + e.message);
        }
    }

    async loadLevelById(levelId) {
        if (!this.currentProject) return;

        try {
            const cleanId = String(levelId).replace(/\.json$/i, '');
            const path = `/projects/${encodeURIComponent(this.currentProject)}/dunyalar/${encodeURIComponent(cleanId)}.json`;
            const res = await fetch(path);

            if (!res.ok) {
                throw new Error(`Failed to load level: ${res.status}`);
            }

            const data = await res.json();
            this.applyLevelData(data, cleanId);
        } catch (e) {
            alert('Failed to load level: ' + e.message);
        }
    }

    applyLevelData(data, levelId) {
        this.width = Math.max(4, Number(data.width) || 40);
        this.height = Math.max(4, Number(data.height) || 20);
        this.tilesetPath = data.tilesetPath || 'WORLD_PIXEL_ART';
        const rawLayers = Array.isArray(data.layers) && data.layers.length > 0
            ? data.layers
            : [new Array(this.width * this.height).fill(0)];
        this.layers = rawLayers.map(layer => {
            const arr = (layer && typeof layer === 'object' && Array.isArray(layer.data)) ? layer.data : layer;
            return Array.isArray(arr) ? arr.slice() : new Array(this.width * this.height).fill(0);
        });
        this.collision = Array.isArray(data.collision) ? data.collision.slice() : new Array(this.width * this.height).fill(0);
        this.decorations = Array.isArray(data.decorations) ? data.decorations.slice() : [];
        this.spawn = data.spawn ? { ...data.spawn } : { x: 2, y: 12 };
        this.goal = data.goal ? { ...data.goal } : { x: 35, y: 12 };
        this.collectibles = Array.isArray(data.collectibles) ? data.collectibles.slice() : [];
        this.checkpoints = Array.isArray(data.checkpoints) ? data.checkpoints.slice() : [];
        this.entities = Array.isArray(data.entities) ? data.entities.slice() : [];
        this.levelName = data.name || 'Untitled Level';
        this.levelId = (levelId || data.id || 'level1').replace(/\.json$/i, '');
        this.background = data.background || '';
        this.weather = data.weather || 'none';
        this.lighting = data.lighting || 'day';
        this.shader = data.shader || 'default';

        // Preload any referenced prefabs
        const prefabKeys = [...new Set(this.decorations.filter(d => d && d.type === 'prefab' && d.data).map(d => d.data))];
        if (prefabKeys.length > 0) {
            Promise.all(prefabKeys.map(k => this.loadPrefabData(k))).then(() => this.render());
        }

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
        this.history = [];
        this.historyIndex = -1;
        this.pushHistory();
        this.setStatus(`Loaded: ${this.levelId}`);
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
        if (window.RedglitchWorldTileset) {
            return window.RedglitchWorldTileset.loadWorldTilesetCanvas({ tileSize: 16 });
        }

        const canvas = document.createElement('canvas');
        const tSize = 16;
        const cols = 16;
        const totalTiles = 600;
        const rows = Math.ceil(totalTiles / cols);
        canvas.width = cols * tSize;
        canvas.height = rows * tSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        try {
            const atlas = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = 'sprite-art/worldpixelart_atlas.png';
            });
            ctx.drawImage(atlas, 0, 0, canvas.width, canvas.height);
            return canvas;
        } catch (_) {}

        const batchSize = 50;
        const supportsImageBitmap = typeof createImageBitmap === 'function';
        for (let i = 1; i <= totalTiles; i += batchSize) {
            const promises = [];
            for (let j = i; j < i + batchSize && j <= totalTiles; j++) {
                const x = ((j - 1) % cols) * tSize;
                const y = Math.floor((j - 1) / cols) * tSize;
                const url = encodeURI(`/sprite-art/worldpixelart/texture_16px ${j}.png`);

                if (supportsImageBitmap) {
                    promises.push(fetch(url)
                        .then(r => r.ok ? r.blob() : null)
                        .then(blob => blob ? createImageBitmap(blob) : null)
                        .then(imgBitmap => { if (imgBitmap) ctx.drawImage(imgBitmap, x, y, tSize, tSize); })
                        .catch(() => {}));
                } else {
                    promises.push(new Promise(resolve => {
                        const img = new Image();
                        img.onload = () => { ctx.drawImage(img, x, y, tSize, tSize); resolve(); };
                        img.onerror = () => resolve();
                        img.src = url;
                    }));
                }
            }
            await Promise.all(promises);
        }

        console.log('[PlatformerEditor] Tileset combined.');
        return canvas;
    }
    
    async loadPrefabs() {
        try {
            const systemFiles = new Set([
                'enemies.json', 'npcs.json', 'skills.json', 'items.json', 'campaign.json',
                'dialogues.json', 'music.json', 'ui.json', 'achievements.json', 'locales.json',
                'animations.json', 'quests.json', 'variables.json', 'test_3d_campaign.json'
            ]);

            let entries = [];
            try {
                const ideRes = await fetch('/api/ide/list?dir=' + encodeURIComponent('dunyalar/definitions') + '&t=' + Date.now());
                if (ideRes.ok) {
                    const data = await ideRes.json();
                    const rawList = Array.isArray(data)
                        ? data
                        : (Array.isArray(data?.files) ? data.files : (Array.isArray(data?.entries) ? data.entries : []));
                    entries = rawList.map(item => typeof item === 'string'
                        ? { name: item, path: `dunyalar/definitions/${item}`, isDirectory: false }
                        : { name: item.name || String(item.path || '').split('/').pop(), path: item.path || `dunyalar/definitions/${item.name || ''}`, isDirectory: Boolean(item.isDirectory) });
                }
            } catch (_) {}

            if (entries.length === 0) {
                const assetsRes = await fetch('/api/assets/list?t=' + Date.now());
                if (assetsRes.ok) {
                    const assets = await assetsRes.json();
                    if (Array.isArray(assets)) {
                        entries = assets.map(a => ({
                            name: a.name || String(a.path || '').split('/').pop(),
                            path: a.path || '',
                            isDirectory: Boolean(a.isDirectory)
                        }));
                    }
                }
            }

            const prefabs = entries.filter(a => {
                if (!a || a.isDirectory || !a.name) return false;
                const p = String(a.path || '').toLowerCase();
                const n = String(a.name).toLowerCase();
                return n.endsWith('.json') && !n.endsWith('.bak') && (p.includes('definitions') || p === '') && !systemFiles.has(n);
            });

            const list = document.getElementById('prefab-list');
            if (list) {
                list.innerHTML = '';
                prefabs.forEach(p => {
                    const div = document.createElement('div');
                    div.style.cssText = "padding:8px; border-bottom:1px solid #333; cursor:pointer; color:#ccc;";
                    div.innerHTML = `<i class="fas fa-cube"></i> ${_escapeHtml(p.name.replace(/\.json$/i, ''))}`;
                    div.onclick = () => {
                        this.selectedPrefab = p.name;
                        this.loadPrefabData(p.name).then(() => this.render());
                        Array.from(list.children).forEach(c => c.style.background = 'transparent');
                        div.style.background = '#222';
                        this.currentTool = 'prefab';
                        this.currentMode = 'prefabs';
                    };
                    list.appendChild(div);
                });
            }
        } catch (e) {
            console.warn('[PlatformerEditor] loadPrefabs error:', e);
        }
    }

    async loadPrefabData(filename) {
        const cleanFile = String(filename).endsWith('.json') ? filename : `${filename}.json`;
        if (!this.prefabCache[filename]) {
            try {
                const res = await fetch(`dunyalar/definitions/${encodeURIComponent(cleanFile)}`);
                if (res.ok) this.prefabCache[filename] = await res.json();
            } catch (e) {}
        }
    }
    
    initPalette() {
        if (!this.tilesetReady) return;
        const paletteContainer = document.getElementById('tile-palette');
        if (!paletteContainer) return;
        paletteContainer.innerHTML = '';
        const frag = document.createDocumentFragment();
        const cols = 16;
        const rows = 38;
        const spriteUrl = (window.RedglitchWorldTileset)
            ? window.RedglitchWorldTileset.getPaletteSpriteUrl(this.tileset)
            : ((this.tileset instanceof HTMLImageElement && this.tileset.src) ? this.tileset.src : 'sprite-art/worldpixelart_atlas.png');

        for (let i = 0; i < 600; i++) {
            const tileDiv = document.createElement('div');
            tileDiv.className = 'palette-tile';
            tileDiv.style.width = '100%';
            tileDiv.style.aspectRatio = '1/1';
            tileDiv.style.border = '1px solid #444';
            tileDiv.style.cursor = 'pointer';
            tileDiv.style.imageRendering = 'pixelated';

            const thumb = document.createElement('div');
            thumb.className = 'palette-thumb';
            thumb.style.width = '100%';
            thumb.style.height = '100%';
            if (window.RedglitchWorldTileset) {
                window.RedglitchWorldTileset.applyTileSpriteStyle(thumb, i, cols, rows, spriteUrl);
            } else {
                const col = i % cols;
                const row = Math.floor(i / cols);
                thumb.style.backgroundImage = `url("${spriteUrl}")`;
                thumb.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
                thumb.style.backgroundPosition = `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
                thumb.style.backgroundRepeat = 'no-repeat';
                thumb.style.imageRendering = 'pixelated';
            }
            tileDiv.appendChild(thumb);
            tileDiv.onclick = () => {
                if (this.currentMode === 'collision') this.setMode('decoration');
                this.selectedTile = i + 1;
                document.querySelectorAll('.palette-tile').forEach(t => t.style.border = '1px solid #444');
                tileDiv.style.border = '2px solid #ff0000';
                this.currentTool = 'paint';
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.tool-btn[data-tool="paint"]')?.classList.add('active');
            };
            frag.appendChild(tileDiv);
        }
        paletteContainer.appendChild(frag);
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
            this.keys[e.code] = true;
            this.keys[e.key] = true;

            const mod = e.ctrlKey || e.metaKey;
            const keyLower = e.key.toLowerCase();
            const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
            const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

            if (mod && keyLower === 's') { e.preventDefault(); this.saveLevel(); return; }
            if (inField) return;

            if (mod && keyLower === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
            if (mod && (keyLower === 'y' || (keyLower === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); return; }
            if (this.currentMode === 'collision' && !mod && e.key >= '0' && e.key <= '8') {
                this.selectedCollisionType = parseInt(e.key);
                this.updateCollisionUI();
            }

            // Keyboard Zoom
            if (e.key === '+' || e.key === '=') {
                this.zoom = Math.min(3, this.zoom + 0.1);
                document.getElementById('zoom-slider').value = this.zoom;
                this.render();
            }
            if (e.key === '-' || e.key === '_') {
                this.zoom = Math.max(0.25, this.zoom - 0.1);
                document.getElementById('zoom-slider').value = this.zoom;
                this.render();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this.keys[e.key] = false;
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
        document.getElementById('prop-name').addEventListener('change', (e) => { this.levelName = e.target.value; });
        document.getElementById('prop-id').addEventListener('change', (e) => { this.levelId = e.target.value; });
        document.getElementById('spawn-x').addEventListener('change', (e) => { this.spawn.x = parseInt(e.target.value) || 0; this.render(); this.pushHistory(); });
        document.getElementById('spawn-y').addEventListener('change', (e) => { this.spawn.y = parseInt(e.target.value) || 0; this.render(); this.pushHistory(); });
        document.getElementById('goal-x').addEventListener('change', (e) => { this.goal.x = parseInt(e.target.value) || 0; this.render(); this.pushHistory(); });
        document.getElementById('goal-y').addEventListener('change', (e) => { this.goal.y = parseInt(e.target.value) || 0; this.render(); this.pushHistory(); });
        document.getElementById('prop-project').addEventListener('change', (e) => {
            this.currentProject = e.target.value;
            this.loadWorlds();
        });
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
        this.isDragging = true;
        this._fillAppliedThisStroke = false;
        this.paint(mx, my);
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
        if (this.isDragging && this.currentTool !== 'fill') this.paint(mx, my);
    }

    handleMouseUp() {
        const wasDragging = this.isDragging;
        this.isDragging = false;
        this.isPanning = false;
        this._fillAppliedThisStroke = false;
        this.canvas.style.cursor = 'crosshair';
        if (wasDragging) this.pushHistory();
    }
    handleWheel(e) {
        e.preventDefault();
        this.zoom = Math.max(0.25, Math.min(3, this.zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
        document.getElementById('zoom-slider').value = this.zoom; this.render();
    }

    floodFill(startX, startY, grid, replacement) {
        if (!Array.isArray(grid)) return;
        const w = this.width;
        const h = this.height;
        const target = grid[startY * w + startX];
        if (target === replacement) return;
        const stack = [[startX, startY]];
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            const idx = y * w + x;
            if (grid[idx] !== target) continue;
            grid[idx] = replacement;
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }

    paint(mx, my) {
        try {
            const tx = Math.floor((mx / this.zoom - this.offsetX) / this.tileSize);
            const ty = Math.floor((my / this.zoom - this.offsetY) / this.tileSize);
            if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return;
            const idx = ty * this.width + tx;
            if (this.currentTool === 'fill') {
                if (this._fillAppliedThisStroke) return;
                this._fillAppliedThisStroke = true;
                if (this.currentMode === 'collision') {
                    this.floodFill(tx, ty, this.collision, this.selectedCollisionType);
                } else {
                    if (!this.layers[0]) this.layers[0] = new Array(this.width * this.height).fill(0);
                    this.floodFill(tx, ty, this.layers[0], this.selectedTile);
                }
            } else if (this.currentTool === 'erase') {
                if (this.currentMode === 'collision') {
                    this.collision[idx] = 0;
                } else {
                    if (this.layers[0]) this.layers[0][idx] = 0;
                    this.decorations = this.decorations.filter(d => d.x !== tx || d.y !== ty);
                    this.collectibles = this.collectibles.filter(c => c.x !== tx || c.y !== ty);
                    this.checkpoints = this.checkpoints.filter(cp => cp.x !== tx || cp.y !== ty);
                    this.entities = this.entities.filter(ent => ent.x !== tx || ent.y !== ty);
                }
            } else if (this.currentMode === 'collision') {
                this.collision[idx] = this.selectedCollisionType;
            } else if (this.currentTool === 'paint') {
                if (!this.layers[0]) this.layers[0] = new Array(this.width * this.height).fill(0);
                this.layers[0][idx] = this.selectedTile;
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
        if (this.selectedEntity === 'spawn') {
            this.spawn = { x: tx, y: ty };
            document.getElementById('spawn-x').value = tx;
            document.getElementById('spawn-y').value = ty;
        } else if (this.selectedEntity === 'goal') {
            this.goal = { x: tx, y: ty };
            document.getElementById('goal-x').value = tx;
            document.getElementById('goal-y').value = ty;
        } else if (this.selectedEntity === 'coin') {
            this.collectibles = this.collectibles.filter(c => c.x !== tx || c.y !== ty);
            this.collectibles.push({ x: tx, y: ty, type: 'coin' });
        } else if (this.selectedEntity === 'checkpoint') {
            this.checkpoints = this.checkpoints.filter(cp => cp.x !== tx || cp.y !== ty);
            this.checkpoints.push({ x: tx, y: ty });
        } else if (this.selectedEntity === 'enemy') {
            this.entities = this.entities.filter(ent => ent.x !== tx || ent.y !== ty);
            this.entities.push({ x: tx, y: ty, type: 'enemy', behavior: 'patrol', w: 24, h: 32, color: '#e74c3c' });
        }
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
                }
            }
        }
        if (this.showGrid) {
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath();
            for (let x = 0; x <= this.width; x++) { ctx.moveTo(x * 32, 0); ctx.lineTo(x * 32, this.height * 32); }
            for (let y = 0; y <= this.height; y++) { ctx.moveTo(0, y * 32); ctx.lineTo(this.width * 32, y * 32); }
            ctx.stroke();
        }
        this.decorations.forEach(deco => {
            if (deco.type === 'prefab') {
                const data = this.prefabCache[deco.data];
                if (data && data.sprite && window.createPixelImage) {
                    const img = window.createPixelImage(data.sprite);
                    if (img) ctx.drawImage(img, deco.x * 32, deco.y * 32, 32, 32);
                } else {
                    ctx.fillStyle = '#2ecc71';
                    ctx.fillRect(deco.x * 32 + 6, deco.y * 32 + 6, 20, 20);
                }
            }
        });
        this.collectibles.forEach(c => {
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(c.x * 32 + 16, c.y * 32 + 16, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#d35400';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
        this.checkpoints.forEach(cp => {
            ctx.fillStyle = '#3498db';
            ctx.fillRect(cp.x * 32 + 8, cp.y * 32 + 4, 16, 24);
            ctx.fillStyle = '#ecf0f1';
            ctx.fillRect(cp.x * 32 + 10, cp.y * 32 + 6, 12, 8);
        });
        this.entities.forEach(ent => {
            ctx.fillStyle = ent.color || '#e74c3c';
            ctx.fillRect(ent.x * 32 + 4, ent.y * 32 + 2, 24, 30);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('E', ent.x * 32 + 16, ent.y * 32 + 17);
        });
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.spawn.x * 32 + 4, this.spawn.y * 32 + 4, 24, 24);
        ctx.fillStyle = '#ff0000'; ctx.fillRect(this.goal.x * 32 + 4, this.goal.y * 32 + 4, 24, 24);
        ctx.restore();
    }

    _buildLevelPayload() {
        return {
            name: this.levelName,
            id: this.levelId,
            type: 'platformer-2d',
            width: this.width,
            height: this.height,
            tilesetPath: this.tilesetPath,
            layers: this.layers,
            collision: this.collision,
            decorations: this.decorations,
            spawn: this.spawn,
            goal: this.goal,
            collectibles: this.collectibles,
            checkpoints: this.checkpoints,
            entities: this.entities,
            background: this.background,
            weather: this.weather,
            lighting: this.lighting,
            shader: this.shader,
            parallaxLayers: this.parallaxLayers || []
        };
    }

    newLevel() {
        if (!confirm('Start a new level? Unsaved changes will be lost.')) return;
        this.width = 40;
        this.height = 20;
        this.layers = [new Array(this.width * this.height).fill(0)];
        this.collision = new Array(this.width * this.height).fill(0);
        this.decorations = [];
        this.entities = [];
        this.collectibles = [];
        this.checkpoints = [];
        this.spawn = { x: 2, y: 12 };
        this.goal = { x: 35, y: 12 };
        this.levelName = 'Untitled Level';
        this.levelId = 'level1';
        this.background = '';
        this.weather = 'none';
        this.lighting = 'day';
        this.shader = 'default';

        document.getElementById('prop-name').value = this.levelName;
        document.getElementById('prop-id').value = this.levelId;
        document.getElementById('level-width').value = this.width;
        document.getElementById('level-height').value = this.height;
        document.getElementById('spawn-x').value = this.spawn.x;
        document.getElementById('spawn-y').value = this.spawn.y;
        document.getElementById('goal-x').value = this.goal.x;
        document.getElementById('goal-y').value = this.goal.y;
        this.render();
        this.history = [];
        this.historyIndex = -1;
        this.pushHistory();
        this.setStatus('New level created');
    }

    clearLevel() {
        if (!confirm('Clear all tiles, collision, and objects?')) return;
        this.layers = [new Array(this.width * this.height).fill(0)];
        this.collision = new Array(this.width * this.height).fill(0);
        this.decorations = [];
        this.entities = [];
        this.collectibles = [];
        this.checkpoints = [];
        this.render();
        this.pushHistory();
        this.setStatus('Level cleared');
    }

    fillGround() {
        if (!this.layers[0]) this.layers[0] = new Array(this.width * this.height).fill(0);
        const startRow = Math.max(0, this.height - 2);
        const groundTile = this.selectedTile || 1;
        for (let y = startRow; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                this.collision[idx] = 1;
                this.layers[0][idx] = groundTile;
            }
        }
        this.render();
        this.pushHistory();
        this.setStatus('Ground filled');
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
        this.render();
    }

    resetZoom() {
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        const slider = document.getElementById('zoom-slider');
        if (slider) slider.value = 1;
        this.render();
    }

    resizeLevel() {
        const wInput = document.getElementById('level-width');
        const hInput = document.getElementById('level-height');
        const newW = Math.max(10, Math.min(200, parseInt(wInput?.value, 10) || this.width));
        const newH = Math.max(10, Math.min(100, parseInt(hInput?.value, 10) || this.height));
        if (wInput) wInput.value = newW;
        if (hInput) hInput.value = newH;
        if (newW === this.width && newH === this.height) return;

        const oldW = this.width;
        const oldH = this.height;
        const copyW = Math.min(oldW, newW);
        const copyH = Math.min(oldH, newH);

        this.layers = (this.layers || []).map(layer => {
            const next = new Array(newW * newH).fill(0);
            for (let y = 0; y < copyH; y++) {
                for (let x = 0; x < copyW; x++) {
                    next[y * newW + x] = layer[y * oldW + x];
                }
            }
            return next;
        });

        const nextCol = new Array(newW * newH).fill(0);
        for (let y = 0; y < copyH; y++) {
            for (let x = 0; x < copyW; x++) {
                nextCol[y * newW + x] = this.collision[y * oldW + x];
            }
        }
        this.collision = nextCol;
        this.decorations = this.decorations.filter(d => d.x >= 0 && d.x < newW && d.y >= 0 && d.y < newH);
        this.entities = this.entities.filter(e => e.x >= 0 && e.x < newW && e.y >= 0 && e.y < newH);
        this.collectibles = this.collectibles.filter(c => c.x >= 0 && c.x < newW && c.y >= 0 && c.y < newH);
        this.checkpoints = this.checkpoints.filter(cp => cp.x >= 0 && cp.x < newW && cp.y >= 0 && cp.y < newH);
        this.spawn.x = Math.max(0, Math.min(newW - 1, this.spawn.x));
        this.spawn.y = Math.max(0, Math.min(newH - 1, this.spawn.y));
        this.goal.x = Math.max(0, Math.min(newW - 1, this.goal.x));
        this.goal.y = Math.max(0, Math.min(newH - 1, this.goal.y));
        document.getElementById('spawn-x').value = this.spawn.x;
        document.getElementById('spawn-y').value = this.spawn.y;
        document.getElementById('goal-x').value = this.goal.x;
        document.getElementById('goal-y').value = this.goal.y;

        this.width = newW;
        this.height = newH;
        this.render();
        this.pushHistory();
        this.setStatus(`Resized to ${newW}x${newH}`);
    }

    async saveLevelAs() {
        const entered = prompt('Save level as (filename ID):', this.levelId || 'level1');
        if (!entered || !entered.trim()) return;
        const cleanId = entered.trim().replace(/\.json$/i, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
            alert('Invalid level ID. Use letters, numbers, underscores, and hyphens only.');
            return;
        }
        this.levelId = cleanId;
        const idInput = document.getElementById('prop-id');
        if (idInput) idInput.value = cleanId;
        await this.saveLevel();
    }

    async loadLevel() { const id = prompt('Level ID:'); if (id) this.loadLevelById(id); }
    async saveLevel() {
        if (!this.currentProject) {
            alert('Please select a project first!');
            return;
        }

        const levelData = this._buildLevelPayload();

        const filename = this.levelId.endsWith('.json') ? this.levelId : `${this.levelId}.json`;
        const path = `projects/${this.currentProject}/dunyalar/${filename}`;

        try {
            const res = await fetch('/api/ide/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    path: path,
                    content: JSON.stringify(levelData, null, 2)
                })
            });

            if (res.ok) {
                this.setStatus(`Saved: ${path}`);
                this.loadWorlds(); // Refresh list
            } else {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const err = await res.json();
                    alert('Save failed: ' + (err.error || 'Unknown error'));
                } else {
                    const text = await res.text();
                    console.error('Server error response:', text);
                    alert('Save failed: Server returned an unexpected response (likely 404 or 500). Check console.');
                }
            }
        } catch (e) {
            alert('Error saving level: ' + e.message);
        }
    }
    setMode(mode) {
        this.currentMode = mode;
        const colPanel = document.getElementById('panel-collision-types');
        if (colPanel) colPanel.style.display = mode === 'collision' ? 'block' : 'none';
        const prefabPanel = document.getElementById('panel-prefabs');
        if (prefabPanel) {
            const objectsTabActive = document.getElementById('tab-entities')?.classList.contains('active');
            prefabPanel.style.display = (mode === 'prefabs' || objectsTabActive) ? 'block' : 'none';
        }
        this.render();
    }
    setStatus(msg) { document.getElementById('status-text').textContent = msg; }
    _applyHistoryState(stateStr) {
        const s = JSON.parse(stateStr);
        this.width = s.width;
        this.height = s.height;
        this.layers = s.layers;
        this.collision = s.collision;
        this.decorations = s.decorations || [];
        this.entities = s.entities || [];
        this.collectibles = s.collectibles || [];
        this.checkpoints = s.checkpoints || [];
        if (s.spawn) this.spawn = s.spawn;
        if (s.goal) this.goal = s.goal;
        const wEl = document.getElementById('level-width');
        const hEl = document.getElementById('level-height');
        if (wEl) wEl.value = this.width;
        if (hEl) hEl.value = this.height;
        document.getElementById('spawn-x').value = this.spawn.x;
        document.getElementById('spawn-y').value = this.spawn.y;
        document.getElementById('goal-x').value = this.goal.x;
        document.getElementById('goal-y').value = this.goal.y;
        this.render();
    }
    pushHistory() {
        const snap = JSON.stringify({
            width: this.width,
            height: this.height,
            layers: this.layers,
            collision: this.collision,
            decorations: this.decorations,
            entities: this.entities,
            collectibles: this.collectibles,
            checkpoints: this.checkpoints,
            spawn: this.spawn,
            goal: this.goal
        });
        if (this.historyIndex >= 0 && this.history[this.historyIndex] === snap) return;
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(snap);
        if (this.history.length > 50) this.history.shift();
        this.historyIndex = this.history.length - 1;
    }
    undo() {
        if (this.historyIndex > 0) {
            try {
                this._applyHistoryState(this.history[--this.historyIndex]);
            } catch (e) {
                console.error('[PlatformerEditor] Undo failed:', e);
                this.historyIndex++;
            }
        }
    }
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            try {
                this._applyHistoryState(this.history[++this.historyIndex]);
            } catch (e) {
                console.error('[PlatformerEditor] Redo failed:', e);
                this.historyIndex--;
            }
        }
    }
    updateCollisionUI() { document.querySelectorAll('.collision-type-btn').forEach(btn => btn.classList.toggle('active', btn.id === `collision-type-${this.selectedCollisionType}`)); }
    generateLevel() {
        const data = window.SmartGenerator.generate({ width: this.width, height: this.height, theme: document.getElementById('gen-theme').value, difficulty: document.getElementById('gen-complexity').value });
        this.collision = data.collision; this.layers = data.layers; this.spawn = data.spawn; this.goal = data.goal;
        this.render();
        this.pushHistory();
    }
    testLevel() {
        const payload = this._buildLevelPayload();
        try {
            sessionStorage.setItem('redglitch_playtest_data', JSON.stringify(payload));
        } catch (e) {
            console.warn('[PlatformerEditor] Failed to write sessionStorage playtest data:', e);
        }
        const url = `/engines/platformer-2d/index.html?playtest=true&level=${encodeURIComponent(this.levelId || 'level1')}&project=${encodeURIComponent(this.currentProject || '')}`;
        window.open(url, '_blank');
    }
}
window.editor = new PlatformerEditor();

// --- AI Integration: StudioBridge + Tool Dispatch ---
(function initPlatformerAI() {
    const eventBus = window.RedglitchEventBus;
    if (!eventBus || !window.StudioBridge) {
        window.addEventListener('studio-bridge-ready', initPlatformerAI, { once: true });
        return;
    }

    const bridge = new window.StudioBridge('platformer', eventBus);

    bridge.register({
        name: 'generateLevel',
        description: 'Generate a procedural platformer level using SmartGenerator.',
        securityLevel: 'low-risk',
        parameters: {
            type: 'object',
            properties: {
                theme: { type: 'string', enum: ['flow', 'spire', 'abyss', 'gauntlet', 'clockwork'], description: 'Level concept/theme.', default: 'flow' },
                difficulty: { type: 'number', description: 'Difficulty 1-10.', default: 5 },
                width: { type: 'number', description: 'Level width in tiles.', default: 40 },
                height: { type: 'number', description: 'Level height in tiles.', default: 20 }
            }
        },
        execute: async (args) => {
            const themeSelect = document.getElementById('gen-theme');
            const diffSelect = document.getElementById('gen-complexity');
            if (themeSelect && args.theme) themeSelect.value = args.theme;
            if (diffSelect && args.difficulty) diffSelect.value = args.difficulty;
            if (args.width) window.editor.width = args.width;
            if (args.height) window.editor.height = args.height;
            window.editor.generateLevel();
            return { success: true, message: `Generated ${args.theme || 'flow'} level (difficulty: ${args.difficulty || 5}).` };
        }
    });

    bridge.register({
        name: 'save',
        description: 'Save the current platformer level.',
        securityLevel: 'low-risk',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
            window.editor.saveLevel();
            return { success: true, message: 'Platformer level saved.' };
        }
    });

    bridge.announceAll();
    console.log('[PlatformerEditor] AI StudioBridge registered.');
})();

// AI Generation Helper
window._platformerAIGenerate = (params) => {
    console.log('[PlatformerEditor] AI generating level:', params);
    const themeSelect = document.getElementById('gen-theme');
    const diffSelect = document.getElementById('gen-complexity');
    if (themeSelect && params.theme) themeSelect.value = params.theme;
    if (diffSelect && params.difficulty) diffSelect.value = params.difficulty;
    if (params.width) window.editor.width = params.width;
    if (params.height) window.editor.height = params.height;
    window.editor.generateLevel();
    console.log('[PlatformerEditor] AI level generated!');
};

function _platformerPendingCheck() {
    // Recovery is owned by ToolRegistry so approval and request IDs are preserved.
}

// Listen for localStorage changes from assistant iframe
window.addEventListener('storage', (e) => {
    if (e.key === 'ai_pending_action' && e.newValue) {
        console.log('[PlatformerEditor] Storage event: new pending action detected');
        setTimeout(() => _platformerPendingCheck(), 200);
    }
});

// Check on load
setTimeout(() => _platformerPendingCheck(), 500);
