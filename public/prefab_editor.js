/**
 * KETEBE PREFAB CONSTRUCTOR - v2.0
 * Specialized tool for entity composition and prefab definition.
 * Integrated with EventBus, SharedProjectState, and AssetManager
 */

// Integration system references
let eventBus, projectState, assetManager;

function initializePrefabIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.KetebeEventBus;
        projectState = window.KetebeProjectState;
        assetManager = window.KetebeAssetManager;
        
        if (eventBus) {
            // Listen for sprite updates
            eventBus.on('asset:sprite:*', (event) => {
                console.log('[PrefabEditor] Sprite asset updated:', event.data);
            });
            
            // Listen for character updates
            eventBus.on('character:updated', (event) => {
                console.log('[PrefabEditor] Character updated:', event.data);
            });
            
            console.log('[PrefabEditor] EventBus connected');
        }
    }
}

function broadcastPrefabUpdate(prefabName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`prefab:${action}`, {
            prefabId: prefabName,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`prefabs.${prefabName}`, {
            name: prefabName,
            lastModified: Date.now()
        });
    }
}

class PrefabEditor {
    constructor() {
        this.data = {
            name: "New_Entity",
            sprite: "player",
            components: [
                { type: 'Transform', x: 0, y: 0, scale: 3 }
            ]
        };

        this.selectedComponentIndex = 0;
        this.zoom = 2.0;
        this.offset = { x: 0, y: 0 };
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.showGrid = true;

        this.canvas = document.getElementById('editor-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.hierarchyEl = document.getElementById('hierarchy-list');
        this.inspectorEl = document.getElementById('inspector-content');
        this.nameInput = document.getElementById('prefab-name');
        this.statusMsg = document.getElementById('status-msg');

        this.images = {}; // Cache for sprites
        this.prefabCache = {}; // Cache for child prefabs

        this.init();
    }

    init() {
        // Initialize integration first
        initializePrefabIntegration();
        
        this.setupEventListeners();
        
        // Handle URL parameters
        const params = new URLSearchParams(window.location.search);
        if (params.get('sprite')) {
            this.data.sprite = params.get('sprite');
        }
        if (params.get('load')) {
            this.loadPrefab(params.get('load'));
        }

        this.refresh();
        this.animate();
    }

    setupEventListeners() {
        // Viewport Dragging
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                this.isDragging = true;
                this.lastMouse = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;
                this.offset.x += dx;
                this.offset.y += dy;
                this.lastMouse = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom = Math.max(0.5, Math.min(10, this.zoom * delta));
        });

