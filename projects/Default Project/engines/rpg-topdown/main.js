// main.js - ketebe ENGINE v5.2 - HYBRID CORE (Robust Legacy Logic + New Architecture)

// Inject Logger Hook for DevTools Integration
(function() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    function sendToOpener(level, msg) {
        if (window.opener) {
            try {
                // Ensure we send plain strings to avoid cloning issues
                const safeMsg = typeof msg === 'string' ? msg : JSON.stringify(msg, (key, value) => {
                    if (key === 'game' || key === 'ctx' || key === 'canvas') return '[Circular/DOM]';
                    return value;
                });
                
                window.opener.postMessage({
                    type: 'log',
                    level: level,
                    message: safeMsg
                }, '*');
            } catch (e) {
                // Fallback for circular structures
                window.opener.postMessage({
                    type: 'log',
                    level: level,
                    message: String(msg)
                }, '*');
            }
        }
    }

    console.log = function(...args) {
        // Filter out noisy frame logs if needed
        sendToOpener('info', args.map(a => String(a)).join(' '));
        originalLog.apply(console, args);
    };
    console.warn = function(...args) {
        sendToOpener('warning', args.map(a => String(a)).join(' '));
        originalWarn.apply(console, args);
    };
    console.error = function(...args) {
        sendToOpener('error', args.map(a => String(a)).join(' '));
        originalError.apply(console, args);
    };
})();

// ============================================
// LOGIC SYSTEM
// ============================================

window.LogicSystem = class LogicSystem {
    constructor(game) {
        this.game = game;
        this.scripts = new Map(); // scriptName → module
        this.runtimes = new Map(); // entityId → LogicRuntime instance
        this.algorithmRuntimes = new Map(); // entityId → AlgorithmRuntime instance
        this.algorithms = new Map(); // algorithmName → algorithm data
        this.loadedScripts = new Set(); // Track what's already loaded
        
        console.log('[LogicSystem] Initialized');
    }
    
    async loadScript(scriptName) {
        if (this.loadedScripts.has(scriptName)) {
            return this.scripts.get(scriptName);
        }
        
        try {
            const url = `/api/logic/js/${scriptName}`;
            console.log(`[LogicSystem] Loading script: ${scriptName}`);
            
            // Dynamic import of the generated logic script
            const module = await import(url);
            this.scripts.set(scriptName, module);
            this.loadedScripts.add(scriptName);
            
            console.log(`[LogicSystem] Loaded script: ${scriptName}`);
            return module;
        } catch (error) {
            console.error(`[LogicSystem] Failed to load script ${scriptName}:`, error);
            return null;
        }
    }
    
    async loadAlgorithm(algorithmName) {
        if (this.algorithms.has(algorithmName)) {
            return this.algorithms.get(algorithmName);
        }
        
        try {
            const url = `/api/logic/${algorithmName}`;
            console.log(`[LogicSystem] Loading algorithm: ${algorithmName}`);
            
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            this.algorithms.set(algorithmName, data);
            
            console.log(`[LogicSystem] Loaded algorithm: ${algorithmName}`);
            return data;
        } catch (error) {
            console.error(`[LogicSystem] Failed to load algorithm ${algorithmName}:`, error);
            return null;
        }
    }
    
    async attachToEntity(entity, scriptName, events = ['start', 'update']) {
        if (!entity || !scriptName) return;
        
        // Detect if this is an Algorithm Studio script (.algorithm) or regular .js
        const isAlgorithm = scriptName.endsWith('.algorithm') || scriptName.includes('.algorithm');
        
        if (isAlgorithm) {
            // Load algorithm data
            const algorithmData = await this.loadAlgorithm(scriptName);
            if (!algorithmData) {
                console.warn(`[LogicSystem] Cannot attach non-existent algorithm: ${scriptName}`);
                return;
            }
            
            // Create AlgorithmRuntime instance
            const AlgorithmRuntime = window.AlgorithmRuntime;
            if (!AlgorithmRuntime) {
                console.error('[LogicSystem] AlgorithmRuntime class not loaded!');
                return;
            }
            
            const runtime = new AlgorithmRuntime(algorithmData, this.game, entity);
            this.algorithmRuntimes.set(entity.id, runtime);
            
            // Store on entity
            entity.algorithmScript = scriptName;
            entity.algorithmRuntime = runtime;
            entity.algorithmEvents = events;
            
            console.log(`[LogicSystem] Attached algorithm "${scriptName}" to entity ${entity.id || entity.name}`);
            
            // Auto-call onStart if event includes 'start'
            if (events.includes('start')) {
                await runtime.execute('start');
            }
        } else {
            // Load script if not already loaded (existing logic)
            const module = await this.loadScript(scriptName);
            if (!module) {
                console.warn(`[LogicSystem] Cannot attach non-existent script: ${scriptName}`);
                return;
            }
            
            // Create runtime instance for this entity
            const runtime = new window.LogicRuntime(this.game, entity);
            this.runtimes.set(entity.id, runtime);
            
            // Store on entity
            entity.logicScript = scriptName;
            entity.logicRuntime = runtime;
            entity.logicEvents = events;
            entity.logicState = {}; // Persistent state for this entity's logic
            
            console.log(`[LogicSystem] Attached logic "${scriptName}" to entity ${entity.id || entity.name}`);
            
            // Auto-call onStart if event includes 'start'
            if (events.includes('start')) {
                await this.trigger(entity, 'start');
            }
        }
    }
    
    async trigger(entity, eventName, data = {}) {
        if (!entity) return;
        
        // V2.0: Check for Visual Script Graph
        if (entity.logicScript && this.game.vsl) {
            const scriptName = entity.logicScript;
            // Check if we have the JSON graph loaded
            if (!this.algorithms.has(scriptName)) {
                // Try to load it on the fly
                await this.loadAlgorithm(scriptName);
            }
            const graph = this.algorithms.get(scriptName);
            if (graph && graph.version === "2.0") {
                // Execute using new Runtime
                await this.game.vsl.runGraph(graph, entity, `evt_${eventName}`);
                return;
            }
        }

        // Check if entity has algorithm runtime (Legacy)
        if (entity.algorithmRuntime) {
            const runtime = entity.algorithmRuntime;
            try {
                await runtime.execute(eventName, data);
            } catch (error) {
                console.error(`[LogicSystem] Error executing algorithm ${eventName}:`, error);
            }
            return;
        }
        
        // Fall back to regular script logic
        if (!entity.logicScript) return;
        
        const module = this.scripts.get(entity.logicScript);
        const runtime = this.runtimes.get(entity.id);
        
        if (!module || !runtime) {
            console.warn(`[LogicSystem] Cannot trigger ${eventName} - missing module or runtime for entity ${entity.id}`);
            return;
        }
        
        try {
            // Call appropriate event handler
            switch (eventName) {
                case 'start':
                    if (module.onStart) await module.onStart(runtime);
                    break;
                case 'update':
                    if (module.onUpdate) await module.onUpdate(runtime, data.dt || 0);
                    break;
                case 'interact':
                    if (module.onInteract) await module.onInteract(runtime, data.player);
                    break;
                case 'collide':
                    if (module.onCollide) await module.onCollide(runtime, data.other);
                    break;
                default:
                    console.warn(`[LogicSystem] Unknown event: ${eventName}`);
            }
        } catch (error) {
            console.error(`[LogicSystem] Error executing ${eventName} for ${entity.logicScript}:`, error);
        }
    }
    
    // Call update on all entities with logic every frame
    async updateAll(dt) {
        for (const [entityId, runtime] of this.runtimes) {
            const entity = runtime.owner;
            if (entity && entity.logicScript && entity.logicEvents?.includes('update')) {
                await this.trigger(entity, 'update', { dt });
            }
        }
    }
    
    detach(entity) {
        if (!entity) return;
        
        this.runtimes.delete(entity.id);
        delete entity.logicScript;
        delete entity.logicRuntime;
        delete entity.logicEvents;
        delete entity.logicState;
        
        console.log(`[LogicSystem] Detached logic from entity ${entity.id || entity.name}`);
    }
    
    // Hot-reload support
    async reload(scriptName) {
        this.loadedScripts.delete(scriptName);
        this.scripts.delete(scriptName);
        
        // Reload all entities using this script
        for (const [entityId, runtime] of this.runtimes) {
            if (runtime.owner.logicScript === scriptName) {
                await this.loadScript(scriptName);
                console.log(`[LogicSystem] Reloaded script ${scriptName} for entity ${entityId}`);
            }
        }
    }
}

// ============================================
// END LOGIC SYSTEM
// ============================================

window.AtmosphereSystem = class AtmosphereSystem {
    constructor() {
        this.canvas = document.getElementById('atmosphere-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.pixelScale = 4;
        this.clouds = [];
        this.islands = [];
        this.time = 0;
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.offCanvas = document.createElement('canvas');
        this.oCtx = this.offCanvas.getContext('2d');
    }
    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.internalW = Math.ceil(this.canvas.width / this.pixelScale);
        this.internalH = Math.ceil(this.canvas.height / this.pixelScale);
        if (this.offCanvas) {
            this.offCanvas.width = this.internalW;
            this.offCanvas.height = this.internalH;
        }
    }
    start() {
        if (!this.canvas) return;
        for (let i = 0; i < 5; i++) {
            this.islands.push({ x: Math.random() * this.internalW, y: Math.random() * this.internalH, w: 20 + Math.random() * 30, h: 10 + Math.random() * 15, speed: 0.05 + Math.random() * 0.1, seed: Math.random() * 100 });
        }
        for (let i = 0; i < 10; i++) {
            this.clouds.push({ x: Math.random() * this.internalW, y: Math.random() * this.internalH, w: 15 + Math.random() * 25, h: 8 + Math.random() * 12, speed: 0.1 + Math.random() * 0.2 });
        }
        this.animate();
    }
    animate() {
        if (!this.canvas || this.canvas.style.display === 'none') { requestAnimationFrame(() => this.animate()); return; }
        this.time += 0.01;
        const oCtx = this.oCtx;
        oCtx.imageSmoothingEnabled = false;
        const grad = oCtx.createLinearGradient(0, 0, 0, this.internalH); grad.addColorStop(0, '#4facfe'); grad.addColorStop(1, '#00f2fe');
        oCtx.fillStyle = grad; oCtx.fillRect(0, 0, this.internalW, this.internalH);
        oCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.clouds.forEach(c => { c.x -= c.speed; if (c.x + c.w < 0) c.x = this.internalW; oCtx.fillRect(Math.floor(c.x), Math.floor(c.y), c.w, c.h); });
        this.islands.forEach(isl => {
            isl.x -= isl.speed; if (isl.x + isl.w < 0) { isl.x = this.internalW; isl.y = Math.random() * this.internalH; } 
            const hover = Math.sin(this.time + isl.seed) * 2; const drawX = Math.floor(isl.x); const drawY = Math.floor(isl.y + hover);
            oCtx.fillStyle = '#2ecc71'; oCtx.fillRect(drawX, drawY, isl.w, isl.h / 3);
            oCtx.fillStyle = '#8b4513'; oCtx.beginPath(); oCtx.moveTo(drawX, drawY + isl.h / 3); oCtx.lineTo(drawX + isl.w, drawY + isl.h / 3); oCtx.lineTo(drawX + isl.w / 2, drawY + isl.h); oCtx.fill();
            if (isl.seed > 50) { oCtx.fillStyle = '#3498db'; oCtx.fillRect(drawX + isl.w/2 - 2, drawY + isl.h/3, 4, isl.h/2); } 
        });
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.offCanvas, 0, 0, this.internalW, this.internalH, 0, 0, this.canvas.width, this.canvas.height);
        requestAnimationFrame(() => this.animate());
    }
}

