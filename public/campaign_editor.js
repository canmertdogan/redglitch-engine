// CAMPAIGN STUDIO v7.0 (FULLY INTEGRATED)
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

// Initialize integration
function initializeCampaignIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.KetebeEventBus;
        projectState = window.KetebeProjectState;
        assetManager = window.KetebeAssetManager;
        
        if (eventBus) {
            // Listen for quest updates
            eventBus.on('quest:updated', (event) => {
                console.log('[CampaignEditor] Quest updated:', event.data.questId);
                window.editor.loadResources(); // Refresh quest list
            });
            
            // Listen for cutscene updates
            eventBus.on('cutscene:saved', (event) => {
                console.log('[CampaignEditor] Cutscene saved:', event.data.cutsceneId);
                window.editor.loadResources(); // Refresh cutscene list
            });
            
            // Listen for external campaign load
            eventBus.on('campaign:load', (event) => {
                if (event.data.campaignId && window.editor) {
                    // Load specific campaign
                }
            });
            
            console.log('[CampaignEditor] EventBus connected');
        }
    }
}

// --- LOADING ---
function updateProgress(percent, text) {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    const overlay = document.getElementById('loading-overlay');
    
    if (bar) bar.style.width = percent + '%';
    if (txt) txt.innerText = text;
    
    if (percent >= 100) {
        setTimeout(() => {
            if (overlay) {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.5s';
                setTimeout(() => overlay.style.display = 'none', 500);
            }
        }, 500);
    }
}

class CampaignEditor {
    constructor() {
        this.nodes = [];
        this.connections = [];
        this.transform = { x: 0, y: 0, scale: 1 };
        this.selection = null;
        this.dragState = null;
        
        // Campaign metadata
        this.campaignName = 'main_campaign';
        this.campaignMetadata = {
            name: 'Main Campaign',
            description: '',
            author: '',
            version: '1.0.0'
        };
        
        // Resources
        this.availableLevels = [];
        this.availableLevelsByEngine = {
            'rpg-topdown': [],
            'iso-pixel': [],
            'platformer-2d': []
        };
        this.itemDefs = [];
        this.variables = [];
        this.enemyDefs = [];
        this.cutsceneDefs = [];
        this.questDefs = [];
        
        // Selection state for popups
        this.pendingSelection = null;
        this.selectedEnemies = [];

        // History
        this.history = [];
        this.historyIndex = -1;
        this.clipboard = null;
        
        // Multi-engine support
        this.validator = new CampaignValidator();
        this.validationResults = null;

        // Minimap Cache
        this.miniMapInfo = { scale: 1, minX: 0, minY: 0 };

        this.dom = {
            workspace: document.getElementById('workspace'),
            container: document.getElementById('nodes-container'),
            svg: document.getElementById('connections-layer'),
            transform: document.getElementById('canvas-transform'),
            inspector: document.getElementById('inspector-content'),
            bg: document.getElementById('map-background'),
            toast: document.getElementById('validation-toast'),
            toastMsg: document.getElementById('validation-msg'),
            minimap: document.getElementById('minimap'),
            ctxMenu: document.getElementById('context-menu')
        };

        this.minimapCtx = this.dom.minimap.getContext('2d');
        this.nodeElements = new Map();

        this.init();
    }

    async init() {
        updateProgress(10, "INITIALIZING SYSTEM...");
        // Initialize integration
        initializeCampaignIntegration();
        
        updateProgress(30, "LOADING RESOURCES...");
        await this.loadResources();
        
        updateProgress(60, "FETCHING CAMPAIGN DATA...");
        await this.loadCampaign();
        
        updateProgress(80, "BUILDING GRAPH...");
        this.pushHistory(); 
        this.setupInput();
        this.renderGraph();
        
        window.addEventListener('resize', () => this.resize());
        updateProgress(100, "READY!");
    }
    
    resize() {
        this.renderMinimap();
    }
    
    // Broadcast campaign changes
    broadcastUpdate(action = 'updated') {
        if (eventBus) {
            eventBus.emit(`campaign:${action}`, {
                nodes: this.nodes,
                connections: this.connections,
                variables: this.variables,
                timestamp: Date.now()
            });
        }
        
        if (projectState) {
            projectState.set('campaign', {
                nodes: this.nodes,
                connections: this.connections,
                variables: this.variables
            });
        }
    }

    async loadResources() {
        try {
            const [levelsRes, itemsRes, varsRes, enemiesRes, cutscenesRes, questsRes] = await Promise.all([
                fetch('/api/files/levels'),
                fetch('/dunyalar/definitions/items.json'),
                fetch('/dunyalar/definitions/variables.json'),
                fetch('/dunyalar/definitions/enemies.json'),
                fetch('/api/cutscenes/list'),
                fetch('/api/quests')
            ]);
            
            if (levelsRes.ok) {
                const files = await levelsRes.json();
                this.availableLevels = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
                
                // Load levels by engine type
                await this._loadLevelsByEngine();
                
                // If availableLevels is empty but engine lists aren't, merge them
                if (this.availableLevels.length === 0) {
                    const allEngineLevels = [
                        ...this.availableLevelsByEngine['rpg-topdown'],
                        ...this.availableLevelsByEngine['iso-pixel'],
                        ...this.availableLevelsByEngine['platformer-2d']
                    ];
                    this.availableLevels = [...new Set(allEngineLevels)]; // Unique
                }
            }
            if (itemsRes.ok) this.itemDefs = await itemsRes.json();
            if (varsRes.ok) {
                const vars = await varsRes.json();
                this.variables = Array.isArray(vars) ? vars : [];
            }
            if (enemiesRes.ok) this.enemyDefs = await enemiesRes.json();
            if (cutscenesRes.ok) this.cutsceneDefs = await cutscenesRes.json();
            if (questsRes.ok) this.questDefs = await questsRes.json();
        } catch(e) { console.warn("Resource load error", e); }
    }
    
    async _loadLevelsByEngine() {
        const engineTypes = ['rpg-topdown', 'iso-pixel', 'platformer-2d'];
        
        console.log('[CampaignEditor] Loading levels by engine type...');
        
        for (const engineType of engineTypes) {
            try {
                const url = `/api/levels/by-engine/${engineType}`;
                console.log(`[CampaignEditor] Fetching: ${url}`);
                const res = await fetch(url);
                
                if (res.ok) {
                    const data = await res.json();
                    console.log(`[CampaignEditor] ${engineType}: ${data.levels.length} levels`, data.levels.map(l => l.id));
                    this.availableLevelsByEngine[engineType] = data.levels.map(l => l.id);
                } else {
                    console.warn(`[CampaignEditor] Failed to fetch ${engineType}: ${res.status}`);
                    this.availableLevelsByEngine[engineType] = [];
                }
            } catch (e) {
                console.error(`[CampaignEditor] Error loading levels for ${engineType}:`, e);
                this.availableLevelsByEngine[engineType] = [];
            }
        }
        
        console.log('[CampaignEditor] Final availableLevelsByEngine:', this.availableLevelsByEngine);
        
        // Fallback: if no engine-specific data, assume all levels are rpg-topdown
        if (this.availableLevelsByEngine['rpg-topdown'].length === 0) {
            console.log('[CampaignEditor] Using fallback: copying all levels to rpg-topdown');
            this.availableLevelsByEngine['rpg-topdown'] = [...this.availableLevels];
        }
    }

    async loadCampaign() {
        try {
            const res = await fetch('/dunyalar/definitions/campaign.json');
            if (res.ok) {
                const data = await res.json();
                this.nodes = Array.isArray(data) ? data : [];
                this.rebuildConnections();
            }
        } catch(e) { this.nodes = []; }
    }

    rebuildConnections() {
        this.connections = [];
        this.nodes.forEach(n => {
            if (n.next) this.connections.push({ from: n.id, port: 'out', to: n.next });
            if (n.nextTrue) this.connections.push({ from: n.id, port: 'true', to: n.nextTrue });
            if (n.nextFalse) this.connections.push({ from: n.id, port: 'false', to: n.nextFalse });
        });
    }

    // --- RENDER LOGIC ---

    renderGraph() {
        this.updateTransform();
        this.dom.container.innerHTML = '';
        this.nodeElements.clear();

        const sorted = [...this.nodes].sort((a,b) => (a.type==='group'? -1 : 1));

        sorted.forEach(n => {
            const el = this.createNodeDOM(n);
            this.dom.container.appendChild(el);
            this.nodeElements.set(n.id, el);
        });

        this.renderWires();
        this.renderMinimap();
    }

    updateTransform() {
        this.dom.transform.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
        this.dom.workspace.style.backgroundPosition = `${this.transform.x}px ${this.transform.y}px`;
        this.dom.workspace.style.backgroundSize = `${40*this.transform.scale}px ${40*this.transform.scale}px`;
        this.renderMinimap();
    }

    updatePositions() {
        this.nodes.forEach(n => {
            const el = this.nodeElements.get(n.id);
            if (el) {
                el.style.left = `${n.x}px`;
                el.style.top = `${n.y}px`;
                if(n.type === 'group') {
                    el.style.width = `${n.w || 300}px`;
                    el.style.height = `${n.h || 300}px`;
                }
                if (this.selection === n.id) el.classList.add('selected');
                else el.classList.remove('selected');
            }
        });
        this.renderWires();
        this.renderMinimap();
    }