        // Name input
        this.nameInput.addEventListener('input', (e) => {
            this.data.name = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
            this.nameInput.value = this.data.name;
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.key === 'g' || e.key === 'G') this.showGrid = !this.showGrid;
            if (e.key === 'Delete' && this.selectedComponentIndex !== -1) {
                if (this.data.components[this.selectedComponentIndex].type !== 'Transform') {
                    this.removeComponent(this.selectedComponentIndex);
                }
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.save();
            }
        });
    }

    // --- DATA MANAGEMENT ---

    createNew() {
        if (confirm("Create new prefab? Unsaved changes will be lost.")) {
            this.data = {
                name: "New_Entity",
                sprite: "player",
                components: [
                    { type: 'Transform', x: 0, y: 0, scale: 3 }
                ]
            };
            this.selectedComponentIndex = 0;
            this.refresh();
            this.setStatus("NEW PREFAB CREATED");
        }
    }

    addComponent(type) {
        // Singletons
        const singletons = ['Transform', 'Stats', 'Collider'];
        if (singletons.includes(type) && this.data.components.find(c => c.type === type)) {
            this.setStatus(`ALREADY HAS ${type}`, 'danger');
            return;
        }

        const defaults = this.getDefaultsFor(type);
        this.data.components.push({ type, ...defaults });
        this.selectedComponentIndex = this.data.components.length - 1;
        this.refresh();
        this.setStatus(`ADDED ${type}`);
    }

    removeComponent(index) {
        if (this.data.components[index].type === 'Transform') return;
        this.data.components.splice(index, 1);
        this.selectedComponentIndex = Math.min(this.selectedComponentIndex, this.data.components.length - 1);
        this.refresh();
    }

    getDefaultsFor(type) {
        switch(type) {
            case 'Transform': return { x: 0, y: 0, scale: 3 };
            case 'Stats': return { hp: 100, maxHp: 100, damage: 10, speed: 50, xpValue: 20 };
            case 'Collider': return { width: 16, height: 16, offsetX: 0, offsetY: 0, isTrigger: false };
            case 'Script': return { scriptId: 'demo', onDeath: '', onSpawn: '' };
            case 'Light': return { radius: 100, color: '#f1c40f', intensity: 0.5, pulse: false };
            case 'Loot': return { table: 'common', chance: 1.0, goldMin: 0, goldMax: 5 };
            case 'Particle': return { system: 'fire', active: true, offset: {x:0, y:0} };
            case 'Prefab': return { ref: '', x: 0, y: 0, scale: 1, rotation: 0 };
            default: return {};
        }
    }

    // --- UI RENDERING ---

    refresh() {
        this.nameInput.value = this.data.name;
        this.renderHierarchy();
        this.renderInspector();
    }

    renderHierarchy() {
        this.hierarchyEl.innerHTML = '';
        this.data.components.forEach((comp, idx) => {
            const item = document.createElement('div');
            item.className = `active-comp ${this.selectedComponentIndex === idx ? 'selected' : ''}`;
            
            const icon = this.getIconFor(comp.type);
            item.innerHTML = `
                <div class="active-comp-header">
                    <span><i class="fas ${icon}"></i> ${comp.type.toUpperCase()}</span>
                    ${comp.type !== 'Transform' ? `<i class="fas fa-times" style="color:#e74c3c; cursor:pointer;" onclick="event.stopPropagation(); editor.removeComponent(${idx})"></i>` : ''}
                </div>
            `;
            
            item.onclick = () => {
                this.selectedComponentIndex = idx;
                this.refresh();
            };
            
            this.hierarchyEl.appendChild(item);
        });
    }

    getIconFor(type) {
        switch(type) {
            case 'Transform': return 'fa-arrows-alt';
            case 'Stats': return 'fa-heart';
            case 'Collider': return 'fa-vector-square';
            case 'Script': return 'fa-code';
            case 'Light': return 'fa-sun';
            case 'Loot': return 'fa-coins';
            case 'Particle': return 'fa-atom';
            case 'Prefab': return 'fa-cubes';
            default: return 'fa-cube';
        }
    }

    renderInspector() {
        this.inspectorEl.innerHTML = '';
        const comp = this.data.components[this.selectedComponentIndex];
        
        if (!comp) {
            this.inspectorEl.innerHTML = '<div style="text-align:center; margin-top:50px; color:#444;">SELECT A COMPONENT</div>';
            return;
        }

        // Global properties if Transform is selected
        if (comp.type === 'Transform') {
            this.addInspectorGroup("CORE SETTINGS", [
                { label: 'Sprite', key: 'sprite', type: 'text', target: this.data },
                { label: 'X Pos', key: 'x', type: 'number', target: comp },
                { label: 'Y Pos', key: 'y', type: 'number', target: comp },
                { label: 'Scale', key: 'scale', type: 'number', target: comp, step: 0.1 }
            ]);
        } else if (comp.type === 'Prefab') {
             this.addInspectorGroup("NESTED PREFAB", [
                { label: 'Prefab Ref', key: 'ref', type: 'prefab_ref', target: comp },
                { label: 'X Offset', key: 'x', type: 'number', target: comp },
                { label: 'Y Offset', key: 'y', type: 'number', target: comp },
                { label: 'Scale', key: 'scale', type: 'number', target: comp, step: 0.1 },
                { label: 'Rotation', key: 'rotation', type: 'number', target: comp }
             ]);
        } else {
            const fields = Object.keys(comp)
                .filter(k => k !== 'type')
                .map(k => {
                    let type = 'text';
                    if (typeof comp[k] === 'number') type = 'number';
                    if (typeof comp[k] === 'boolean') type = 'checkbox';
                    if (k.toLowerCase().includes('color')) type = 'color';
                    
                    return { label: k, key: k, type: type, target: comp };
                });
            
            this.addInspectorGroup(comp.type.toUpperCase(), fields);
        }
    }

    addInspectorGroup(title, fields) {
        const group = document.createElement('div');
        group.className = 'inspector-group';
        
        group.innerHTML = `<div class="inspector-label">${title}</div>`;
        const body = document.createElement('div');
        body.className = 'inspector-fields';

        fields.forEach(f => {
            const row = document.createElement('div');
            row.className = 'field-row';
            
            const label = document.createElement('div');
            label.className = 'field-name';
            label.innerText = f.label;
            
            const wrap = document.createElement('div');
            wrap.className = 'field-input-wrap';
            
            const input = document.createElement('input');
            input.className = 'f-val';
            
            if (f.type === 'prefab_ref') {
                input.type = 'text';
                input.readOnly = true;
                input.value = f.target[f.key];
                input.style.width = '70%';
                
                const btn = document.createElement('button');
                btn.innerHTML = '<i class="fas fa-folder-open"></i>';
                btn.style.width = '25%';
                btn.style.marginLeft = '5%';
                btn.style.background = '#222';
                btn.style.color = '#ccc';
                btn.style.border = '1px solid #444';
                btn.style.cursor = 'pointer';
                btn.style.height = '28px'; // Match input height roughly
                
                btn.onclick = () => {
                    this.showLoadDialog((name) => {
                        f.target[f.key] = name;
                        input.value = name;
                        this.loadChildPrefab(name);
                    });
                };
                
                wrap.appendChild(input);
                wrap.appendChild(btn);
            } else {
                input.type = f.type === 'checkbox' ? 'checkbox' : (f.type === 'color' ? 'text' : f.type);
            
                if (f.type === 'checkbox') {
                    input.checked = f.target[f.key];
                    input.style.width = 'auto';
                    input.onchange = (e) => f.target[f.key] = e.target.checked;
                } else {
                    input.value = f.target[f.key];
                    if (f.step) input.step = f.step;
                    
                    input.oninput = (e) => {
                        let val = e.target.value;
                        if (f.type === 'number') val = parseFloat(val) || 0;
                        f.target[f.key] = val;
                    };
                }

                if (f.type === 'color') {
                    const preview = document.createElement('div');
                    preview.className = 'color-preview';
                    preview.style.background = f.target[f.key];
                    preview.onclick = () => {
                        const c = prompt("Enter hex color:", f.target[f.key]);
                        if (c) {
                            f.target[f.key] = c;
                            preview.style.background = c;
                            input.value = c;
                        }
                    };
                    row.appendChild(preview);
                }
                
                wrap.appendChild(input);
            }
            
            row.appendChild(label);
            row.appendChild(wrap);
            body.appendChild(row);
        });

        group.appendChild(body);
        this.inspectorEl.appendChild(group);
    }

    // --- VIEWPORT RENDERING ---

    animate() {
        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);
        
        ctx.save();
        ctx.translate(w/2 + this.offset.x, h/2 + this.offset.y);
        ctx.scale(this.zoom, this.zoom);

        if (this.showGrid) this.drawGrid(ctx);

        // Draw Prefab
        this.drawPrefab(ctx);

        ctx.restore();
    }

    drawGrid(ctx) {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1 / this.zoom;
        const size = 1000;
        const step = 16;

        ctx.beginPath();
        for (let x = -size; x <= size; x += step) {
            ctx.moveTo(x, -size);
            ctx.lineTo(x, size);
        }
        for (let y = -size; y <= size; y += step) {
            ctx.moveTo(-size, y);
            ctx.lineTo(size, y);
        }
        ctx.stroke();

        // Axes
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
        ctx.moveTo(0, -size); ctx.lineTo(0, size);
        ctx.stroke();
    }

    drawPrefab(ctx) {
        const transform = this.data.components.find(c => c.type === 'Transform');
        const sprite = this.data.sprite;
        const scale = transform.scale || 1;

        // Draw Sprite
        if (sprite) {
            const img = this.getSprite(sprite);
            if (img && img.complete) {
                const sw = img.width * scale;
                const sh = img.height * scale;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, -sw/2, -sh/2, sw, sh);
            } else {
                ctx.fillStyle = '#444';
                ctx.fillRect(-8 * scale, -8 * scale, 16 * scale, 16 * scale);
            }
        }

        // Draw Gizmos for components
        this.data.components.forEach((comp, idx) => {
            const isSelected = this.selectedComponentIndex === idx;
            
            if (comp.type === 'Prefab') {
                if (comp.ref && this.prefabCache[comp.ref]) {
                    const child = this.prefabCache[comp.ref];
                    ctx.save();
                    ctx.translate(comp.x, comp.y);
                    const finalScale = comp.scale || 1;
                    ctx.scale(finalScale, finalScale);
                    if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);
                    
                    if (child.sprite) {
                        const cImg = this.getSprite(child.sprite);
                        if (cImg && cImg.complete) {
                            // Find child's transform to get its base scale
                            const cTransform = child.components.find(c => c.type === 'Transform') || { scale: 3 };
                            const cScale = cTransform.scale || 1;
                            const sw = cImg.width * cScale;
                            const sh = cImg.height * cScale;
                            ctx.drawImage(cImg, -sw/2, -sh/2, sw, sh);
                        } else {
                             ctx.fillStyle = '#888';
                             ctx.fillRect(-10, -10, 20, 20);
                        }
                    }
                    
                    if (isSelected) {
                        ctx.strokeStyle = '#f1c40f';
                        ctx.lineWidth = 2 / finalScale;
                        ctx.strokeRect(-20, -20, 40, 40);
                    }
                    ctx.restore();
                } else {
                    // Placeholder
                    ctx.save();
                    ctx.translate(comp.x, comp.y);
                    ctx.strokeStyle = isSelected ? '#f1c40f' : '#444';
                    ctx.setLineDash([4, 2]);
                    ctx.strokeRect(-16, -16, 32, 32);
                    ctx.restore();
                }
            }

            if (comp.type === 'Collider') {
                ctx.strokeStyle = isSelected ? '#2ecc71' : 'rgba(46, 204, 113, 0.3)';
                ctx.lineWidth = 2 / this.zoom;
                const cw = comp.width * scale;
                const ch = comp.height * scale;
                ctx.strokeRect(-cw/2 + (comp.offsetX*scale), -ch/2 + (comp.offsetY*scale), cw, ch);
            }

            if (comp.type === 'Light') {
                ctx.strokeStyle = isSelected ? comp.color : 'rgba(255,255,255,0.1)';
                ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
                ctx.beginPath();
                ctx.arc(0, 0, comp.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });
    }

    getSprite(name) {
        if (this.images[name]) return this.images[name];
        
        const img = new Image();
        let paths = [];
        
        if (name.includes('/') || name.includes('.')) {
            paths.push(name);
        } else {
            paths.push(`/sprite-art/${name}.png`);
            paths.push(`/sprite-art/${name}.gif`);
            paths.push(`/base_game/assets/${name}.png`);
            paths.push(`/base_game/assets/${name}.gif`);
        }
        
        let attempt = 0;
        const tryNext = () => {
            if (attempt < paths.length) {
                img.src = paths[attempt++];
            }
        };
        
        img.onerror = tryNext;
        tryNext();
        
        this.images[name] = img;
        return img;
    }

    // --- IO ---

    setStatus(msg, type = '') {
        this.statusMsg.innerText = msg.toUpperCase();
        this.statusMsg.style.color = type === 'danger' ? 'var(--danger)' : 'var(--gold)';
        setTimeout(() => { if (this.statusMsg.innerText === msg.toUpperCase()) this.statusMsg.innerText = 'READY'; }, 3000);
    }

    async save() {
        const name = this.data.name;
        if (!name || name === 'New_Entity') {
            const n = prompt("Enter unique prefab name:");
            if (!n) return;
            this.data.name = n;
            this.nameInput.value = n;
        }

        try {
            const res = await fetch('/api/ide/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: `dunyalar/definitions/${this.data.name}.json`,
                    content: JSON.stringify(this.data, null, 2)
                })
            });

            if (res.ok) {
                this.setStatus("PREFAB SAVED SUCCESSFULLY");
            } else {
                this.setStatus("SAVE FAILED", 'danger');
            }
        } catch (e) {
            this.setStatus("IO ERROR", 'danger');
        }
    }

    async showLoadDialog(onSelect = null) {
        const dialog = document.getElementById('file-browser');
        const list = document.getElementById('file-list');
        list.innerHTML = '<div style="padding:20px; color:#555;">SCANNING DEFINITIONS...</div>';
        dialog.style.display = 'flex';

        try {
            // Updated path to ensure we hit the public definitions folder
            const res = await fetch('/api/ide/list?dir=dunyalar/definitions');
            if (res.ok) {
                const files = await res.json();
                list.innerHTML = '';
                const jsonFiles = files.filter(f => f.name.endsWith('.json'));
                
                if (jsonFiles.length === 0) {
                    list.innerHTML = '<div style="padding:20px; color:#555;">NO PREFABS FOUND</div>';
                }

                jsonFiles.forEach(f => {
                    const item = document.createElement('div');
                    item.className = 'comp-item';
                    item.innerHTML = `<span><i class="far fa-file-code"></i> ${f.name}</span>`;
                    item.onclick = () => {
                        const name = f.name.replace('.json', '');
                        if (onSelect) {
                            onSelect(name);
                        } else {
                            this.loadPrefab(name);
                        }
                        this.hideLoadDialog();
                    };
                    list.appendChild(item);
                });
            } else {
                 list.innerHTML = '<div style="padding:20px; color:var(--danger);">FAILED TO FETCH FILES (SERVER ERROR)</div>';
            }
        } catch (e) {
            list.innerHTML = '<div style="padding:20px; color:var(--danger);">FAILED TO FETCH FILES (NETWORK ERROR)</div>';
        }
    }

    hideLoadDialog() {
        document.getElementById('file-browser').style.display = 'none';
    }

    async loadChildPrefab(name) {
        if (!name || this.prefabCache[name]) return;
        
        try {
            const res = await fetch(`/api/ide/read?file=dunyalar/definitions/${name}.json`);
            if (res.ok) {
                const text = await res.text();
                this.prefabCache[name] = JSON.parse(text);
                // Preload its sprite
                if (this.prefabCache[name].sprite) {
                    this.getSprite(this.prefabCache[name].sprite);
                }
            }
        } catch (e) {
            console.error("Failed to load child prefab:", name);
        }
    }

    async loadPrefab(name) {
        try {
            const res = await fetch(`/api/ide/read?file=dunyalar/definitions/${name}.json`);
            if (res.ok) {
                const text = await res.text();
                this.data = JSON.parse(text);
                
                // Preload children
                this.data.components.forEach(c => {
                    if (c.type === 'Prefab' && c.ref) {
                        this.loadChildPrefab(c.ref);
                    }
                });

                this.selectedComponentIndex = 0;
                this.refresh();
                this.setStatus(`LOADED: ${name}`);
            }
        } catch (e) {
            this.setStatus("LOAD ERROR", 'danger');
        }
    }
}

// Global instance
window.editor = new PrefabEditor();