// editor.js - Advanced Level Editor Logic
class WorldEditor {
    constructor() {
        
        // --- STATE ---
        const CONFIG = {
            tileSize: 16,
            scale: 2, 
            minScale: 0.5,
            maxScale: 6,
            tilesetSrc: 'WORLD_PIXEL_ART',
            cols: 16
        };
        
        let map = {
            width: 30,
            height: 20,
            type: 'topdown',
            tilesetPath: 'WORLD_PIXEL_ART',
            layers: [],
            collision: [],
            decorations: [], // {x, y, type, data}
            spawn: {x: 5, y: 5},
            exit: null,
            weather: 'none',
            lighting: 'day'
        };
        
        let editorState = {
            mode: 'visual',
            tool: 'pen',
            selectedTileID: 1,
            selectedProp: 'spawn',
            selectedPrefab: null,
            activeLayer: 0,
            isDrawing: false,
            tilesetReady: false,
            history: [],
            historyIndex: -1,
            prefabCache: {},
            dragStart: null,
            dragEnd: null,
            fillRect: true,
            selectedCollisionType: 1,  // Default: Solid (Shadowed)
            currentFilename: null  // Track current file for Save vs Save As
        };
        
        // Collision Type Definitions
        const COLLISION_TYPES = {
            0: { name: 'Passable', color: 'transparent', key: '0' },
            1: { name: 'Solid (Shadowed)', color: 'rgba(231, 76, 60, 0.5)', key: '1' },
            2: { name: 'Shadowless Wall', color: 'rgba(52, 152, 219, 0.5)', key: '2' },
            3: { name: 'Half-Height', color: 'rgba(255, 0, 0, 0.5)', key: '3' },
            4: { name: 'One-Way Up', color: 'rgba(46, 204, 113, 0.5)', arrow: '↑', key: '4' },
            5: { name: 'One-Way Down', color: 'rgba(46, 204, 113, 0.5)', arrow: '↓', key: '5' },
            6: { name: 'One-Way Left', color: 'rgba(46, 204, 113, 0.5)', arrow: '←', key: '6' },
            7: { name: 'One-Way Right', color: 'rgba(46, 204, 113, 0.5)', arrow: '→', key: '7' },
            8: { name: 'Trigger Zone', color: 'rgba(155, 89, 182, 0.4)', dashed: true, key: '8' }
        };
        
        // --- DOM ---
        let canvas, ctx, paletteGrid, previewCanvas, prCtx;
        function initDOM() {
            canvas = document.getElementById('editorCanvas');
            if (canvas) ctx = canvas.getContext('2d');
            paletteGrid = document.getElementById('palette-grid');
            previewCanvas = document.getElementById('selected-tile-preview');
            if (previewCanvas) prCtx = previewCanvas.getContext('2d');
        }
        let tileset = new Image();
        const PLAYTEST_WINDOW_NAME = 'redglitch_topdown_playtest';
        let playtestWindowRef = null;
            
            // Periodically clean up closed playtest windows
            setInterval(() => {
                if (playtestWindowRef && playtestWindowRef.closed) {
                    playtestWindowRef = null;
                }
            }, 1000);
        let playtestLaunchLocked = false;
        
        // --- INIT ---
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
        
        // Integration system references
        let eventBus, projectState, studioBridge;
        
        function initializeWorldIntegration() {
            initDOM();
            if (typeof window !== 'undefined') {
                eventBus = window.RedGlitchEventBus;
                projectState = window.RedGlitchProjectState;
                
                if (eventBus) {
                    // Initialize StudioBridge for IRAB
                    if (window.StudioBridge) {
                        studioBridge = new window.StudioBridge('world', eventBus);
                        registerWorldTools();
                    }
        
                    // Phase 9: Thought Visualization
                    eventBus.on('studio:visual:ghost', (data) => {
                        editorState.aiGhost = data;
                        render();
                    });
        
                    eventBus.on('studio:visual:clear', () => {
                        editorState.aiGhost = null;
                        render();
                    });
        
                    console.log('[WorldEditor] EventBus connected');
                }
            }
        }
        
        /**
         * Register IRAB tools for World Builder
         */
        function registerWorldTools() {
            // world.spawn
            studioBridge.register({
                name: 'spawn',
                description: 'Spawn an entity, NPC, or prop at specific coordinates.',
                securityLevel: 'low-risk',
                parameters: {
                    type: 'object',
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                        type: { type: 'string', description: 'Type of entity (npc, enemy, chest, tree, etc.)' },
                        data: { type: 'string', description: 'Optional ID or data for the entity' }
                    },
                    required: ['x', 'y', 'type']
                },
                execute: async (args) => {
                    const { x, y, type, data } = args;
                    // Remove existing at this spot
                    map.decorations = map.decorations.filter(d => d.x !== x || d.y !== y);
                    
                    if (type === 'spawn') {
                        map.spawn = { x, y };
                    } else if (type === 'exit') {
                        map.exit = { x, y, data: data || "" };
                    } else {
                        map.decorations.push({ x, y, type, data: data || "" });
                    }
                    render();
                    return { success: true };
                }
            });
        
            // world.setTile
            studioBridge.register({
                name: 'setTile',
                description: 'Set a specific tile ID at map coordinates.',
                securityLevel: 'low-risk',
                parameters: {
                    type: 'object',
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                        tileID: { type: 'number' },
                        layer: { type: 'number', default: 0 }
                    },
                    required: ['x', 'y', 'tileID']
                },
                execute: async (args) => {
                    const { x, y, tileID, layer } = args;
                    if (x < 0 || x >= map.width || y < 0 || y >= map.height) throw new Error("Out of bounds");
                    
                    const targetLayer = layer || 0;
                    if (!map.layers[targetLayer]) {
                        while(map.layers.length <= targetLayer) {
                            map.layers.push(new Array(map.width * map.height).fill(null));
                        }
                    }
                    
                    map.layers[targetLayer][y * map.width + x] = tileID;
                    render();
                    return { success: true };
                }
            });
        