    createNodeDOM(node) {
        if (!node.type) node.type = 'unknown'; // Safety fix
        const div = document.createElement('div');
        div.className = `node ${node.type} ${this.selection === node.id ? 'selected' : ''}`;
        div.id = node.id;
        div.style.left = `${node.x || 0}px`;
        div.style.top = `${node.y || 0}px`;
        
        // Add engine type data attribute for level nodes
        if (node.type === 'level' && node.engineType) {
            div.setAttribute('data-engine', node.engineType);
        }
        
        // Add validation indicator if node has errors
        if (this.validationResults && this.validationResults.nodeErrors) {
            const nodeErrors = this.validationResults.nodeErrors[node.id];
            if (nodeErrors && nodeErrors.length > 0) {
                div.classList.add('validation-error');
                const badge = document.createElement('div');
                badge.className = 'validation-badge';
                badge.innerHTML = '!';
                badge.title = nodeErrors.join('\n');
                div.appendChild(badge);
            }
        }

        if (node.type === 'group') {
            div.style.width = `${node.w || 300}px`;
            div.style.height = `${node.h || 300}px`;
            div.innerHTML = `<div style="position:absolute; top:5px; left:5px; font-weight:bold; color:rgba(255,255,255,0.3); pointer-events:none;">${node.name}</div>`;
            const handle = document.createElement('div');
            handle.style.cssText = "position:absolute; bottom:0; right:0; width:15px; height:15px; cursor:se-resize; background:rgba(255,255,255,0.1);";
            handle.onmousedown = (e) => { e.stopPropagation(); this.startDragGroupResize(e, node.id); };
            div.appendChild(handle);
        }
        else if (node.type === 'comment') {
            div.innerHTML = `<div class="node-body">${node.text || 'Write a note...'}</div>`;
        }
        else {
            let icon = 'circle';
            let color = '#ccc';
            
            switch(node.type) {
                case 'start': icon = 'play'; color = '#2ecc71'; break;
                case 'level': 
                    // Engine-specific icons and colors
                    if (node.engineType === 'iso-pixel') {
                        icon = 'cube'; color = '#3498db';
                    } else if (node.engineType === 'platformer-2d') {
                        icon = 'running'; color = '#2ecc71';
                    } else {
                        icon = 'dungeon'; color = '#e74c3c';
                    }
                    break;
                case 'branch': icon = 'code-branch'; color = '#9b59b6'; break;
                case 'battle': icon = 'skull'; color = '#e74c3c'; break;
                case 'reward': icon = 'gift'; color = '#f1c40f'; break;
                case 'variable': icon = 'pen'; color = '#e67e22'; break;
                case 'dialogue': icon = 'comment-dots'; color = '#fff'; break;
                case 'cutscene': icon = 'film'; color = '#1abc9c'; break;
                case 'quest': icon = 'scroll'; color = '#9b59b6'; break;
                case 'random': icon = 'dice'; color = '#e67e22'; break;
                case 'wait': icon = 'clock'; color = '#95a5a6'; break;
                default: icon = 'question'; color = '#666'; break;
            }
            
            // Add engine badge for level nodes
            let engineBadge = '';
            if (node.type === 'level' && node.engineType) {
                const engineNames = {
                    'rpg-topdown': 'RPG',
                    'iso-pixel': 'ISO',
                    'platformer-2d': 'PLT'
                };
                engineBadge = `<span class="engine-badge ${node.engineType}">${engineNames[node.engineType] || 'UNK'}</span>`;
            }

            div.innerHTML = `
                <div class="node-header" style="color:${color}; border-bottom-color:${color}">
                    <span><i class="fas fa-${icon}"></i> ${node.type.toUpperCase()}${engineBadge}</span>
                </div>
                <div class="node-body">
                    ${this.getNodeLabel(node)}
                </div>
            `;

            // Ports
            if (node.type !== 'start') div.appendChild(this.createPort(node.id, 'in', 'input'));
            
            if (node.type === 'branch' || node.type === 'random') {
                div.appendChild(this.createPort(node.id, 'true', 'output true'));
                div.appendChild(this.createPort(node.id, 'false', 'output false'));
            } else {
                div.appendChild(this.createPort(node.id, 'out', 'output'));
            }
        }

        div.onmousedown = (e) => {
            if (e.target.classList.contains('port')) return;
            e.stopPropagation(); 
            if(e.button === 2) { this.showContextMenu(e, node.id); return; }
            this.startDragNode(e, node.id);
        };

        return div;
    }

    renderMinimap() {
        const ctx = this.minimapCtx;
        const w = this.dom.minimap.width;
        const h = this.dom.minimap.height;
        ctx.clearRect(0, 0, w, h);
        
        let minX = 0, minY = 0, maxX = 1, maxY = 1;
        this.nodes.forEach(n => {
            if(n.x < minX) minX = n.x;
            if(n.y < minY) minY = n.y;
            if(n.x + 200 > maxX) maxX = n.x + 200;
            if(n.y + 150 > maxY) maxY = n.y + 150;
        });
        
        minX -= 500; minY -= 500; maxX += 500; maxY += 500;
        const mapW = maxX - minX;
        const mapH = maxY - minY;
        const scale = Math.min(w / mapW, h / mapH);
        
        this.miniMapInfo = { scale, minX, minY, maxX, maxY }; // Cache for input

        // Draw Nodes
        this.nodes.forEach(n => {
            const x = (n.x - minX) * scale;
            const y = (n.y - minY) * scale;
            let width = 200 * scale; 
            let height = 150 * scale;
            
            if(n.type === 'group') {
                width = (n.w || 300) * scale;
                height = (n.h || 300) * scale;
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
            } else if (n.type === 'comment') {
                ctx.fillStyle = '#f1c40f';
            } else {
                ctx.fillStyle = n.id === this.selection ? '#fff' : '#666';
            }
            ctx.fillRect(x, y, width, height);
        });
        
        // Draw Viewport
        const vx = (-this.transform.x / this.transform.scale - minX) * scale;
        const vy = (-this.transform.y / this.transform.scale - minY) * scale;
        const vw = (this.dom.workspace.clientWidth / this.transform.scale) * scale;
        const vh = (this.dom.workspace.clientHeight / this.transform.scale) * scale;
        
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2;
        ctx.strokeRect(vx, vy, vw, vh);
    }

    // --- INTERACTION ---

    setupInput() {
        // Minimap Click-to-Pan
        this.dom.minimap.addEventListener('mousedown', e => {
            e.stopPropagation();
            if (this.miniMapInfo.scale === 0) return;
            
            const rect = this.dom.minimap.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            
            // Convert Minimap -> World
            const wx = (mx / this.miniMapInfo.scale) + this.miniMapInfo.minX;
            const wy = (my / this.miniMapInfo.scale) + this.miniMapInfo.minY;
            
            // Center View
            this.transform.x = -wx * this.transform.scale + this.dom.workspace.clientWidth / 2;
            this.transform.y = -wy * this.transform.scale + this.dom.workspace.clientHeight / 2;
            this.updateTransform();
        });

        // Workspace Pan
        this.dom.workspace.addEventListener('mousedown', e => {
            if (e.button === 2) { this.showContextMenu(e, null); return; }
            if (e.target === this.dom.workspace || e.target.id === 'map-background' || e.target === this.dom.svg) {
                this.dragState = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: this.transform.x, oy: this.transform.y };
                this.selection = null;
                this.dom.ctxMenu.style.display = 'none';
                this.renderInspector();
                this.updatePositions();
            }
        });

        this.dom.workspace.addEventListener('contextmenu', e => e.preventDefault());

        window.addEventListener('mousemove', e => {
            if (!this.dragState) return;
            
            if (this.dragState.type === 'pan') {
                this.transform.x = this.dragState.ox + (e.clientX - this.dragState.sx);
                this.transform.y = this.dragState.oy + (e.clientY - this.dragState.sy);
                this.updateTransform();
            }
            else if (this.dragState.type === 'node') {
                const scale = this.transform.scale;
                const dx = (e.clientX - this.dragState.sx) / scale;
                const dy = (e.clientY - this.dragState.sy) / scale;
                
                const n = this.nodes.find(x => x.id === this.dragState.id);
                if (n) {
                    n.x = Math.round((this.dragState.ox + dx) / 20) * 20; 
                    n.y = Math.round((this.dragState.oy + dy) / 20) * 20;
                    
                    if (n.type === 'group' && this.dragState.children) {
                        this.dragState.children.forEach(c => {
                            c.node.x = c.ox + dx; 
                            c.node.y = c.oy + dy;
                        });
                    }
                    this.updatePositions(); 
                }
            }
            else if (this.dragState.type === 'resize') {
                const n = this.nodes.find(x => x.id === this.dragState.id);
                const scale = this.transform.scale;
                n.w = Math.max(100, this.dragState.ow + (e.clientX - this.dragState.sx)/scale);
                n.h = Math.max(100, this.dragState.oh + (e.clientY - this.dragState.sy)/scale);
                this.updatePositions();
            }
            else if (this.dragState.type === 'wire') {
                this.dragState.cx = e.clientX;
                this.dragState.cy = e.clientY;
                this.renderWires(); 
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.dragState) {
                if (this.dragState.type === 'node' || this.dragState.type === 'resize') {
                    this.pushHistory();
                }
                this.dragState = null;
                this.renderWires();
            }
        });

