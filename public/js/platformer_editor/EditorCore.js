/**
 * EditorCore.js
 * Main entry point and state machine for Platformer Studio.
 */

class EditorCore {
    constructor() {
        this.canvas = document.getElementById('editorCanvas');
        this.renderer = new PlatformerRenderer(this.canvas);
        
        // Editor State
        this.map = this.createNewMap(50, 20);
        this.activeLayer = 'main';
        this.activeTool = 'brush';
        this.activeSubTab = 'tiles';
        this.selectedTileId = 1;
        this.selectedEntity = null;
        
        this.zoom = 1.0;
        this.camera = { x: 0, y: 0 };
        
        this.isPanning = false;
        this.lastMousePos = { x: 0, y: 0 };
        
        this.init();
    }

    async init() {
        console.log('[PlatformerStudio] Initializing...');
        
        // 1. Pre-load assets
        if (window.PlatformerAssetManager) {
            await window.PlatformerAssetManager.load();
        }

        // 2. Setup Renderer for Editor
        this.renderer.resize(800, 600); // Default, will update
        this.resizeViewport();
        
        // 3. Init UI components
        this.initAtlas();
        
        // 4. Bind UI Events
        this.bindEvents();
        
        // 5. Start Render Loop
        this.render();
        
        console.log('[PlatformerStudio] Ready.');
    }