            // world.drawRect
            studioBridge.register({
                name: 'drawRect',
                description: 'Fill a rectangular area with a specific tile.',
                securityLevel: 'low-risk',
                parameters: {
                    type: 'object',
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                        w: { type: 'number' },
                        h: { type: 'number' },
                        tileID: { type: 'number' },
                        layer: { type: 'number', default: 0 }
                    },
                    required: ['x', 'y', 'w', 'h', 'tileID']
                },
                execute: async (args) => {
                    const { x, y, w, h, tileID, layer } = args;
                    const targetLayer = layer || 0;
                    
                    for (let iy = y; iy < y + h; iy++) {
                        for (let ix = x; ix < x + w; ix++) {
                            if (ix >= 0 && ix < map.width && iy >= 0 && iy < map.height) {
                                map.layers[targetLayer][iy * map.width + ix] = tileID;
                            }
                        }
                    }
                    render();
                    return { success: true };
                }
            });
        
            // world.save
            studioBridge.register({
                name: 'save',
                description: 'Save the current world to the server.',
                securityLevel: 'low-risk',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Optional name to save as.' }
                    }
                },
                execute: async (args) => {
                    if (args.name) {
                        document.getElementById('level-name').value = args.name;
                    }
                    await saveToServer(false);
                    return { success: true, message: `World ${map.name} saved.` };
                }
            });
        
            // world.generateMap
            studioBridge.register({
                name: 'generateMap',
                description: 'Generate a procedural top-down RPG map using the built-in generator.',
                securityLevel: 'low-risk',
                parameters: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['village', 'dungeon', 'hell', 'heaven', 'lab'], description: 'Map type/biome.', default: 'village' },
                        density: { type: 'number', description: 'Generation density 1-10.', default: 5 },
                        seed: { type: 'string', description: 'Optional seed for reproducible maps.' }
                    }
                },
                execute: async (args) => {
                    const typeSelect = document.getElementById('gen-type');
                    const densityInput = document.getElementById('gen-density');
                    const seedInput = document.getElementById('gen-seed');
                    if (typeSelect && args.type) typeSelect.value = args.type;
                    if (densityInput && args.density) densityInput.value = args.density;
                    if (seedInput && args.seed) seedInput.value = args.seed;
                    if (typeof window.generateMap === 'function') {
                        window.generateMap();
                        return { success: true, message: `Generated ${args.type || 'village'} map.` };
                    }
                    throw new Error('Map generator not loaded');
                }
            });
        }
        
        // AI tool message listener for cross-frame dispatch
        window.addEventListener('message', async (event) => {
            if (!event.data || event.data.type !== 'ai:tool') return;
            const { name, id, args } = event.data;
        
            if (name === 'generateMap' || name === 'world.generateMap') {
                console.log('[WorldEditor] Received ai:tool postMessage:', name, args);
                localStorage.removeItem('ai_pending_action');
                if (window._topdownAIGenerate) {
                    window._topdownAIGenerate(args || {});
                } else {
                    // Fallback: set DOM values and call generateMap directly
                    const typeSelect = document.getElementById('gen-type');
                    const densityInput = document.getElementById('gen-density');
                    const seedInput = document.getElementById('gen-seed');
                    if (typeSelect && args && args.type) typeSelect.value = args.type;
                    if (densityInput && args && args.density) densityInput.value = args.density;
                    if (seedInput && args && args.seed) seedInput.value = args.seed;
                    if (typeof window.generateMap === 'function') window.generateMap();
                }
                if (window.parent !== window) {
                    window.parent.postMessage({ type: 'ai:tool:success', id, result: { success: true } }, '*');
                }
            }
        });
        
        function _topdownPendingCheck() {
            const raw = localStorage.getItem('ai_pending_action');
            if (!raw) return;
            try {
                const action = JSON.parse(raw);
                if (!action || !action.method) return;
                const age = Date.now() - (action.timestamp || 0);
                if (age > 60000) { localStorage.removeItem('ai_pending_action'); return; }
                if (action.method === 'world.generateMap' || action.method === 'topdown.generateMap' || action.method === 'rpg.generateMap') {
                    localStorage.removeItem('ai_pending_action');
                    console.log('[WorldEditor] Recovering AI pending action:', action.params);
                    if (window._topdownAIGenerate) {
                        window._topdownAIGenerate(action.params || {});
                    }
                }
            } catch (e) {
                console.error('[WorldEditor] Pending action recovery failed:', e);
            }
        }
        
        // Listen for localStorage changes from assistant iframe
        window.addEventListener('storage', (e) => {
            if (e.key === 'ai_pending_action' && e.newValue) {
                console.log('[WorldEditor] Storage event: new pending action detected');
                setTimeout(() => _topdownPendingCheck(), 200);
            }
        });
        
        window.onload = async () => {
            initializeWorldIntegration();
            updateProgress(10, "CONNECTING INTERFACES...");
            
            document.getElementById('tile-search').addEventListener('input', (e) => filterPalette(e.target.value));
            document.getElementById('tileset-selector').addEventListener('change', (e) => changeTileset(e.target.value));
            document.getElementById('custom-tileset-path').addEventListener('change', (e) => changeTileset(e.target.value));
            
            // File IO Listeners
            document.getElementById('file-input').addEventListener('change', loadLevelFromFile);
            document.getElementById('btn-save-server').onclick = () => saveToServer(false);
            document.getElementById('btn-save-as').onclick = () => saveToServer(true);
            document.getElementById('btn-download').onclick = downloadJSON;
            document.getElementById('btn-clear').onclick = () => { if(confirm("Clear map?")) initMap(map.width, map.height); };
            
            updateProgress(30, "LOADING TEXTURE ATLAS...");
            await loadTileset(map.tilesetPath);
            
            updateProgress(50, "INITIALIZING MAP DATA...");
            initMap(30, 20);
            
            updateProgress(60, "BOOTING FX SYSTEM...");
            window.fx = new FXSystem(ctx, canvas.width, canvas.height);
            
            updateProgress(70, "INDEXING ACTORS...");
            await loadActors();
            
            updateProgress(85, "SCANNING PREFABS...");
            await loadPrefabs();
            
            // Check if function exists before calling
            if (typeof loadLevelList === 'function') {
                updateProgress(90, "FETCHING SERVER LEVELS...");
                await loadLevelList();
            }
            
            updateLayerList();
            updateZoomUI();
            render();
            loop();
            
            // Real-time Level List Update
            setInterval(() => {
                if (typeof loadLevelList === 'function') loadLevelList();
            }, 5000);
            
            updateProgress(100, "READY");
        
            // --- AI Generation Helper ---
            window._topdownAIGenerate = (params) => {
                console.log('[WorldEditor] AI generating map:', params);
                const typeSelect = document.getElementById('gen-type');
                const densityInput = document.getElementById('gen-density');
                const seedInput = document.getElementById('gen-seed');
                if (typeSelect && params.type) typeSelect.value = params.type;
                if (densityInput && params.density) densityInput.value = params.density;
                if (seedInput && params.seed) seedInput.value = params.seed;
                if (typeof window.generateMap === 'function') {
                    window.generateMap();
                    console.log('[WorldEditor] AI map generated!');
                } else {
                    console.error('[WorldEditor] generateMap function not available');
                }
            };
        
            // Check for pending AI action immediately
            _topdownPendingCheck();
        
            // Add Keyboard Shortcut for Save
            document.addEventListener('keydown', (e) => {
                // Save (Ctrl+S)
                if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
                    e.preventDefault();
                    console.log("Ctrl+S detected. Triggering save...");
                    saveToServer(false); // Quick save
                    if (window.parent && window.parent.RedGlitchEventBus) {
                        window.parent.RedGlitchEventBus.emit('system:project:save_request');
                    }
                }
                
                // Save As (Ctrl+Shift+S)
                if ((e.ctrlKey || e.metaKey) && e.key === 'S' && e.shiftKey) {
                    e.preventDefault();
                    console.log("Ctrl+Shift+S detected. Triggering Save As...");
                    saveToServer(true); // Save As
                }
                
                // Collision type shortcuts (0-8 keys) when in collision mode
                if (editorState.mode === 'collision' && !e.ctrlKey && !e.altKey) {
                    const key = e.key;
                    if (key >= '0' && key <= '8') {
                        const type = parseInt(key);
                        if (COLLISION_TYPES[type]) {
                            e.preventDefault();
                            selectCollisionType(type);
                        }
                    }
                }
            });
            
            // Initialize prop buttons
            initPropButtons();
        };
        
        function loop() {
            if (window.fx) { window.fx.update(); render(); }
            requestAnimationFrame(loop);
        }
        
        // --- UI UTILS ---
        function initPropButtons() {
            // Attach event listeners to prop buttons
            document.querySelectorAll('.prop-btn[data-type]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const propType = btn.getAttribute('data-type');
                    selectProp(propType);
                });
            });
            
            // NPC placement
            const btnAddNpc = document.getElementById('btn-add-npc');
            if (btnAddNpc) {
                btnAddNpc.addEventListener('click', () => {
                    selectProp('npc');
                });
            }
            
            // Enemy placement
            const btnAddEnemy = document.getElementById('btn-add-enemy');
            if (btnAddEnemy) {
                btnAddEnemy.addEventListener('click', () => {
                    selectProp('enemy');
                });
            }
        }
        
        function selectProp(propType) {
            editorState.selectedProp = propType;
            
            // Update UI to show selected prop
            document.querySelectorAll('.prop-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            const btn = document.querySelector(`.prop-btn[data-type="${propType}"]`);
            if (btn) btn.classList.add('active');
            
            // Show selection feedback
            console.log(`Selected prop: ${propType}`);
            
            // Auto-switch to props mode if not already
            if (editorState.mode !== 'props') {
                setMode('props');
            }
            
            // Auto-switch to pen tool
            setTool('pen');
        }
        window.selectProp = selectProp;
        
        function toggleSection(header) {
            const section = header.parentElement;
            section.classList.toggle('collapsed');
        }
        window.toggleSection = toggleSection;
        
        // Close flyouts on outside click
        window.addEventListener('mousedown', (e) => {
            const rectSettings = document.getElementById('rect-settings');
            const rectBtn = document.getElementById('tool-rect');
            
            if (rectSettings && rectSettings.style.display === 'block') {
                if (!rectSettings.contains(e.target) && !rectBtn.contains(e.target)) {
                    rectSettings.style.display = 'none';
                }
            }
        });
        
        // --- LOAD LEVEL LIST ---
        function findNextLevelName(files) {
            let max = 0;
            files.forEach(f => {
                const match = f.match(/level(\d+)/i);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > max) max = num;
                }
            });
            return `level${max + 1}`;
        }
        
        async function loadLevelList() {
            try {
                const res = await fetch('/api/files/levels');
                if (res.ok) {
                    const files = await res.json();
                    
                    // 1. Floating Window List with Delete Buttons
                    const list = document.getElementById('level-list');
                    if (list) {
                        list.innerHTML = '';
                        files.forEach(f => {
                            const div = document.createElement('div');
                            div.style.cssText = "padding:8px; border-bottom:1px solid #333; display:flex; align-items:center; gap:8px;";
                            
                            // Level name (clickable to load)
                            const nameSpan = document.createElement('span');
                            nameSpan.style.cssText = "flex-grow:1; cursor:pointer; color:#ccc;";
                            nameSpan.innerText = f.replace('.json', '');
                            nameSpan.onclick = () => loadLevelFromServer(f);
                            nameSpan.onmouseover = () => nameSpan.style.color = '#fff';
                            nameSpan.onmouseout = () => nameSpan.style.color = '#ccc';
                            
                            // Delete button
                            const deleteBtn = document.createElement('button');
                            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                            deleteBtn.style.cssText = "background:#c0392b; border:1px solid #e74c3c; color:#fff; padding:4px 8px; cursor:pointer; font-size:0.8rem; border-radius:3px;";
                            deleteBtn.title = "Delete this level";
                            deleteBtn.onclick = (e) => {
                                e.stopPropagation();
                                deleteLevel(f.replace('.json', ''));
                            };
                            deleteBtn.onmouseover = () => deleteBtn.style.background = '#e74c3c';
                            deleteBtn.onmouseout = () => deleteBtn.style.background = '#c0392b';
                            
                            div.appendChild(nameSpan);
                            div.appendChild(deleteBtn);
                            list.appendChild(div);
                        });
                    }
        
                    // 2. Sidebar List with Delete Buttons (New)
                    const sidebarList = document.getElementById('sidebar-level-list');
                    if (sidebarList) {
                        sidebarList.innerHTML = '';
                        files.forEach(f => {
                            const div = document.createElement('div');
                            div.style.cssText = "padding:8px; border-bottom:1px solid #222; display:flex; align-items:center; gap:8px;";
                            
                            // Icon and name (clickable)
                            const nameContainer = document.createElement('div');
                            nameContainer.style.cssText = "flex-grow:1; cursor:pointer; color:#aaa; font-size:0.9rem; display:flex; align-items:center; gap:8px;";
                            nameContainer.innerHTML = `<i class="fas fa-file-code" style="font-size:0.7rem; color:#555;"></i> <span>${f.replace('.json', '')}</span>`;
                            nameContainer.onclick = () => loadLevelFromServer(f);
                            nameContainer.onmouseover = () => nameContainer.style.color = '#fff';
                            nameContainer.onmouseout = () => nameContainer.style.color = '#aaa';
                            
                            // Delete button
                            const deleteBtn = document.createElement('button');
                            deleteBtn.innerHTML = '<i class="fas fa-trash" style="font-size:0.7rem;"></i>';
                            deleteBtn.style.cssText = "background:transparent; border:1px solid #555; color:#888; padding:3px 6px; cursor:pointer; font-size:0.7rem; border-radius:2px;";
                            deleteBtn.title = "Delete";
                            deleteBtn.onclick = (e) => {
                                e.stopPropagation();
                                deleteLevel(f.replace('.json', ''));
                            };
                            deleteBtn.onmouseover = () => { deleteBtn.style.borderColor = '#e74c3c'; deleteBtn.style.color = '#e74c3c'; };
                            deleteBtn.onmouseout = () => { deleteBtn.style.borderColor = '#555'; deleteBtn.style.color = '#888'; };
                            
                            div.appendChild(nameContainer);
                            div.appendChild(deleteBtn);
                            sidebarList.appendChild(div);
                        });
                    }
        
                    // 3. Auto-Name Logic (Only if name is currently default/empty)
                    const nameInput = document.getElementById('level-name');
                    if (nameInput && (nameInput.value === 'level1' || nameInput.value === 'unnamed' || nameInput.value === '')) {
                        nameInput.value = findNextLevelName(files);
                    }
                }
            } catch (e) { console.warn("Failed to load level list", e); }
        }
        window.loadLevelList = loadLevelList;
        
        // --- PREFABS ---
        async function loadPrefabs(forceScan = false) {
            try {
                if (forceScan) {
                    console.log("Triggering manual asset scan...");
                    await fetch('/api/assets/scan', { method: 'POST' });
                }
        
                // Cache-buster to ensure we get fresh results
                let assetsRes = await fetch('/api/assets/list?t=' + Date.now());
                let assets = await assetsRes.json();
                
                console.log(`Loaded ${assets.length} total assets.`);
        
                // Auto-scan if no assets found
                if (assets.length === 0 && !forceScan) {
                    console.log("No assets indexed. Triggering auto-scan...");
                    await fetch('/api/assets/scan', { method: 'POST' });
                    assetsRes = await fetch('/api/assets/list?t=' + Date.now());
                    assets = await assetsRes.json();
                }
        
                const prefabs = assets.filter(a => {
                    const p = a.path.toLowerCase();
                    const n = a.name.toLowerCase();
                    const isJson = n.endsWith('.json');
                    const isDefinition = p.includes('definitions');
                    // Explicitly include our known prefabs
                    const isCustomPrefab = ['soldier','archer','goblin','orc','ghost','skeleton','slime','boss_demon','villager_man','villager_woman','chest_wood','chest_gold','health_font','save_shrine','door_locked','lever_switch','spikes_trap','merchant','camp_fire','potted_plant'].some(name => n.startsWith(name));
                    const isSystem = ['enemies.json', 'npcs.json', 'skills.json', 'items.json', 'campaign.json', 'dialogues.json', 'music.json', 'ui.json', 'achievements.json', 'locales.json', 'animations.json'].includes(n);
                    
                    return isJson && (isDefinition || isCustomPrefab) && !isSystem;
                });
                
                console.log(`Filtered ${prefabs.length} prefabs.`);
        
                const list = document.getElementById('prefab-list');
                if(list) {
                    list.innerHTML = '';
                    prefabs.forEach(p => {
                        const div = document.createElement('div');
                        div.style.cssText = "padding:8px; border-bottom:1px solid #333; cursor:pointer; color:#ccc;";
                        div.innerHTML = `🧩 ${p.name.replace('.json','')}`;
                        div.onclick = () => selectPrefab(p.name);
                        list.appendChild(div);
                    });
                }
            } catch(e) { console.log("Prefab list error", e); }
        }
        window.loadPrefabs = loadPrefabs;
        
        async function selectPrefab(filename) {
            editorState.selectedPrefab = filename;
            Array.from(document.getElementById('prefab-list').children).forEach(el => {
                el.style.background = el.innerText.includes(filename.replace('.json','')) ? '#2ecc71' : 'transparent';
                el.style.color = el.innerText.includes(filename.replace('.json','')) ? '#000' : '#ccc';
            });
            
            if (!editorState.prefabCache[filename]) {
                try {
                    const res = await fetch(`dunyalar/definitions/${filename}`);
                    if(res.ok) editorState.prefabCache[filename] = await res.json();
                } catch(e) {}
            }
        }
        
        // --- RENDER ---
        function render() {
            if (!editorState.tilesetReady) return;
            const ts = CONFIG.tileSize * CONFIG.scale;
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = (map.type === 'platformer') ? '#1a1a1a' : '#111';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        
            if (map.type === 'isometric') renderIsometric(ts);
            else renderStandard(ts);
        
            if (document.getElementById('show-grid').checked) {
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.beginPath();
                for (let x = 0; x <= map.width; x++) { ctx.moveTo(x*ts, 0); ctx.lineTo(x*ts, canvas.height); }
                for (let y = 0; y <= map.height; y++) { ctx.moveTo(0, y*ts); ctx.lineTo(canvas.width, y*ts); }
                ctx.stroke();
            }
        
            // Tool Previews (Rect)
            if (editorState.isDrawing && editorState.tool === 'rect' && editorState.dragStart && editorState.dragEnd) {
                const x = Math.min(editorState.dragStart.x, editorState.dragEnd.x) * ts;
                const y = Math.min(editorState.dragStart.y, editorState.dragEnd.y) * ts;
                const w = (Math.abs(editorState.dragEnd.x - editorState.dragStart.x) + 1) * ts;
                const h = (Math.abs(editorState.dragEnd.y - editorState.dragStart.y) + 1) * ts;
                
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                
                if (editorState.fillRect) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                    ctx.fillRect(x, y, w, h);
                }
                ctx.strokeRect(x, y, w, h);
            }
        }
        
        function renderStandard(ts) {
            const totalCols = Math.floor(tileset.width / 16);
            // Render all layers in order
            map.layers.forEach((layer, layerIdx) => {
                if (!layer) return;
                if (map.layerProps && map.layerProps[layerIdx] && !map.layerProps[layerIdx].visible) return; // VISIBILITY CHECK
        
                for (let i = 0; i < layer.length; i++) {
                    const tileID = layer[i];
                    if (tileID === null || tileID === undefined) continue;
                    const x = (i % map.width) * ts;
                    const y = Math.floor(i / map.width) * ts;
                    const sx = (tileID % totalCols) * 16;
                    const sy = Math.floor(tileID / totalCols) * 16;
                    ctx.drawImage(tileset, sx, sy, 16, 16, x, y, ts, ts);
                }
            });
        
            if (window.fx) {
                const mapWrapper = {
                    width: map.width, height: map.height, collisionMap: map.collision,
                    isSolid: (x,y) => {
                        const c = Math.floor(x/(16*CONFIG.scale)); const r = Math.floor(y/(16*CONFIG.scale));
                        if(c<0||c>=map.width||r<0||r>=map.height) return true;
                        return map.collision[r*map.width+c]===1;
                    }
                };
                window.fx.renderShadows(mapWrapper, 0, 0, CONFIG.scale);
                window.fx.setWeather(map.weather); window.fx.setLighting(map.lighting);
                window.fx.renderWeather(0, 0);
            }
        
            if (document.getElementById('show-collision').checked || editorState.mode === 'collision') {
                for (let i = 0; i < map.collision.length; i++) {
                    const collType = map.collision[i];
                    if (collType !== 0 && COLLISION_TYPES[collType]) {
                        const x = (i % map.width) * ts;
                        const y = Math.floor(i / map.width) * ts;
                        const typeInfo = COLLISION_TYPES[collType];
                        
                        // Draw base color
                        ctx.fillStyle = typeInfo.color;
                        ctx.fillRect(x, y, ts, ts);
                        
                        // Draw dashed border for trigger zones
                        if (typeInfo.dashed) {
                            ctx.strokeStyle = 'rgba(155, 89, 182, 0.8)';
                            ctx.lineWidth = 2;
                            ctx.setLineDash([4, 4]);
                            ctx.strokeRect(x, y, ts, ts);
                            ctx.setLineDash([]);
                        }
                        
                        // Draw arrow for one-way collision
                        if (typeInfo.arrow) {
                            ctx.fillStyle = '#fff';
                            ctx.font = `${ts * 0.6}px Arial`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(typeInfo.arrow, x + ts/2, y + ts/2);
                        }
                    }
                }
            }
        
            map.decorations.forEach(d => {
                const cx = d.x * ts + ts/2;
                const cy = d.y * ts + ts/2;
                drawObject(d, cx, cy, ts);
            });
            if(map.spawn) drawObject({type:'spawn'}, map.spawn.x*ts+ts/2, map.spawn.y*ts+ts/2, ts);
            if(map.exit) drawObject({type:'exit'}, map.exit.x*ts+ts/2, map.exit.y*ts+ts/2, ts);
        
            // Phase 9: AI Ghost Visualization
            if (editorState.aiGhost) {
                const { x, y } = editorState.aiGhost;
                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = '#ff0000'; // Gold
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.strokeRect(x * ts, y * ts, ts, ts);
                ctx.fillRect(x * ts, y * ts, ts, ts);
                
                ctx.globalAlpha = 1.0;
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px monospace';
                ctx.textAlign = 'center';
                ctx.fillText("IRAB INTENT", x * ts + ts/2, y * ts - 5);
                ctx.restore();
            }
            
            if(window.fx) window.fx.render(0,0);
        }
        
        function drawObject(d, cx, cy, ts) {
            if (d.type === 'prefab') {
                const data = editorState.prefabCache[d.data];
                if (data && data.sprite) {
                    if (!window.editorSpriteCache) window.editorSpriteCache = {};
                    if (!window.editorSpriteCache[data.sprite]) window.editorSpriteCache[data.sprite] = window.createPixelImage(data.sprite);
                    const img = window.editorSpriteCache[data.sprite];
                    if (img.complete && img.naturalWidth !== 0) {
                        const scale = (data.components.find(c=>c.type==='Transform')?.scale || 3) * (CONFIG.scale/2); 
                        const dw = img.width * scale;
                        const dh = img.height * scale;
                        ctx.drawImage(img, cx - dw/2, cy - dh/2, dw, dh);
                        const col = data.components.find(c=>c.type==='Collider');
                        if(col) {
                            ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2;
                            ctx.strokeRect(cx - (col.width*scale)/2, cy - (col.height*scale)/2, col.width*scale, col.height*scale);
                        }
                        return;
                    }
                }
                ctx.fillStyle = '#2ecc71'; ctx.font="20px monospace"; ctx.textAlign="center"; ctx.textBaseline="middle";
                ctx.fillText("P", cx, cy);
                return;
            }
            
            ctx.font = "bold 20px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            
            // Actors
            if (d.type === 'npc') { ctx.fillStyle = '#e74c3c'; ctx.fillText('☺', cx, cy); }
            else if (d.type === 'enemy') { ctx.fillStyle = '#c0392b'; ctx.fillText('👹', cx, cy); }
            
            // Markers
            else if (d.type === 'spawn') { ctx.fillStyle = 'cyan'; ctx.fillText('S', cx, cy); }
            else if (d.type === 'exit') { ctx.fillStyle = '#2ecc71'; ctx.fillText('🚪', cx, cy); }
            
            // Containers
            else if (d.type === 'chest') { ctx.fillStyle = '#f39c12'; ctx.fillText('📦', cx, cy); }
            else if (d.type === 'barrel') { ctx.fillStyle = '#8b4513'; ctx.fillText('🛢️', cx, cy); }
            else if (d.type === 'crate') { ctx.fillStyle = '#d2691e'; ctx.fillText('📦', cx, cy); }
            else if (d.type === 'pot') { ctx.fillStyle = '#cd853f'; ctx.fillText('🏺', cx, cy); }
            
            // Doors & Gates
            else if (d.type === 'door') { ctx.fillStyle = '#8b4513'; ctx.fillText('🔒', cx, cy); }
            else if (d.type === 'gate') { ctx.fillStyle = '#7f8c8d'; ctx.fillText('🚧', cx, cy); }
            else if (d.type === 'portal') { ctx.fillStyle = '#9b59b6'; ctx.fillText('🌀', cx, cy); }
            
            // Lighting
            else if (d.type === 'torch') { ctx.fillStyle = '#e67e22'; ctx.fillText('🔥', cx, cy); }
            else if (d.type === 'candle') { ctx.fillStyle = '#ff0000'; ctx.fillText('🕯️', cx, cy); }
            else if (d.type === 'lamp') { ctx.fillStyle = '#ff0000'; ctx.fillText('🏮', cx, cy); }
            else if (d.type === 'brazier') { ctx.fillStyle = '#e74c3c'; ctx.fillText('🔥', cx, cy); }
            else if (d.type === 'glow') { ctx.fillStyle = '#00f3ff'; ctx.fillText('✨', cx, cy); }
            
            // Nature
            else if (d.type === 'tree') { ctx.fillStyle = '#27ae60'; ctx.fillText('🌲', cx, cy); }
            else if (d.type === 'bush') { ctx.fillStyle = '#2ecc71'; ctx.fillText('🌳', cx, cy); }
            else if (d.type === 'flower') { ctx.fillStyle = '#e91e63'; ctx.fillText('🌸', cx, cy); }
            else if (d.type === 'rock') { ctx.fillStyle = '#7f8c8d'; ctx.fillText('🪨', cx, cy); }
            else if (d.type === 'grass') { ctx.fillStyle = '#2ecc71'; ctx.fillText('🌱', cx, cy); }
            else if (d.type === 'mushroom') { ctx.fillStyle = '#e74c3c'; ctx.fillText('🍄', cx, cy); }
            
            // Furniture
            else if (d.type === 'table') { ctx.fillStyle = '#8b4513'; ctx.fillText('🪑', cx, cy); }
            else if (d.type === 'chair') { ctx.fillStyle = '#a0522d'; ctx.fillText('🪑', cx, cy); }
            else if (d.type === 'bed') { ctx.fillStyle = '#c0392b'; ctx.fillText('🛏️', cx, cy); }
            else if (d.type === 'bookshelf') { ctx.fillStyle = '#8b4513'; ctx.fillText('📚', cx, cy); }
            
            // Interactive
            else if (d.type === 'sign') { ctx.fillStyle = '#ff0000'; ctx.fillText('🪧', cx, cy); }
            else if (d.type === 'switch') { ctx.fillStyle = '#3498db'; ctx.fillText('🔌', cx, cy); }
            else if (d.type === 'lever') { ctx.fillStyle = '#95a5a6'; ctx.fillText('🎚️', cx, cy); }
            else if (d.type === 'button') { ctx.fillStyle = '#e74c3c'; ctx.fillText('🔘', cx, cy); }
            
            // Special
            else if (d.type === 'savepoint' || d.type === 'save_point') { ctx.fillStyle = '#2ecc71'; ctx.fillText('💾', cx, cy); }
            else if (d.type === 'shop') { ctx.fillStyle = '#f39c12'; ctx.fillText('🛒', cx, cy); }
            else if (d.type === 'warp' || d.type === 'teleport') { ctx.fillStyle = '#9b59b6'; ctx.fillText('⭐', cx, cy); }
            else if (d.type === 'checkpoint') { ctx.fillStyle = '#3498db'; ctx.fillText('🏁', cx, cy); }
            
            // Hazards/Traps
            else if (d.type === 'spikes') { ctx.fillStyle = '#95a5a6'; ctx.fillText('💀', cx, cy); }
            else if (d.type === 'fire_trap') { ctx.fillStyle = '#e67e22'; ctx.fillText('🔥', cx, cy); }
            else if (d.type === 'saw') { ctx.fillStyle = '#7f8c8d'; ctx.fillText('⚙️', cx, cy); }
            else if (d.type === 'pit') { ctx.fillStyle = '#000'; ctx.fillText('🕳️', cx, cy); }
            
            // Triggers
            else if (d.type === 'area_trigger') { ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; ctx.fillText('🎯', cx, cy); }
            else if (d.type === 'dialogue_trigger') { ctx.fillStyle = '#9b59b6'; ctx.fillText('💬', cx, cy); }
            else if (d.type === 'camera_trigger') { ctx.fillStyle = '#34495e'; ctx.fillText('📽️', cx, cy); }
            else if (d.type === 'script_trigger') { ctx.fillStyle = '#1abc9c'; ctx.fillText('📜', cx, cy); }
            
            // Misc
            else if (d.type === 'healing_font') { ctx.fillStyle = '#3498db'; ctx.fillText('⛲', cx, cy); }
            
            // Unknown
            else { ctx.fillStyle = '#95a5a6'; ctx.fillText('?', cx, cy); }
        }
        
        // --- PAINT ---
        function paint(e) {
            const rect = canvas.getBoundingClientRect();
            const ts = CONFIG.tileSize * CONFIG.scale;
            const tx = Math.floor((e.clientX - rect.left) / ts);
            const ty = Math.floor((e.clientY - rect.top) / ts);
            
            // Auto-Expand Logic
            if (tx < 0) { expandMap(0, 0, 0, 1); return; }
            if (ty < 0) { expandMap(1, 0, 0, 0); return; }
            if (tx >= map.width) { expandMap(0, 1, 0, 0); return; }
            if (ty >= map.height) { expandMap(0, 0, 1, 0); return; }
        
            const idx = ty * map.width + tx;
        
            // Handle Rect Tool Dragging state
            if (editorState.tool === 'rect') {
                editorState.dragEnd = { x: tx, y: ty };
                render(); // Trigger re-render to show rect overlay
                return; // Don't paint individual tiles yet
            }
        
            if (editorState.mode === 'visual') {
                if (editorState.tool === 'fill') {
                    floodFill(tx, ty, editorState.activeLayer);
                } else if (editorState.tool === 'picker') {
                    const pickedTile = map.layers[editorState.activeLayer][idx];
                    if (pickedTile !== null && pickedTile !== undefined) {
                        editorState.selectedTileID = pickedTile;
                    }
                    setTool('pen'); 
                } else if (editorState.tool === 'magic') {
                    // Scatter Brush: Paint current + random neighbors
                    map.layers[editorState.activeLayer][idx] = editorState.selectedTileID;
                    for(let dy=-1; dy<=1; dy++) {
                        for(let dx=-1; dx<=1; dx++) {
                            if(Math.random() > 0.6) { // 40% chance scatter
                                const nx = tx+dx, ny = ty+dy;
                                if(nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
                                    map.layers[editorState.activeLayer][ny*map.width+nx] = editorState.selectedTileID;
                                }
                            }
                        }
                    }
                } else if (editorState.tool === 'eraser') {
                    map.layers[editorState.activeLayer][idx] = null;
                } else {
                    // Pen
                    map.layers[editorState.activeLayer][idx] = editorState.selectedTileID;
                }
            }
            else if (editorState.mode === 'collision') {
                map.collision[idx] = (e.shiftKey || editorState.tool === 'eraser') ? 0 : editorState.selectedCollisionType;
            }
            else if (editorState.mode === 'props') {
                if (editorState.tool === 'eraser') {
                    map.decorations = map.decorations.filter(d => d.x !== tx || d.y !== ty);
                    if (map.spawn && map.spawn.x === tx && map.spawn.y === ty) map.spawn = null;
                    if (map.exit && map.exit.x === tx && map.exit.y === ty) map.exit = null;
                } else {
                    // Remove existing decorations at this spot
                    map.decorations = map.decorations.filter(d => d.x !== tx || d.y !== ty);
                    
                    // Special props that have their own properties on the map object
                    if (editorState.selectedProp === 'spawn') {
                        map.spawn = { x: tx, y: ty };
                    } 
                    else if (editorState.selectedProp === 'exit') {
                        map.exit = { x: tx, y: ty, data: document.getElementById('prop-data').value };
                    }
                    else {
                        // Standard decorations
                        let data = document.getElementById('prop-data').value;
                        if(editorState.selectedProp === 'npc') data = document.getElementById('npc-selector').value;
                        else if (editorState.selectedProp === 'enemy') data = document.getElementById('enemy-selector').value;
                        map.decorations.push({ x: tx, y: ty, type: editorState.selectedProp, data });
                    }
                }
            }
            else if (editorState.mode === 'prefabs') {
                if (editorState.tool === 'eraser') {
                    map.decorations = map.decorations.filter(d => d.x !== tx || d.y !== ty);
                } else if (editorState.selectedPrefab) {
                    map.decorations = map.decorations.filter(d => d.x !== tx || d.y !== ty);
                    map.decorations.push({ x: tx, y: ty, type: 'prefab', data: editorState.selectedPrefab });
                }
            }
            render();
        }
        
        function floodFill(startX, startY, layerIndex) {
            const layer = map.layers[layerIndex];
            if (!layer) return;
            
            const width = map.width;
            const height = map.height;
            const targetTile = layer[startY * width + startX];
            const replacementTile = editorState.selectedTileID;
            
            if (targetTile === replacementTile) return;
            
            const stack = [[startX, startY]];
            
            while (stack.length) {
                const [x, y] = stack.pop();
                const idx = y * width + x;
                
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    if (layer[idx] === targetTile) {
                        layer[idx] = replacementTile;
                        stack.push([x + 1, y]);
                        stack.push([x - 1, y]);
                        stack.push([x, y + 1]);
                        stack.push([x, y - 1]);
                    }
                }
            }
        }
        
        function commitRect() {
            if (!editorState.dragStart || !editorState.dragEnd) return;
            
            const x1 = Math.min(editorState.dragStart.x, editorState.dragEnd.x);
            const x2 = Math.max(editorState.dragStart.x, editorState.dragEnd.x);
            const y1 = Math.min(editorState.dragStart.y, editorState.dragEnd.y);
            const y2 = Math.max(editorState.dragStart.y, editorState.dragEnd.y);
            
            const shouldFill = editorState.fillRect;
            
            for(let y=y1; y<=y2; y++) {
                for(let x=x1; x<=x2; x++) {
                    // If not filling, only paint borders
                    if (!shouldFill) {
                        if (x > x1 && x < x2 && y > y1 && y < y2) continue;
                    }
        
                    const idx = y * map.width + x;
                    if (editorState.mode === 'visual') {
                        map.layers[editorState.activeLayer][idx] = editorState.selectedTileID;
                    } else if (editorState.mode === 'collision') {
                        map.collision[idx] = editorState.selectedCollisionType;
                    }
                }
            }
            render();
        }
        
        canvas.addEventListener('mousedown', e => { 
            pushHistory(); 
            editorState.isDrawing = true; 
            
            const rect = canvas.getBoundingClientRect();
            const ts = CONFIG.tileSize * CONFIG.scale;
            const tx = Math.floor((e.clientX - rect.left) / ts);
            const ty = Math.floor((e.clientY - rect.top) / ts);
            
            if (editorState.tool === 'rect') {
                editorState.dragStart = { x: tx, y: ty };
                editorState.dragEnd = { x: tx, y: ty }; // Init end to start
            } else {
                paint(e); 
            }
        });
        
        // Double-click to edit decorations (signs, NPCs, enemies, etc.)
        canvas.addEventListener('dblclick', e => {
            const rect = canvas.getBoundingClientRect();
            const ts = CONFIG.tileSize * CONFIG.scale;
            const tx = Math.floor((e.clientX - rect.left) / ts);
            const ty = Math.floor((e.clientY - rect.top) / ts);
            
            // Find decoration at this position
            const deco = map.decorations.find(d => d.x === tx && d.y === ty);
            
            if (deco) {
                if (deco.type === 'sign') {
                    const newText = prompt("Enter sign text:", deco.data || "");
                    if (newText !== null) {
                        deco.data = newText;
                        render();
                    }
                } else if (deco.type === 'npc') {
                    const newId = prompt("Enter NPC ID:", deco.data || "villager");
                    if (newId !== null) {
                        deco.data = newId;
                        render();
                    }
                } else if (deco.type === 'enemy') {
                    const newId = prompt("Enter enemy ID:", deco.data || "slime");
                    if (newId !== null) {
                        deco.data = newId;
                        render();
                    }
                } else if (deco.type === 'chest') {
                    const newItems = prompt("Enter chest contents (comma-separated item IDs):", deco.data || "apple,potion");
                    if (newItems !== null) {
                        deco.data = newItems;
                        render();
                    }
                } else {
                    // Generic data editing for other prop types
                    const newData = prompt(`Edit data for ${deco.type}:`, deco.data || "");
                    if (newData !== null) {
                        deco.data = newData;
                        render();
                    }
                }
            } else {
                // Check spawn/exit
                if (map.spawn && map.spawn.x === tx && map.spawn.y === ty) {
                    alert("Spawn point - cannot edit data");
                } else if (map.exit && map.exit.x === tx && map.exit.y === ty) {
                    const newData = prompt("Enter exit target level:", map.exit.data || "");
                    if (newData !== null) {
                        map.exit.data = newData;
                        render();
                    }
                }
            }
        });
        
        canvas.addEventListener('mousemove', e => { 
            if (editorState.isDrawing) paint(e); 
        });
        
        canvas.addEventListener('mouseup', () => { 
            if (editorState.isDrawing && editorState.tool === 'rect') {
                commitRect();
                editorState.dragStart = null;
                editorState.dragEnd = null;
            }
            editorState.isDrawing = false; 
            render(); // Clear overlay
        });
        
        // --- TOOLS ---
        function setTool(tool) {
            editorState.tool = tool;
            
            // Toggle Flyouts
            const rectSettings = document.getElementById('rect-settings');
            if (rectSettings) {
                rectSettings.style.display = (tool === 'rect') ? 'block' : 'none';
            }
        
            const rail = document.getElementById('tool-rail');
            if (rail) {
                // Deactivate all tool buttons in rail
                const tools = rail.querySelectorAll('button[id^="tool-"]');
                tools.forEach(b => b.classList.remove('active'));
            }
            
            // Activate current
            const btn = document.getElementById(`tool-${tool}`);
            if (btn) btn.classList.add('active');
        }
        
        document.getElementById('tool-pen').onclick = () => setTool('pen');
        document.getElementById('tool-eraser').onclick = () => setTool('eraser');
        document.getElementById('tool-fill').onclick = () => setTool('fill');
        document.getElementById('tool-rect').onclick = () => setTool('rect');
        document.getElementById('tool-magic').onclick = () => setTool('magic');
        document.getElementById('tool-picker').onclick = () => setTool('picker');
        document.getElementById('btn-resize').onclick = () => resizeMap();
        
        function resizeMap() {
            const newW = parseInt(document.getElementById('map-w').value);
            const newH = parseInt(document.getElementById('map-h').value);
            
            if (isNaN(newW) || isNaN(newH) || newW < 1 || newH < 1) {
                alert("Invalid dimensions!");
                return;
            }
        
            // Smart Resize (Expand/Crop from Top-Left)
            pushHistory();
            
            const dW = newW - map.width;
            const dH = newH - map.height;
            
            if (dW >= 0 && dH >= 0) {
                expandMap(0, dW, dH, 0); // Expand right/bottom
            } else {
                // Destructive resize (crop)
                const oldW = map.width;
                const oldH = map.height;
                
                map.layers = map.layers.map(layer => {
                    const newLayer = new Array(newW * newH).fill(null);
                    for (let y = 0; y < Math.min(oldH, newH); y++) {
                        for (let x = 0; x < Math.min(oldW, newW); x++) {
                            newLayer[y * newW + x] = layer[y * oldW + x];
                        }
                    }
                    return newLayer;
                });
                
                const newCol = new Array(newW * newH).fill(0);
                for (let y = 0; y < Math.min(oldH, newH); y++) {
                    for (let x = 0; x < Math.min(oldW, newW); x++) {
                        newCol[y * newW + x] = map.collision[y * oldW + x];
                    }
                }
                map.collision = newCol;
                
                map.decorations = map.decorations.filter(d => d.x < newW && d.y < newH);
                if(map.spawn && (map.spawn.x >= newW || map.spawn.y >= newH)) map.spawn = {x:0, y:0};
                
                map.width = newW;
                map.height = newH;
                resizeCanvasElement();
                render();
            }
        }
        
        function setMode(mode) {
            editorState.mode = mode;
            
            const rail = document.getElementById('tool-rail');
            if (rail) {
                // Deactivate all mode buttons
                const modes = rail.querySelectorAll('button[id^="mode-"]');
                modes.forEach(b => b.classList.remove('active'));
            }
            
            const btn = document.getElementById(`mode-${mode}`);
            if (btn) btn.classList.add('active');
        
            // Switch Sidebar Panel
            ['tiles', 'props', 'fx', 'prefabs', 'collision-types'].forEach(p => {
                const el = document.getElementById(`panel-${p}`);
                if (el) {
                    let shouldShow = false;
                    if (mode === 'visual' && p === 'tiles') shouldShow = true;
                    if (mode === 'collision' && p === 'collision-types') shouldShow = true;
                    if (mode === p) shouldShow = true;
                    el.style.display = shouldShow ? 'flex' : 'none';
                }
            });
            
            render();
        }
        
        function selectCollisionType(type) {
            editorState.selectedCollisionType = type;
            // Update UI to show selected type
            document.querySelectorAll('.collision-type-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const btn = document.getElementById(`collision-type-${type}`);
            if (btn) btn.classList.add('active');
            
            // Update preview
            const preview = document.getElementById('collision-type-preview');
            if (preview) {
                preview.textContent = `SELECTED: ${COLLISION_TYPES[type].name}`;
                preview.style.color = COLLISION_TYPES[type].color.replace('0.5', '1').replace('0.4', '1');
            }
        }
        
        document.getElementById('mode-visual').onclick = () => setMode('visual');
        document.getElementById('mode-collision').onclick = () => setMode('collision');
        document.getElementById('mode-props').onclick = () => setMode('props');
        document.getElementById('mode-fx').onclick = () => setMode('fx');
        document.getElementById('mode-prefabs').onclick = () => setMode('prefabs');
        
        // --- HISTORY ---
        window.pushHistory = function() {
            editorState.history.push(JSON.stringify(map));
            if(editorState.history.length > 20) editorState.history.shift();
            editorState.historyIndex = editorState.history.length - 1;
        };
        window.undo = function() {
            if(editorState.historyIndex > 0) {
                editorState.historyIndex--;
                map = JSON.parse(editorState.history[editorState.historyIndex]);
                editorState.activeLayer = Math.min(editorState.activeLayer, map.layers.length - 1);
                updateLayerList();
                render();
            }
        };
        window.redo = function() {
            if(editorState.historyIndex < editorState.history.length - 1) {
                editorState.historyIndex++;
                map = JSON.parse(editorState.history[editorState.historyIndex]);
                editorState.activeLayer = Math.min(editorState.activeLayer, map.layers.length - 1);
                updateLayerList();
                render();
            }
        };
        
        async function changeTileset(path) {
            if (path === 'CUSTOM') {
                document.getElementById('custom-tileset-path').style.display = 'block';
                return;
            }
            document.getElementById('custom-tileset-path').style.display = 'none';
            
            editorState.tilesetReady = false;
            map.tilesetPath = path;
            await loadTileset(path);
            render();
        }
        
        // --- LOADING ---
        async function loadTileset(path) {
            return new Promise(r => {
                if (path === 'WORLD_PIXEL_ART') {
                    combineWorldPixelArt().then(c => { tileset = c; editorState.tilesetReady = true; initPalette(); r(); });
                } else {
                    tileset.src = path;
                    tileset.onload = () => { editorState.tilesetReady = true; initPalette(); r(); };
                }
            });
        }
        
        function initPalette() {
            paletteGrid.innerHTML = '';
            const total = (tileset.width/16) * (tileset.height/16);
            // Increased limit to show all tiles
            for(let i=0; i<total; i++) { 
                const d = document.createElement('div');
                d.className = 'palette-item';
                d.dataset.id = i; // For search filtering
        
                const c = document.createElement('canvas'); c.width=16; c.height=16;
                const cx = c.getContext('2d');
                const sx = (i % (tileset.width/16)) * 16;
                const sy = Math.floor(i / (tileset.width/16)) * 16;
                cx.drawImage(tileset, sx, sy, 16, 16, 0, 0, 16, 16);
                d.appendChild(c);
                
                // Restore ID Label
                const span = document.createElement('span');
                span.innerText = i;
                d.appendChild(span);
        
                d.onclick = () => { editorState.selectedTileID = i; setMode('visual'); };
                paletteGrid.appendChild(d);
            }
        }
        
        async function combineWorldPixelArt() {
            const canvas = document.createElement('canvas');
            const tSize = 16;
            const cols = 16;
            const totalTiles = 600; 
            const rows = Math.ceil(totalTiles / cols);
            
            canvas.width = cols * tSize;
            canvas.height = rows * tSize;
            const ctx = canvas.getContext('2d');
        
            // Use the global loading bar
            const progressBar = document.getElementById('loading-bar');
            const progressText = document.getElementById('loading-text');
            
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
                        if (progressBar) {
                            // Map 30-50% of global loading to texture loading
                            const percent = 30 + (loadedCount / totalTiles) * 20; 
                            progressBar.style.width = percent + '%';
                        }
                        if (progressText && loadedCount % 20 === 0) {
                            progressText.innerText = `ASSEMBLING TILES... ${Math.floor((loadedCount / totalTiles) * 100)}%`;
                        }
                        resolve();
                    };
                    img.onerror = () => {
                        // Silent fail for missing tiles
                        loadedCount++; 
                        resolve();
                    };
                    img.src = `sprite-art/worldpixelart/texture_16px%20${i}.png`;
                }));
            }
            
            await Promise.all(promises);
            
            // Fallback logic
            if (loadedCount < 50 || ctx.getImageData(0,0,1,1).data[3] === 0) { 
                 console.warn("Detailed tileset failed. Loading default.");
                 return new Promise(r => {
                     const fallback = new Image();
                     fallback.src = 'base_game/assets/world_tileset.png';
                     fallback.onload = () => {
                         canvas.width = fallback.width;
                         canvas.height = fallback.height;
                         ctx.drawImage(fallback, 0, 0);
                         r(canvas);
                     };
                     fallback.onerror = () => {
                         r(canvas); 
                     };
                 });
            }
        
            return canvas;
        }
        
        function expandMap(top, right, bottom, left) {
            const w = map.width + left + right;
            const h = map.height + top + bottom;
            
            // Create new layers with new dimensions
            const newLayers = map.layers.map(layer => {
                const newLayer = new Array(w * h).fill(0);
                for(let y = 0; y < map.height; y++) {
                    for(let x = 0; x < map.width; x++) {
                        const oldIdx = y * map.width + x;
                        const newIdx = (y + top) * w + (x + left);
                        newLayer[newIdx] = layer[oldIdx];
                    }
                }
                return newLayer;
            });
        
            // Update collision
            const newCollision = new Array(w * h).fill(0);
            for(let y = 0; y < map.height; y++) {
                for(let x = 0; x < map.width; x++) {
                    const oldIdx = y * map.width + x;
                    const newIdx = (y + top) * w + (x + left);
                    newCollision[newIdx] = map.collision[oldIdx];
                }
            }
        
            // Shift objects
            if (map.decorations) {
                map.decorations.forEach(d => {
                    d.x += left;
                    d.y += top;
                });
            }
        
            if (map.spawn) {
                map.spawn.x += left;
                map.spawn.y += top;
            }
        
            map.width = w;
            map.height = h;
            map.layers = newLayers;
            map.collision = newCollision;
            
            console.log(`Map expanded to ${w}x${h}`);
            resizeCanvasElement();
            render();
        }
        
        function initMap(w, h) { 
            map.width=w; map.height=h; 
            map.layers=[new Array(w*h).fill(287)]; 
            map.collision=new Array(w*h).fill(0); 
            resizeCanvasElement(); 
            updateLayerList();
            render(); 
        }
        
        function updateLayerList() {
            const list = document.getElementById('layer-list');
            if (!list) return;
            list.innerHTML = '';
            
            // Ensure props exist
            if (!map.layerProps) map.layerProps = [];
            while(map.layerProps.length < map.layers.length) {
                map.layerProps.push({ visible: true, locked: false, name: `Layer ${map.layerProps.length}` });
            }
        
            for (let i = map.layers.length - 1; i >= 0; i--) {
                const props = map.layerProps[i] || { visible: true, locked: false, name: `Layer ${i}` };
                const isActive = (i === editorState.activeLayer);
                
                const div = document.createElement('div');
                div.className = `layer-item ${isActive ? 'active' : ''}`;
                div.innerHTML = `
                    <div class="layer-vis ${props.visible ? '' : 'hidden'}" onclick="event.stopPropagation(); toggleLayerVis(${i})">
                        <i class="fas fa-eye${props.visible ? '' : '-slash'}"></i>
                    </div>
                    <div class="layer-name" onclick="selectLayer(${i})">
                        ${props.name || ('Layer ' + i)}
                    </div>
                    <div class="layer-controls">
                        <div class="layer-btn" onclick="event.stopPropagation(); removeLayer()"><i class="fas fa-trash"></i></div>
                    </div>
                `;
                list.appendChild(div);
            }
        }
        window.updateLayerList = updateLayerList;
        
        function toggleLayerVis(i) {
            if (!map.layerProps) return;
            if (!map.layerProps[i]) map.layerProps[i] = { visible: true, locked: false, name: `Layer ${i}` };
            
            map.layerProps[i].visible = !map.layerProps[i].visible;
            updateLayerList();
            render();
        }
        window.toggleLayerVis = toggleLayerVis;
        
        function selectLayer(i) { 
            editorState.activeLayer = i; 
            updateLayerList(); 
        }
        window.selectLayer = selectLayer;
        
        function addLayer() {
            pushHistory();
            map.layers.push(new Array(map.width * map.height).fill(null));
            editorState.activeLayer = map.layers.length - 1;
            updateLayerList();
            render();
        }
        window.addLayer = addLayer;
        
        function removeLayer() {
            if (map.layers.length <= 1) return alert("Cannot remove last layer");
            if (!confirm(`Remove Layer ${editorState.activeLayer}?`)) return;
            
            pushHistory();
            map.layers.splice(editorState.activeLayer, 1);
            editorState.activeLayer = Math.max(0, editorState.activeLayer - 1);
            updateLayerList();
            render();
        }
        window.removeLayer = removeLayer;
        
        function moveLayer(delta) {
            const from = editorState.activeLayer;
            const to = from + delta;
            if (to < 0 || to >= map.layers.length) return;
            
            pushHistory();
            const temp = map.layers[from];
            map.layers[from] = map.layers[to];
            map.layers[to] = temp;
            editorState.activeLayer = to;
            updateLayerList();
            render();
        }
        window.moveLayer = moveLayer;
        
        function updateZoomUI() { document.getElementById('zoom-level').innerText = Math.round(CONFIG.scale * 100) + '%'; }
        
        function changeZoom(delta) {
            CONFIG.scale += delta;
            if (CONFIG.scale < CONFIG.minScale) CONFIG.scale = CONFIG.minScale;
            if (CONFIG.scale > CONFIG.maxScale) CONFIG.scale = CONFIG.maxScale;
            resizeCanvasElement();
            updateZoomUI();
            if (typeof render === 'function') render();
        }
        
        function resizeCanvasElement() { canvas.width = map.width * 16 * CONFIG.scale; canvas.height = map.height * 16 * CONFIG.scale; }
        
        async function loadLevelFromServer(filename) {
            try {
                const res = await fetch(`dunyalar/${filename}`);
                if(res.ok) {
                    const data = await res.json();
                    loadMapData(data);
                    
                    // Only close modal if open
                    const win = document.getElementById('level-window');
                    if (win && win.style.display !== 'none') {
                        toggleLevelWindow();
                    }
                }
            } catch(e) { console.error("Error loading level:", e); }
        }
        
        function toggleLevelWindow() {
            const win = document.getElementById('level-window');
            if (win) {
                const isHidden = win.style.display === 'none';
                win.style.display = isHidden ? 'flex' : 'none';
                if (isHidden) loadLevelList();
            }
        }
        
        function playtest() {
            if (playtestLaunchLocked) return;
            playtestLaunchLocked = true;
            setTimeout(() => { playtestLaunchLocked = false; }, 350);
        
            const serializedMap = JSON.stringify(map);
            const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        
            // Phase 28: Unified Session Storage
            sessionStorage.setItem('redglitch_playtest_data', serializedMap);
            localStorage.setItem('redglitch_test_session', sessionId);
        
            const playtestUrl = `index.html?engine=rpg-topdown&playtest=true&session=${encodeURIComponent(sessionId)}&ts=${Date.now()}`;
            playtestWindowRef = window.open(playtestUrl, PLAYTEST_WINDOW_NAME);
        
            if (playtestWindowRef) {
                playtestWindowRef.focus();
            } else {
                playtestLaunchLocked = false;
                alert("Playtest window was blocked. Please allow popups for this site.");
            }
        }
        
        function loadMapData(data) { 
            map = data; 
            
            // Ensure decorations array exists
            if (!map.decorations) map.decorations = [];
            
            const filename = map.name || 'unnamed';
            document.getElementById('level-name').value = filename;
            document.getElementById('map-w').value = map.width;
            document.getElementById('map-h').value = map.height;
            if (document.getElementById('map-type')) document.getElementById('map-type').value = map.type || 'topdown';
            if (document.getElementById('fx-shader')) document.getElementById('fx-shader').value = map.shader || 'default';
            
            // Track current filename
            editorState.currentFilename = filename;
            updateFilenameDisplay(filename);
            
            editorState.activeLayer = 0; 
            resizeCanvasElement(); 
            updateLayerList(); 
            render(); 
        }
        
        function loadLevelFromFile(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    loadMapData(data);
                } catch (err) { alert("Invalid JSON file"); }
            };
            reader.readAsText(file);
        }
        
        async function saveToServer(forcePrompt = false) {
            let nameInput = document.getElementById('level-name');
            if (!nameInput) {
                console.error("Critical Error: Level name input field not found!");
                alert("Critical Error: Level name input field is missing from the UI.");
                return;
            }
            
            let name = nameInput.value;
            
            // If forcing prompt (Save As) or no current filename, ask for name
            if (forcePrompt || !editorState.currentFilename || name.trim() === "" || name === "level1") {
                const promptName = prompt("Enter a name for this level:", name || "level1");
                if (!promptName) return; // User cancelled
                name = promptName.trim();
                if (!name) {
                    alert("Level name cannot be empty!");
                    return;
                }
                nameInput.value = name;
            }
            
            console.log("Attempting to save level:", name);
            
            // Strip extension if present
            if (name.endsWith('.json')) name = name.replace('.json', '');
            
            map.name = name;
            editorState.currentFilename = name; // Track current file
            
            // Convert spawn format to game engine format (spawnX/spawnY in pixels)
            if (map.spawn && typeof map.spawn === 'object') {
                map.spawnX = map.spawn.x * 48; // Convert tile to pixel (16 * 3 scale)
                map.spawnY = map.spawn.y * 48;
                // Keep spawn object for editor compatibility
            }
            
            // Convert exit format if needed
            if (map.exit && typeof map.exit === 'object') {
                map.exitX = map.exit.x * 48;
                map.exitY = map.exit.y * 48;
            }
            
            // Validate map data
            if (!map || typeof map !== 'object') {
                 alert("Error: Map data is corrupted or missing.");
                 return;
            }
        
            try {
                const payload = JSON.stringify(map);
                console.log(`Sending save request for ${name}. Payload size: ${payload.length} chars.`);
                
                const res = await fetch(`/api/levels/${name}.json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload
                });
                
                if (res.ok) {
                    console.log("Save successful!");
                    
                    // Update UI to show saved filename
                    updateFilenameDisplay(name);
                    
                    // Show success message
                    const msg = forcePrompt ? `Level saved as '${name}'!` : `Level '${name}' saved!`;
                    showSaveNotification(msg, true);
                    
                    if (typeof loadLevelList === 'function') loadLevelList();
                } else {
                    const txt = await res.text();
                    console.error("Save failed response:", res.status, txt);
                    alert(`FAILED to save: Server responded with ${res.status} ${res.statusText}\nDetails: ${txt}`);
                }
            } catch (e) { 
                console.error("Save network error:", e);
                alert("Network Error: Could not connect to server.\n" + e.message); 
            }
        }
        
        function updateFilenameDisplay(name) {
            const nameInput = document.getElementById('level-name');
            if (nameInput) {
                nameInput.value = name;
            }
            
            // Update window title if in Electron
            if (window.electronAPI) {
                document.title = `Level Editor - ${name}`;
            }
        }
        
        function showSaveNotification(message, success = true) {
            // Create notification element
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 50px;
                right: 20px;
                padding: 15px 25px;
                background: ${success ? '#27ae60' : '#e74c3c'};
                color: white;
                border-radius: 5px;
                font-family: 'VT323', monospace;
                font-size: 1.2rem;
                z-index: 10000;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                animation: slideIn 0.3s ease-out;
            `;
            notification.innerHTML = `<i class="fas fa-${success ? 'check-circle' : 'exclamation-triangle'}"></i> ${message}`;
            
            // Add animation styles
            const style = document.createElement('style');
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(400px); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
            
            document.body.appendChild(notification);
            
            // Auto-remove after 3 seconds
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
        
        function downloadJSON() {
            const name = document.getElementById('level-name').value || 'map';
            const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
        
        async function deleteLevel(filename) {
            if (!filename) {
                filename = prompt("Enter the name of the level to delete:", editorState.currentFilename || "");
                if (!filename) return;
            }
            
            // Strip extension if present
            if (filename.endsWith('.json')) {
                filename = filename.replace('.json', '');
            }
            
            // Confirmation dialog
            const confirmMsg = `Are you sure you want to DELETE "${filename}"?\n\nThis action CANNOT be undone!`;
            if (!confirm(confirmMsg)) {
                return;
            }
            
            try {
                console.log(`Attempting to delete level: ${filename}`);
                
                const res = await fetch(`/api/levels/${filename}.json`, {
                    method: 'DELETE'
                });
                
                if (res.ok) {
                    console.log("Delete successful!");
                    showSaveNotification(`Level '${filename}' deleted!`, true);
                    
                    // If we deleted the currently open file, reset to new map
                    if (editorState.currentFilename === filename) {
                        if (confirm("You deleted the currently open level. Create a new map?")) {
                            initMap(30, 20);
                            editorState.currentFilename = null;
                            updateFilenameDisplay('level1');
                        }
                    }
                    
                    // Refresh level list
                    if (typeof loadLevelList === 'function') {
                        loadLevelList();
                    }
                } else {
                    const data = await res.json();
                    console.error("Delete failed:", data);
                    alert(`Failed to delete level: ${data.error || 'Unknown error'}`);
                }
            } catch (e) {
                console.error("Delete network error:", e);
                alert(`Network Error: Could not delete level.\n${e.message}`);
            }
        }
        window.deleteLevel = deleteLevel;
        
        async function loadActors() {
            try {
                const t = Date.now();
                const npcs = await fetch(`/dunyalar/definitions/npcs.json?t=${t}`).then(r => r.json()).catch(() => []);
                const enemies = await fetch(`/dunyalar/definitions/enemies.json?t=${t}`).then(r => r.json()).catch(() => []);
                const npcSel = document.getElementById('npc-selector');
                const enemySel = document.getElementById('enemy-selector');
                if (npcSel) {
                    npcSel.innerHTML = '<option value="">-- Choose NPC --</option>';
                    npcs.forEach(n => {
                        const opt = document.createElement('option');
                        opt.value = n.id; opt.innerText = n.id;
                        npcSel.appendChild(opt);
                    });
                }
                if (enemySel) {
                    enemySel.innerHTML = '<option value="">-- Choose Enemy --</option>';
                    enemies.forEach(e => {
                        const opt = document.createElement('option');
                        opt.value = e.id; opt.innerText = e.id;
                        enemySel.appendChild(opt);
                    });
                }
            } catch(e) { console.log("Load actors error", e); }
        }
        
        // --- TILE MAPPER / AUTO-MAP ---
        async function autoMapTiles() {
            if (!editorState.tilesetReady) return alert('Tileset not ready yet.');
            // Ensure we have a canvas for tileset
            let tsCanvas = tileset;
            if (tileset instanceof HTMLImageElement) {
                tsCanvas = document.createElement('canvas');
                tsCanvas.width = tileset.width; tsCanvas.height = tileset.height;
                const c = tsCanvas.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(tileset, 0, 0);
            }
        
            const cols = Math.max(1, Math.floor(tsCanvas.width / 16));
            const rows = Math.max(1, Math.floor(tsCanvas.height / 16));
            const total = cols * rows;
            const ctx2 = tsCanvas.getContext('2d');
        
            const avgColors = [];
            for (let i = 0; i < total; i++) {
                const sx = (i % cols) * 16; const sy = Math.floor(i / cols) * 16;
                const imgd = ctx2.getImageData(sx, sy, 16, 16).data;
                let r = 0, g = 0, b = 0, cnt = 0;
                for (let p = 0; p < imgd.length; p += 4) {
                    const a = imgd[p + 3]; if (a === 0) continue;
                    r += imgd[p]; g += imgd[p + 1]; b += imgd[p + 2]; cnt++;
                }
                if (cnt === 0) avgColors.push([255, 255, 255]);
                else avgColors.push([Math.round(r / cnt), Math.round(g / cnt), Math.round(b / cnt)]);
            }
        
            // Target heuristics (tunable)
            const targets = {
                FLOOR_GRASS: [80, 140, 60],
                TREE: [60, 45, 20],
                WATER: [30, 90, 150],
                WOOD_FLOOR: [160, 110, 70],
                LAVA: [200, 80, 30],
                FLOOR_STONE: [150, 150, 150]
            };
        
            const mapping = {};
            for (const key in targets) {
                let bestIdx = 0; let bestDist = Infinity;
                for (let i = 0; i < avgColors.length; i++) {
                    const c = avgColors[i];
                    const d = Math.hypot(c[0] - targets[key][0], c[1] - targets[key][1], c[2] - targets[key][2]);
                    if (d < bestDist) { bestDist = d; bestIdx = i; }
                }
                mapping[key] = bestIdx;
            }
        
            if (window.tuneTileIDs) {
                window.tuneTileIDs(mapping);
                alert('Auto-mapper applied. Open Tile Mapper to fine-tune.');
            } else {
                alert('Tile tuning API not available.');
            }
        }
        
        function openTileMapper() {
            // Remove existing
            const existing = document.getElementById('tile-mapper-window');
            if (existing) return existing.style.display = 'flex';
        
            const keys = ['FLOOR_GRASS','FLOOR_GRASS_FLOWER','FLOOR_STONE','FLOOR_DIRT','TREE','WATER','WOOD_FLOOR','LAVA','ROOF','FENCE','BRICK'];
            const modal = document.createElement('div');
            modal.id = 'tile-mapper-window';
            modal.className = 'floating-window';
            modal.style.left = '50%'; modal.style.top = '50%'; modal.style.transform = 'translate(-50%,-50%)';
            modal.style.minWidth = '360px';
        
            const header = document.createElement('div'); header.className = 'window-header'; header.innerHTML = 'TILE MAPPER <i class="fas fa-times" style="cursor:pointer"></i>';
            header.querySelector('i').onclick = () => modal.style.display = 'none';
            modal.appendChild(header);
        
            const content = document.createElement('div'); content.className = 'window-content';
        
            // Current mapping if available
            const current = (window.getTileIDs && typeof window.getTileIDs === 'function') ? window.getTileIDs() : {};
        
            keys.forEach(k => {
                const row = document.createElement('div'); row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px'; row.style.marginBottom = '6px';
                const label = document.createElement('div'); label.style.width = '130px'; label.innerText = k;
                const input = document.createElement('input'); input.type = 'number'; input.value = (current[k] !== undefined) ? current[k] : (k === 'FLOOR_GRASS' ? 287 : 0);
                input.style.width = '80px';
                const prev = document.createElement('canvas'); prev.width = 32; prev.height = 32; prev.style.border = '1px solid #333';
        
                input.onchange = () => drawPreview(prev, parseInt(input.value || 0));
                row.appendChild(label); row.appendChild(input); row.appendChild(prev);
                content.appendChild(row);
                // initial preview
                drawPreview(prev, parseInt(input.value || 0));
            });
        
            const applyBtn = document.createElement('button'); applyBtn.className = 'btn-full'; applyBtn.innerText = 'APPLY MAPPING'; applyBtn.style.marginTop = '8px';
            applyBtn.onclick = () => {
                const rows = content.querySelectorAll('div');
                const mapObj = {};
                rows.forEach(r => {
                    const lbl = r.children[0]; const inp = r.children[1];
                    if (lbl && inp) mapObj[lbl.innerText] = parseInt(inp.value || 0);
                });
                if (window.tuneTileIDs) {
                    window.tuneTileIDs(mapObj);
                    alert('Tile mapping applied.');
                } else alert('tuneTileIDs API missing.');
            };
        
            content.appendChild(applyBtn);
            modal.appendChild(content);
            document.body.appendChild(modal);
        }
        
        function drawPreview(canvasEl, tileIndex) {
            if (!editorState.tilesetReady) return;
            const ctxPrev = canvasEl.getContext('2d'); ctxPrev.imageSmoothingEnabled = false; ctxPrev.clearRect(0,0,32,32);
            const cols = Math.max(1, Math.floor(tileset.width / 16));
            const sx = (tileIndex % cols) * 16; const sy = Math.floor(tileIndex / cols) * 16;
            // If tileset is a canvas
            if (tileset instanceof HTMLCanvasElement) ctxPrev.drawImage(tileset, sx, sy, 16, 16, 0, 0, 32, 32);
            else if (tileset instanceof HTMLImageElement) {
                const tmp = document.createElement('canvas'); tmp.width = tileset.width; tmp.height = tileset.height; const tctx = tmp.getContext('2d'); tctx.drawImage(tileset,0,0);
                ctxPrev.drawImage(tmp, sx, sy, 16, 16, 0, 0, 32, 32);
            }
        }
        
        function filterPalette(q) {
            const items = document.querySelectorAll('.palette-item');
            items.forEach(item => {
                item.style.display = item.dataset.id.includes(q) ? 'flex' : 'none';
            });
        }
        
        async function loadLevelList() {
            try {
                const res = await fetch('/api/files/levels');
                if (res.ok) {
                    const files = await res.json();
                    
                    // Suggest Next Name
                    const nextName = suggestNextLevelName(files);
                    const nameInput = document.getElementById('level-name');
                    if (nameInput && (nameInput.value === 'level1' || nameInput.value === 'unnamed' || nameInput.value === '')) {
                        nameInput.value = nextName;
                    }
        
                    // 1. Floating Window List
                    const list = document.getElementById('level-list');
                    if (list) {
                        list.innerHTML = '';
                        files.forEach(f => {
                            const div = document.createElement('div');
                            div.style.cssText = "padding:5px; border-bottom:1px solid #333; cursor:pointer; color:#ccc;";
                            div.innerText = f.replace('.json', '');
                            div.onclick = () => loadLevelFromServer(f);
                            list.appendChild(div);
                        });
                    }
        
                    // 2. Sidebar List
                    const sidebarList = document.getElementById('sidebar-level-list');
                    if (sidebarList) {
                        sidebarList.innerHTML = '';
                        files.forEach(f => {
                            const div = document.createElement('div');
                            div.style.cssText = "padding:8px; border-bottom:1px solid #222; cursor:pointer; color:#aaa; font-size:0.9rem; display:flex; align-items:center; gap:8px;";
                            div.innerHTML = `<i class=\"fas fa-file-code\" style=\"font-size:0.7rem; color:#555;\"></i> <span>${f.replace('.json', '')}</span>`;
                            div.onmouseover = () => div.style.color = '#fff';
                            div.onmouseout = () => div.style.color = '#aaa';
                            div.onclick = () => loadLevelFromServer(f);
                            sidebarList.appendChild(div);
                        });
                    }
                }
            } catch (e) { console.warn("Failed to load level list", e); }
        }
        
        function suggestNextLevelName(files) {
            let maxNum = 0;
            files.forEach(f => {
                const match = f.match(/level(\d+)/i);
                if (match) {
                    const n = parseInt(match[1]);
                    if (n > maxNum) maxNum = n;
                }
            });
            return `level${maxNum + 1}`;
        }
        
        // --- EXPORTS ---
        window.initMap = initMap;
        window.toggleLevelWindow = toggleLevelWindow;
        window.saveToServer = saveToServer;
        window.downloadJSON = downloadJSON;
        window.playtest = playtest;
        window.undo = undo;
        window.redo = redo;
        window.changeZoom = changeZoom;
        window.loadLevelList = loadLevelList;
        window.autoMapTiles = autoMapTiles;
        window.openTileMapper = openTileMapper;
        
        
        // --- PUBLIC API ---
        this.initDOM = initDOM;
        this.updateProgress = updateProgress;
        this.initializeWorldIntegration = initializeWorldIntegration;
        this.registerWorldTools = registerWorldTools;
        this._topdownPendingCheck = _topdownPendingCheck;
        this.loop = loop;
        this.initPropButtons = initPropButtons;
        this.selectProp = selectProp;
        this.toggleSection = toggleSection;
        this.findNextLevelName = findNextLevelName;
        this.render = render;
        this.renderStandard = renderStandard;
        this.drawObject = drawObject;
        this.paint = paint;
        this.floodFill = floodFill;
        this.commitRect = commitRect;
        this.setTool = setTool;
        this.resizeMap = resizeMap;
        this.setMode = setMode;
        this.selectCollisionType = selectCollisionType;
        this.initPalette = initPalette;
        this.expandMap = expandMap;
        this.initMap = initMap;
        this.updateLayerList = updateLayerList;
        this.toggleLayerVis = toggleLayerVis;
        this.selectLayer = selectLayer;
        this.addLayer = addLayer;
        this.removeLayer = removeLayer;
        this.moveLayer = moveLayer;
        this.updateZoomUI = updateZoomUI;
        this.changeZoom = changeZoom;
        this.resizeCanvasElement = resizeCanvasElement;
        this.toggleLevelWindow = toggleLevelWindow;
        this.playtest = playtest;
        this.loadMapData = loadMapData;
        this.loadLevelFromFile = loadLevelFromFile;
        this.updateFilenameDisplay = updateFilenameDisplay;
        this.showSaveNotification = showSaveNotification;
        this.downloadJSON = downloadJSON;
        this.openTileMapper = openTileMapper;
        this.drawPreview = drawPreview;
        this.filterPalette = filterPalette;
        this.suggestNextLevelName = suggestNextLevelName;
    }
}
window.WorldEditor = WorldEditor;

// Initialize backward compatibility immediately
window.editorInstance = new WorldEditor();
window.updateProgress = window.editorInstance.updateProgress;
window.initializeWorldIntegration = window.editorInstance.initializeWorldIntegration;
window.registerWorldTools = window.editorInstance.registerWorldTools;
window._topdownPendingCheck = window.editorInstance._topdownPendingCheck;
window.loop = window.editorInstance.loop;
window.initPropButtons = window.editorInstance.initPropButtons;
window.selectProp = window.editorInstance.selectProp;
window.toggleSection = window.editorInstance.toggleSection;
window.findNextLevelName = window.editorInstance.findNextLevelName;
window.render = window.editorInstance.render;
window.renderStandard = window.editorInstance.renderStandard;
window.drawObject = window.editorInstance.drawObject;
window.paint = window.editorInstance.paint;
window.floodFill = window.editorInstance.floodFill;
window.commitRect = window.editorInstance.commitRect;
window.setTool = window.editorInstance.setTool;
window.resizeMap = window.editorInstance.resizeMap;
window.setMode = window.editorInstance.setMode;
window.selectCollisionType = window.editorInstance.selectCollisionType;
window.initPalette = window.editorInstance.initPalette;
window.expandMap = window.editorInstance.expandMap;
window.initMap = window.editorInstance.initMap;
window.updateLayerList = window.editorInstance.updateLayerList;
window.toggleLayerVis = window.editorInstance.toggleLayerVis;
window.selectLayer = window.editorInstance.selectLayer;
window.addLayer = window.editorInstance.addLayer;
window.removeLayer = window.editorInstance.removeLayer;
window.moveLayer = window.editorInstance.moveLayer;
window.updateZoomUI = window.editorInstance.updateZoomUI;
window.changeZoom = window.editorInstance.changeZoom;
window.resizeCanvasElement = window.editorInstance.resizeCanvasElement;
window.toggleLevelWindow = window.editorInstance.toggleLevelWindow;
window.playtest = window.editorInstance.playtest;
window.loadMapData = window.editorInstance.loadMapData;
window.loadLevelFromFile = window.editorInstance.loadLevelFromFile;
window.updateFilenameDisplay = window.editorInstance.updateFilenameDisplay;
window.showSaveNotification = window.editorInstance.showSaveNotification;
window.downloadJSON = window.editorInstance.downloadJSON;
window.openTileMapper = window.editorInstance.openTileMapper;
window.drawPreview = window.editorInstance.drawPreview;

// Listen for global save
if (window.parent && window.parent.RedGlitchEventBus) {
    window.parent.RedGlitchEventBus.on('system:global_save', () => {
        if (typeof saveToServer === 'function') {
            saveToServer(false);
        }
    });
}
window.filterPalette = window.editorInstance.filterPalette;
window.suggestNextLevelName = window.editorInstance.suggestNextLevelName;