        this.dom.workspace.addEventListener('wheel', e => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.transform.scale = Math.max(0.2, Math.min(2, this.transform.scale + delta));
            this.updateTransform();
        });
        
        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Pan with arrow keys (hold shift for faster movement)
            const panSpeed = e.shiftKey ? 50 : 20;
            if (e.key === 'ArrowUp' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.transform.y += panSpeed;
                this.updateTransform();
                return;
            }
            if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.transform.y -= panSpeed;
                this.updateTransform();
                return;
            }
            if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.transform.x += panSpeed;
                this.updateTransform();
                return;
            }
            if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.transform.x -= panSpeed;
                this.updateTransform();
                return;
            }
            
            // Existing shortcuts
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') { e.preventDefault(); this.undo(); }
                if (e.key === 'y') { e.preventDefault(); this.redo(); }
                if (e.key === 'c') { e.preventDefault(); this.copy(); }
                if (e.key === 'v') { e.preventDefault(); this.paste(); }
                if (e.key === 's') { e.preventDefault(); this.save(); }
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selection) {
                    this.deleteNode(this.selection);
                }
            }
        });
    }

    showContextMenu(e, nodeId) {
        e.preventDefault();
        const menu = this.dom.ctxMenu;
        menu.style.display = 'flex';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.innerHTML = '';

        const addItem = (icon, text, action) => {
            const div = document.createElement('div');
            div.className = 'context-item';
            div.innerHTML = `<i class="fas fa-${icon}"></i> ${text}`;
            div.onclick = () => { action(); menu.style.display = 'none'; };
            menu.appendChild(div);
        };

        if (nodeId) {
            this.selection = nodeId;
            this.renderInspector();
            this.updatePositions();
            addItem('copy', 'Copy Node', () => this.copy());
            addItem('trash', 'Delete Node', () => this.deleteNode(nodeId));
            if(this.nodes.find(n=>n.id===nodeId).type !== 'start') {
                addItem('unlink', 'Disconnect', () => {
                    const n = this.nodes.find(x=>x.id===nodeId);
                    n.next = null; n.nextTrue = null; n.nextFalse = null;
                    this.rebuildConnections(); this.renderWires();
                });
            }
        } else {
            addItem('plus', 'Add Note', () => this.addNode('comment', e.clientX, e.clientY));
            addItem('object-group', 'Add Group', () => this.addNode('group', e.clientX, e.clientY));
            if(this.clipboard) addItem('paste', 'Paste', () => this.paste());
            addItem('magic', 'Auto Arrange', () => this.autoLayout());
            addItem('list', 'Variables', () => window.toggleVarWindow());
        }
    }

    startDragNode(e, id) {
        if (e.button !== 0) return;
        this.selection = id;
        const n = this.nodes.find(x => x.id === id);
        
        let children = null;
        if (n.type === 'group') {
            children = this.nodes.filter(c => 
                c.id !== id && 
                c.x > n.x && c.x < n.x + (n.w||300) &&
                c.y > n.y && c.y < n.y + (n.h||300)
            ).map(c => ({ node: c, ox: c.x, oy: c.y }));
        }

        this.dragState = { type: 'node', id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, children };
        this.renderInspector();
        this.updatePositions(); 
    }

    startDragGroupResize(e, id) {
        const n = this.nodes.find(x => x.id === id);
        this.dragState = { type: 'resize', id, sx: e.clientX, sy: e.clientY, ow: n.w||300, oh: n.h||300 };
    }

    startDragWire(e, id, port) { this.dragState = { type: 'wire', from: id, port, cx: e.clientX, cy: e.clientY }; }
    endDragWire(e, toId) {
        if (this.dragState && this.dragState.type === 'wire') {
            const { from, port } = this.dragState;
            if (from === toId) return; 
            this.pushHistory();
            const srcNode = this.nodes.find(n => n.id === from);
            if (port === 'out') srcNode.next = toId;
            if (port === 'true') srcNode.nextTrue = toId;
            if (port === 'false') srcNode.nextFalse = toId;
            this.rebuildConnections();
            this.renderWires();
        }
        this.dragState = null;
    }

    // ... Helper Methods ...
    createPort(nid, port, type) {
        const p = document.createElement('div');
        p.className = `port ${type}`;
        p.dataset.id = nid;
        p.dataset.port = port;
        if (type.includes('output')) { p.onmousedown = (e) => { e.stopPropagation(); this.startDragWire(e, nid, port); }; } 
        else { p.onmouseup = (e) => { e.stopPropagation(); this.endDragWire(e, nid); }; }
        return p;
    }
    getPortPos(nid, port) {
        const n = this.nodes.find(x => x.id === nid);
        if (!n) return null;
        let x = (n.x || 0) + 100; let y = (n.y || 0);
        if (port === 'in') { y -= 0; }
        else {
            y += 65; 
            if (port === 'true') x = n.x + 40; 
            if (port === 'false') x = n.x + 160;
        }
        return { x, y };
    }
    getCanvasPos(cx, cy) {
        const r = this.dom.workspace.getBoundingClientRect();
        return {
            x: (cx - r.left - this.transform.x) / this.transform.scale,
            y: (cy - r.top - this.transform.y) / this.transform.scale
        };
    }
    getNodeLabel(node) {
        if (node.type === 'level') return node.levelId || 'No Map';
        if (node.type === 'dialogue') return node.text ? (node.text.substring(0, 20) + '...') : '...';
        if (node.type === 'variable') return `${node.flag} = ${node.value}`;
        if (node.type === 'branch') return node.condition || '?';
        if (node.type === 'cutscene') return node.cutsceneId || 'No Cutscene';
        if (node.type === 'quest') return node.questId || 'No Quest';
        if (node.type === 'battle') {
            if (node.enemies && node.enemies.length > 0) {
                return node.enemies.slice(0, 2).join(', ') + (node.enemies.length > 2 ? '...' : '');
            }
            return 'No Enemies';
        }
        if (node.type === 'reward') return node.itemId || 'No Item';
        if (node.type === 'wait') return `Wait ${node.duration || 1}s`;
        if (node.type === 'random') return `${node.chance || 50}% Chance`;
        
        // Advanced node types
        if (node.type === 'mini-game') return node.name || node.gameType || 'Mini-Game';
        if (node.type === 'hub') return node.name || 'Hub Area';
        if (node.type === 'challenge-mode') return node.name || `${node.challengeType || 'Challenge'}`;
        if (node.type === 'boss-rush') return node.name || `${(node.bossLevels || []).length} Bosses`;
        if (node.type === 'exploration') return node.name || 'Explore';
        
        return node.name || node.id;
    }
    createPathSVG(p1, p2, isTemp, color) {
        const dist = Math.sqrt((p1.x-p2.x)**2 + (p1.y-p2.y)**2);
        const controlOffset = Math.min(150, dist * 0.5); 
        const cp1 = { x: p1.x, y: p1.y + controlOffset };
        const cp2 = { x: p2.x, y: p2.y - controlOffset };
        const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", color);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-width", "3");
        return path;
    }

    renderWires() {
        this.dom.svg.innerHTML = '';
        this.connections.forEach(c => {
            const p1 = this.getPortPos(c.from, c.port);
            const p2 = this.getPortPos(c.to, 'in');
            if (p1 && p2) {
                const el = this.createPathSVG(p1, p2, false, (c.port === 'true' || c.port === 'false') ? (c.port === 'true' ? '#2ecc71' : '#e74c3c') : '#666');
                this.dom.svg.appendChild(el);
            }
        });
        if (this.dragState && this.dragState.type === 'wire') {
            const p1 = this.getPortPos(this.dragState.from, this.dragState.port);
            const p2 = this.getCanvasPos(this.dragState.cx, this.dragState.cy);
            if (p1) { 
                const el = this.createPathSVG(p1, p2, true, '#fff');
                this.dom.svg.appendChild(el);
            }
        }
    }

    // --- VARIABLES ---
    
    async saveVariables() {
        try {
            await fetch('/api/variables', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(this.variables) 
            });
        } catch(e) { console.error("Vars save failed", e); }
    }

    addVariable(name) {
        if (!name || this.variables.includes(name)) return;
        this.variables.push(name);
        this.saveVariables();
        this.renderVarList();
    }

    renderVarList() {
        const list = document.getElementById('var-list');
        list.innerHTML = '';
        this.variables.forEach(v => {
            const div = document.createElement('div');
            div.style.cssText = "padding:5px; border-bottom:1px solid #333; display:flex; justify-content:space-between; color:#ccc;";
            div.innerHTML = `<span>${v}</span> <i class="fas fa-trash" style="cursor:pointer; color:#e74c3c;"></i>`;
            div.querySelector('i').onclick = () => {
                this.variables = this.variables.filter(x => x !== v);
                this.saveVariables();
                this.renderVarList();
            };
            list.appendChild(div);
        });
    }

    // --- LOGIC ---

    addNode(type, mx, my) {
        this.pushHistory();
        const id = type + '_' + Math.floor(Math.random()*10000);
        let cx, cy;
        
        if (mx !== undefined) {
            const pos = this.getCanvasPos(mx, my);
            cx = pos.x; cy = pos.y;
        } else {
            cx = (-this.transform.x + this.dom.workspace.clientWidth/2) / this.transform.scale;
            cy = (-this.transform.y + this.dom.workspace.clientHeight/2) / this.transform.scale;
        }
        
        const newNode = {
            id, type, x: cx - 100, y: cy, name: type.toUpperCase()
        };

        if (type === 'level') {
            newNode.levelId = this.availableLevels[0] || '';
            newNode.engineType = 'rpg-topdown'; // Default engine type
        }
        if (type === 'branch') newNode.condition = 'flag_name';
        if (type === 'variable') { newNode.flag = 'flag_name'; newNode.value = true; }
        if (type === 'reward') newNode.itemId = this.itemDefs[0]?.id || '';
        if (type === 'dialogue') newNode.text = 'Hello World';
        if (type === 'group') { newNode.w = 300; newNode.h = 300; }
        if (type === 'comment') { newNode.text = 'New Note'; }
        if (type === 'wait') { newNode.duration = 1; }
        if (type === 'random') { newNode.chance = 50; }
        if (type === 'cutscene') newNode.cutsceneId = '';
        if (type === 'quest') newNode.questId = '';
        if (type === 'battle') { newNode.enemies = []; newNode.bgMusic = ''; }

        this.nodes.push(newNode);
        this.renderGraph();
        this.selection = id;
        this.renderInspector();
        this.updatePositions();
    }

    deleteNode(id) {
        if(confirm("Delete this node?")) {
            this.pushHistory();
            this.nodes = this.nodes.filter(n => n.id !== id);
            this.rebuildConnections();
            this.selection = null;
            this.renderGraph();
            this.renderInspector();
        }
    }

    renderInspector() {
        const ins = this.dom.inspector;
        ins.innerHTML = '';
        if (!this.selection) { ins.innerHTML = `<div style="text-align:center;color:#555;margin-top:50px;">SELECT NODE</div>`; return; }

        const node = this.nodes.find(n => n.id === this.selection);
        if (!node) return;

        const createInput = (label, key, type='text', options=null) => {
            const wrap = document.createElement('div');
            wrap.className = 'prop-group';
            wrap.innerHTML = `<span class="prop-label">${label}</span>`;
            
            let input;
            if (type === 'textarea') {
                input = document.createElement('textarea');
                input.className = 'prop-input';
                input.style.height = '80px';
                input.value = node[key] || '';
            }
            else if (type === 'select') {
                input = document.createElement('select');
                input.className = 'prop-input';
                options.forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.val; o.innerText = opt.label;
                    if (node[key] == opt.val) o.selected = true;
                    input.appendChild(o);
                });
            } else {
                input = document.createElement('input');
                input.type = type;
                input.className = 'prop-input';
                input.value = node[key] || '';
            }

            input.onchange = (e) => {
                this.pushHistory();
                node[key] = (type === 'checkbox') ? e.target.checked : e.target.value;
                
                // Re-render graph if engine type changed (to update colors/badges)
                if (key === 'engineType' && node.type === 'level') {
                    this.renderGraph();
                    this.renderInspector(); // Refresh to show correct levels
                } else {
                    const dom = this.nodeElements.get(node.id);
                    if(dom) {
                        if (node.type === 'comment') dom.querySelector('.node-body').innerText = node.text;
                        else dom.querySelector('.node-body').innerText = this.getNodeLabel(node);
                    }
                }
            };
            wrap.appendChild(input);
            ins.appendChild(wrap);
        };

        if (node.type === 'comment') {
            createInput("Note Content", "text", "textarea");
        } else {
            createInput("ID", "id");
            createInput("Name", "name");
            
            // Level selector
            if (node.type === 'level') {
                // Engine type selector
                createInput("Engine Type", "engineType", "select", [
                    { val: 'rpg-topdown', label: 'RPG Top-Down' },
                    { val: 'iso-pixel', label: 'Isometric Pixel' },
                    { val: 'platformer-2d', label: 'Platformer 2D' }
                ]);
                
                // Level file selector (filtered by engine type)
                const engineType = node.engineType || 'rpg-topdown';
                const levelsForEngine = this.availableLevelsByEngine[engineType] || [];
                const levelOpts = levelsForEngine.length > 0 
                    ? levelsForEngine.map(l => ({ val: l, label: l }))
                    : [{ val: '', label: 'No levels found for this engine' }];
                createInput("Level File", "levelId", "select", levelOpts);
                
                // Add button to open level editor
                const levelBtn = document.createElement('button');
                levelBtn.className = 'btn-full';
                levelBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> OPEN LEVEL EDITOR';
                levelBtn.onclick = () => {
                    const editorMap = {
                        'rpg-topdown': 'editor.html',
                        'iso-pixel': 'iso_editor.html',
                        'platformer-2d': 'pixel_editor.html'
                    };
                    window.open(editorMap[engineType] || 'editor.html', '_blank');
                };
                ins.appendChild(levelBtn);
            }
            
            // Branch/Variable - use variable manager
            if (node.type === 'branch' || node.type === 'variable') {
                const varOpts = this.variables.length > 0 
                    ? this.variables.map(v => ({val: v, label: v})) 
                    : [{val: 'flag_name', label: 'Add via Variables...'}];
                createInput(node.type === 'branch' ? "Condition" : "Flag", node.type === 'branch' ? "condition" : "flag", "select", varOpts);
                
                // Add button to open variable manager
                const varBtn = document.createElement('button');
                varBtn.className = 'btn-full';
                varBtn.innerHTML = '<i class="fas fa-cog"></i> MANAGE VARIABLES';
                varBtn.onclick = () => window.toggleVarWindow();
                ins.appendChild(varBtn);
            }
            
            if (node.type === 'variable') createInput("Value (true/false)", "value");
            if (node.type === 'dialogue') createInput("Text", "text", "textarea");
            
            // Reward - item selector
            if (node.type === 'reward') {
                const itemOpts = this.itemDefs.length > 0 
                    ? this.itemDefs.map(i => ({ val: i.id, label: i.name || i.id }))
                    : [{ val: '', label: 'No items found' }];
                createInput("Item ID", "itemId", "select", itemOpts);
                createInput("Quantity", "quantity", "number");
            }
            
            // Cutscene selector
            if (node.type === 'cutscene') {
                const cutsceneOpts = Array.isArray(this.cutsceneDefs) && this.cutsceneDefs.length > 0 
                    ? this.cutsceneDefs.map(c => ({ val: c.id || c, label: c.name || c.id || c }))
                    : [{ val: '', label: 'No cutscenes found' }];
                createInput("Cutscene", "cutsceneId", "select", cutsceneOpts);
                
                // Open cutscene editor button
                const csBtn = document.createElement('button');
                csBtn.className = 'btn-full';
                csBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> OPEN CUTSCENE STUDIO';
                csBtn.onclick = () => window.open('interactive_cutscene_editor.html', '_blank');
                ins.appendChild(csBtn);
            }
            
            // Quest selector
            if (node.type === 'quest') {
                const questOpts = Array.isArray(this.questDefs) && this.questDefs.length > 0 
                    ? this.questDefs.map(q => ({ val: q.id, label: q.name || q.id }))
                    : [{ val: '', label: 'No quests found' }];
                createInput("Quest", "questId", "select", questOpts);
                createInput("Action", "questAction", "select", [
                    { val: 'start', label: 'Start Quest' },
                    { val: 'complete', label: 'Complete Quest' },
                    { val: 'fail', label: 'Fail Quest' }
                ]);
                
                // Open quest editor button
                const qBtn = document.createElement('button');
                qBtn.className = 'btn-full';
                qBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> OPEN QUEST EDITOR';
                qBtn.onclick = () => window.open('quest_editor.html', '_blank');
                ins.appendChild(qBtn);
            }
            
            // Battle - enemy selector
            if (node.type === 'battle') {
                // Show current enemies
                const enemyLabel = document.createElement('div');
                enemyLabel.className = 'prop-group';
                enemyLabel.innerHTML = `<span class="prop-label">ENEMIES</span>`;
                const enemyList = document.createElement('div');
                enemyList.style.cssText = 'padding:8px; background:#000; border:1px solid #333; min-height:40px; color:#ccc; font-size:0.9rem;';
                enemyList.innerText = (node.enemies && node.enemies.length > 0) 
                    ? node.enemies.join(', ') 
                    : 'Click button to select enemies';
                enemyLabel.appendChild(enemyList);
                ins.appendChild(enemyLabel);
                
                // Select enemies button
                const enemyBtn = document.createElement('button');
                enemyBtn.className = 'btn-full';
                enemyBtn.innerHTML = '<i class="fas fa-skull"></i> SELECT ENEMIES';
                enemyBtn.onclick = () => {
                    this.pendingSelection = node.id;
                    this.selectedEnemies = node.enemies ? [...node.enemies] : [];
                    window.toggleEnemyWindow();
                };
                ins.appendChild(enemyBtn);
                
                createInput("Background Music", "bgMusic");
                createInput("Battle Arena", "arenaId");
            }
            
            if (node.type === 'wait') createInput("Duration (sec)", "duration", "number");
            if (node.type === 'random') createInput("Chance (%)", "chance", "number");
            
            // Advanced node types
            if (node.type === 'mini-game') {
                createInput("Game Type", "gameType", "select", [
                    { val: 'challenge', label: 'Challenge' },
                    { val: 'puzzle', label: 'Puzzle' },
                    { val: 'reflex', label: 'Reflex' },
                    { val: 'memory', label: 'Memory' }
                ]);
                createInput("Engine Type", "engineType", "select", [
                    { val: 'rpg-topdown', label: 'RPG Top-Down' },
                    { val: 'iso-pixel', label: 'Isometric Pixel' },
                    { val: 'platformer-2d', label: 'Platformer 2D' }
                ]);
                createInput("Level File", "levelId");
                createInput("Time Limit (sec)", "timeLimit", "number");
                createInput("Score Target", "scoreTarget", "number");
                createInput("Restore State After", "restoreStateAfter", "checkbox");
            }
            
            if (node.type === 'hub') {
                createInput("Engine Type", "engineType", "select", [
                    { val: 'rpg-topdown', label: 'RPG Top-Down' },
                    { val: 'iso-pixel', label: 'Isometric Pixel' },
                    { val: 'platformer-2d', label: 'Platformer 2D' }
                ]);
                createInput("Level File", "levelId");
                createInput("Has Shop", "hasShop", "checkbox");
                createInput("Has Inn", "hasInn", "checkbox");
                createInput("Has Quest Board", "hasQuestBoard", "checkbox");
                createInput("Heal Player", "healPlayer", "checkbox");
                
                // Info text
                const info = document.createElement('div');
                info.className = 'prop-group';
                info.style.cssText = 'color:#888; font-size:0.9rem; margin-top:10px;';
                info.innerHTML = '<i class="fas fa-info-circle"></i> Hub = Safe area with NPCs, shops, quests';
                ins.appendChild(info);
            }
            
            if (node.type === 'challenge-mode') {
                createInput("Challenge Type", "challengeType", "select", [
                    { val: 'time_trial', label: 'Time Trial' },
                    { val: 'score_attack', label: 'Score Attack' },
                    { val: 'survival', label: 'Survival' },
                    { val: 'no_damage', label: 'No Damage' }
                ]);
                createInput("Engine Type", "engineType", "select", [
                    { val: 'rpg-topdown', label: 'RPG Top-Down' },
                    { val: 'iso-pixel', label: 'Isometric Pixel' },
                    { val: 'platformer-2d', label: 'Platformer 2D' }
                ]);
                createInput("Level File", "levelId");
                createInput("Time Limit (sec)", "timeLimit", "number");
                createInput("Score Target", "scoreTarget", "number");
                createInput("Restrictions (comma-separated)", "restrictions");
                
                // Info text
                const info = document.createElement('div');
                info.className = 'prop-group';
                info.style.cssText = 'color:#888; font-size:0.9rem; margin-top:10px;';
                info.innerHTML = '<i class="fas fa-info-circle"></i> Restrictions: no_items, low_health, no_mana';
                ins.appendChild(info);
            }
            
            if (node.type === 'boss-rush') {
                createInput("Engine Type", "engineType", "select", [
                    { val: 'rpg-topdown', label: 'RPG Top-Down' },
                    { val: 'iso-pixel', label: 'Isometric Pixel' },
                    { val: 'platformer-2d', label: 'Platformer 2D' }
                ]);
                createInput("Restore Health Between Bosses", "restoreHealthBetweenBosses", "checkbox");
                
                // Boss levels list (simplified for now - could be enhanced with a list editor)
                const bossInfo = document.createElement('div');
                bossInfo.className = 'prop-group';
                bossInfo.innerHTML = '<span class="prop-label">Boss Levels (JSON)</span>';
                const bossTextarea = document.createElement('textarea');
                bossTextarea.className = 'prop-input';
                bossTextarea.style.height = '120px';
                bossTextarea.style.fontFamily = 'monospace';
                bossTextarea.value = node.bossLevels ? JSON.stringify(node.bossLevels, null, 2) : '[]';
                bossTextarea.onchange = (e) => {
                    try {
                        node.bossLevels = JSON.parse(e.target.value);
                        this.pushHistory();
                    } catch (err) {
                        alert('Invalid JSON: ' + err.message);
                    }
                };
                bossInfo.appendChild(bossTextarea);
                ins.appendChild(bossInfo);
                
                // Info text
                const info = document.createElement('div');
                info.className = 'prop-group';
                info.style.cssText = 'color:#888; font-size:0.9rem; margin-top:10px;';
                info.innerHTML = '<i class="fas fa-info-circle"></i> Format: [{"levelId":"boss1", "name":"Boss Name"}]';
                ins.appendChild(info);
            }
            
            if (node.type === 'exploration') {
                createInput("Engine Type", "engineType", "select", [
                    { val: 'rpg-topdown', label: 'RPG Top-Down' },
                    { val: 'iso-pixel', label: 'Isometric Pixel' },
                    { val: 'platformer-2d', label: 'Platformer 2D' }
                ]);
                createInput("Level File", "levelId");
                createInput("Allow Early Exit", "allowEarlyExit", "checkbox");
                
                // Objectives/secrets (simplified for now)
                const objInfo = document.createElement('div');
                objInfo.className = 'prop-group';
                objInfo.innerHTML = '<span class="prop-label">Objectives (comma-separated)</span>';
                const objInput = document.createElement('input');
                objInput.className = 'prop-input';
                objInput.value = node.objectives ? node.objectives.join(', ') : '';
                objInput.onchange = (e) => {
                    node.objectives = e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    this.pushHistory();
                };
                objInfo.appendChild(objInput);
                ins.appendChild(objInfo);
                
                // Info text
                const info = document.createElement('div');
                info.className = 'prop-group';
                info.style.cssText = 'color:#888; font-size:0.9rem; margin-top:10px;';
                info.innerHTML = '<i class="fas fa-info-circle"></i> Exploration = Open-world segment, optional objectives';
                ins.appendChild(info);
            }
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-full'; delBtn.style.cssText = "margin-top:20px; border-color:#c0392b; color:#c0392b;";
        delBtn.innerText = "DELETE NODE";
        delBtn.onclick = () => this.deleteNode(this.selection);
        ins.appendChild(delBtn);
    }

    pushHistory() {
        const state = JSON.stringify(this.nodes);
        if (this.historyIndex < this.history.length - 1) this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(state);
        if (this.history.length > 50) this.history.shift();
        this.historyIndex = this.history.length - 1;
    }
    undo() { if (this.historyIndex > 0) { this.historyIndex--; this.restoreState(this.history[this.historyIndex]); } }
    redo() { if (this.historyIndex < this.history.length - 1) { this.historyIndex++; this.restoreState(this.history[this.historyIndex]); } }
    restoreState(json) { this.nodes = JSON.parse(json); this.rebuildConnections(); this.selection = null; this.renderGraph(); this.renderInspector(); }
    copy() { if (this.selection) { const n = this.nodes.find(n => n.id === this.selection); if (n) this.clipboard = JSON.parse(JSON.stringify(n)); } }
    paste() {
        if (!this.clipboard) return;
        this.pushHistory();
        const n = JSON.parse(JSON.stringify(this.clipboard));
        n.id = n.type + '_' + Math.floor(Math.random()*100000);
        n.x += 20; n.y += 20;
        delete n.next; delete n.nextTrue; delete n.nextFalse;
        this.nodes.push(n); this.renderGraph(); this.selection = n.id; this.renderInspector();
    }
    autoLayout() {
        this.pushHistory();
        const adj = {}; const roots = new Set(this.nodes.map(n => n.id));
        this.nodes.forEach(n => {
            adj[n.id] = [];
            const targets = [n.next, n.nextTrue, n.nextFalse].filter(t=>t);
            targets.forEach(t => { adj[n.id].push(t); roots.delete(t); });
        });
        const rank = {}; const queue = [];
        const startNode = this.nodes.find(n => n.type === 'start');
        if (startNode) queue.push({id: startNode.id, d: 0}); else roots.forEach(r => queue.push({id: r, d: 0}));
        while(queue.length > 0) {
            const {id, d} = queue.shift();
            if (rank[id] !== undefined && rank[id] >= d) continue;
            rank[id] = d;
            if(adj[id]) adj[id].forEach(child => queue.push({id: child, d: d+1}));
        }
        const rows = {};
        this.nodes.forEach(n => {
            const r = rank[n.id] || 0; if (!rows[r]) rows[r] = 0;
            n.x = r * 250 + 100; n.y = rows[r] * 150 + 100; rows[r]++;
        });
        this.updatePositions();
    }
    async validate() {
        // Clear previous validation
        this.validationResults = null;
        this.nodeElements.forEach(el => {
            el.classList.remove('validation-error', 'validation-warning');
            const badge = el.querySelector('.validation-badge');
            if (badge) badge.remove();
        });
        
        // Use CampaignValidator
        const result = await this.validator.validate({ nodes: this.nodes });
        
        // Store results
        this.validationResults = {
            ...result,
            nodeErrors: {}
        };
        
        // Parse errors to associate with nodes
        result.errors.forEach(err => {
            const match = err.match(/Node '([^']+)'/);
            if (match) {
                const nodeName = match[1];
                const node = this.nodes.find(n => n.id === nodeName || n.name === nodeName);
                if (node) {
                    if (!this.validationResults.nodeErrors[node.id]) {
                        this.validationResults.nodeErrors[node.id] = [];
                    }
                    this.validationResults.nodeErrors[node.id].push(err);
                }
            }
        });
        
        // Re-render to show badges
        this.renderGraph();
        
        // Show toast summary
        if (result.errors.length > 0) {
            this.showToast(`${result.errors.length} error(s) found`, true, false);
        } else if (result.warnings.length > 0) {
            this.showToast(`${result.warnings.length} warning(s)`, false, false);
        } else {
            this.showToast('Campaign is valid!', false, true);
        }
        
        // Show detailed report
        this._showValidationReport(result);
    }
    
    _showValidationReport(result) {
        const report = [];
        report.push('═══ CAMPAIGN VALIDATION ═══\n');
        
        if (result.valid) {
            report.push('✓ Campaign is valid\n');
        } else {
            report.push('✗ Campaign has errors\n');
        }
        
        if (result.errors.length > 0) {
            report.push('\nERRORS:');
            result.errors.forEach(err => report.push(`  ✗ ${err}`));
        }
        
        if (result.warnings.length > 0) {
            report.push('\nWARNINGS:');
            result.warnings.forEach(warn => report.push(`  ⚠ ${warn}`));
        }
        
        // Check for unreachable nodes
        const unreachable = this.validator.findUnreachableNodes(this.nodes);
        if (unreachable.length > 0) {
            report.push(`\nUNREACHABLE NODES: ${unreachable.join(', ')}`);
        }
        
        // Check for cycles
        const cycles = this.validator.detectCycles(this.nodes);
        if (cycles.length > 0) {
            report.push('\nCYCLES DETECTED:');
            cycles.forEach(cycle => report.push(`  ${cycle.join(' → ')}`));
        }
        
        console.log(report.join('\n'));
        alert(report.join('\n'));
    }
    showToast(msg, isErr, isSucc) {
        this.dom.toastMsg.innerText = msg;
        this.dom.toast.style.display = 'block';
        this.dom.toast.style.backgroundColor = isErr ? '#e74c3c' : (isSucc ? '#2ecc71' : '#f1c40f');
        setTimeout(() => this.dom.toast.style.display = 'none', 3000);
    }
    search(q) {
        if(!q) { this.nodeElements.forEach(el => el.style.opacity = '1'); return; }
        q = q.toLowerCase(); let first = null;
        this.nodes.forEach(n => {
            const m = n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || (n.text && n.text.toLowerCase().includes(q));
            const el = this.nodeElements.get(n.id);
            if(el) { el.style.opacity = m ? '1' : '0.2'; if(m && !first) first = n; }
        });
        if(first) {
            this.transform.x = -first.x * this.transform.scale + this.dom.workspace.clientWidth/2;
            this.transform.y = -first.y * this.transform.scale + this.dom.workspace.clientHeight/2;
            this.updateTransform();
        }
    }
    async save() {
        try { 
            // Use new campaigns API
            const campaignData = {
                metadata: this.campaignMetadata,
                nodes: this.nodes
            };
            
            await fetch(`/api/campaigns/${this.campaignName}`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(campaignData) 
            });
            
            // Also save to legacy endpoint for backward compatibility
            await fetch('/api/campaign', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(this.nodes) 
            }); 
            
            // Broadcast to integration system
            this.broadcastUpdate('saved');
            
            this.showToast(`Campaign "${this.campaignName}" saved successfully!`, false, true);
            
            const btn = document.querySelector('#toolbar .tool-btn[title*="Save"]'); 
            if(btn) { btn.style.color = '#2ecc71'; setTimeout(() => btn.style.color = '', 1000); } 
        } catch(e) { 
            console.error('Save failed:', e);
            this.showToast('Save failed!', true, false);
        }
    }
    
    async loadCampaignFromServer(campaignName) {
        try {
            const res = await fetch(`/api/campaigns/${campaignName}`);
            if (res.ok) {
                const data = await res.json();
                
                // Handle both formats: new (with metadata) and old (nodes array)
                if (data.metadata && data.nodes) {
                    this.campaignName = campaignName;
                    this.campaignMetadata = data.metadata;
                    this.nodes = data.nodes;
                } else if (Array.isArray(data)) {
                    // Legacy format
                    this.nodes = data;
                }
                
                this.rebuildConnections();
                this.renderGraph();
                this.showToast(`Campaign "${campaignName}" loaded!`, false, true);
            } else {
                throw new Error('Campaign not found');
            }
        } catch(e) {
            console.error('Load failed:', e);
            this.showToast(`Failed to load campaign "${campaignName}"`, true, false);
        }
    }
    
    async listCampaigns() {
        try {
            const res = await fetch('/api/campaigns/list');
            if (res.ok) {
                const data = await res.json();
                return data.campaigns || [];
            }
        } catch(e) {
            console.error('Failed to list campaigns:', e);
        }
        return [];
    }
    
    async deleteCampaign(campaignName) {
        if (!confirm(`Delete campaign "${campaignName}"? This cannot be undone.`)) {
            return;
        }
        
        try {
            const res = await fetch(`/api/campaigns/${campaignName}`, { method: 'DELETE' });
            if (res.ok) {
                this.showToast(`Campaign "${campaignName}" deleted`, false, true);
                return true;
            }
        } catch(e) {
            console.error('Delete failed:', e);
            this.showToast(`Failed to delete campaign`, true, false);
        }
        return false;
    }
}