    initAtlas() {
        const grid = document.getElementById('tiles-grid');
        if (!grid) return;

        const totalTiles = 600; // Matching engine
        const tileSize = 16; // Source size
        const displaySize = 32; // UI size
        
        const tilesetImg = window.PlatformerAssetManager?.get('tileset');
        if (!tilesetImg) {
            console.error('[PlatformerStudio] Tileset not loaded for atlas UI');
            return;
        }

        for (let i = 1; i <= totalTiles; i++) {
            const card = document.createElement('div');
            card.className = 'asset-card tile-card';
            if (i === this.selectedTileId) card.classList.add('active');
            card.dataset.tileId = i;

            const canvas = document.createElement('canvas');
            canvas.width = displaySize;
            canvas.height = displaySize;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            const sx = ((i - 1) % 16) * tileSize;
            const sy = Math.floor((i - 1) / 16) * tileSize;

            ctx.drawImage(tilesetImg, sx, sy, tileSize, tileSize, 0, 0, displaySize, displaySize);
            
            card.appendChild(canvas);
            card.addEventListener('click', () => {
                document.querySelectorAll('.tile-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.selectedTileId = i;
            });

            grid.appendChild(card);
        }
    }

    createNewMap(width, height) {
        return {
            name: 'New Level',
            width: width,
            height: height,
            collision: new Array(width * height).fill(0),
            layers: [
                { name: 'background', data: new Array(width * height).fill(0) },
                { name: 'main', data: new Array(width * height).fill(0) },
                { name: 'foreground', data: new Array(width * height).fill(0) }
            ],
            decorations: [],
            entities: [],
            spawn: { x: 2, y: height - 5 },
            background: '#87CEEB',
            autoTiling: true
        };
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resizeViewport());
        
        // Viewport Interaction
        this.canvas.addEventListener('mousedown', e => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', e => this.handleMouseMove(e));
        window.addEventListener('mouseup', e => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', e => this.handleWheel(e), { passive: false });
        
        // Sidebar interactions
        document.querySelectorAll('.layer-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.layer-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.activeLayer = item.dataset.layer;
            });
        });

        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeTool = btn.id.replace('tool-', '');
            });
        });

        // Bottom Panel Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Hide all grids
                document.getElementById('tiles-grid').classList.add('hidden');
                document.getElementById('entities-grid').classList.add('hidden');
                document.getElementById('generator-panel').classList.add('hidden');
                
                // Show selected grid
                const target = tab.dataset.tab;
                if (target === 'tiles') {
                    document.getElementById('tiles-grid').classList.remove('hidden');
                    this.activeSubTab = 'tiles';
                }
                else if (target === 'entities') {
                    document.getElementById('entities-grid').classList.remove('hidden');
                    this.activeSubTab = 'entities';
                }
                else if (target === 'generator') {
                    document.getElementById('generator-panel').classList.remove('hidden');
                    this.activeSubTab = 'generator';
                }
            });
        });

        // Entity Card Selection
        document.querySelectorAll('.asset-card[data-entity]').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.asset-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.selectedEntity = card.dataset.entity;
            });
        });

        // Generator
        document.getElementById('btn-generate').addEventListener('click', () => {
            const theme = document.getElementById('gen-theme').value;
            const diff = parseInt(document.getElementById('gen-diff').value);
            
            let newMap;
            if (['forest', 'cave', 'castle'].includes(theme)) {
                console.log(`[PlatformerStudio] Generating Advanced ${theme} level...`);
                newMap = window.AdvancedGenerator.generate({
                    width: this.map.width,
                    height: this.map.height,
                    biome: theme,
                    difficulty: diff
                });
            } else {
                if (!window.SmartGenerator) return;
                console.log(`[PlatformerStudio] Generating Classic ${theme} level...`);
                newMap = window.SmartGenerator.generate({
                    width: this.map.width,
                    height: this.map.height,
                    theme: theme,
                    difficulty: diff
                });
            }

            if (newMap) {
                this.map = newMap;
                this.renderer.invalidateCache();
            }
        });

        // Play
        document.getElementById('btn-play').addEventListener('click', () => {
            console.log('[PlatformerStudio] Launching Playtest...');
            localStorage.setItem('temp_playtest_platformer', JSON.stringify(this.map));
            window.open('engines/platformer-2d/index.html?playtest=true', '_blank');
        });

        // New
        document.getElementById('btn-new').addEventListener('click', () => {
            if (confirm('Create new map? Unsaved changes will be lost.')) {
                this.map = this.createNewMap(50, 20);
                this.renderer.invalidateCache();
            }
        });

        // Save
        document.getElementById('btn-save').addEventListener('click', async () => {
            const name = prompt('Level Name:', this.map.name);
            if (!name) return;
            this.map.name = name;

            console.log(`[PlatformerStudio] Saving ${name}...`);
            try {
                const response = await fetch('/api/levels/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        data: this.map,
                        type: 'platformer-2d'
                    })
                });
                const result = await response.json();
                if (result.success) alert('Level saved!');
                else alert('Save failed: ' + result.message);
            } catch (e) {
                console.error(e);
                alert('Save error');
            }
        });

        // Load
        document.getElementById('btn-load').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/levels/list?type=platformer-2d');
                const levels = await response.json();
                if (!levels || levels.length === 0) {
                    alert('No levels found.');
                    return;
                }

                const names = levels.map(l => l.name).join('\n');
                const name = prompt(`Available Levels:\n${names}\n\nEnter level name:`);
                if (!name) return;

                const res = await fetch(`/api/levels/load?name=${name}&type=platformer-2d`);
                const data = await res.json();
                if (data) {
                    this.map = data;
                    this.renderer.invalidateCache();
                    alert('Level loaded!');
                }
            } catch (e) {
                console.error(e);
                alert('Load error');
            }
        });
    }

    resizeViewport() {
        const container = document.getElementById('viewport-container');
        const w = container.clientWidth;
        const h = container.clientHeight;
        this.canvas.width = w;
        this.canvas.height = h;
        this.renderer.resize(w, h);
    }

    handleMouseDown(e) {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            this.isPanning = true;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
            return;
        }
        
        // Tool Logic
        this.isPainting = true;
        this.paint(e);
    }

    handleMouseMove(e) {
        // Panning
        if (this.isPanning) {
            const dx = e.clientX - this.lastMousePos.x;
            const dy = e.clientY - this.lastMousePos.y;
            this.camera.x -= dx / this.zoom;
            this.camera.y -= dy / this.zoom;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            return;
        }

        // Mouse Coords update
        const rect = this.canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / this.zoom + this.camera.x;
        const my = (e.clientY - rect.top) / this.zoom + this.camera.y;
        const tx = Math.floor(mx / 32);
        const ty = Math.floor(my / 32);
        document.getElementById('coords').innerText = `X: ${tx}, Y: ${ty}`;

        if (this.isPainting) {
            this.paint(e);
        }
    }

    handleMouseUp(e) {
        this.isPanning = false;
        this.isPainting = false;
        this.canvas.style.cursor = 'crosshair';
    }

    handleWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // World position before zoom
        const worldX = mouseX / this.zoom + this.camera.x;
        const worldY = mouseY / this.zoom + this.camera.y;

        const delta = -Math.sign(e.deltaY) * 0.1 * this.zoom;
        this.zoom = Math.max(0.1, Math.min(5.0, this.zoom + delta));
        
        // Adjust camera to keep mouse over same world position
        this.camera.x = worldX - mouseX / this.zoom;
        this.camera.y = worldY - mouseY / this.zoom;
        
        document.getElementById('zoom-level').innerText = `ZOOM: ${Math.round(this.zoom * 100)}%`;
    }

    paint(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / this.zoom + this.camera.x;
        const my = (e.clientY - rect.top) / this.zoom + this.camera.y;
        
        const tx = Math.floor(mx / 32);
        const ty = Math.floor(my / 32);
        
        if (tx < 0 || tx >= this.map.width || ty < 0 || ty >= this.map.height) return;
        
        const idx = ty * this.map.width + tx;
        let changed = false;

        // --- TILE PAINTING ---
        if (this.activeSubTab === 'tiles') {
            const value = this.activeTool === 'brush' ? this.selectedTileId : 0;
            
            if (this.activeLayer === 'collision') {
                if (this.map.collision[idx] !== value) {
                    this.map.collision[idx] = value;
                    changed = true;
                }
            } else if (['background', 'main', 'foreground'].includes(this.activeLayer)) {
                const layer = this.map.layers.find(l => l.name === this.activeLayer);
                if (layer && layer.data[idx] !== value) {
                    layer.data[idx] = value;
                    changed = true;
                }
            }
        } 
        
        // --- ENTITY PLACEMENT ---
        else if (this.activeSubTab === 'entities') {
            if (this.activeTool === 'brush') {
                if (!this.selectedEntity) return;
                
                if (this.selectedEntity === 'player') {
                    this.map.spawn = { x: tx, y: ty };
                    changed = true;
                } else {
                    // Check if already an entity here
                    const existing = this.map.entities.find(ent => ent.x === tx && ent.y === ty);
                    if (!existing) {
                        this.map.entities.push({
                            type: this.selectedEntity,
                            x: tx,
                            y: ty
                        });
                        changed = true;
                    }
                }
            } else if (this.activeTool === 'eraser') {
                const initialLen = this.map.entities.length;
                this.map.entities = this.map.entities.filter(ent => ent.x !== tx || ent.y !== ty);
                if (this.map.entities.length !== initialLen) changed = true;
            }
        }

        if (changed) {
            this.renderer.invalidateCache();
        }
    }

    render() {
        // Sync editor zoom and camera to renderer
        this.renderer.setZoom(this.zoom);
        this.renderer.camera.x = this.camera.x;
        this.renderer.camera.y = this.camera.y;
        
        // Custom render pass for editor
        // Note: we pass a temporary 'player' object to the renderer so it draws the spawn point
        const tempPlayer = {
            x: this.map.spawn.x * 32,
            y: this.map.spawn.y * 32,
            w: 24, h: 32,
            color: '#e74c3c'
        };

        this.renderer.render(this.map, tempPlayer, this.map.entities, this.map.collectibles);
        
        // Draw Editor Overlays (Grid, Gizmos)
        this.drawGrid();
        
        requestAnimationFrame(() => this.render());
    }

    drawGrid() {
        const ctx = this.renderer.ctx;
        const tileSize = 32 * this.zoom;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        // Calculate offset in screen pixels
        const offsetX = -(this.camera.x * this.zoom) % tileSize;
        const offsetY = -(this.camera.y * this.zoom) % tileSize;
        
        ctx.beginPath();
        for (let x = offsetX; x < w; x += tileSize) {
            ctx.moveTo(Math.floor(x), 0);
            ctx.lineTo(Math.floor(x), h);
        }
        for (let y = offsetY; y < h; y += tileSize) {
            ctx.moveTo(0, Math.floor(y));
            ctx.lineTo(w, Math.floor(y));
        }
        ctx.stroke();
        ctx.restore();
    }
}

window.Editor = new EditorCore();