window.UISystem = class UISystem {
    constructor(game) { this.game = game; this.config = {}; this.activeScreen = null; }
    async init() { try { const res = await fetch('/dunyalar/definitions/ui.json'); if (res.ok) { const data = await res.json(); this.config = data.screens || {}; } } catch (e) { console.warn("UI Config load failed"); } }
    showScreen(screenId) {
        const old = document.getElementById('dynamic-ui-root'); if (old) old.remove();
        if (!this.config[screenId]) return; this.activeScreen = screenId;
        
        // Find or create the active screen's scaler
        let activeContainer = document.querySelector('.screen.active');
        let scaler = null;

        if (activeContainer) {
            scaler = activeContainer.querySelector('.ui-scaler');
        } else {
            // Check for game-container if we are in-game (HUD)
            const gameContainer = document.getElementById('game-container');
            if (gameContainer && !gameContainer.classList.contains('hidden')) {
                scaler = gameContainer.querySelector('.ui-scaler');
            }
        }

        if (!scaler) {
            // Fallback
            scaler = document.body;
        }

        const root = document.createElement('div'); root.id = 'dynamic-ui-root';
        root.style.width = '100%'; root.style.height = '100%';
        root.style.zIndex = '2000'; root.style.position = 'absolute'; root.style.top = '0'; root.style.left = '0'; root.style.pointerEvents = 'none';

        // Use Shared Renderer
        window.UIRenderer.render(this.config[screenId], root, {
            onClick: (action, e) => this.handleAction(action, e),
            variables: this.game.player // For {hp} bindings
        });

        scaler.appendChild(root);

        // --- Post-Render Population ---
        if (screenId === 'skill_selector') this.populateSkillSelector();
        if (screenId === 'inventory') this.populateInventoryGrid();
    }

    populateSkillSelector() {
        const container = document.getElementById('skill_container');
        if (!container) return;
        container.style.display = 'grid'; container.style.gridTemplateColumns = 'repeat(4, 1fr)'; container.style.padding = '20px'; container.style.gap = '15px';
        
        const skills = this.game.skillDefs || [];
        skills.forEach(skill => {
            const card = document.createElement('div');
            card.className = 'retro-panel'; 
            card.style.padding = '10px'; 
            card.style.cursor = 'pointer'; 
            card.style.display = 'flex'; 
            card.style.flexDirection = 'column'; 
            card.style.alignItems = 'center';
            card.style.pointerEvents = 'auto'; // FIX: Enable clicking
            
            const icon = window.createPixelImage(skill.sprite);
            icon.style.width = '64px'; icon.style.height = '64px';
            
            const name = document.createElement('div');
            name.innerText = skill.name; name.style.marginTop = '10px'; name.style.color = '#f1c40f';
            
            card.appendChild(icon); card.appendChild(name);
            
            // Selection logic (ID-based for robustness)
            const isSelected = this.game.activeSkills.some(s => s && s.id === skill.id);
            if (isSelected) card.style.borderColor = '#2ecc71';
            
            // Force high Z-Index and explicit cursor
            card.style.zIndex = '5000';
            card.style.cursor = 'pointer';

            card.onclick = (e) => {
                e.stopPropagation(); // Prevent bubbling
                console.log("Skill Clicked:", skill.name);
                const idx = this.game.activeSkills.findIndex(s => s && s.id === skill.id);
                if (idx !== -1) {
                    console.log("Deselecting at index", idx);
                    this.game.activeSkills[idx] = null;
                    card.style.borderColor = '#333';
                } else {
                    const emptySlot = this.game.activeSkills.indexOf(null);
                    if (emptySlot !== -1) {
                        console.log("Selecting at slot", emptySlot);
                        this.game.activeSkills[emptySlot] = skill;
                        card.style.borderColor = '#2ecc71';
                    } else alert("ONLY 4 SKILLS ALLOWED!");
                }
                this.game.updateSkillHUD();
            };
            container.appendChild(card);
        });
        console.log("Skill Selector Populated with", skills.length, "skills.");
    }

    populateInventoryGrid() {
        const grid = document.getElementById('inv_grid');
        if (!grid) return;
        grid.style.display = 'grid'; grid.style.gridTemplateColumns = 'repeat(6, 1fr)'; grid.style.padding = '20px'; grid.style.gap = '10px';
        
        // 24 Slots
        for (let i = 0; i < 24; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-grid-slot'; 
            
            const item = this.game.inventory[i];
            if (item) {
                const icon = window.createPixelImage(item.sprite);
                icon.style.width = '48px'; icon.style.height = '48px'; // Slightly smaller to fit padding
                slot.appendChild(icon);
                
                // Add count badge if needed (optional)
                if (item.count && item.count > 1) {
                    const badge = document.createElement('span');
                    badge.className = 'count-badge';
                    badge.innerText = item.count;
                    slot.appendChild(badge);
                }

                slot.onclick = () => {
                    this.game.useItem(i);
                    this.populateInventoryGrid(); // Refresh
                };
            }
            grid.appendChild(slot);
        }
    }

    async handleAction(scriptName, e) {
        if (!scriptName) return;
        const menu = window.menuSystem;

        // Dynamic navigate: prefix — navigate to any UI screen
        if (scriptName.startsWith('navigate:')) {
            const targetScreen = scriptName.substring(9);
            if (targetScreen && this.config[targetScreen]) {
                menu.showDynamicScreen(targetScreen);
            } else {
                console.warn('[UI] Navigate target not found:', targetScreen);
            }
            return;
        }

        // Structured action: prefix — strip and fall through to switch
        let action = scriptName;
        if (scriptName.startsWith('action:')) {
            action = scriptName.substring(7);
        }

        switch(action) {
            case 'start_skill_selector': menu.switchScreen('skill_selector'); break;
            case 'confirm_skills_and_start': menu.startGame(true); break;
            case 'start_game': menu.startGame(true); break;
            case 'load_game': menu.startGame(false); break;
            case 'logout': menu.logout(); break;
            case 'resume_game': menu.togglePause(); break;
            case 'quit_to_menu': menu.quitGame(); break;
            case 'open_engine': window.location.href = '/tools.html'; break;
            case 'open_campaigns': window.location.href = 'campaign_launcher.html'; break;
            case 'open_credits': window.location.href = 'credits.html'; break;
            case 'show_campaign_map': 
                if (this.game.campaign && this.game.campaign.controller) {
                    this.showCampaignMapOverlay();
                }
                break;
            case 'open_settings_screen': menu.switchScreen('settings'); break;
            case 'back_from_settings': 
                if (menu.game.isPaused) menu.switchScreen('pause');
                else menu.switchScreen('mainMenu');
                break;
            case 'toggle_touch':
                const controls = document.getElementById('mobile-controls');
                if (controls) {
                    const isHidden = controls.classList.contains('hidden');
                    if (isHidden) controls.classList.remove('hidden');
                    else controls.classList.add('hidden');
                    
                    if (e && e.target) {
                        e.target.innerText = isHidden ? "TOUCH CONTROLS: ON" : "TOUCH CONTROLS: OFF";
                    }
                }
                break;
            default: console.log("Action Triggered:", action);
        }
    }
    
    showCampaignMapOverlay() {
        const controller = this.game.campaign.controller;
        if (!controller) return;
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'campaign-map-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-family: 'VT323', monospace;
        `;
        
        // Title
        const title = document.createElement('h2');
        title.innerText = controller.campaignMetadata?.name || 'Campaign Progress';
        title.style.cssText = 'color: #f1c40f; font-size: 48px; margin-bottom: 20px; text-shadow: 2px 2px #000;';
        overlay.appendChild(title);
        
        // Progress info
        const info = document.createElement('div');
        info.style.cssText = 'font-size: 24px; margin-bottom: 30px; text-align: center;';
        const totalNodes = controller.campaignData.nodes.length;
        const completed = controller.completedNodes.length;
        const progress = Math.floor((completed / totalNodes) * 100);
        
        info.innerHTML = `
            <p>Progress: ${completed}/${totalNodes} nodes (${progress}%)</p>
            <p>Current Node: ${controller.currentNodeId || 'Starting...'}</p>
            <p>Global Flags: ${Object.keys(controller.globalFlags).filter(k => controller.globalFlags[k]).join(', ') || 'None'}</p>
        `;
        overlay.appendChild(info);
        
        // Node list
        const nodeList = document.createElement('div');
        nodeList.style.cssText = `
            max-height: 400px;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.5);
            padding: 20px;
            border: 2px solid #3498db;
            border-radius: 8px;
            width: 600px;
            margin-bottom: 20px;
        `;
        
        controller.campaignData.nodes.forEach(node => {
            const nodeDiv = document.createElement('div');
            const isCompleted = controller.completedNodes.includes(node.id);
            const isCurrent = controller.currentNodeId === node.id;
            
            let icon = '○';
            let color = '#888';
            if (isCompleted) {
                icon = '✓';
                color = '#2ecc71';
            } else if (isCurrent) {
                icon = '▶';
                color = '#3498db';
            }
            
            nodeDiv.innerHTML = `<span style="color: ${color};">${icon} ${node.type.toUpperCase()}: ${node.id}</span>`;
            nodeDiv.style.cssText = 'margin: 10px 0; font-size: 20px;';
            nodeList.appendChild(nodeDiv);
        });
        
        overlay.appendChild(nodeList);
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerText = 'CLOSE';
        closeBtn.style.cssText = `
            background: #e74c3c;
            color: #fff;
            border: none;
            padding: 15px 40px;
            font-size: 24px;
            font-family: 'VT323', monospace;
            cursor: pointer;
            border-radius: 5px;
        `;
        closeBtn.onclick = () => overlay.remove();
        overlay.appendChild(closeBtn);
        
        document.body.appendChild(overlay);
    }
}

window.MenuSystem = class MenuSystem {
    constructor(gameInstance) {
        this.game = gameInstance; this.currentUser = "GUEST"; this.atmosphere = new window.AtmosphereSystem(); this.music = document.getElementById('menu-music');
        this.uiSystem = this.game.uiSystem; // Shared instance
        this.screens = { 
            login: document.getElementById('login-screen'), 
            mainMenu: document.getElementById('main-menu'), 
            overlay: document.getElementById('overlay-screen'), 
            game: document.getElementById('game-container'), 
            pause: document.getElementById('pause-menu'),
            skill_selector: document.getElementById('skill-selector-screen'),
            inventory: document.getElementById('inventory-screen'),
            settings: document.getElementById('settings-screen')
        };
        this.pauseState = { main: document.getElementById('pause-main'), options: document.getElementById('pause-options') };
        this.init();
    }
    async init() { 
        await this.uiSystem.init(); 
        this.setupEventListeners(); 
        this.atmosphere.start(); 
        
        // Preload Definitions for UI (Skills, etc.)
        await this.game.loadDefinitions();

        // Check for campaign mode first
        if (window.CAMPAIGN_MODE && window.CAMPAIGN_DATA && window.CAMPAIGN_SETTINGS) {
            await this.startCampaignMode();
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const isPlaytest = urlParams.get('playtest') === 'true' || urlParams.get('playtest') === '1';
        if (isPlaytest) {
            await this.startTestMode(urlParams);
            return;
        }

        const savedName = localStorage.getItem('ketebe_username'); 
        if (savedName) this.login(savedName); 
    }
    async startTestMode(urlParams = new URLSearchParams(window.location.search)) {
        const raw = localStorage.getItem('ketebe_test_map') || localStorage.getItem('temp_playtest');
        if (!raw) {
            console.error('[RPG Playtest] No map data found in localStorage.');
            return;
        }

        const requestedSession = urlParams.get('session');
        const latestSession = localStorage.getItem('ketebe_test_session');
        if (requestedSession && latestSession && requestedSession !== latestSession) {
            console.log(`[RPG Playtest] Ignoring stale playtest session: ${requestedSession}`);
            return;
        }

        let mapData = null;
        try {
            mapData = JSON.parse(raw);
        } catch (error) {
            console.error('[RPG Playtest] Invalid playtest map payload:', error);
            return;
        }

        this.screens.login.classList.add('hidden');
        this.screens.mainMenu.classList.add('hidden');
        const loadScreen = document.getElementById('loading-screen');
        if (loadScreen) loadScreen.classList.remove('hidden');

        await this.game.start("DEV_TESTER", true, { skipInitialLevelLoad: true });
        await this.game.loadLevelFromData(mapData);

        if (loadScreen) loadScreen.classList.add('hidden');
        this.switchScreen('game');
    }
    setupEventListeners() {
        const get = (id) => document.getElementById(id);
        const add = (id, fn) => { const el = get(id); if (el) el.addEventListener('click', fn); };
        add('login-btn', () => { const input = get('username-input'); const name = input.value.trim().toUpperCase(); if (name.length > 0) { this.login(name); this.playMusic(); } else alert("PLEASE ENTER A NAME!"); });
        add('btn-new-game', () => this.startGame(true)); add('btn-load-game', () => this.startGame(false)); add('btn-engine', () => window.location.href = '/tools.html');
        add('btn-cheats', () => this.showOverlay('CHEATS', 'God Mode: OFF\nInfinite Gold: OFF')); add('btn-settings', () => this.showOverlay('SETTINGS', 'Use In-Game Menu for Settings'));
        add('btn_credits', () => window.location.href = 'credits.html'); add('btn-logout', () => this.logout());
        add('btn-close-overlay', () => { this.screens.overlay.classList.add('hidden'); this.screens.overlay.classList.remove('active'); });
        add('pause-btn', () => this.togglePause()); add('btn-resume', () => this.togglePause());
        add('btn-options', () => { if(this.pauseState.main) this.pauseState.main.classList.add('hidden'); if(this.pauseState.options) this.pauseState.options.classList.remove('hidden'); });
        add('btn-quit', () => this.quitGame()); add('btn-options-back', () => { if(this.pauseState.options) this.pauseState.options.classList.add('hidden'); if(this.pauseState.main) this.pauseState.main.classList.remove('hidden'); });
        const langSelect = get('lang-select'); if (langSelect) { langSelect.value = localStorage.getItem('ketebe_lang') || 'EN'; langSelect.addEventListener('change', (e) => { window.LOCALE.setLanguage(e.target.value); }); }
        const touchBtn = get('opt-touch-toggle'); if (touchBtn) { touchBtn.addEventListener('click', () => { const mc = get('mobile-controls'); if (touchBtn.innerText === "ON") { touchBtn.innerText = "OFF"; if(mc) mc.classList.add('hidden'); } else { touchBtn.innerText = "ON"; if(mc) mc.classList.remove('hidden'); } }); }
        const invSlots = document.querySelectorAll('.inv-slot'); invSlots.forEach((slot, idx) => { slot.addEventListener('click', () => { const item = this.game.inventory[idx]; if (item) this.game.useItem(idx); else { invSlots.forEach(s => s.classList.remove('selected')); slot.classList.add('selected'); } }); });
        window.addEventListener('keydown', (e) => { 
            if (e.key === 'Escape' && this.game.isRunning) this.togglePause(); 
            if (e.key === 'e' && this.game.isRunning && (!this.game.isPaused || this.uiSystem.activeScreen === 'inventory')) this.toggleInventory();
        });
    }
    async playMusic() { }
    stopMusic() { if (this.music) { this.music.pause(); this.music.currentTime = 0; } if (this.game && this.game.audio) this.game.audio.stopAll(); }
    async login(name) { this.currentUser = name; localStorage.setItem('ketebe_username', name); const display = document.getElementById('current-user-display'); if (display) display.innerText = name; localStorage.removeItem('ketebe_character'); try { const res = await fetch(`/api/profile/${name}`); if (res.ok) { const p = await res.json(); localStorage.setItem('ketebe_character', JSON.stringify(p)); if (this.game) this.game.loadProfileData(p); } } catch (e) {} this.switchScreen('mainMenu'); }
    logout() { this.currentUser = "GUEST"; localStorage.removeItem('ketebe_username'); localStorage.removeItem('ketebe_character'); document.getElementById('username-input').value = ""; this.switchScreen('login'); }
    switchScreen(screenName) {
        Object.values(this.screens).forEach(el => { if (el) { el.classList.remove('active'); el.classList.add('hidden'); } });
        const target = this.screens[screenName]; if (target) { target.classList.remove('hidden'); target.classList.add('active'); }

        // FIX: Ensure game is visible behind pause menu (needed when returning from Settings)
        if (screenName === 'pause') {
            if (this.screens.game) this.screens.game.classList.remove('hidden');
        }

        if (screenName === 'mainMenu') { this.uiSystem.showScreen('main_menu'); }
        else if (screenName === 'pause') { this.uiSystem.showScreen('pause_menu'); }
        else if (screenName === 'skill_selector') { this.uiSystem.showScreen('skill_selector'); }
        else if (screenName === 'inventory') { this.uiSystem.showScreen('inventory'); }
        else if (screenName === 'settings') { this.uiSystem.showScreen('settings_menu'); }
        else { const old = document.getElementById('dynamic-ui-root'); if (old) old.remove(); }
        
        if (this.atmosphere && this.atmosphere.canvas) {
            // Hide atmosphere in-game or in-pause (since game is visible)
            this.atmosphere.canvas.style.display = (screenName === 'game' || screenName === 'pause') ? 'none' : 'block';
        }
        if (screenName === 'game') { 
            this.screens.game.style.display = 'block'; 
            this.screens.game.classList.remove('hidden'); 
            this.stopMusic(); 
            this.uiSystem.showScreen('hud'); 
            if(this.game.refreshUI) this.game.refreshUI();
        } else { if (this.currentUser !== "GUEST") this.playMusic(); }
    }
    showOverlay(title, body) { document.getElementById('overlay-title').innerText = title; document.getElementById('overlay-body').innerText = body; this.screens.overlay.classList.remove('hidden'); this.screens.overlay.classList.add('active'); } 
    async startGame(isNew) { 
        const loadScreen = document.getElementById('loading-screen'); const bar = document.getElementById('game-loading-bar'); const text = document.getElementById('game-loading-text');
        loadScreen.classList.remove('hidden'); if(this.screens.mainMenu) this.screens.mainMenu.classList.add('hidden');
        const initPromise = this.game.start(this.currentUser, isNew);
        for(let i=0; i<=90; i+=2) { bar.style.width = `${i}%`; text.innerText = `${i}%`; await new Promise(r => setTimeout(r, 10)); }
        await initPromise; bar.style.width = '100%'; text.innerText = '100%'; await new Promise(r => setTimeout(r, 200));
        loadScreen.classList.add('hidden'); this.switchScreen('game'); 
    }
    togglePause() { 
        const hud = document.getElementById('game-hud'); 
        if (this.game.isPaused) { 
            // RESUME
            this.game.isPaused = false; 
            this.switchScreen('game'); // Proper cleanup
        } else { 
            // PAUSE
            this.game.isPaused = true; 
            this.switchScreen('pause'); // Use switchScreen for pause too for consistency?
            // But existing logic was manual. Let's keep manual for PAUSE to avoid full redraw if desired, 
            // BUT for RESUME we must use switchScreen to clear Inventory/Settings overlays.
        } 
    }
    toggleInventory() {
        if (this.uiSystem.activeScreen === 'inventory') {
            this.game.isPaused = false;
            this.switchScreen('game');
        } else {
            this.game.isPaused = true;
            this.switchScreen('inventory');
        }
    }
    showDynamicScreen(screenId) {
        // For user-defined screens from ui.json, dynamically create a container if needed
        if (!this.screens[screenId]) {
            const container = document.createElement('div');
            container.id = `dynamic-screen-${screenId}`;
            container.className = 'screen hidden';
            container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1500;';
            document.body.appendChild(container);
            this.screens[screenId] = container;
        }
        // Hide all screens, show target + render UI
        Object.values(this.screens).forEach(el => { if (el) { el.classList.remove('active'); el.classList.add('hidden'); } });
        // Keep game visible behind overlay screens
        if (this.screens.game && this.game.isRunning) this.screens.game.classList.remove('hidden');
        const target = this.screens[screenId];
        if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
        this.uiSystem.showScreen(screenId);
    }
    quitGame() { 
        // Check if campaign mode and quit to launcher
        if (window.CAMPAIGN_MODE) {
            window.location.href = 'campaign_launcher.html';
        } else {
            this.game.stop(); 
            this.game.isPaused = false; 
            this.screens.pause.classList.add('hidden'); 
            this.switchScreen('mainMenu'); 
        }
    }
    
    async startCampaignMode() {
        console.log('[MenuSystem] Starting campaign mode...');
        
        const { campaignId, shouldContinue, saveSlot } = window.CAMPAIGN_SETTINGS;
        const campaignData = window.CAMPAIGN_DATA;
        
        // Auto-login with username (use saved or default)
        let username = sessionStorage.getItem('ketebe_username');
        if (!username) {
            username = localStorage.getItem('ketebe_username') || 'PLAYER';
        }
        
        this.currentUser = username;
        localStorage.setItem('ketebe_username', username);
        
        // Skip login screen, go straight to loading
        this.screens.login.classList.add('hidden');
        this.screens.mainMenu.classList.add('hidden');
        
        const loadScreen = document.getElementById('loading-screen');
        const bar = document.getElementById('game-loading-bar');
        const text = document.getElementById('game-loading-text');
        
        loadScreen.classList.remove('hidden');
        bar.style.width = '10%';
        text.innerText = 'Initializing Campaign...';
        
        try {
            // Initialize game
            await this.game.start(this.currentUser, !shouldContinue);
            bar.style.width = '40%';
            text.innerText = 'Loading Campaign Data...';
            
            // Set campaign data in the CampaignSystem
            if (this.game.campaign) {
                this.game.campaign.data = campaignData;
                
                // Check if multi-engine and initialize controller
                if (this.game.campaign._isMultiEngineCampaign()) {
                    await this.game.campaign._initController();
                    bar.style.width = '60%';
                    text.innerText = 'Starting Campaign...';
                    
                    // Start or continue campaign
                    if (shouldContinue) {
                        // Load campaign state
                        const stateResponse = await fetch(`/api/campaign-state/${username}`);
                        if (stateResponse.ok) {
                            const state = await stateResponse.json();
                            if (state.campaignId === campaignId && this.game.campaign.controller) {
                                await this.game.campaign.controller.loadCampaignState(state);
                                bar.style.width = '80%';
                                text.innerText = 'Resuming Campaign...';
                                // Resume from saved node
                                await this.game.campaign.controller.processNode(state.currentNodeId);
                            } else {
                                // State mismatch, start fresh
                                await this.game.campaign.start();
                            }
                        } else {
                            // No save found, start fresh
                            await this.game.campaign.start();
                        }
                    } else {
                        // New campaign
                        await this.game.campaign.start();
                    }
                } else {
                    // Single engine campaign - use normal flow
                    await this.game.campaign.start();
                }
                
                bar.style.width = '100%';
                text.innerText = 'Campaign Ready!';
                await new Promise(r => setTimeout(r, 500));
                
                loadScreen.classList.add('hidden');
                this.switchScreen('game');
                
            } else {
                throw new Error('Campaign system not available');
            }
        } catch (error) {
            console.error('[MenuSystem] Campaign start failed:', error);
            alert('Failed to start campaign: ' + error.message);
            window.location.href = 'campaign_launcher.html';
        }
    }
}

window.Particle = class Particle {
    constructor(x, y, vx, vy, color, life, size = 4, spriteFrames = null) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.color = color; this.life = life; this.maxLife = life; this.size = size; this.spriteFrames = spriteFrames;
    }
    update(deltaTime) { this.x += this.vx * deltaTime; this.y += this.vy * deltaTime; this.life -= deltaTime; }
    draw(ctx, camX, camY) {
        const alpha = Math.max(0, this.life / this.maxLife); ctx.globalAlpha = alpha;
        if (this.spriteFrames && this.spriteFrames.length > 0) {
            const frameIdx = Math.floor(((this.maxLife - this.life) / this.maxLife) * this.spriteFrames.length);
            const frame = this.spriteFrames[Math.min(frameIdx, this.spriteFrames.length - 1)];
            ctx.drawImage(frame, Math.floor(this.x - camX), Math.floor(this.y - camY), this.size, this.size);
        } else { ctx.fillStyle = this.color; ctx.fillRect(Math.floor(this.x - camX), Math.floor(this.y - camY), this.size, this.size); }
        ctx.globalAlpha = 1.0;
    }
}

window.WeatherSystem = class WeatherSystem {
    constructor() { this.particles = []; this.type = 'ash'; }
    update(deltaTime, width, height) {
        if (this.type === 'ash' && this.particles.length < 50) { this.particles.push({ x: Math.random() * width, y: -10, vx: (Math.random() - 0.5) * 50, vy: 20 + Math.random() * 30, size: 1 + Math.random() * 2 }); } 
        for (let i = this.particles.length - 1; i >= 0; i--) { const p = this.particles[i]; p.x += p.vx * deltaTime; p.y += p.vy * deltaTime; if (p.y > height || p.x < 0 || p.x > width) this.particles.splice(i, 1); }
    }
    draw(ctx) {
        if (this.type === 'ash') { ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; this.particles.forEach(p => ctx.fillRect(p.x, p.y, p.size, p.size)); }
        if (this.type === 'heat') { const offset = Math.sin(Date.now() * 0.005) * 5; ctx.fillStyle = 'rgba(231, 76, 60, 0.05)'; ctx.fillRect(offset, 0, ctx.canvas.width, ctx.canvas.height); }
    }
}

// NPC class now loaded from NPC.js

window.Enemy = class Enemy {
    constructor(x, y, id, game) {
        this.x = x; this.y = y; this.id = id; this.game = game; this.width = 16; this.height = 16; this.scale = 3;
        
        // --- DEFINITION & STATS ---
        let def = game.enemyDefs[id]; 
        if (!def || !def.stats) { const oldDef = def || { hp: 50, speed: 100, ai: 'patrol', range: 250, sprite: 'monster' }; def = { id: id, name: oldDef.name || id, stats: { hp: oldDef.hp || 50, speed: oldDef.speed || 100, xp: 20, damage: 10 }, ai: { type: oldDef.ai || 'patrol', range: oldDef.range || 250, attackRange: 150, patrolRadius: 100, cooldown: 1.5 }, animations: { idle: { sprite: oldDef.sprite || 'monster', speed: 0.15 }, run: { sprite: oldDef.sprite || 'monster', speed: 0.15 }, attack: { sprite: oldDef.sprite || 'monster', speed: 0.15 }, hit: { sprite: oldDef.sprite || 'monster', speed: 0.15 }, death: { sprite: oldDef.sprite || 'monster', speed: 0.15 } } }; } 
        this.def = def; this.hp = def.stats.hp; this.maxHp = def.stats.hp; this.speed = def.stats.speed; this.ai = def.ai;
        
        // --- SPRITES ---
        this.sprites = {}; 
        if (def.animations) { Object.keys(def.animations).forEach(key => { this.sprites[key] = window.createPixelImage(def.animations[key].sprite); }); } 
        else { this.sprites.idle = window.createPixelImage(def.sprite || 'monster'); } 
        
        // --- ANIMATION STATE ---
        this.visualState = 'idle'; // decoupled from logic state
        this.animTimer = 0; this.animFrame = 0; 
        this.dir = { x: 1, y: 0 };
        this.origin = { x: x, y: y };
        
        // --- STATE MACHINE ---
        const fsmStates = {
            IDLE: {
                enter: (en) => { en.visualState = 'idle'; },
                update: (en, dt, timer) => {
                    const dist = en.distToPlayer();
                    if (dist < en.ai.range) { en.fsm.change('CHASE'); return; }
                    
                    if (en.ai.type === 'patrol' && timer > 2.0) {
                        en.fsm.change('PATROL');
                    }
                }
            },
            PATROL: {
                enter: (en) => {
                    en.visualState = 'run';
                    const angle = Math.random() * Math.PI * 2;
                    en.patrolDir = { x: Math.cos(angle), y: Math.sin(angle) };
                },
                update: (en, dt, timer) => {
                    if (en.distToPlayer() < en.ai.range) { en.fsm.change('CHASE'); return; }
                    if (timer > 2.0) { en.fsm.change('IDLE'); return; }
                    
                    en.move(en.patrolDir.x, en.patrolDir.y, en.speed * 0.5, dt);
                }
            },
            CHASE: {
                enter: (en) => { en.visualState = 'run'; },
                update: (en, dt) => {
                    const dist = en.distToPlayer();
                    if (dist > en.ai.range * 1.5) { en.fsm.change('IDLE'); return; }
                    
                    if (dist < en.ai.attackRange) { 
                         // Check cooldown
                         if (en.shootTimer <= 0) { en.fsm.change('ATTACK'); return; }
                    }
                    
                    // Move towards player
                    const dx = en.game.player.x - en.x;
                    const dy = en.game.player.y - en.y;
                    const angle = Math.atan2(dy, dx);
                    en.move(Math.cos(angle), Math.sin(angle), en.speed, dt);
                    en.shootTimer -= dt;
                }
            },
            ATTACK: {
                enter: (en) => { 
                    en.visualState = 'attack'; 
                    en.animFrame = 0;
                    // Shoot immediately or at specific frame? Let's shoot now for simplicity
                    const dx = en.game.player.x - en.x;
                    const dy = en.game.player.y - en.y;
                    en.shoot(Math.atan2(dy, dx));
                    en.shootTimer = en.ai.cooldown || 1.5;
                },
                update: (en, dt, timer) => {
                    if (timer > 0.5) { // Attack anim duration
                        en.fsm.change('CHASE');
                    }
                }
            }
        };

        this.fsm = new window.StateMachine(this, fsmStates);
        this.fsm.change('IDLE');
        this.shootTimer = 0;
    }
    
    distToPlayer() {
        const sw = this.width * this.scale, sh = this.height * this.scale;
        return Math.sqrt((this.game.player.x + 24 - (this.x + sw/2))**2 + (this.game.player.y + 24 - (this.y + sh/2))**2);
    }

    move(dx, dy, speed, dt) {
        this.game.moveEntity(this, dx, dy, speed, dt);
    }

    update(deltaTime) {
        // Animation Tick
        const currentAnimConfig = this.def.animations[this.visualState] || this.def.animations['idle']; 
        const frameSpeed = currentAnimConfig.speed || 0.15; 
        const sprite = this.sprites[this.visualState] || this.sprites['idle']; 
        const frameCount = (sprite && sprite.width) ? Math.max(1, Math.floor(sprite.width / 16)) : 1;
        
        this.animTimer += deltaTime; 
        if (this.animTimer > frameSpeed) { 
            this.animTimer = 0; 
            this.animFrame = (this.animFrame + 1) % frameCount; 
        }

        // Logic Tick
        if (this.ai.type === 'static') { 
            this.handleStaticAI(deltaTime); 
            this.visualState = 'idle'; 
        } else {
            this.fsm.update(deltaTime);
        }
    }
    handleStaticAI(deltaTime) { const distToPlayer = Math.sqrt((this.game.player.x - this.x)**2 + (this.game.player.y - this.y)**2); if (distToPlayer < this.ai.range) { const dx = this.game.player.x - this.x; const dy = this.game.player.y - this.y; const angle = Math.atan2(dy, dx); this.shootTimer -= deltaTime; if (this.shootTimer <= 0) { this.shootTimer = this.ai.cooldown || 2.0; this.shoot(angle); } } } 
    shoot(angle) { const vx = Math.cos(angle); const vy = Math.sin(angle); const spawnX = this.x + (this.width * this.scale) / 2; const spawnY = this.y + (this.height * this.scale) / 2; const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#8e44ad'; ctx.fillRect(4, 4, 8, 8); ctx.fillStyle = '#2c3e50'; ctx.fillRect(6, 6, 4, 4); const projectile = this.game.spawnFireball(spawnX, spawnY, vx, vy, canvas); if(projectile) { projectile.speed = 250; projectile.isEnemy = true; } }
    draw(ctx, cameraX, cameraY) { ctx.imageSmoothingEnabled = false; const sprite = this.sprites[this.visualState] || this.sprites['idle']; if (!sprite) return; const frameCount = Math.floor(sprite.width / 16) || 1; const safeFrame = this.animFrame % frameCount; const sourceX = safeFrame * 16; ctx.drawImage(sprite, sourceX, 0, 16, 16, Math.floor(this.x - cameraX), Math.floor(this.y - cameraY), 48, 48); if (this.hp < this.maxHp) { ctx.fillStyle = '#000'; ctx.fillRect(this.x-cameraX, this.y-cameraY-10, 48, 6); ctx.fillStyle = '#e74c3c'; ctx.fillRect(this.x-cameraX+1, this.y-cameraY-9, (this.hp/this.maxHp)*46, 4); } }
}

window.Fireball = class Fireball {
    constructor() { this.active = false; this.x = 0; this.y = 0; this.dx = 0; this.dy = 0; this.sprite = null; this.width = 0; this.height = 0; this.life = 0; this.speed = 400; this.scale = 2; this.isEnemy = false; this.isText = false; }
    reset(x, y, dx, dy, sprite) {
        this.active = true;
        this.x = x; this.y = y; this.dx = dx; this.dy = dy; this.sprite = sprite; 
        this.width = sprite.width; this.height = sprite.height; 
        this.life = 2.0; this.speed = 400; this.scale = 2; 
        this.isEnemy = false; 
        this.isText = (sprite instanceof HTMLCanvasElement);
    }
    update(deltaTime, mapSystem) { 
        if (!this.active) return;
        this.life -= deltaTime; 
        this.x += this.dx * this.speed * deltaTime; 
        this.y += this.dy * this.speed * deltaTime; 
        const sw = this.width * this.scale, sh = this.height * this.scale; 
        const cx = this.x + sw / 2; 
        const cy = this.y + sh / 2; 
        
        // Projectiles pass over half-height obstacles but are blocked by solid walls
        const collType = mapSystem.getCollisionType(cx, cy);
        if (collType === 1 || collType === 2) { // Solid or shadowless wall
            this.life = 0;
        }
        // Passes through half-height (3), one-way (4-7), and trigger zones (8)
    }
}

window.Core = class Core {
    constructor() {
        this.canvas = document.getElementById('gameCanvas'); this.ctx = this.canvas.getContext('2d');
        this.input = new window.InputHandler(this.canvas); this.mapSystem = new window.MapSystem(this.ctx);
        this.dialogueSystem = new window.DialogueSystem(); this.achievementSystem = new window.AchievementSystem(); this.saveSystem = new window.SaveSystem();
        this.questSystem = new window.QuestSystem(this);
        this.campaignSystem = new window.CampaignSystem(this); 
        this.uiSystem = new window.UISystem(this);
        
        // Initialize Logic System
        this.logicSystem = new window.LogicSystem(this);
        
        // V2.0: Initialize Visual Script Runtime
        if (window.VisualScriptEngine) {
            this.vsl = new window.VisualScriptEngine(this);
            console.log("[Core] VisualScriptEngine initialized (v2.0)");
        } else {
            // Lazy load if not present (Phase 1)
            import('./VisualScriptEngine.js').then(m => {
                window.VisualScriptEngine = m.VisualScriptEngine;
                this.vsl = new m.VisualScriptEngine(this);
                console.log("[Core] VisualScriptEngine lazy-loaded (v2.0)");
            });
        }
        
        // Initialize Interactive Cutscene Engine (Phase 1)
        if (window.InteractiveCutsceneEngine) {
            this.interactiveCutsceneEngine = new window.InteractiveCutsceneEngine(this);
            console.log("Interactive Cutscene Engine initialized");
        } 
        
        this.isRunning = false; this.isPaused = false;
        this.player = {
            x: 0, y: 0, width: 16, height: 16, scale: 3, speed: 250, direction: 1, hp: 100, maxHp: 100, mana: 50, maxMana: 50, stamina: 100, maxStamina: 100,
            state: 'idle', frame: 0, timer: 0, animSpeed: 0.15, shootCooldown: 0, vy: 0, onGround: false, jumpForce: -600, gravity: 1500, manaDepleted: false,
            history: [], segmentCount: 8, segmentSpacing: 4, glowColor: '#e74c3c'
        };
        this.playerHead = window.createPixelImage('caterpillar_head'); this.playerBody = window.createPixelImage('caterpillar_body'); this.targetSprite = window.createPixelImage('target');
        this.fireFrames = [window.createPixelImage('fire_1'), window.createPixelImage('fire_2'), window.createPixelImage('fire_3')];
        
        const createTextSprite = (text) => { const canvas = document.createElement('canvas'); const fontSize = 14; const h = 20; const w = Math.max(20, text.length * 12 + 4); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; const cx = w / 2; const cy = h / 2; ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e74c3c'; for(let ox=-1; ox<=1; ox++) for(let oy=-1; oy<=1; oy++) ctx.fillText(text, cx + ox, cy + oy); ctx.fillStyle = '#f39c12'; ctx.fillText(text, cx, cy - 1); ctx.fillText(text, cx, cy + 1); ctx.fillText(text, cx - 1, cy); ctx.fillText(text, cx + 1, cy); ctx.fillStyle = '#ffffff'; ctx.fillText(text, cx, cy); return canvas; };
        this.irabSprites = ['أ','ب','ت','ج','د','ر','س','ص','ط','ع','ف','ق','ك','ل','م','ن','هـ','و','ي'].map(createTextSprite);
        this.ultimateSprites = ['فعل','فاعل','مفعول به','رفع','نصب','جر','مبتدأ','خبر'].map(createTextSprite);
        
        this.fireballs = []; 
        for(let i=0; i<200; i++) this.fireballs.push(new window.Fireball()); // Pool init
        this.fireballIndex = 0;
        this.collisionCandidates = []; // GC Optimization
        this.renderLights = []; // GC Optimization

        this.enemies = []; this.npcs = []; this.particles = []; this.weather = new window.WeatherSystem(); this.screenShake = 0;
        this.fx = new window.FXSystem(this.ctx, this.canvas.width, this.canvas.height); 
        this.audio = new window.AudioSystem(); 
        this.console = new window.DebugConsole(this); 
        this.gameTime = 8.0; this.timeSpeed = 0.1; 
        
        this.entities = []; this.camera = { x: 0, y: 0 }; this.prevCamera = { x: 0, y: 0 }; this.currentLevel = 1; this.currentLevelId = 'level1';
        this.spatialHash = new window.SpatialHash(128); // Cell Size 128
        this.enemyDefs = {}; this.npcDefs = {}; this.itemDefs = []; this.skillDefs = []; this.inventory = []; this.activeSkills = [null, null, null, null];
        this.campaign = []; // Initialize empty campaign array
        
        this.revives = 5;
        this.respawns = 3;
        this.uiBars = { 
            hp: document.querySelector('.bar-fill.hp') || document.getElementById('hp_bar_fill'), 
            stamina: document.querySelector('.bar-fill.stamina') || document.getElementById('stamina_bar_fill'), 
            mana: document.querySelector('.bar-fill.mana') || document.getElementById('mana_bar_fill') 
        };
        this.interactionHint = document.getElementById('interaction-hint');
        this.lastTime = performance.now();
        this.accumulator = 0;
        this.fixedTimeStep = 1 / 60;
        this.loadProfileData(); this.setupDeathEvents(); this.resize(); window.addEventListener('resize', () => this.resize());
        
        const fsBtn = document.getElementById('fullscreen-btn'); if (fsBtn) fsBtn.addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); });
        const isoBtn = document.getElementById('debug-iso-btn'); if (isoBtn) isoBtn.addEventListener('click', () => { this.mapSystem.type = (this.mapSystem.type === 'isometric') ? 'topdown' : 'isometric'; });
        const saveBtn = document.getElementById('btn-save'); if (saveBtn) saveBtn.addEventListener('click', async () => { if (this.isRunning && this.playerName) { const gameState = { level: this.currentLevel, player: this.player, inventory: this.inventory, activeSkills: this.activeSkills }; if (await this.saveSystem.save(this.playerName, 1, gameState)) alert("GAME SAVED!"); else alert("SAVE FAILED!"); } });
    }

    login(username) {
        console.log(`[RPG Core] Login requested for: ${username}`);
        if (window.menuSystem) {
            window.menuSystem.login(username);
        } else {
            console.warn("[RPG Core] MenuSystem not ready for login.");
        }
    }

    refreshUI() {
        this.uiBars = { 
            hp: document.querySelector('.bar-fill.hp') || document.getElementById('hp_bar_fill'), 
            stamina: document.querySelector('.bar-fill.stamina') || document.getElementById('stamina_bar_fill'), 
            mana: document.querySelector('.bar-fill.mana') || document.getElementById('mana_bar_fill') 
        };
    }

    log(msg, type = 'info') { const color = type === 'error' ? 'red' : (type === 'success' ? 'green' : 'white'); console.log(`%c[GAME] ${msg}`, `color: ${color}`); if (this.console && this.console.log) this.console.log(msg, type); }

    setupDeathEvents() {
        const btnRevive = document.getElementById('btn-revive'); const btnRespawn = document.getElementById('btn-respawn'); const btnQuit = document.getElementById('btn-death-quit');
        if (btnRevive) btnRevive.onclick = () => this.revive();
        if (btnRespawn) btnRespawn.onclick = () => this.respawn();
        if (btnQuit) btnQuit.onclick = () => { document.getElementById('death-screen').classList.add('hidden'); window.menuSystem.switchScreen('mainMenu'); this.stop(); };
    }
    die() { this.isRunning = false; const deathScreen = document.getElementById('death-screen'); if (deathScreen) { deathScreen.classList.remove('hidden'); document.getElementById('revive-count').innerText = this.revives; document.getElementById('respawn-count').innerText = this.respawns; document.getElementById('btn-revive').style.display = this.revives > 0 ? 'block' : 'none'; document.getElementById('btn-respawn').style.display = this.respawns > 0 ? 'block' : 'none'; } }
    revive() { if (this.revives > 0) { this.revives--; this.player.hp = this.player.maxHp; this.isRunning = true; document.getElementById('death-screen').classList.add('hidden'); this.lastTime = performance.now(); requestAnimationFrame(this.gameLoop.bind(this)); } }
    async respawn() { if (this.respawns > 0) { this.respawns--; this.inventory = []; this.updateInventoryHUD(); this.player.hp = this.player.maxHp; this.player.mana = this.player.maxMana; this.player.stamina = this.player.maxStamina; await this.loadLevel(this.currentLevelId || 'level1'); this.isRunning = true; document.getElementById('death-screen').classList.add('hidden'); this.lastTime = performance.now(); requestAnimationFrame(this.gameLoop.bind(this)); } }
    loadProfileData(data) { const p = data || JSON.parse(localStorage.getItem('ketebe_character')); if (p) { if(p.hp) { this.player.hp = p.hp; this.player.maxHp = p.hp; } if(p.stamina) { this.player.stamina = p.stamina; this.player.maxStamina = p.stamina; } if(p.mana) { this.player.mana = p.mana; this.player.maxMana = p.mana; } if(p.speed) this.player.speed = p.speed; if(p.jumpForce) this.player.jumpForce = -p.jumpForce; if(p.segmentCount) this.player.segmentCount = p.segmentCount; if(p.segmentSpacing) this.player.segmentSpacing = p.segmentSpacing; this.player.glowColor = p.glowColor || '#e74c3c'; if (p.headData) { const img = new Image(); img.src = p.headData; this.playerHead = img; } if (p.bodyData) { const img = new Image(); img.src = p.bodyData; this.playerBody = img; } } }
    
    spawnFireball(x, y, dx, dy, sprite) {
        // Ring Buffer Strategy: O(1) and never fails
        const fb = this.fireballs[this.fireballIndex];
        this.fireballIndex = (this.fireballIndex + 1) % this.fireballs.length;
        
        fb.reset(x, y, dx, dy, sprite);
        return fb;
    }

    // --- PHYSICS HELPER (Sliding) ---
    moveEntity(entity, dx, dy, speed, dt) {
        const sw = (entity.width || 16) * (entity.scale || 3);
        const sh = (entity.height || 16) * (entity.scale || 3);
        const padding = 10; // Hitbox padding

        // X Axis
        if (dx !== 0) {
            const moveX = dx * speed * dt;
            const nextX = entity.x + moveX;
            const direction = dx > 0 ? 'right' : 'left';
            // Check corners with directional collision
            if (!this.mapSystem.isSolid(nextX + padding, entity.y + padding, direction) && 
                !this.mapSystem.isSolid(nextX + sw - padding, entity.y + sh - padding, direction) &&
                !this.mapSystem.isSolid(nextX + padding, entity.y + sh - padding, direction) && 
                !this.mapSystem.isSolid(nextX + sw - padding, entity.y + padding, direction)) {
                entity.x = nextX;
                
                // Check trigger zones
                if (entity === this.player) {
                    this.checkTriggerZones(entity);
                }
            }
        }

        // Y Axis
        if (dy !== 0) {
            const moveY = dy * speed * dt;
            const nextY = entity.y + moveY;
            const direction = dy > 0 ? 'down' : 'up';
            // Check corners with directional collision
            if (!this.mapSystem.isSolid(entity.x + padding, nextY + padding, direction) && 
                !this.mapSystem.isSolid(entity.x + sw - padding, nextY + sh - padding, direction) &&
                !this.mapSystem.isSolid(entity.x + padding, nextY + sh - padding, direction) && 
                !this.mapSystem.isSolid(entity.x + sw - padding, nextY + padding, direction)) {
                entity.y = nextY;
                
                // Check trigger zones
                if (entity === this.player) {
                    this.checkTriggerZones(entity);
                }
            }
        }
    }
    
    checkTriggerZones(entity) {
        const cx = entity.x + (entity.width || 16) * (entity.scale || 3) / 2;
        const cy = entity.y + (entity.height || 16) * (entity.scale || 3) / 2;
        
        if (this.mapSystem.isTriggerZone(cx, cy)) {
            const ts = this.mapSystem.tileSize * this.mapSystem.scale;
            const tileX = Math.floor(cx / ts);
            const tileY = Math.floor(cy / ts);
            const triggerId = `trigger_${tileX}_${tileY}`;
            
            // Fire trigger event only once per entry
            if (!this.activeTriggers) this.activeTriggers = new Set();
            if (!this.activeTriggers.has(triggerId)) {
                this.activeTriggers.add(triggerId);
                console.log(`[Trigger] Entered zone at (${tileX}, ${tileY})`);
                
                // Fire custom event for game logic to hook into
                if (this.onTriggerEnter) {
                    this.onTriggerEnter(tileX, tileY);
                }
            }
        } else {
            // Clear triggers when not in zone
            if (this.activeTriggers) this.activeTriggers.clear();
        }
    }

    // Updated to use FXSystem
    spawnParticle(x, y, vx, vy, color, life, size = 4, spriteFrames = null) { 
        // Map legacy params to new config
        const config = {
            physics: { gravity: 0, drag: 0.95, spread: 0 },
            life: { min: life, max: life },
            size: { start: size, end: 0 },
            color: { start: color || '#fff', end: color || '#fff' },
            speed: { min: 0, max: 0 } // handled by vx/vy override
        };
        
        // Manual spawn on FXSystem
        const p = this.fx.pool.find(p => !p.active);
        if (p) {
            p.init(x, y, 0, config, spriteFrames ? spriteFrames[0] : null);
            p.vx = vx;
            p.vy = vy;
        }
    }

    createExplosion(x, y, color, count = 8) { for (let i = 0; i < count; i++) { const angle = Math.random() * Math.PI * 2; const speed = 50 + Math.random() * 100; this.spawnParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, 0.5 + Math.random() * 0.5, 3 + Math.random() * 3); } }    async start(playerName, isNewGame, options = {}) {
        this.playerName = playerName; this.isRunning = true; this.isPaused = false;
        const skipInitialLevelLoad = !!options.skipInitialLevelLoad;
        await this.loadDefinitions(); this.assignSkills(); 
        await this.achievementSystem.init(playerName); 
        await this.dialogueSystem.init();
        await this.questSystem.init();
        this.achievementSystem.unlock('START_GAME');
        if (isNewGame) { this.player.hp = 100; this.player.mana = 50; this.player.stamina = 100; this.currentLevel = 1; if (!skipInitialLevelLoad) await this.loadLevel(this.currentLevel); } 
        else { const data = await this.saveSystem.load(playerName, 1); if (data) { this.currentLevel = data.level; this.player.hp = data.player.hp; this.player.maxHp = data.player.maxHp; this.player.mana = data.player.mana; this.player.stamina = data.player.stamina; this.inventory = data.inventory || []; this.activeSkills = data.activeSkills || [null,null,null,null]; await this.loadLevel(this.currentLevel); this.player.x = data.player.x; this.player.y = data.player.y; this.updateInventoryHUD(); this.updateSkillHUD(); } else await this.start(playerName, true, options); }
        requestAnimationFrame(this.gameLoop.bind(this)); for(let i=0; i<300; i++) this.player.history.push({ x: this.player.x, y: this.player.y, dir: this.player.direction });
    }
    async loadDefinitions() {
        try {
            const [eRes, nRes, iRes, cRes, sRes] = await Promise.all([fetch('/dunyalar/definitions/enemies.json'), fetch('/dunyalar/definitions/npcs.json'), fetch('/dunyalar/definitions/items.json'), fetch('/dunyalar/definitions/campaign.json'), fetch('/dunyalar/definitions/skills.json')]);
            if (eRes.ok) (await eRes.json()).forEach(def => this.enemyDefs[def.id] = def);
            if (nRes.ok) (await nRes.json()).forEach(def => this.npcDefs[def.id] = def);
            if (iRes.ok) this.itemDefs = await iRes.json();
            if (sRes.ok) this.skillDefs = await sRes.json();
            if (cRes.ok) this.campaign = await cRes.json(); else this.campaign = [{ id: 'level1', next: 'level2' }];
        } catch (e) {}
    }
    triggerUltimate() { console.log("SERIOUS IRAB BURST!"); this.screenShake = 0.5; this.achievementSystem.unlock('IRAB_BURST'); const rings = 3; const bulletsPerRing = 32; const sw = this.player.width * this.player.scale, sh = this.player.height * this.player.scale; const sx = this.player.x + sw/2, sy = this.player.y + sh/2; for (let r = 0; r < rings; r++) { const rot = (r * Math.PI) / 8; const speed = 250 + (r * 75); for (let i = 0; i < bulletsPerRing; i++) { const ang = (i / bulletsPerRing) * Math.PI * 2 + rot; const spr = this.ultimateSprites[Math.floor(Math.random() * this.ultimateSprites.length)]; const fb = this.spawnFireball(sx - (spr.width * 1.5)/2, sy - (spr.height * 1.5)/2, Math.cos(ang), Math.sin(ang), spr); if(fb) { fb.speed = speed; fb.life = 4.0; fb.scale = 1.5; } } } }

    destroy() {
        this.isRunning = false;
        
        // Cleanup Input
        if (this.input && this.input.destroy) {
            this.input.destroy();
        }

        // Remove Resize Listener
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
        } else {
            // Since we didn't store the bound function in constructor (legacy code),
            // we can't easily remove it. We rely on the fact that arrow functions
            // in addEventListener might be hard to remove.
            // Future improvement: Store bound handlers in constructor.
        }

        // Cleanup any systems that need it
        if (this.audio && this.audio.stopAll) {
            this.audio.stopAll();
        }

        // Clear Canvas
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        console.log('[RPG Core] Destroyed');
    }

    async loadLevelFromData(dungeonData) {
        try {
            await this.mapSystem.loadMap(dungeonData); this.enemies = []; this.npcs = [];
            const loadDecorations = async () => {
                for (const d of this.mapSystem.decorations) {
                    if (d.type === 'enemy') this.enemies.push(new window.Enemy(d.x * 48, d.y * 48, d.data, this));
                    else if (d.type === 'npc') this.npcs.push(new window.NPC(d.x * 48, d.y * 48, d.data, this));
                    else if (d.type === 'prefab') {
                        try { const res = await fetch(`dunyalar/definitions/${d.data}`); if (res.ok) { const prefab = await res.json(); const hasStats = prefab.components.some(c => c.type === 'Stats'); const script = prefab.components.find(c => c.type === 'Script'); const id = script ? script.scriptId : 'demo'; if (hasStats) { const en = new window.Enemy(d.x * 48, d.y * 48, id, this); en.def.name = prefab.name; if(prefab.sprite) { en.def.animations.idle.sprite = prefab.sprite; en.sprites.idle = window.createPixelImage(prefab.sprite); } this.enemies.push(en); } else { const npc = new window.NPC(d.x * 48, d.y * 48, id, this); if(prefab.sprite) { npc.def.animations.idle.sprite = prefab.sprite; npc.sprites.idle = window.createPixelImage(prefab.sprite); } this.npcs.push(npc); } } } catch(e) { console.warn("Prefab error", e); }
                    }
                }
            };
            await loadDecorations();
            if (this.fx) {
                if (dungeonData.ambience && !dungeonData.weather) { if (['rain', 'fog'].includes(dungeonData.ambience)) dungeonData.weather = dungeonData.ambience; if (dungeonData.ambience === 'night') dungeonData.lighting = 'night'; } 
                this.fx.setWeather(dungeonData.weather || 'none'); this.fx.setLighting(dungeonData.lighting || 'day');
            }

            // Apply Post-Process Shader
            if (this.postProcess) {
                this.postProcess.setShader(dungeonData.shader || 'default');
            }

            // Set player spawn position - support both formats
            if (dungeonData.spawnX !== undefined) { 
                this.player.x = dungeonData.spawnX; 
                this.player.y = dungeonData.spawnY; 
            } else if (dungeonData.spawn) {
                // Support editor format: spawn: {x, y}
                this.player.x = dungeonData.spawn.x * 48; // Convert tile to pixel coordinates
                this.player.y = dungeonData.spawn.y * 48;
            }
        } catch (err) { console.error(err); }
    }
    async loadLevel(levelId) {
        const path = (typeof levelId === 'number') ? `dunyalar/level${levelId}.json` : `dunyalar/${levelId}.json`;
        try {
            const res = await fetch(path); if (!res.ok) throw new Error(`Level not found`);
            const dungeonData = await res.json(); await this.mapSystem.loadMap(dungeonData);
            this.enemies = []; this.npcs = [];
            const name = String(dungeonData.name || levelId);
            const banner = document.createElement('div'); banner.style.cssText = `position: fixed; top: 20%; left: 50%; transform: translate(-50%, -50%); color: var(--gold); font-size: 4rem; text-shadow: 4px 4px 0 #000; z-index: 200; pointer-events: none; animation: fadeOut 3s forwards;`;
            banner.innerText = name.toUpperCase(); document.body.appendChild(banner); setTimeout(() => banner.remove(), 3000);
            
            const loadDecorations = async () => {
                for (const d of this.mapSystem.decorations) {
                    if (d.type === 'enemy') this.enemies.push(new window.Enemy(d.x * 48, d.y * 48, d.data, this));
                    else if (d.type === 'npc') this.npcs.push(new window.NPC(d.x * 48, d.y * 48, d.data, this));
                    else if (d.type === 'prefab') {
                        try { const res = await fetch(`dunyalar/definitions/${d.data}`); if (res.ok) { const prefab = await res.json(); const hasStats = prefab.components.some(c => c.type === 'Stats'); const script = prefab.components.find(c => c.type === 'Script'); const id = script ? script.scriptId : 'demo'; if (hasStats) { const en = new window.Enemy(d.x * 48, d.y * 48, id, this); en.def.name = prefab.name; if(prefab.sprite) { en.def.animations.idle.sprite = prefab.sprite; en.sprites.idle = window.createPixelImage(prefab.sprite); } this.enemies.push(en); } else { const npc = new window.NPC(d.x * 48, d.y * 48, id, this); if(prefab.sprite) { npc.def.animations.idle.sprite = prefab.sprite; npc.sprites.idle = window.createPixelImage(prefab.sprite); } this.npcs.push(npc); } } } catch(e) { console.warn("Prefab error", e); }
                    }
                }
            };
            await loadDecorations();
            
            if (this.fx) {
                if (dungeonData.ambience && !dungeonData.weather) { if (['rain', 'fog'].includes(dungeonData.ambience)) dungeonData.weather = dungeonData.ambience; if (dungeonData.ambience === 'night') dungeonData.lighting = 'night'; } 
                this.fx.setWeather(dungeonData.weather || 'none'); this.fx.setLighting(dungeonData.lighting || 'day');
            }
            
            // Set player spawn position - support both formats
            if (dungeonData.spawnX !== undefined) { 
                this.player.x = dungeonData.spawnX; 
                this.player.y = dungeonData.spawnY; 
            } else if (dungeonData.spawn) {
                // Support editor format: spawn: {x, y}
                this.player.x = dungeonData.spawn.x * 48; // Convert tile to pixel coordinates
                this.player.y = dungeonData.spawn.y * 48;
            }
            
            let musicToPlay = dungeonData.music; if (window.MUSIC_CONFIG && window.MUSIC_CONFIG.levels && window.MUSIC_CONFIG.levels[levelId]) { musicToPlay = window.MUSIC_CONFIG.levels[levelId]; } 
            if (musicToPlay) { this.playSong(musicToPlay); }
        } catch (err) { this.showVoidScreen(err.message); }
    }
    
    async playSong(songName) { 
        try { 
            if (songName.endsWith('.json')) { 
                const res = await fetch(`muzikler/${songName}`); 
                if (res.ok) { 
                    const songData = await res.json(); 
                    if(this.audio.playTracker) this.audio.playTracker(songData); 
                } 
            } else {
                // Assume Audio File
                this.audio.playMusic(`muzikler/${songName}`);
            }
        } catch (e) { console.warn("Failed to load song:", songName); } 
    } 
    
    showVoidScreen(msg) { this.isRunning = false; this.canvas.style.display = 'none'; document.getElementById('game-hud').classList.add('hidden'); let voidScreen = document.getElementById('void-screen'); if (!voidScreen) { voidScreen = document.createElement('div'); voidScreen.id = 'void-screen'; voidScreen.style.cssText = `position: absolute; top:0; left:0; width:100%; height:100%; background: #100; color: #e74c3c; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: 'VT323', monospace; z-index: 9999;`; document.body.appendChild(voidScreen); } voidScreen.innerHTML = `<h1>VOID</h1><p>${msg}</p><button onclick="location.reload()">RESTART</button>`; } 
    stop() { this.isRunning = false; }
    resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; this.ctx.imageSmoothingEnabled = false; if (this.fx) this.fx.resize(this.canvas.width, this.canvas.height); }
    update(deltaTime) {
        this.gameTime += deltaTime * this.timeSpeed; if (this.gameTime >= 24) this.gameTime = 0;
        if (this.fx) { this.fx.update(deltaTime); this.fx.setTime(this.gameTime); }
        
        // Capture previous camera state for interpolation
        this.prevCamera.x = this.camera.x;
        this.prevCamera.y = this.camera.y;

        if (this.dialogueSystem && this.dialogueSystem.active) { 
            if (this.input.keys.Action && !this.dialogueSystem.justStarted) { 
                if (this.dialogueSystem.choicesContainer.innerHTML === '') {
                    this.dialogueSystem.next(); 
                }
                this.input.keys.Action = false; 
            } 
            return; 
        }

        if (!this.isRunning || this.isPaused) return;
        const sw = this.player.width * this.player.scale, sh = this.player.height * this.player.scale;
        
        // --- CAMERA JUICE (Look-Ahead + Smoothing) ---
        // 1. Calculate Target: Player Center + Mouse Offset (capped)
        const mouseXRel = this.input.mouse.x - (this.canvas.width / 2);
        const mouseYRel = this.input.mouse.y - (this.canvas.height / 2);
        const lookAheadFactor = 0.15; // How much it peeks towards mouse
        
        const targetCamX = (this.player.x + sw/2) - (this.canvas.width / 2) + (mouseXRel * lookAheadFactor);
        const targetCamY = (this.player.y + sh/2) - (this.canvas.height / 2) + (mouseYRel * lookAheadFactor);

        // 2. Smooth Lerp (0.1 = fast, 0.05 = heavy)
        const smoothSpeed = 5 * deltaTime;
        this.camera.x += (targetCamX - this.camera.x) * smoothSpeed;
        this.camera.y += (targetCamY - this.camera.y) * smoothSpeed;
        
        // 3. Shake is handled by FXSystem now
        
        const axis = this.input.getAxis();
        const isMoving = (axis.x !== 0 || axis.y !== 0);
        if (isMoving) { const lastPos = this.player.history[0]; const distMoved = lastPos ? Math.sqrt((this.player.x - lastPos.x) ** 2 + (this.player.y - lastPos.y) ** 2) : 999; if (distMoved > 2) { this.player.history.unshift({ x: this.player.x, y: this.player.y, dir: this.player.direction }); if (this.player.history.length > 300) this.player.history.pop(); } }        if (!this.mapSystem || !this.mapSystem.width || !this.player) return;
        if (this.player.shootCooldown > 0) this.player.shootCooldown -= deltaTime;
        const pxS = this.player.x - this.camera.x + sw / 2, pyS = this.player.y - this.camera.y + sh / 2;
        const dx = this.input.mouse.x - pxS, dy = this.input.mouse.y - pyS, dist = Math.sqrt(dx * dx + dy * dy);
        this.aimCursor = { x: this.input.mouse.x, y: this.input.mouse.y };

        // AUTO-AIM
        if (this.input.isMobile || (this.input.joystick && this.input.joystick.active)) {
            let closest = null;
            let minDst = 400;
            this.enemies.forEach(en => {
                const d = Math.sqrt((en.x - this.player.x)**2 + (en.y - this.player.y)**2);
                if (d < minDst) { minDst = d; closest = en; }
            });
            if (closest) {
                const csw = closest.width * closest.scale;
                const csh = closest.height * closest.scale;
                this.aimCursor = {
                    x: (closest.x + csw/2) - this.camera.x,
                    y: (closest.y + csh/2) - this.camera.y
                };
            }
        }

        if (this.input.keys.z) this.useSkill(0); if (this.input.keys.x) this.useSkill(1); if (this.input.keys.c) this.useSkill(2); if (this.input.keys.v) this.useSkill(3);
        if (this.input.mouse.isDown && this.player.shootCooldown <= 0 && dist > 0 && this.player.mana >= 2) this.useSkill(-1); 
        if (!isMoving) { if (Math.random() > 0.8) this.spawnParticle(this.player.x + 24, this.player.y + 24, (Math.random()-0.5)*20, -Math.random()*40, '#f39c12', 0.6, 2); if (Math.random() > 0.85) this.spawnParticle(this.player.x + 10 + Math.random()*28, this.player.y + Math.random()*20, 0, -30 - Math.random()*20, null, 0.8, 20, this.fireFrames); } 
        if (this.player.mana <= 0.05 && !this.player.manaDepleted) { this.player.mana = 0; this.player.manaDepleted = true; this.triggerUltimate(); }
        if (this.player.mana < this.player.maxMana) { this.player.mana += 2 * deltaTime; if (this.player.mana >= 10) this.player.manaDepleted = false; }
        
        this.enemies.forEach(en => { try { en.update(deltaTime); } catch(e) { console.warn("Enemy Error:", e); } }); 
        this.npcs.forEach(npc => { try { npc.update(deltaTime); } catch(e) { console.warn("NPC Error:", e); } });
        this.weather.update(deltaTime, this.canvas.width, this.canvas.height);
        
        // Update Logic System
        if (this.logicSystem) {
            try {
                this.logicSystem.updateAll(deltaTime);
            } catch(e) {
                console.error("Logic System Error:", e);
            }
        }

        // Update Spatial Audio Listener
        if (this.audio && this.player) {
            this.audio.updateListener(this.player.x, this.player.y);
        }

        // Update Spatial Hash
        this.spatialHash.clear();
        this.spatialHash.insert(this.player);
        this.enemies.forEach(en => this.spatialHash.insert(en));

        for (let i = 0; i < this.fireballs.length; i++) { 
            const fb = this.fireballs[i]; 
            if (!fb.active) continue;

            fb.update(deltaTime, this.mapSystem); 
            let removed = false; 
            
            if (fb.isEnemy) { 
                // Check against Player
                if (Math.sqrt((fb.x - this.player.x - 24) ** 2 + (fb.y - this.player.y - 24) ** 2) < 25) { 
                    this.player.hp -= 10; fb.life = 0; 
                    if(this.fx) {
                        this.fx.shake(5, 20);
                        this.fx.popText(this.player.x + 24, this.player.y, "10", "#e74c3c");
                    }
                    this.createExplosion(this.player.x + 24, this.player.y + 24, '#8e44ad', 5); fb.active = false; removed = true; 
                } 
            } else { 
                // Spatial Hash Query for Enemies
                this.collisionCandidates.length = 0;
                const candidates = this.spatialHash.retrieve(fb, this.collisionCandidates);
                for (const entity of candidates) {
                    if (entity === this.player) continue; 
                    if (entity.hp !== undefined && entity.maxHp !== undefined) {
                        if (Math.sqrt((fb.x - entity.x - 24) ** 2 + (fb.y - entity.y - 24) ** 2) < 30) { 
                            entity.hp -= 25; fb.life = 0; 
                            if(this.fx) this.fx.popText(entity.x + 24, entity.y, "25", "#f1c40f");
                            this.createExplosion(fb.x, fb.y, '#f1c40f', 5); 
                            if (entity.hp <= 0) { 
                                this.createExplosion(entity.x + 24, entity.y + 24, '#e74c3c', 15); 
                                const idx = this.enemies.indexOf(entity);
                                if (idx > -1) this.enemies.splice(idx, 1); 
                            } 
                            fb.active = false; removed = true; break; 
                        } 
                    }
                }
            } 
            if (!removed && fb.life <= 0) { 
                this.createExplosion(fb.x + (fb.width * fb.scale) / 2, fb.y + (fb.height * fb.scale) / 2, '#f39c12', 10); 
                fb.active = false; 
            } 
        } 
        
        if (this.player.hp <= 0) { this.player.hp = 0; this.updateHUD(); this.die(); return; }
        const sprinting = this.input.keys.Shift && isMoving; let speed = this.player.speed;
        if (sprinting && this.player.stamina > 0) { this.player.stamina -= 20 * deltaTime; speed *= 1.8; this.player.animSpeed = 0.08; } 
        else { this.player.animSpeed = 0.15; if (this.player.stamina < this.player.maxStamina) this.player.stamina += 10 * deltaTime; }
        let nearNPC = false; this.npcs.forEach(npc => { 
            const dx = (this.player.x + 24) - (npc.x + 24);
            const dy = (this.player.y + 24) - (npc.y + 24);
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 80) { 
                nearNPC = true; 
                if (this.input.keys.Action && !this.dialogueSystem.active) { 
                    const dialogueId = (npc.def && npc.def.interaction) ? npc.def.interaction.dialogue : npc.id; 
                    this.dialogueSystem.start(dialogueId); 
                    this.achievementSystem.unlock('TALK_NPC'); 
                    this.input.keys.Action = false; 
                } 
            } 
        });
        this.mapSystem.decorations.forEach(deco => { if (deco.type === 'sign') { const dx = deco.x * 48 + 24; const dy = deco.y * 48 + 24; if (Math.sqrt((this.player.x + 24 - dx) ** 2 + (this.player.y + 24 - dy) ** 2) < 80) { nearNPC = true; if (this.input.keys.Action && !this.dialogueSystem.active) { this.dialogueSystem.db.conversations.push({ id: "_sign_temp", nodes: [{ speaker: "sign", text: deco.data || "A blank sign." }] }); this.dialogueSystem.start("_sign_temp", () => { this.dialogueSystem.db.conversations = this.dialogueSystem.db.conversations.filter(c => c.id !== "_sign_temp"); }); this.input.keys.Action = false; } } } if (deco.type === 'chest' && !deco.opened) { const dx = deco.x * 48 + 24; const dy = deco.y * 48 + 24; if (Math.sqrt((this.player.x + 24 - dx) ** 2 + (this.player.y + 24 - dy) ** 2) < 80) { nearNPC = true; if (this.input.keys.Action && !this.dialogueSystem.active) { deco.opened = true; this.createExplosion(dx, dy, '#f1c40f', 20); const itemIds = deco.data ? deco.data.split(',').map(s => s.trim()) : ["apple"]; itemIds.forEach(id => { const itemDef = this.itemDefs.find(i => i.id === id) || this.itemDefs[Math.floor(Math.random()*this.itemDefs.length)]; if (itemDef) { this.inventory.push({...itemDef}); console.log("Gained item:", itemDef.name); } }); this.updateInventoryHUD(); this.dialogueSystem.db.conversations.push({ id: "_chest_temp", nodes: [{ speaker: "hero", text: `You found: ${itemIds.join(", ")}!` }] }); this.dialogueSystem.start("_chest_temp", () => { this.dialogueSystem.db.conversations = this.dialogueSystem.db.conversations.filter(c => c.id !== "_chest_temp"); }); this.input.keys.Action = false; } } } });
        if (this.interactionHint) { if (nearNPC && !this.dialogueSystem.active) { this.interactionHint.classList.remove('hidden'); } else { this.interactionHint.classList.add('hidden'); } }
        let mx = axis.x, my = axis.y; if (this.mapSystem.type === 'isometric') { mx = axis.x + axis.y; my = axis.y - axis.x; } 
        if (mx > 0) this.player.direction = 1; if (mx < 0) this.player.direction = -1;
        
        const len = Math.sqrt(mx*mx + my*my); 
        if (len > 0) { 
            // Normalize
            const ndx = mx / len;
            const ndy = my / len;
            this.moveEntity(this.player, ndx, ndy, speed, deltaTime);
        } 
        
        this.player.state = isMoving ? 'run' : 'idle'; 
        this.player.timer += deltaTime; 
        if (this.player.timer >= this.player.animSpeed) { 
            this.player.timer = 0; 
            this.player.frame++; 
        } 
        
        // Check for exit door to load next level
        if (this.mapSystem.mapExit) { 
            const exitX = this.mapSystem.mapExit.x * 48;
            const exitY = this.mapSystem.mapExit.y * 48;
            const distance = Math.sqrt((this.player.x - exitX) ** 2 + (this.player.y - exitY) ** 2);
            
            // Show hint when near exit
            if (distance < 80) {
                nearNPC = true; // Trigger interaction hint
            }
            
            // Enter exit when close enough
            if (distance < 50) {
                // In campaign runtime mode, the adapter handles progression
                if (window.CAMPAIGN_RUNTIME_MODE) {
                    console.log('[RPG Core] Exit reached - adapter will handle progression');
                    // Don't load next level here, let the adapter callback system handle it
                    return;
                }
                
                // Standalone mode: Try campaign system first
                const node = this.campaign && this.campaign.find(n => n.id === this.currentLevelId);
                if (node && node.next) {
                    this.currentLevelId = node.next;
                    this.loadLevel(this.currentLevelId);
                } else if (typeof this.currentLevel === 'number') {
                    // Fallback: increment level number
                    this.currentLevel++;
                    this.currentLevelId = this.currentLevel;
                    this.loadLevel(this.currentLevel).catch(() => {
                        // No more levels
                        alert("CONGRATULATIONS! YOU COMPLETED ALL LEVELS!");
                        this.isRunning = false;
                        window.location.reload();
                    });
                } else {
                    // Try to extract number from level name and increment
                    const match = String(this.currentLevelId).match(/(\d+)/);
                    if (match) {
                        const num = parseInt(match[0]) + 1;
                        const nextLevel = String(this.currentLevelId).replace(/\d+/, num);
                        this.currentLevelId = nextLevel;
                        this.loadLevel(nextLevel).catch(() => {
                            alert("CONGRATULATIONS! YOU COMPLETED ALL LEVELS!");
                            this.isRunning = false;
                            window.location.reload();
                        });
                    } else {
                        // No way to determine next level
                        alert("LEVEL COMPLETE! (No next level configured)");
                    }
                }
            }
        }
        
        this.updateHUD();
    }
    updateHUD() { 
        if (!this.player || !this.uiBars) return; if (this.uiBars.hp) this.uiBars.hp.style.width = `${(this.player.hp/this.player.maxHp)*100}%`; if (this.uiBars.stamina) this.uiBars.stamina.style.width = `${(this.player.stamina/this.player.maxStamina)*100}%`; if (this.uiBars.mana) this.uiBars.mana.style.width = `${(this.player.mana/this.player.maxMana)*100}%`; 
        const hours = Math.floor(this.gameTime); const minutes = Math.floor((this.gameTime - hours) * 60); const clockEl = document.getElementById('game-clock') || document.getElementById('clock'); if (clockEl) { clockEl.innerText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`; }
    }
    useItem(idx) { const item = this.inventory[idx]; if (!item) return; if (item.type === 'heal') this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.value); if (item.type === 'mana') this.player.mana = Math.min(this.player.maxMana, this.player.mana + item.value); if (item.type === 'stamina') this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + item.value); this.createExplosion(this.player.x + 24, this.player.y + 24, '#fff', 10); this.inventory.splice(idx, 1); this.updateInventoryHUD(); }
    useSkill(slotIdx) {
        if (this.player.shootCooldown > 0) return; let skill = this.activeSkills[slotIdx]; if (slotIdx === -1) skill = { type: 'projectile', mana: 2, cooldown: 0.15, name: 'Arabic Fire' }; if (!skill || this.player.mana < skill.mana) return;
        this.player.mana -= skill.mana; this.player.shootCooldown = skill.cooldown || 0.5;
        const sw = this.player.width * this.player.scale, sh = this.player.height * this.player.scale;
        const pxS = this.player.x - this.camera.x + sw / 2, pyS = this.player.y - this.camera.y + sh / 2;
        const dx = this.aimCursor.x - pxS, dy = this.aimCursor.y - pyS, dist = Math.sqrt(dx * dx + dy * dy);
        let dirX = dx / dist, dirY = dy / dist;
        if (this.mapSystem.type === 'isometric') { const wx = dirY + dirX / 2; const wy = dirY - dirX / 2; const wl = Math.sqrt(wx*wx + wy*wy); dirX = wx/wl; dirY = wy/wl; }
        if (skill.type === 'projectile') { const spr = (slotIdx === -1) ? this.irabSprites[Math.floor(Math.random() * this.irabSprites.length)] : window.createPixelImage(skill.sprite); const scale = (slotIdx === -1) ? 1.5 : 2;
            const fb = this.spawnFireball(this.player.x + sw/2 - (spr.width * scale)/2, this.player.y + sh/2 - (spr.height * scale)/2, dirX, dirY, spr);
            if(fb) fb.scale = scale;
        }
        if (skill.type === 'heal') { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20); for(let i=0; i<15; i++) this.spawnParticle(this.player.x + sw/2, this.player.y + sh/2, (Math.random()-0.5)*100, -Math.random()*100, '#2ecc71', 0.8, 4); }
    }
    assignSkills() { for (let i = 0; i < 4; i++) { if (this.skillDefs && this.skillDefs[i]) { this.activeSkills[i] = this.skillDefs[i]; } else { this.activeSkills[i] = null; } } this.updateSkillHUD(); }
    updateSkillHUD() { const slots = document.querySelectorAll('#skill-bar .skill-slot'); slots.forEach((slot, idx) => { const label = slot.innerText[0]; slot.innerHTML = `<span style="position:absolute; top:2px; left:2px; font-size:10px; pointer-events:none;">${label}</span>`; const skill = this.activeSkills[idx]; if (skill) { const icon = window.createPixelImage(skill.sprite); icon.style.width = '32px'; icon.style.height = '32px'; slot.appendChild(icon); } }); }    updateInventoryHUD() { const slots = document.querySelectorAll('.inv-slot'); slots.forEach((slot, idx) => { slot.innerHTML = ''; const item = this.inventory[idx]; if (item) { const icon = window.createPixelImage(item.sprite); icon.style.width = '32px'; icon.style.height = '32px'; slot.appendChild(icon); } }); }
    draw(alpha) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); 
        this.ctx.imageSmoothingEnabled = false;
        
        // Interpolate Camera
        const camX = this.prevCamera.x + (this.camera.x - this.prevCamera.x) * alpha;
        const camY = this.prevCamera.y + (this.camera.y - this.prevCamera.y) * alpha;
        
        // Shake is handled by FXSystem's render wrapper or manually here if needed
        // Since FXSystem now handles offsets in its own render, we need to pass camera-shake 
        // to mapSystem and others.
        
        let sx = 0, sy = 0;
        if (this.fx && this.fx.shakeTime > 0) {
             sx = (Math.random()-0.5) * this.fx.shakeIntensity; 
             sy = (Math.random()-0.5) * this.fx.shakeIntensity; 
        }

        const viewX = camX - sx;
        const viewY = camY - sy;

        // Draw Map with Shake
        this.mapSystem.draw(viewX, viewY, this.canvas.width, this.canvas.height);
        
        if (this.fx) this.fx.renderShadows(this.mapSystem, viewX, viewY, 3);
        if (this.fx) this.fx.render(viewX, viewY);

        const viewW = this.canvas.width;
        const viewH = this.canvas.height;
        const buffer = 100;

        const isVisible = (e) => {
            return (e.x + 50 > viewX - buffer && 
                    e.x - 50 < viewX + viewW + buffer && 
                    e.y + 50 > viewY - buffer && 
                    e.y - 50 < viewY + viewH + buffer);
        };

        this.enemies.forEach(en => { if(isVisible(en)) en.draw(this.ctx, viewX, viewY); });
        this.npcs.forEach(npc => { if(isVisible(npc)) npc.draw(this.ctx, viewX, viewY); });
        
        this.fireballs.forEach(fb => { 
            if(!fb.active) return;
            if (fb.x > viewX - buffer && fb.x < viewX + viewW + buffer && fb.y > viewY - buffer && fb.y < viewY + viewH + buffer) {
                const fsw = fb.width * fb.scale, fsh = fb.height * fb.scale; 
                this.ctx.drawImage(fb.sprite, Math.floor(fb.x - viewX), Math.floor(fb.y - viewY), fsw, fsh); 
            }
        });

        // Player is always visible (center)
        const sw = this.player.width * this.player.scale, sh = this.player.height * this.player.scale;
        const axis = this.input.getAxis(), isMoving = (axis.x !== 0 || axis.y !== 0);
        
        this.ctx.shadowColor = this.player.glowColor || '#e74c3c'; 
        this.ctx.shadowBlur = isMoving ? 10 : 25;
        
        // Draw Player Segments
        for (let i = this.player.segmentCount; i > 0; i--) { 
            const hIdx = i * this.player.segmentSpacing; 
            const pos = this.player.history[hIdx] || { x: this.player.x, y: this.player.y, dir: this.player.direction }; 
            const taper = 1.0 - (i / (this.player.segmentCount + 2)) * 0.8; 
            const segW = sw * taper, segH = sh * taper;
            
            this.ctx.save(); 
            this.ctx.translate(Math.floor(pos.x - viewX + sw/2), Math.floor(pos.y - viewY + sh/2)); 
            this.ctx.scale(pos.dir, 1);
            const wobble = isMoving ? Math.sin(Date.now() * 0.012 + i * 0.8) * (12 * (1-taper)) : 0;
            this.ctx.drawImage(this.playerBody, -segW/2, -segH/2 + wobble, segW, segH); 
            this.ctx.restore();
        }

        // Draw Player Head
        const headWobble = isMoving ? Math.sin(Date.now() * 0.012) * 5 : 0;
        this.ctx.save(); 
        this.ctx.translate(Math.floor(this.player.x - viewX + sw/2), Math.floor(this.player.y - viewY + sh/2 + headWobble)); 
        this.ctx.scale(this.player.direction, 1);
        this.ctx.drawImage(this.playerHead, -sw/2, -sh/2, sw, sh); 
        this.ctx.restore();
        
        this.ctx.shadowBlur = 0; 
        if (this.aimCursor) { const cs = 40; this.ctx.drawImage(this.targetSprite, this.aimCursor.x - cs/2, this.aimCursor.y - cs/2, cs, cs); }
        
        if (this.fx) {
            this.fx.renderWeather(viewX, viewY);
            
            // Lighting
            const lights = this.renderLights;
            lights.length = 0;
            
            lights.push({
                x: this.player.x + sw/2,
                y: this.player.y + sh/2,
                radius: 150 + Math.sin(Date.now() * 0.005) * 10,
                color: 'rgba(231, 76, 60, 0.4)',
                intensity: 0.6
            });
            this.fireballs.forEach(fb => {
                if(!fb.active) return;
                lights.push({
                    x: fb.x + (fb.width*fb.scale)/2,
                    y: fb.y + (fb.height*fb.scale)/2,
                    radius: 80,
                    color: fb.isEnemy ? 'rgba(142, 68, 173, 0.5)' : 'rgba(241, 196, 15, 0.5)',
                    intensity: 0.8
                });
            });
            if (this.mapSystem && this.mapSystem.decorations) { 
                this.mapSystem.decorations.forEach(d => {
                    const lx = d.x * 48 + 24;
                    const ly = d.y * 48 + 24;
                    // Culling lights
                    if (lx > viewX - 200 && lx < viewX + viewW + 200 && ly > viewY - 200 && ly < viewY + viewH + 200) {
                        if (d.type === 'torch') { lights.push({ x: lx, y: ly, radius: 120 + Math.random()*5, color: 'rgba(230, 126, 34, 0.3)', intensity: 0.5 }); }
                        if (d.type === 'candle') { lights.push({ x: lx, y: ly, radius: 60 + Math.random()*2, color: 'rgba(241, 196, 15, 0.2)', intensity: 0.4 }); }
                    }
                }); 
            } 
            this.fx.renderSoftLighting(viewX, viewY, lights);
        }
        this.weather.draw(this.ctx);
    }
    gameLoop(ts) { 
        if (!this.isRunning) return; 
        
        let dt = (ts - this.lastTime) / 1000;
        this.lastTime = ts;
        
        // Safety cap to prevent "Spiral of Death" on lag spikes (e.g. tab switching)
        if (dt > 0.25) dt = 0.25;

        this.accumulator += dt;
        
        while (this.accumulator >= this.fixedTimeStep) {
            this.update(this.fixedTimeStep);
            this.accumulator -= this.fixedTimeStep;
        }

        const alpha = this.accumulator / this.fixedTimeStep;
        this.draw(alpha);
        
        requestAnimationFrame(this.gameLoop.bind(this)); 
    }
}

async function initRPGEngine() {
    // Check if another engine already claimed window.game
    if (window.game && !(window.game instanceof window.Core)) {
        console.log("[RPG Core] Another engine is active. Skipping auto-init.");
        return;
    }

    // Check URL for engine override to be safe
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('engine') && urlParams.get('engine') !== 'rpg-topdown') {
        console.log("[RPG Core] Engine override detected. Skipping auto-init.");
        return;
    }

    console.log("[RPG Core] Initializing Top-Down Engine...");
    window.LOCALE.setLanguage(localStorage.getItem('ketebe_lang') || 'EN'); 
    
    try { 
        const res = await fetch('dunyalar/definitions/music.json'); 
        if(res.ok) window.MUSIC_CONFIG = await res.json(); 
    } catch(e) { console.warn("Music config not loaded"); }
    
    // Skip auto-initialization in campaign runtime mode
    if (window.CAMPAIGN_RUNTIME_MODE) {
        console.log("[RPG Core] Campaign runtime mode detected, skipping auto-init");
        return;
    }
    
    if (!window.game) window.game = new window.Core(); 
    if (!window.menuSystem) window.menuSystem = new window.MenuSystem(window.game); 

    // V2.0: Reflection System (Dev Mode Only)
    // In a real build, this JSON would be pre-generated.
    import('./ReflectionSystem.js').then(m => {
        if (!window.game) return;
        const reflector = new m.ReflectionSystem(window.game);
        const schema = reflector.generateSchema();
        // Expose for Algorithm Studio to read
        window.GAME_API_SCHEMA = schema;
        console.log(`[Reflection] Generated ${schema.length} API nodes.`);
    });
}

if (document.readyState === 'complete') {
    initRPGEngine();
} else {
    window.addEventListener('load', initRPGEngine);
}

window.attemptLogin = () => { 
    const input = document.getElementById('username-input'); 
    if (input && input.value.trim()) {
        const username = input.value.trim().toUpperCase();
        
        // Priority 1: MenuSystem (Polished RPG Flow)
        if (window.menuSystem) {
            window.menuSystem.login(username);
        } 
        // Priority 2: Direct Game Login (New Standalone Demos)
        else if (window.game && typeof window.game.login === 'function') {
            window.game.login(username);
        } 
        else {
            console.error("[Runtime] No engine found to handle login. (Game:", !!window.game, "Menu:", !!window.menuSystem, ")");
        }
    } 
};

// PHASE B: Listen for test commands from Algorithm Studio
window.addEventListener('message', async (event) => {
    if (event.data.type === 'testAlgorithm') {
        console.log('[AlgorithmTest] Received test command:', event.data);
        
        const { scriptName, eventName } = event.data;
        
        // Create or get test entity
        if (!window.testEntity) {
            window.testEntity = {
                id: 'test_entity',
                name: 'Test Entity',
                x: 320,
                y: 240,
                type: 'test'
            };
        }
        
        // Get game instance
        const game = window.game || window.menuSystem?.game;
        if (!game || !game.logicSystem) {
            console.error('[AlgorithmTest] Game or LogicSystem not available');
            if (window.opener) {
                window.opener.postMessage({
                    type: 'algorithmLog',
                    message: '✗ Game not initialized. Please start a game first.'
                }, '*');
            }
            return;
        }
        
        try {
            // Attach algorithm to test entity
            await game.logicSystem.attachToEntity(window.testEntity, scriptName, [eventName]);
            
            // Trigger the event
            await game.logicSystem.trigger(window.testEntity, eventName);
            
            console.log('[AlgorithmTest] Script executed successfully');
            if (window.opener) {
                window.opener.postMessage({
                    type: 'algorithmLog',
                    message: `✓ Script executed successfully`
                }, '*');
            }
        } catch (error) {
            console.error('[AlgorithmTest] Error:', error);
            if (window.opener) {
                window.opener.postMessage({
                    type: 'algorithmError',
                    scriptName: scriptName,
                    eventName: eventName,
                    error: error.message,
                    stack: error.stack
                }, '*');
            }
        }
    }
});