// Global Wrappers
window.editor = new CampaignEditor();

window.toggleInspector = (force) => {
    const el = document.getElementById('inspector-container');
    const btn = document.getElementById('inspector-handle');
    if (!el || !btn) return;
    
    const isCollapsed = el.style.width === '12px'; 
    
    let shouldOpen = isCollapsed;
    if (typeof force === 'boolean') shouldOpen = force;
    
    el.style.width = shouldOpen ? '300px' : '12px';
    btn.innerText = shouldOpen ? '⏵' : '⏴';
    
    // Trigger layout refresh after transition
    setTimeout(() => {
        if (window.editor && window.editor.resize) window.editor.resize();
    }, 120);
};

window.toggleSidebar = (force) => {
    const el = document.getElementById('sidebar-container');
    const btn = document.getElementById('sidebar-handle');
    if (!el || !btn) return;
    
    const isCollapsed = el.style.width === '12px'; 
    
    let shouldOpen = isCollapsed;
    if (typeof force === 'boolean') shouldOpen = force;
    
    el.style.width = shouldOpen ? '80px' : '12px';
    btn.innerText = shouldOpen ? '⏴' : '⏵';
    
    // Trigger layout refresh after transition
    setTimeout(() => {
        if (window.editor && window.editor.resize) window.editor.resize();
    }, 120);
};

window.addNode = (t) => window.editor.addNode(t);
window.saveToServer = () => window.editor.save();
window.adjustZoom = (d) => { window.editor.transform.scale = Math.max(0.2, Math.min(2, window.editor.transform.scale + d)); window.editor.updateTransform(); };
window.resetZoom = () => { window.editor.transform.scale = 1; window.editor.transform.x = 0; window.editor.transform.y = 0; window.editor.updateTransform(); };
window.autoArrange = () => window.editor.autoLayout();
window.toggleMapMode = () => { const bg = document.getElementById('map-background'); bg.style.display = bg.style.display === 'none' ? 'block' : 'none'; };
window.runCampaign = () => { window.editor.save().then(() => window.open('index.html', '_blank')); };
window.undo = () => window.editor.undo();
window.redo = () => window.editor.redo();
window.copyNode = () => window.editor.copy();
window.pasteNode = () => window.editor.paste();
window.validateCampaign = () => window.editor.validate();
window.searchNodes = (q) => window.editor.search(q);

// Variable Manager
window.toggleVarWindow = () => {
    const w = document.getElementById('var-window');
    w.style.display = w.style.display === 'none' ? 'block' : 'none';
    if(w.style.display === 'block') window.editor.renderVarList();
};
window.addVariable = () => {
    const val = document.getElementById('new-var-name').value;
    if(val) {
        window.editor.addVariable(val);
        document.getElementById('new-var-name').value = '';
    }
};

// Level Window
window.toggleLevelWindow = () => {
    const w = document.getElementById('level-window');
    w.style.display = w.style.display === 'none' ? 'block' : 'none';
    if(w.style.display === 'block') {
        const list = document.getElementById('level-list');
        list.innerHTML = '';
        window.editor.availableLevels.forEach(level => {
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.innerHTML = `<i class="fas fa-dungeon"></i>${level}`;
            item.onclick = () => {
                if (window.editor.selection) {
                    const node = window.editor.nodes.find(n => n.id === window.editor.selection);
                    if (node && node.type === 'level') {
                        node.levelId = level;
                        window.editor.renderGraph();
                        window.editor.renderInspector();
                    }
                }
                w.style.display = 'none';
            };
            list.appendChild(item);
        });
    }
};

// Cutscene Window
window.toggleCutsceneWindow = () => {
    const w = document.getElementById('cutscene-window');
    w.style.display = w.style.display === 'none' ? 'block' : 'none';
    if(w.style.display === 'block') {
        const list = document.getElementById('cutscene-list');
        list.innerHTML = '';
        const cutscenes = window.editor.cutsceneDefs || [];
        if (cutscenes.length === 0) {
            list.innerHTML = '<div style="color:#666; text-align:center; grid-column:1/-1;">No cutscenes found.<br>Create one in Cutscene Studio.</div>';
            return;
        }
        cutscenes.forEach(cs => {
            const id = cs.id || cs;
            const name = cs.name || cs.id || cs;
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.innerHTML = `<i class="fas fa-film"></i>${name}`;
            item.onclick = () => {
                if (window.editor.selection) {
                    const node = window.editor.nodes.find(n => n.id === window.editor.selection);
                    if (node && node.type === 'cutscene') {
                        node.cutsceneId = id;
                        window.editor.renderGraph();
                        window.editor.renderInspector();
                    }
                }
                w.style.display = 'none';
            };
            list.appendChild(item);
        });
    }
};

// Quest Window
window.toggleQuestWindow = () => {
    const w = document.getElementById('quest-window');
    w.style.display = w.style.display === 'none' ? 'block' : 'none';
    if(w.style.display === 'block') {
        const list = document.getElementById('quest-list');
        list.innerHTML = '';
        const quests = window.editor.questDefs || [];
        if (quests.length === 0) {
            list.innerHTML = '<div style="color:#666; text-align:center; grid-column:1/-1;">No quests found.<br>Create one in Quest Editor.</div>';
            return;
        }
        quests.forEach(q => {
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.innerHTML = `<i class="fas fa-scroll"></i>${q.name || q.id}`;
            item.onclick = () => {
                if (window.editor.selection) {
                    const node = window.editor.nodes.find(n => n.id === window.editor.selection);
                    if (node && node.type === 'quest') {
                        node.questId = q.id;
                        window.editor.renderGraph();
                        window.editor.renderInspector();
                    }
                }
                w.style.display = 'none';
            };
            list.appendChild(item);
        });
    }
};

// Enemy Window
window.toggleEnemyWindow = () => {
    const w = document.getElementById('enemy-window');
    w.style.display = w.style.display === 'none' ? 'block' : 'none';
    if(w.style.display === 'block') {
        const list = document.getElementById('enemy-list');
        list.innerHTML = '';
        const enemies = window.editor.enemyDefs || [];
        if (enemies.length === 0) {
            list.innerHTML = '<div style="color:#666; text-align:center; grid-column:1/-1;">No enemies found.</div>';
            return;
        }
        enemies.forEach(e => {
            const item = document.createElement('div');
            const isSelected = window.editor.selectedEnemies.includes(e.id);
            item.className = `selector-item ${isSelected ? 'selected' : ''}`;
            item.innerHTML = `<i class="fas fa-skull"></i>${e.name || e.id}`;
            item.onclick = () => {
                const idx = window.editor.selectedEnemies.indexOf(e.id);
                if (idx >= 0) {
                    window.editor.selectedEnemies.splice(idx, 1);
                    item.classList.remove('selected');
                } else {
                    window.editor.selectedEnemies.push(e.id);
                    item.classList.add('selected');
                }
                document.getElementById('selected-enemies').innerText = 
                    window.editor.selectedEnemies.length > 0 
                        ? window.editor.selectedEnemies.join(', ') 
                        : 'None';
            };
            list.appendChild(item);
        });
        document.getElementById('selected-enemies').innerText = 
            window.editor.selectedEnemies.length > 0 
                ? window.editor.selectedEnemies.join(', ') 
                : 'None';
    }
};

window.confirmEnemySelection = () => {
    if (window.editor.pendingSelection) {
        const node = window.editor.nodes.find(n => n.id === window.editor.pendingSelection);
        if (node && node.type === 'battle') {
            node.enemies = [...window.editor.selectedEnemies];
            window.editor.renderGraph();
            window.editor.renderInspector();
        }
        window.editor.pendingSelection = null;
    }
    document.getElementById('enemy-window').style.display = 'none';
};

// ============= MENU FUNCTIONS =============

// File Menu
window.newCampaign = () => {
    if (confirm('Create new campaign? Unsaved changes will be lost.')) {
        window.editor.nodes = [];
        window.editor.connections = [];
        window.editor.selection = null;
        window.editor.addNode('start');
        window.editor.pushHistory();
        window.editor.renderGraph();
        window.editor.renderInspector();
    }
};

window.loadCampaignFile = async () => {
    const dialog = document.getElementById('load-dialog');
    const loading = document.getElementById('campaigns-loading');
    const list = document.getElementById('campaigns-list');
    const empty = document.getElementById('campaigns-empty');
    
    dialog.style.display = 'flex';
    loading.style.display = 'block';
    list.style.display = 'none';
    empty.style.display = 'none';
    
    try {
        const res = await fetch('/api/campaigns');
        if (!res.ok) throw new Error('Failed to load campaigns');
        
        const campaigns = await res.json();
        loading.style.display = 'none';
        
        if (campaigns.length === 0) {
            empty.style.display = 'block';
            return;
        }
        
        list.style.display = 'block';
        list.innerHTML = '';
        
        campaigns.forEach(campaign => {
            const card = document.createElement('div');
            card.style.cssText = `
                background: #111; border: 1px solid #333; padding: 15px; margin-bottom: 10px;
                cursor: pointer; transition: all 0.2s;
            `;
            card.onmouseenter = () => { card.style.borderColor = 'var(--accent)'; card.style.background = '#1a1a1a'; };
            card.onmouseleave = () => { card.style.borderColor = '#333'; card.style.background = '#111'; };
            
            const metadata = campaign.metadata || {};
            const displayName = metadata.name || campaign.name || campaign.file.replace('.json', '');
            const description = metadata.description || campaign.description || 'No description';
            const author = metadata.author || campaign.author || 'Unknown';
            const nodeCount = campaign.nodeCount || 0;
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div style="font-size: 1.2rem; color: var(--accent); font-weight: bold;">${displayName}</div>
                    <div style="color: #666; font-size: 0.9rem;">${nodeCount} nodes</div>
                </div>
                <div style="color: #aaa; font-size: 0.95rem; margin-bottom: 5px;">${description}</div>
                <div style="color: #666; font-size: 0.85rem;">
                    <i class="fas fa-user"></i> ${author} | 
                    <i class="fas fa-folder"></i> ${campaign.source} | 
                    <i class="fas fa-file"></i> ${campaign.file}
                </div>
            `;
            
            card.onclick = () => loadCampaignByName(campaign.file.replace('.json', ''));
            list.appendChild(card);
        });
    } catch (e) {
        console.error('Failed to load campaigns:', e);
        loading.style.display = 'none';
        empty.style.display = 'block';
        window.editor.showToast('Failed to load campaigns', true, false);
    }
};

async function loadCampaignByName(name) {
    try {
        const res = await fetch(`/api/campaigns/${name}`);
        if (!res.ok) throw new Error('Campaign not found');
        
        const data = await res.json();
        
        // Handle both formats: {metadata, nodes} or just [nodes]
        if (data.nodes && Array.isArray(data.nodes)) {
            window.editor.nodes = data.nodes;
            if (data.metadata) {
                window.editor.campaignMetadata = data.metadata;
                window.editor.campaignName = name;
            }
        } else if (Array.isArray(data)) {
            window.editor.nodes = data;
        } else {
            throw new Error('Invalid campaign format');
        }
        
        window.editor.rebuildConnections();
        window.editor.pushHistory();
        window.editor.renderGraph();
        closeLoadDialog();
        window.editor.showToast(`Campaign "${name}" loaded!`, false, true);
    } catch (e) {
        console.error('Failed to load campaign:', e);
        window.editor.showToast('Failed to load campaign', true, false);
    }
}

function closeLoadDialog() {
    document.getElementById('load-dialog').style.display = 'none';
}

window.exportCampaign = () => {
    const data = JSON.stringify(window.editor.nodes, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaign.json';
    a.click();
    URL.revokeObjectURL(url);
    window.editor.showToast('Campaign exported!', false, true);
};

window.importCampaign = () => {
    document.getElementById('import-file-input').click();
};

window.handleImportFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data)) {
                window.editor.nodes = data;
                window.editor.rebuildConnections();
                window.editor.pushHistory();
                window.editor.renderGraph();
                window.editor.showToast('Campaign imported!', false, true);
            } else {
                throw new Error('Invalid format');
            }
        } catch (err) {
            window.editor.showToast('Invalid campaign file', true, false);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset for re-import
};

// Edit Menu
window.duplicateNode = () => {
    window.editor.copy();
    window.editor.paste();
};

window.deleteSelectedNode = () => {
    if (window.editor.selection) {
        window.editor.deleteNode(window.editor.selection);
    }
};

window.selectAll = () => {
    // For now, just show a message - multi-select would require more work
    window.editor.showToast('Multi-select coming soon!', false, false);
};

// View Menu
window.fitToScreen = () => {
    if (window.editor.nodes.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    window.editor.nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + 200);
        maxY = Math.max(maxY, n.y + 100);
    });
    
    const padding = 100;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const viewW = window.editor.dom.workspace.clientWidth;
    const viewH = window.editor.dom.workspace.clientHeight;
    
    const scale = Math.min(viewW / contentW, viewH / contentH, 1);
    window.editor.transform.scale = scale;
    window.editor.transform.x = -minX * scale + (viewW - contentW * scale) / 2 + padding * scale;
    window.editor.transform.y = -minY * scale + (viewH - contentH * scale) / 2 + padding * scale;
    window.editor.updateTransform();
};

window.centerOnStart = () => {
    const startNode = window.editor.nodes.find(n => n.type === 'start');
    if (startNode) {
        const viewW = window.editor.dom.workspace.clientWidth;
        const viewH = window.editor.dom.workspace.clientHeight;
        window.editor.transform.x = -startNode.x * window.editor.transform.scale + viewW / 2;
        window.editor.transform.y = -startNode.y * window.editor.transform.scale + viewH / 2;
        window.editor.updateTransform();
    } else {
        window.editor.showToast('No START node found', true, false);
    }
};

window.toggleMinimap = () => {
    const minimap = document.getElementById('minimap');
    minimap.style.display = minimap.style.display === 'none' ? 'block' : 'none';
};

window.toggleGrid = () => {
    const workspace = document.getElementById('workspace');
    if (workspace.style.backgroundImage === 'none') {
        workspace.style.backgroundImage = 'radial-gradient(#222 1px, transparent 1px)';
    } else {
        workspace.style.backgroundImage = 'none';
    }
};

// Tools Menu
window.showStatistics = () => {
    const nodes = window.editor.nodes;
    const stats = {
        total: nodes.length,
        start: nodes.filter(n => n.type === 'start').length,
        level: nodes.filter(n => n.type === 'level').length,
        dialogue: nodes.filter(n => n.type === 'dialogue').length,
        cutscene: nodes.filter(n => n.type === 'cutscene').length,
        quest: nodes.filter(n => n.type === 'quest').length,
        battle: nodes.filter(n => n.type === 'battle').length,
        branch: nodes.filter(n => n.type === 'branch').length,
        reward: nodes.filter(n => n.type === 'reward').length,
        variable: nodes.filter(n => n.type === 'variable').length,
        other: nodes.filter(n => ['comment', 'group', 'random', 'wait'].includes(n.type)).length
    };
    
    const content = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div style="padding:15px; background:#111; border:1px solid #333;">
                <div style="color:var(--accent); font-size:2rem; font-weight:bold;">${stats.total}</div>
                <div style="color:#888;">Total Nodes</div>
            </div>
            <div style="padding:15px; background:#111; border:1px solid #333;">
                <div style="color:#2ecc71; font-size:2rem; font-weight:bold;">${stats.level}</div>
                <div style="color:#888;">Levels</div>
            </div>
        </div>
        <table style="width:100%; margin-top:15px; border-collapse:collapse;">
            <tr style="border-bottom:1px solid #333;"><td style="padding:8px; color:#888;">Start Nodes</td><td style="text-align:right; color:#fff;">${stats.start}</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:8px; color:#888;">Dialogues</td><td style="text-align:right; color:#fff;">${stats.dialogue}</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:8px; color:#888;">Cutscenes</td><td style="text-align:right; color:#fff;">${stats.cutscene}</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:8px; color:#888;">Quests</td><td style="text-align:right; color:#fff;">${stats.quest}</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:8px; color:#888;">Battles</td><td style="text-align:right; color:#fff;">${stats.battle}</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:8px; color:#888;">Branches</td><td style="text-align:right; color:#fff;">${stats.branch}</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:8px; color:#888;">Rewards</td><td style="text-align:right; color:#fff;">${stats.reward}</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:8px; color:#888;">Variables</td><td style="text-align:right; color:#fff;">${stats.variable}</td></tr>
            <tr><td style="padding:8px; color:#888;">Other</td><td style="text-align:right; color:#fff;">${stats.other}</td></tr>
        </table>
    `;
    showModal('Campaign Statistics', content);
};

// Help Menu
window.showShortcuts = () => {
    const content = `
        <table style="width:100%; border-collapse:collapse;">
            <tr style="border-bottom:1px solid #333;"><td style="padding:10px;"><kbd style="background:#222; padding:3px 8px; border:1px solid #444;">Ctrl+S</kbd></td><td style="color:#ccc;">Save Campaign</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:10px;"><kbd style="background:#222; padding:3px 8px; border:1px solid #444;">Ctrl+Z</kbd></td><td style="color:#ccc;">Undo</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:10px;"><kbd style="background:#222; padding:3px 8px; border:1px solid #444;">Ctrl+Y</kbd></td><td style="color:#ccc;">Redo</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:10px;"><kbd style="background:#222; padding:3px 8px; border:1px solid #444;">Ctrl+C</kbd></td><td style="color:#ccc;">Copy Node</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:10px;"><kbd style="background:#222; padding:3px 8px; border:1px solid #444;">Ctrl+V</kbd></td><td style="color:#ccc;">Paste Node</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:10px;"><kbd style="background:#222; padding:3px 8px; border:1px solid #444;">Delete</kbd></td><td style="color:#ccc;">Delete Node</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:10px;"><kbd style="background:#222; padding:3px 8px; border:1px solid #444;">Mouse Wheel</kbd></td><td style="color:#ccc;">Zoom In/Out</td></tr>
            <tr style="border-bottom:1px solid #333;"><td style="padding:10px;"><kbd style="background:#222; padding:3px 8px; border:1px solid #444;">Click + Drag</kbd></td><td style="color:#ccc;">Pan Canvas</td></tr>
            <tr><td style="padding:10px;"><kbd style="background:#222; padding:3px 8px; border:1px solid #444;">Right Click</kbd></td><td style="color:#ccc;">Context Menu</td></tr>
        </table>
    `;
    showModal('Keyboard Shortcuts', content);
};

window.showNodeHelp = () => {
    const content = `
        <div style="max-height:400px; overflow-y:auto;">
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #2ecc71;">
                <strong style="color:#2ecc71;">START</strong><br>
                <span style="color:#888;">Entry point of your campaign. Every campaign needs exactly one START node.</span>
            </div>
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #3498db;">
                <strong style="color:#3498db;">LEVEL</strong><br>
                <span style="color:#888;">Load a map/level for the player to explore. Connect to next node for progression.</span>
            </div>
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #9b59b6;">
                <strong style="color:#9b59b6;">BRANCH (IF)</strong><br>
                <span style="color:#888;">Conditional branching based on game variables. Has TRUE and FALSE outputs.</span>
            </div>
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #fff;">
                <strong style="color:#fff;">DIALOGUE</strong><br>
                <span style="color:#888;">Display text/dialogue to the player.</span>
            </div>
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #1abc9c;">
                <strong style="color:#1abc9c;">CUTSCENE</strong><br>
                <span style="color:#888;">Play an interactive cutscene created in Cutscene Studio.</span>
            </div>
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #9b59b6;">
                <strong style="color:#9b59b6;">QUEST</strong><br>
                <span style="color:#888;">Start, complete, or fail a quest from the Quest Editor.</span>
            </div>
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #e74c3c;">
                <strong style="color:#e74c3c;">BATTLE</strong><br>
                <span style="color:#888;">Initiate combat with selected enemies.</span>
            </div>
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #f1c40f;">
                <strong style="color:#f1c40f;">REWARD</strong><br>
                <span style="color:#888;">Give items to the player.</span>
            </div>
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #e67e22;">
                <strong style="color:#e67e22;">VARIABLE</strong><br>
                <span style="color:#888;">Set a game variable/flag to true or false.</span>
            </div>
            <div style="margin-bottom:15px; padding:10px; background:#111; border-left:3px solid #e67e22;">
                <strong style="color:#e67e22;">RANDOM</strong><br>
                <span style="color:#888;">Random branching with percentage chance.</span>
            </div>
            <div style="padding:10px; background:#111; border-left:3px solid #95a5a6;">
                <strong style="color:#95a5a6;">WAIT</strong><br>
                <span style="color:#888;">Pause execution for specified seconds.</span>
            </div>
        </div>
    `;
    showModal('Node Reference', content);
};

window.showAbout = () => {
    const content = `
        <div style="text-align:center; padding:20px;">
            <i class="fas fa-project-diagram" style="font-size:4rem; color:var(--accent); margin-bottom:15px;"></i>
            <h2 style="color:var(--accent); margin:10px 0;">CAMPAIGN STUDIO</h2>
            <p style="color:#888;">Version 7.0</p>
            <p style="color:#ccc; margin:20px 0;">
                Visual campaign flow editor for Ongonluk Engine.<br>
                Create branching storylines, connect levels, and design<br>
                your game's progression with ease.
            </p>
            <div style="border-top:1px solid #333; padding-top:15px; margin-top:15px;">
                <p style="color:#666; font-size:0.9rem;">Part of the Ongonluk Game Development Suite</p>
            </div>
        </div>
    `;
    showModal('About', content);
};

// Modal Helpers
window.showModal = (title, content) => {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('modal-overlay').style.display = 'block';
    document.getElementById('modal-dialog').style.display = 'block';
};

window.closeModal = () => {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('modal-dialog').style.display = 'none';
};

// Additional keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
        e.preventDefault();
        runCampaign();
    }
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        newCampaign();
    }
    if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        loadCampaignFile();
    }
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        duplicateNode();
    }
    if (e.key === 'Escape') {
        closeModal();
        closeSaveDialog();
        toggleMetadataWindow();
    }
});

// ================== METADATA & SAVE DIALOGS ==================

function toggleMetadataWindow() {
    const win = document.getElementById('metadata-window');
    const isVisible = win.style.display !== 'none';
    
    if (!isVisible) {
        // Populate with current metadata
        document.getElementById('metadata-campaign-name').value = window.editor.campaignName;
        document.getElementById('metadata-display-name').value = window.editor.campaignMetadata.name;
        document.getElementById('metadata-description').value = window.editor.campaignMetadata.description || '';
        document.getElementById('metadata-author').value = window.editor.campaignMetadata.author || '';
        document.getElementById('metadata-version').value = window.editor.campaignMetadata.version || '1.0.0';
    }
    
    win.style.display = isVisible ? 'none' : 'flex';
}

function saveMetadata() {
    const campaignName = document.getElementById('metadata-campaign-name').value.trim();
    const displayName = document.getElementById('metadata-display-name').value.trim();
    const description = document.getElementById('metadata-description').value.trim();
    const author = document.getElementById('metadata-author').value.trim();
    const version = document.getElementById('metadata-version').value.trim();
    
    if (!campaignName) {
        alert('Campaign name is required!');
        return;
    }
    
    // Validate campaign name (alphanumeric and underscores only)
    if (!/^[a-z0-9_]+$/.test(campaignName)) {
        alert('Campaign name must be lowercase letters, numbers, and underscores only!');
        return;
    }
    
    // Update editor metadata
    window.editor.campaignName = campaignName;
    window.editor.campaignMetadata = {
        name: displayName || campaignName,
        description: description,
        author: author,
        version: version || '1.0.0'
    };
    
    // Update UI
    updateCampaignInfo();
    
    // Close dialog
    toggleMetadataWindow();
    
    window.editor.showToast('Metadata updated!', false, true);
}

function openSaveDialog() {
    const dialog = document.getElementById('save-dialog');
    const input = document.getElementById('save-campaign-name');
    const warning = document.getElementById('save-warning');
    
    // Pre-fill with current campaign name
    input.value = window.editor.campaignName;
    
    // Check if campaign exists
    checkCampaignExists(input.value);
    
    // Add input listener to update warning
    input.oninput = () => {
        checkCampaignExists(input.value.trim());
    };
    
    dialog.style.display = 'flex';
}

function closeSaveDialog() {
    document.getElementById('save-dialog').style.display = 'none';
}

async function checkCampaignExists(name) {
    if (!name) {
        document.getElementById('save-warning').style.display = 'none';
        return;
    }
    
    try {
        const res = await fetch(`/api/campaigns/${name}`);
        document.getElementById('save-warning').style.display = res.ok ? 'block' : 'none';
    } catch(e) {
        document.getElementById('save-warning').style.display = 'none';
    }
}

async function confirmSave() {
    const campaignName = document.getElementById('save-campaign-name').value.trim();
    
    if (!campaignName) {
        alert('Campaign name is required!');
        return;
    }
    
    // Validate campaign name
    if (!/^[a-z0-9_]+$/.test(campaignName)) {
        alert('Campaign name must be lowercase letters, numbers, and underscores only!');
        return;
    }
    
    // Update campaign name
    window.editor.campaignName = campaignName;
    
    // Close dialog
    closeSaveDialog();
    
    // Perform save
    await window.editor.save();
    
    // Update UI
    updateCampaignInfo();
}

function updateCampaignInfo() {
    // Update toolbar/status with current campaign info
    const statusBar = document.querySelector('#toolbar');
    if (statusBar) {
        let infoDiv = document.getElementById('campaign-info-display');
        if (!infoDiv) {
            infoDiv = document.createElement('div');
            infoDiv.id = 'campaign-info-display';
            infoDiv.style.cssText = 'color:#aaa; font-size:0.9rem; margin-left:15px;';
            statusBar.insertBefore(infoDiv, statusBar.firstChild);
        }
        infoDiv.innerHTML = `<i class="fas fa-file"></i> ${window.editor.campaignMetadata.name || window.editor.campaignName}`;
    }
}

// Update the save function to use the new dialog
window.saveToServer = () => {
    openSaveDialog();
};

// Add new global function
window.editCampaignMetadata = () => {
    toggleMetadataWindow();
};

// Initialize campaign info display on load
setTimeout(() => {
    if (window.editor) {
        updateCampaignInfo();
    }
}, 500);