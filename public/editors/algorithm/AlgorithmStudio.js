import { CodeBuilder } from './CodeBuilder.js';
import { LIB, CATEGORIES } from './AlgorithmNodes.js';

// algorithm_editor.js - Core Visual Scripting Engine v2.1
// Improved Visuals, Robust Layout, and User-Friendly Features
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

function initializeAlgorithmIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedGlitchEventBus;
        projectState = window.RedGlitchProjectState;
        assetManager = window.RedGlitchAssetManager;
        
        if (eventBus) {
            // Listen for script requests
            eventBus.on('algorithm:request', (event) => {
                console.log('[AlgorithmEditor] Algorithm requested:', event.data.scriptId);
            });

            // PHASE 5: Live Debugging
            eventBus.on('vsl:node_exec', (event) => {
                const { nodeId } = event.data;
                const nodeEl = document.getElementById(nodeId);
                if (nodeEl) {
                    nodeEl.classList.add('executing');
                    setTimeout(() => nodeEl.classList.remove('executing'), 200);
                }
            });

            eventBus.on('vsl:value_update', (event) => {
                const { wireId, value } = event.data;
                if (window.studio) {
                    if (!window.studio.liveValues) window.studio.liveValues = new Map();
                    window.studio.liveValues.set(wireId, value);
                }
            });
            
            console.log('[AlgorithmEditor] EventBus connected');
        }
    }
}

function broadcastAlgorithmUpdate(scriptName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`algorithm:${action}`, {
            scriptId: scriptName,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`algorithms.${scriptName}`, {
            name: scriptName,
            lastModified: Date.now()
        });
    }
}



function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export class AlgorithmStudio {
    constructor() {
        this.nodes = [];
        this.wires = [];
        this.vars = []; 
        this.transform = { x: 0, y: 0, scale: 1 };
        this.nextNodeId = 1;
        this.nextWireId = 1;
        this.isReadOnly = false;
        this.viewMode = 'GRAPH'; 
        
        this.state = {
            dragging: null,
            selection: null,
            contextMenuPos: { x:0, y:0 },
            hoverNode: null
        };

        this.coreScripts = ['system_init', 'core_loop', 'engine_physics', 'ui_master'];

        this.dom = {
            canvas: document.getElementById('canvas-viewport'),
            codeView: document.getElementById('code-viewport'),
            codeEditor: document.getElementById('code-editor'),
            graph: document.getElementById('graph-layer'),
            nodes: document.getElementById('node-layer'),
            wires: document.getElementById('wire-layer'),
            libList: document.getElementById('lib-content'),
            scriptList: document.getElementById('script-list'),
            inspector: document.getElementById('inspector-content'),
            console: document.getElementById('console-log'),
            varList: document.getElementById('var-list'),
            scriptName: document.getElementById('script-name'),
            contextMenu: document.getElementById('context-menu')
        };
        
        // Tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'node-tooltip';
        document.body.appendChild(this.tooltip);
        
        // PHASE 2: Tool Rail
        this.activeTool = 'pointer'; // Default tool
        this.debugMode = false;

        // PHASE 3: Layout Presets
        this.activePreset = 'default';
        this.customPresets = {};
        this.loadCustomPresets();
        
        // PHASE 5: Canvas Enhancements
        this.gridEnabled = true;
        this.gridSize = 32;
        
        // PHASE 6: Quick Search
        this.searchOverlay = null;
        this.searchInput = null;
        this.searchResults = null;
        this.searchSelectedIndex = 0;
        this.searchFilteredNodes = [];
        this.searchCategory = 'all';
        this.recentNodes = [];
        this.favoriteNodes = [];
        this.loadSearchPreferences();

        // PHASE 3: Project Data
        this.projectAssets = {
            sounds: [],
            sprites: [],
            prefabs: []
        };

        // PHASE 2.1: Type System & Validation
        this.typeCompatibility = {
            any: ['exec', 'num', 'string', 'bool', 'entity', 'array', 'any'],
            exec: ['exec'],
            num: ['num', 'any'],
            string: ['string', 'any'],
            bool: ['bool', 'any'],
            entity: ['entity', 'any'],
            array: ['array', 'any']
        };
        
        this.validationErrors = [];
        this.validationWarnings = [];
        
        this.init();
    }
    
    // PHASE 2.1: Type validation methods
    canConnectPorts(fromType, toType) {
        if (!fromType || !toType) return true; // Allow if type not defined
        const compatible = this.typeCompatibility[fromType] || [];
        return compatible.includes(toType);
    }
    
    getPortDefinition(nodeId, portId, direction) {
        const node = this.getNode(nodeId);
        if (!node) return null;
        
        const def = LIB[node.type];
        if (!def) return null;
        
        const ports = direction === 'output' ? def.outputs : def.inputs;
        if (!ports) return null;
        
        return ports.find(p => p.id === portId);
    }
    
    validateWireTypes(wire) {
        const fromPort = this.getPortDefinition(wire.fromNode, wire.fromPort, 'output');
        const toPort = this.getPortDefinition(wire.toNode, wire.toPort, 'input');
        
        if (!fromPort || !toPort) {
            return { valid: false, error: 'Port not found' };
        }
        
        if (!this.canConnectPorts(fromPort.type, toPort.type)) {
            return {
                valid: false,
                error: `Type mismatch: Cannot connect ${fromPort.type} to ${toPort.type}`
            };
        }
        
        return { valid: true };
    }
    
    validateAllWires() {
        this.validationErrors = [];
        this.validationWarnings = [];
        
        this.wires.forEach(wire => {
            const validation = this.validateWireTypes(wire);
            if (!validation.valid) {
                this.validationErrors.push({
                    type: 'TYPE_MISMATCH',
                    wireId: wire.id,
                    message: validation.error,
                    wire: wire
                });
                wire.invalid = true;
            } else {
                wire.invalid = false;
            }
        });
        
        return {
            valid: this.validationErrors.length === 0,
            errors: this.validationErrors,
            warnings: this.validationWarnings
        };
    }

    async fetchProjectData() {
        try {
            // 1. Fetch Assets
            const assetRes = await fetch('/api/assets');
            if (assetRes.ok) {
                const data = await assetRes.json();
                const assets = data.assets || [];
                this.projectAssets.sounds = assets.filter(a => a.type === 'audio').map(a => a.name);
                this.projectAssets.sprites = assets.filter(a => a.type === 'image').map(a => a.name);
            }

            // 2. Fetch Prefabs (from standardized NPCs/Enemies registries)
            const npcRes = await fetch('/api/npcs');
            if (npcRes.ok) {
                const npcs = await npcRes.json();
                this.projectAssets.prefabs.push(...npcs.map(n => n.id));
            }
            
            console.log(`[AlgorithmStudio] Assets Synchronized: ${this.projectAssets.sounds.length} sounds.`);
        } catch (e) {
            console.warn("[AlgorithmStudio] Failed to synchronize project data:", e);
        }
    }

    init() {
        // Initialize integration first
        initializeAlgorithmIntegration();
        
        // PHASE 3: Fetch project data
        this.fetchProjectData();
        this.initLayoutManager();
        
        // PHASE 2: Initialize tool keyboard shortcuts
        this.initToolKeyboardShortcuts();
        
        // PHASE 3: Initialize preset system
        this.loadLayoutPreset();
        this.initPresetKeyboardShortcuts();
        
        // PHASE 6: Initialize quick search
        this.initQuickSearch();
        
        this.setupInput();
        this.populateLibrary();
        this.setupDragDrop();
        this.refreshScriptList();
        
        // PHASE 7: Initialize enhancements (after library populated)
        this.initEnhancements();
        
        // PHASE B: Listen for error messages from game
        window.addEventListener('message', (event) => {
            if (event.data.type === 'algorithmError') {
                this.handleRuntimeError(event.data);
            } else if (event.data.type === 'algorithmLog') {
                this.logToTestConsole(event.data.message, 'log');
            }
        });
        
        window.addEventListener('mousedown', (e) => {
            if (this.dom.contextMenu && !this.dom.contextMenu.contains(e.target)) this.hideContextMenu();
            
            // Close preset menu on click outside
            const presetMenu = document.getElementById('preset-menu');
            const settingsBtn = document.querySelector('[data-tool="settings"]');
            if (presetMenu && presetMenu.style.display === 'block' && 
                !presetMenu.contains(e.target) && e.target !== settingsBtn) {
                presetMenu.style.display = 'none';
            }
            
            // Close zoom menu on click outside
            const zoomMenu = document.getElementById('zoom-menu');
            const zoomIndicator = document.getElementById('zoom-indicator');
            if (zoomMenu && zoomMenu.style.display === 'block' && 
                !zoomMenu.contains(e.target) && e.target !== zoomIndicator) {
                zoomMenu.style.display = 'none';
            }
        });
        
        const params = new URLSearchParams(window.location.search);
        const script = params.get('script');
        if (script) {
            this.dom.scriptName.value = script;
            this.loadScript(script);
        } else {
            this.spawnNode('evt_start', 100, 100);
        }

        requestAnimationFrame(() => this.loop());
        this.log("Studio v2.1 Ready. [Tools: V/W/H/Z/X/C | Panels: Ctrl+1/2/3 | Presets: F1-F4/F11]", "info");
    }

    loop() {
        if (this.viewMode === 'GRAPH') {
            this.updateTransform();
            this.renderWires();
        }
        
        // PHASE 4: Update status bar periodically (throttled to avoid performance hit)
        if (!this._lastStatusUpdate || Date.now() - this._lastStatusUpdate > 500) {
            this.updateStatusBar();
            this._lastStatusUpdate = Date.now();
        }
        
        requestAnimationFrame(() => this.loop());
    }

    updateTransform() {
        this.dom.graph.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
        this.dom.canvas.style.backgroundPosition = `${this.transform.x}px ${this.transform.y}px`;
        this.dom.canvas.style.backgroundSize = `${40 * this.transform.scale}px ${40 * this.transform.scale}px`;
    }

    setReadOnly(enable) {
        this.isReadOnly = enable;
        const nameInput = this.dom.scriptName;
        const btn = document.querySelector('.tool-btn.primary'); 
        
        if (enable) {
            if(nameInput) {
                nameInput.disabled = true;
                nameInput.style.color = '#e74c3c';
                nameInput.title = "Core System Script (Read-Only)";
            }
            if(btn) { btn.disabled = true; btn.style.opacity = 0.5; btn.style.cursor = 'not-allowed'; }
            if(this.dom.canvas) this.dom.canvas.style.borderColor = '#e74c3c';
            this.log("READ-ONLY MODE ACTIVE", "warn");
        } else {
            if(nameInput) {
                nameInput.disabled = false;
                nameInput.style.color = 'var(--accent)';
                nameInput.title = "";
            }
            if(btn) { btn.disabled = false; btn.style.opacity = 1; btn.style.cursor = 'pointer'; }
            if(this.dom.canvas) this.dom.canvas.style.borderColor = 'transparent';
        }
        this.renderInspector();
    }
    
    // PHASE 1: LAYOUT MANAGEMENT
    initLayoutManager() {
        // Load saved layout state from localStorage
        this.layoutState = {
            leftPanel: 'expanded',
            rightPanel: 'expanded',
            bottomPanel: 'expanded',
            consoleErrorCount: 0,
            consoleWarningCount: 0
        };
        
        const saved = localStorage.getItem('algorithm_studio_layout');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.layoutState = { ...this.layoutState, ...parsed };
            } catch(e) {
                console.warn('Failed to load layout state:', e);
            }
        }
        
        // Apply saved state
        this.applyLayoutState();
        
        // Setup keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '1') {
                    e.preventDefault();
                    this.togglePanel('left');
                }
                if (e.key === '2') {
                    e.preventDefault();
                    this.togglePanel('right');
                }
                if (e.key === '3') {
                    e.preventDefault();
                    this.cycleConsoleState();
                }
            }
        });
    }
    
    applyLayoutState() {
        const leftPanel = document.getElementById('left-panel');
        const rightPanel = document.getElementById('right-panel');
        const bottomPanel = document.getElementById('bottom-panel');
        
        if (leftPanel) {
            if (this.layoutState.leftPanel === 'collapsed') {
                leftPanel.classList.add('collapsed');
                this.updateCollapseButton(leftPanel, 'right');
            } else {
                leftPanel.classList.remove('collapsed');
                this.updateCollapseButton(leftPanel, 'left');
            }
        }
        
        if (rightPanel) {
            if (this.layoutState.rightPanel === 'collapsed') {
                rightPanel.classList.add('collapsed');
                this.updateCollapseButton(rightPanel, 'left');
            } else {
                rightPanel.classList.remove('collapsed');
                this.updateCollapseButton(rightPanel, 'right');
            }
        }
        
        if (bottomPanel) {
            bottomPanel.classList.remove('hidden', 'minimized', 'expanded');
            bottomPanel.classList.add(this.layoutState.bottomPanel);
            this.updateConsoleButton();
        }
    }
    
    togglePanel(panelId) {
        const panel = document.getElementById(`${panelId}-panel`);
        if (!panel) return;
        
        const isCollapsed = panel.classList.contains('collapsed');
        
        if (isCollapsed) {
            panel.classList.remove('collapsed');
            this.layoutState[`${panelId}Panel`] = 'expanded';
            this.updateCollapseButton(panel, panelId === 'left' ? 'left' : 'right');
            this.log(`${panelId} panel expanded`, 'info');
        } else {
            panel.classList.add('collapsed');
            this.layoutState[`${panelId}Panel`] = 'collapsed';
            this.updateCollapseButton(panel, panelId === 'left' ? 'right' : 'left');
            this.log(`${panelId} panel collapsed`, 'info');
        }
        
        this.saveLayoutState();
    }
    
    cycleConsoleState() {
        const panel = document.getElementById('bottom-panel');
        if (!panel) return;
        
        const states = ['expanded', 'minimized', 'hidden'];
        const currentState = this.layoutState.bottomPanel;
        const currentIndex = states.indexOf(currentState);
        const nextIndex = (currentIndex + 1) % states.length;
        const nextState = states[nextIndex];
        
        panel.classList.remove('expanded', 'minimized', 'hidden');
        panel.classList.add(nextState);
        this.layoutState.bottomPanel = nextState;
        
        this.updateConsoleButton();
        this.saveLayoutState();
        
        const stateNames = { expanded: 'Expanded', minimized: 'Minimized', hidden: 'Hidden' };
        this.log(`Console ${stateNames[nextState]}`, 'info');
    }
    
    updateCollapseButton(panel, direction) {
        const btn = panel.querySelector('.collapse-btn i');
        if (btn) {
            const iconMap = {
                left: 'fa-chevron-left',
                right: 'fa-chevron-right',
                up: 'fa-chevron-up',
                down: 'fa-chevron-down'
            };
            btn.className = `fas ${iconMap[direction]}`;
        }
    }
    
    updateConsoleButton() {
        const panel = document.getElementById('bottom-panel');
        const btn = panel?.querySelector('.collapse-btn i');
        if (!btn) return;
        
        const state = this.layoutState.bottomPanel;
        if (state === 'expanded') {
            btn.className = 'fas fa-chevron-down';
        } else if (state === 'minimized') {
            btn.className = 'fas fa-chevron-up';
        } else {
            btn.className = 'fas fa-chevron-up';
        }
    }
    
    updateConsoleBadge() {
        const badge = document.getElementById('console-badge');
        if (!badge) return;
        
        const errorCount = this.layoutState.consoleErrorCount || 0;
        const warningCount = this.layoutState.consoleWarningCount || 0;
        
        if (errorCount > 0) {
            badge.textContent = `${errorCount} errors`;
            badge.className = 'console-badge';
            badge.style.display = 'inline-block';
        } else if (warningCount > 0) {
            badge.textContent = `${warningCount} warnings`;
            badge.className = 'console-badge warnings';
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
    
    saveLayoutState() {
        try {
            localStorage.setItem('algorithm_studio_layout', JSON.stringify(this.layoutState));
        } catch(e) {
            console.warn('Failed to save layout state:', e);
        }
    }
    
    // PHASE 2: TOOL RAIL METHODS
    setTool(toolName) {
        this.activeTool = toolName;
        
        // Update button states
        document.querySelectorAll('.rail-btn').forEach(btn => {
            if (btn.dataset.tool === toolName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Update canvas cursor
        const canvas = this.dom.canvas;
        canvas.className = canvas.className.replace(/tool-\w+/g, '');
        canvas.classList.add(`tool-${toolName}`);
        
        // PHASE 4: Update status bar
        this.updateToolIndicator();
        
        this.log(`Tool: ${toolName}`, 'info');
    }
    
    showQuickAdd() {
        // TODO Phase 2: Implement quick add palette
        this.log('Quick Add: Not yet implemented', 'warn');
        alert('Quick Add feature coming in Phase 7!\nFor now, use the Library panel to add nodes.');
    }
    
    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        const btn = document.querySelector('.rail-btn[data-tool="debug"]');
        if (btn) {
            if (this.debugMode) {
                btn.classList.add('active');
                this.log('Debug Mode: ON', 'info');
            } else {
                btn.classList.remove('active');
                this.log('Debug Mode: OFF', 'info');
            }
        }
    }
    
    showLayoutPresets() {
        // TODO Phase 3: Implement layout presets
        this.log('Layout Presets: Not yet implemented', 'warn');
        alert('Layout Presets coming in Phase 3!\nFor now, use Ctrl+1/2/3 to toggle panels.');
    }
    
    initToolKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Tool shortcuts
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                switch(e.key.toLowerCase()) {
                    case 'v':
                        e.preventDefault();
                        this.setTool('pointer');
                        break;
                    case 'w':
                        e.preventDefault();
                        this.setTool('wire');
                        break;
                    case 'h':
                        e.preventDefault();
                        this.setTool('pan');
                        break;
                    case 'z':
                        e.preventDefault();
                        this.setTool('zoom-in');
                        break;
                    case 'x':
                        e.preventDefault();
                        this.setTool('zoom-out');
                        break;
                    case 'c':
                        e.preventDefault();
                        this.setTool('comment');
                        break;
                }
            }
            
            // Shift+A for Add Node
            if (e.shiftKey && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                this.showQuickAdd();
            }
            
            // F5 for Play
            if (e.key === 'F5') {
                e.preventDefault();
                this.testRun();
            }
            
            // F9 for Debug
            if (e.key === 'F9') {
                e.preventDefault();
                this.toggleDebugMode();
            }
        });
    }

    // ==================== PHASE 3: LAYOUT PRESETS ====================

    getBuiltInPresets() {
        return {
            default: {
                name: 'Default',
                icon: 'fa-th',
                leftPanel: { state: 'expanded', width: 280 },
                rightPanel: { state: 'expanded', width: 300 },
                bottomPanel: { state: 'minimized', height: 30 },
                zoom: 1.0
            },
            fullCanvas: {
                name: 'Full Canvas',
                icon: 'fa-expand',
                leftPanel: { state: 'collapsed', width: 40 },
                rightPanel: { state: 'collapsed', width: 40 },
                bottomPanel: { state: 'hidden', height: 0 },
                zoom: 1.0
            },
            debug: {
                name: 'Debug Mode',
                icon: 'fa-bug',
                leftPanel: { state: 'collapsed', width: 40 },
                rightPanel: { state: 'expanded', width: 300 },
                bottomPanel: { state: 'expanded', height: 160 },
                zoom: 1.0
            },
            library: {
                name: 'Library Focus',
                icon: 'fa-books',
                leftPanel: { state: 'expanded', width: 360 },
                rightPanel: { state: 'collapsed', width: 40 },
                bottomPanel: { state: 'minimized', height: 30 },
                zoom: 1.0
            },
            code: {
                name: 'Code View',
                icon: 'fa-code',
                leftPanel: { state: 'collapsed', width: 40 },
                rightPanel: { state: 'collapsed', width: 40 },
                bottomPanel: { state: 'hidden', height: 0 },
                showCode: true,
                zoom: 1.0
            }
        };
    }

    applyPreset(presetKey) {
        const builtIn = this.getBuiltInPresets();
        let preset = builtIn[presetKey] || this.customPresets[presetKey];
        
        if (!preset) {
            this.log(`Preset "${presetKey}" not found`, 'error');
            return;
        }

        // Apply panel states
        const leftPanel = document.getElementById('left-panel');
        const rightPanel = document.getElementById('right-panel');
        const bottomPanel = document.getElementById('bottom-panel');

        // Left Panel
        if (preset.leftPanel.state === 'expanded') {
            leftPanel.classList.remove('collapsed');
            leftPanel.style.width = preset.leftPanel.width + 'px';
        } else {
            leftPanel.classList.add('collapsed');
        }

        // Right Panel
        if (preset.rightPanel.state === 'expanded') {
            rightPanel.classList.remove('collapsed');
            rightPanel.style.width = preset.rightPanel.width + 'px';
        } else {
            rightPanel.classList.add('collapsed');
        }

        // Bottom Panel
        bottomPanel.classList.remove('hidden', 'minimized', 'expanded');
        if (preset.bottomPanel.state === 'hidden') {
            bottomPanel.classList.add('hidden');
        } else if (preset.bottomPanel.state === 'minimized') {
            bottomPanel.classList.add('minimized');
        } else {
            bottomPanel.classList.add('expanded');
            bottomPanel.style.height = preset.bottomPanel.height + 'px';
        }

        // Code view toggle
        if (preset.showCode) {
            this.viewMode = 'CODE';
            this.dom.canvas.style.display = 'none';
            this.dom.codeView.style.display = 'block';
            this.dom.codeEditor.value = this.compile();
        } else if (this.viewMode === 'CODE') {
            this.viewMode = 'GRAPH';
            this.dom.canvas.style.display = 'block';
            this.dom.codeView.style.display = 'none';
        }

        // Zoom
        if (preset.zoom && preset.zoom !== this.transform.scale) {
            this.transform.scale = preset.zoom;
            this.renderWires();
        }

        this.activePreset = presetKey;
        this.saveLayoutPreset();
        this.log(`Applied preset: ${preset.name}`, 'info');
        
        // Update UI indicator if exists
        const indicator = document.getElementById('preset-indicator');
        if (indicator) {
            indicator.textContent = preset.name;
        }
    }

    saveCurrentAsPreset(name) {
        if (!name || name.trim() === '') {
            this.log('Preset name cannot be empty', 'error');
            return;
        }

        const leftPanel = document.getElementById('left-panel');
        const rightPanel = document.getElementById('right-panel');
        const bottomPanel = document.getElementById('bottom-panel');

        const preset = {
            name: name,
            icon: 'fa-user',
            leftPanel: {
                state: leftPanel.classList.contains('collapsed') ? 'collapsed' : 'expanded',
                width: parseInt(leftPanel.style.width) || 280
            },
            rightPanel: {
                state: rightPanel.classList.contains('collapsed') ? 'collapsed' : 'expanded',
                width: parseInt(rightPanel.style.width) || 300
            },
            bottomPanel: {
                state: bottomPanel.classList.contains('hidden') ? 'hidden' :
                       bottomPanel.classList.contains('minimized') ? 'minimized' : 'expanded',
                height: parseInt(bottomPanel.style.height) || 160
            },
            zoom: this.transform.scale
        };

        const key = name.toLowerCase().replace(/\s+/g, '_');
        this.customPresets[key] = preset;
        this.saveCustomPresets();
        this.log(`Saved custom preset: ${name}`, 'info');
        
        return key;
    }

    deletePreset(presetKey) {
        if (this.customPresets[presetKey]) {
            delete this.customPresets[presetKey];
            this.saveCustomPresets();
            this.log(`Deleted preset: ${presetKey}`, 'info');
            return true;
        }
        return false;
    }

    loadCustomPresets() {
        try {
            const saved = localStorage.getItem('algorithm_studio_custom_presets');
            if (saved) {
                this.customPresets = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load custom presets:', e);
        }
    }

    saveCustomPresets() {
        try {
            localStorage.setItem('algorithm_studio_custom_presets', JSON.stringify(this.customPresets));
        } catch (e) {
            console.error('Failed to save custom presets:', e);
        }
    }

    saveLayoutPreset() {
        try {
            localStorage.setItem('algorithm_studio_active_preset', this.activePreset);
        } catch (e) {
            console.error('Failed to save active preset:', e);
        }
    }

    loadLayoutPreset() {
        try {
            const saved = localStorage.getItem('algorithm_studio_active_preset');
            if (saved) {
                this.activePreset = saved;
                // Don't auto-apply on load, use default behavior from layout manager
            }
        } catch (e) {
            console.error('Failed to load layout preset:', e);
        }
    }

    initPresetKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // F1 - Default
            if (e.key === 'F1') {
                e.preventDefault();
                this.applyPreset('default');
            }
            
            // F2 - Full Canvas
            if (e.key === 'F2') {
                e.preventDefault();
                this.applyPreset('fullCanvas');
            }
            
            // F3 - Debug Mode
            if (e.key === 'F3') {
                e.preventDefault();
                this.applyPreset('debug');
            }
            
            // F4 - Library Focus
            if (e.key === 'F4') {
                e.preventDefault();
                this.applyPreset('library');
            }
            
            // F11 - Code View
            if (e.key === 'F11') {
                e.preventDefault();
                this.applyPreset('code');
            }
        });
    }

    showPresetMenu() {
        const menu = document.getElementById('preset-menu');
        if (!menu) {
            this.log('Preset menu not found', 'error');
            return;
        }

        // Toggle visibility
        if (menu.style.display === 'block') {
            menu.style.display = 'none';
        } else {
            menu.style.display = 'block';
        }
    }

    showSavePresetDialog() {
        const name = prompt('Enter a name for this layout preset:');
        if (name) {
            const key = this.saveCurrentAsPreset(name);
            if (key) {
                this.showNotification(`Preset "${name}" saved!`, 'success');
            }
        }
        this.showPresetMenu(); // Close menu
    }

    // ==================== END PHASE 3 ====================

    // ==================== PHASE 4: TOOLBAR & STATUS BAR ====================

    updateStatusBar() {
        // Update node/wire count
        const nodeCount = document.getElementById('status-nodes');
        const wireCount = document.getElementById('status-wires');
        if (nodeCount) nodeCount.textContent = `${this.nodes.length} nodes`;
        if (wireCount) wireCount.textContent = `${this.wires.length} wires`;
        
        // Update transform
        const transform = document.getElementById('status-transform');
        if (transform) {
            const zoom = Math.round(this.transform.scale * 100);
            transform.textContent = `X: ${Math.round(this.transform.x)}, Y: ${Math.round(this.transform.y)}, Zoom: ${zoom}%`;
        }
        
        // Update validation status
        const validation = document.getElementById('status-validation');
        if (validation) {
            if (this.validationErrors.length > 0) {
                validation.textContent = `⚠️ ${this.validationErrors.length} errors`;
                validation.className = 'has-errors';
            } else if (this.validationWarnings.length > 0) {
                validation.textContent = `⚠️ ${this.validationWarnings.length} warnings`;
                validation.className = 'has-warnings';
            } else {
                validation.textContent = '✓ No errors';
                validation.className = '';
            }
        }
    }

    updateZoomIndicator() {
        const indicator = document.getElementById('zoom-indicator');
        if (indicator) {
            const zoom = Math.round(this.transform.scale * 100);
            indicator.textContent = `${zoom}%`;
        }
        this.updateStatusBar();
    }

    updateToolIndicator() {
        const indicator = document.getElementById('status-tool');
        if (!indicator) return;
        
        const toolNames = {
            pointer: '🖱️ Pointer',
            wire: '🔗 Wire',
            pan: '✋ Pan',
            'zoom-in': '🔍 Zoom In',
            'zoom-out': '🔍 Zoom Out'
        };
        
        indicator.textContent = toolNames[this.activeTool] || '🖱️ Pointer';
    }

    zoomIn() {
        this.transform.scale = Math.min(this.transform.scale * 1.2, 3.0);
        this.renderWires();
        this.updateZoomIndicator();
    }

    zoomOut() {
        this.transform.scale = Math.max(this.transform.scale / 1.2, 0.25);
        this.renderWires();
        this.updateZoomIndicator();
    }

    toggleGrid() {
        const canvas = document.getElementById('canvas-viewport');
        const toggle = document.getElementById('grid-toggle');
        const state = document.getElementById('grid-state');
        
        if (!this.gridEnabled) {
            this.gridEnabled = true;
            this.applyGrid();
            if (state) state.textContent = 'ON';
            if (toggle) toggle.style.opacity = '1';
        } else {
            this.gridEnabled = false;
            canvas.style.backgroundImage = '';
            if (state) state.textContent = 'OFF';
            if (toggle) toggle.style.opacity = '0.5';
        }
    }
    
    applyGrid() {
        const canvas = document.getElementById('canvas-viewport');
        const size = this.gridSize || 32;
        canvas.style.backgroundImage = `radial-gradient(circle, #1a1a1a 1px, transparent 1px)`;
        canvas.style.backgroundSize = `${size}px ${size}px`;
    }
    
    changeGridSize(size) {
        this.gridSize = parseInt(size);
        if (this.gridEnabled) {
            this.applyGrid();
        }
        this.log(`Grid size: ${size}px`, 'info');
    }
    
    showZoomPresets() {
        const menu = document.getElementById('zoom-menu');
        if (!menu) return;
        
        if (menu.style.display === 'block') {
            menu.style.display = 'none';
        } else {
            menu.style.display = 'block';
        }
    }
    
    setZoom(scale) {
        this.transform.scale = Math.max(0.25, Math.min(3.0, scale));
        this.renderWires();
        this.updateZoomIndicator();
        this.log(`Zoom: ${Math.round(scale * 100)}%`, 'info');
    }

    // ==================== END PHASE 4 ====================

    // ==================== PHASE 5: NODE ALIGNMENT ====================

    alignNodes(direction) {
        const selected = this.nodes.filter(n => n.selected || this.state.selection === n.id);
        if (selected.length < 2) {
            this.log('Select 2+ nodes to align', 'warn');
            return;
        }
        
        if (direction === 'left') {
            const minX = Math.min(...selected.map(n => n.x));
            selected.forEach(n => n.x = minX);
        } else if (direction === 'right') {
            const maxX = Math.max(...selected.map(n => n.x));
            selected.forEach(n => n.x = maxX);
        } else if (direction === 'center-h') {
            const avgX = selected.reduce((sum, n) => sum + n.x, 0) / selected.length;
            selected.forEach(n => n.x = avgX);
        } else if (direction === 'top') {
            const minY = Math.min(...selected.map(n => n.y));
            selected.forEach(n => n.y = minY);
        } else if (direction === 'bottom') {
            const maxY = Math.max(...selected.map(n => n.y));
            selected.forEach(n => n.y = maxY);
        } else if (direction === 'center-v') {
            const avgY = selected.reduce((sum, n) => sum + n.y, 0) / selected.length;
            selected.forEach(n => n.y = avgY);
        }
        
        selected.forEach(n => {
            const el = document.getElementById(n.id);
            if (el) {
                el.style.left = n.x + 'px';
                el.style.top = n.y + 'px';
            }
        });
        
        this.renderWires();
        this.log(`Aligned ${selected.length} nodes: ${direction}`, 'info');
    }
    
    distributeNodes(direction) {
        const selected = this.nodes.filter(n => n.selected || this.state.selection === n.id);
        if (selected.length < 3) {
            this.log('Select 3+ nodes to distribute', 'warn');
            return;
        }
        
        if (direction === 'horizontal') {
            selected.sort((a, b) => a.x - b.x);
            const first = selected[0].x;
            const last = selected[selected.length - 1].x;
            const step = (last - first) / (selected.length - 1);
            
            selected.forEach((n, i) => {
                n.x = first + (i * step);
                const el = document.getElementById(n.id);
                if (el) el.style.left = n.x + 'px';
            });
        } else if (direction === 'vertical') {
            selected.sort((a, b) => a.y - b.y);
            const first = selected[0].y;
            const last = selected[selected.length - 1].y;
            const step = (last - first) / (selected.length - 1);
            
            selected.forEach((n, i) => {
                n.y = first + (i * step);
                const el = document.getElementById(n.id);
                if (el) el.style.top = n.y + 'px';
            });
        }
        
        this.renderWires();
        this.log(`Distributed ${selected.length} nodes: ${direction}`, 'info');
    }

    // ==================== END PHASE 5 ====================
    
    // ==================== PHASE 6: QUICK SEARCH & ADD ====================
    
    initQuickSearch() {
        this.searchOverlay = document.getElementById('quick-search-overlay');
        this.searchInput = document.getElementById('search-input');
        this.searchResults = document.getElementById('search-results');
        
        if (!this.searchOverlay || !this.searchInput || !this.searchResults) {
            this.log('Quick Search: DOM elements not found', 'error');
            return;
        }
        
        // Input event for live search
        this.searchInput.addEventListener('input', (e) => {
            this.performSearch(e.target.value);
        });
        
        // Keyboard navigation in search
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.searchSelectNext();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.searchSelectPrevious();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.searchAddSelected();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.closeQuickSearch();
            }
        });
        
        // Global keyboard shortcut Ctrl+K
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.openQuickSearch();
            }
        });
        
        this.log('Quick Search initialized (Ctrl+K)', 'info');
    }
    
    loadSearchPreferences() {
        try {
            const saved = localStorage.getItem('algorithm_studio_search_prefs');
            if (saved) {
                const prefs = JSON.parse(saved);
                this.recentNodes = prefs.recentNodes || [];
                this.favoriteNodes = prefs.favoriteNodes || [];
            }
        } catch (e) {
            this.log('Failed to load search preferences', 'warn');
        }
    }
    
    saveSearchPreferences() {
        try {
            localStorage.setItem('algorithm_studio_search_prefs', JSON.stringify({
                recentNodes: this.recentNodes,
                favoriteNodes: this.favoriteNodes
            }));
        } catch (e) {
            this.log('Failed to save search preferences', 'warn');
        }
    }
    
    openQuickSearch(cx = null, cy = null, fromNodeId = null, fromPortId = null, dataType = null) {
        if (this.searchOverlay) {
            this.searchOverlay.style.display = 'flex';
            this.searchInput.value = '';
            this.searchInput.focus();
            this.searchCategory = 'all';
            this.searchSelectedIndex = 0;
            
            // PHASE 7: Store search context
            this.searchContext = (cx !== null && cy !== null) ? { cx, cy, fromNodeId, fromPortId, dataType } : null;
            
            // Reset category buttons
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.category === 'all');
            });
            
            // Show all nodes initially (filtered by context if exists)
            this.performSearch('');
            
            this.log('Quick Search opened', 'info');
        }
    }
    
    closeQuickSearch() {
        if (this.searchOverlay) {
            this.searchOverlay.style.display = 'none';
            this.searchInput.blur();
            this.searchContext = null; // PHASE 7: Clear context
        }
    }
    
    filterByCategory(category) {
        this.searchCategory = category;
        
        // Update button states
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });
        
        // Re-run search with current query
        this.performSearch(this.searchInput.value);
    }
    
    performSearch(query) {
        const lowerQuery = query.toLowerCase().trim();
        
        // Get all available node types
        let allNodes = this.getAllNodeDefinitions();
        
        // PHASE 7: Context-sensitive filtering
        if (this.searchContext && this.searchContext.dataType) {
            const dragType = this.searchContext.dataType;
            allNodes = allNodes.filter(node => {
                const def = LIB[node.type];
                // Only show nodes that have at least one input compatible with the dragged type
                return def.inputs && def.inputs.some(input => this.canConnectPorts(dragType, input.type));
            });
        }
        
        // Filter by category first
        let filtered = allNodes;
        if (this.searchCategory !== 'all') {
            filtered = filtered.filter(node => node.category === this.searchCategory);
        }
        
        // Apply fuzzy search if query exists
        if (lowerQuery) {
            filtered = filtered.map(node => {
                const score = this.fuzzyMatch(lowerQuery, node);
                return { ...node, score };
            }).filter(node => node.score > 0)
              .sort((a, b) => b.score - a.score);
        }
        
        this.searchFilteredNodes = filtered;
        this.searchSelectedIndex = 0;
        this.renderSearchResults(lowerQuery);
    }
    
    fuzzyMatch(query, node) {
        // Fuzzy matching algorithm
        const name = node.name.toLowerCase();
        const type = node.type.toLowerCase();
        const desc = (node.description || '').toLowerCase();
        
        let score = 0;
        
        // Exact match bonus
        if (name.includes(query)) score += 100;
        if (type.includes(query)) score += 50;
        if (desc.includes(query)) score += 25;
        
        // Fuzzy character matching
        let queryIndex = 0;
        for (let i = 0; i < name.length && queryIndex < query.length; i++) {
            if (name[i] === query[queryIndex]) {
                score += 5;
                queryIndex++;
            }
        }
        
        // Check if all query characters found
        if (queryIndex === query.length) score += 50;
        
        // Favorites get bonus
        if (this.favoriteNodes.includes(node.type)) score += 200;
        
        // Recent nodes get bonus
        const recentIndex = this.recentNodes.indexOf(node.type);
        if (recentIndex !== -1) {
            score += 100 - (recentIndex * 10);
        }
        
        return score;
    }
    
    highlightMatches(text, query) {
        if (!query) return text;
        
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        let result = '';
        let lastIndex = 0;
        
        for (let i = 0; i < lowerText.length; i++) {
            if (lowerQuery.includes(lowerText[i])) {
                result += text.substring(lastIndex, i) + '<span class="match">' + text[i] + '</span>';
                lastIndex = i + 1;
            }
        }
        result += text.substring(lastIndex);
        return result;
    }
    
    renderSearchResults(query) {
        if (!this.searchResults) return;
        
        if (this.searchFilteredNodes.length === 0) {
            this.searchResults.innerHTML = `
                <div class="search-empty">
                    <i class="fas fa-search"></i>
                    <div>No nodes found</div>
                    <div style="margin-top: 10px; font-size: 0.9rem;">Try a different search term or category</div>
                </div>
            `;
            return;
        }
        
        // Group by category
        const grouped = {};
        this.searchFilteredNodes.forEach(node => {
            if (!grouped[node.category]) grouped[node.category] = [];
            grouped[node.category].push(node);
        });
        
        let html = '';
        
        // Favorites section (if any)
        const favorites = this.searchFilteredNodes.filter(n => this.favoriteNodes.includes(n.type));
        if (favorites.length > 0) {
            html += `
                <div class="search-section">
                    <div class="search-section-header">
                        <i class="fas fa-star"></i> FAVORITES (${favorites.length})
                    </div>
                    ${this.renderSearchItems(favorites, query, 0)}
                </div>
            `;
        }
        
        // Recent section (if any and no query)
        const recents = this.searchFilteredNodes.filter(n => this.recentNodes.includes(n.type) && !this.favoriteNodes.includes(n.type));
        if (recents.length > 0 && !query) {
            html += `
                <div class="search-section">
                    <div class="search-section-header">
                        <i class="fas fa-history"></i> RECENT (${recents.length})
                    </div>
                    ${this.renderSearchItems(recents, query, favorites.length)}
                </div>
            `;
        }
        
        // All results by category
        let offset = favorites.length + recents.length;
        const remainingNodes = this.searchFilteredNodes.filter(n => 
            !this.favoriteNodes.includes(n.type) && 
            !this.recentNodes.includes(n.type)
        );
        
        if (remainingNodes.length > 0) {
            Object.keys(grouped).forEach(category => {
                const categoryNodes = grouped[category].filter(n => 
                    !this.favoriteNodes.includes(n.type) && 
                    !this.recentNodes.includes(n.type)
                );
                
                if (categoryNodes.length > 0) {
                    html += `
                        <div class="search-section">
                            <div class="search-section-header">
                                <i class="${this.getCategoryIcon(category)}"></i> ${category.toUpperCase()} (${categoryNodes.length})
                            </div>
                            ${this.renderSearchItems(categoryNodes, query, offset)}
                        </div>
                    `;
                    offset += categoryNodes.length;
                }
            });
        }
        
        this.searchResults.innerHTML = html;
        
        // Add click handlers
        document.querySelectorAll('.search-item').forEach((el, index) => {
            el.addEventListener('click', () => {
                this.searchSelectedIndex = index;
                this.searchAddSelected();
            });
        });
    }
    
    renderSearchItems(nodes, query, startOffset) {
        return nodes.map((node, index) => {
            const globalIndex = startOffset + index;
            const selected = globalIndex === this.searchSelectedIndex ? 'selected' : '';
            const isFavorite = this.favoriteNodes.includes(node.type);
            
            return `
                <div class="search-item ${selected}" data-index="${globalIndex}">
                    <div class="search-item-icon">
                        <i class="${this.getNodeIcon(node.category)}"></i>
                    </div>
                    <div class="search-item-content">
                        <div class="search-item-name">
                            ${this.highlightMatches(node.name, query)}
                            ${isFavorite ? '<i class="fas fa-star" style="color: var(--accent); margin-left: 5px;"></i>' : ''}
                        </div>
                        <div class="search-item-desc">${node.description || 'No description'}</div>
                    </div>
                    <div class="search-item-category">${node.category}</div>
                </div>
            `;
        }).join('');
    }
    
    searchSelectNext() {
        if (this.searchFilteredNodes.length === 0) return;
        this.searchSelectedIndex = (this.searchSelectedIndex + 1) % this.searchFilteredNodes.length;
        this.updateSearchSelection();
    }
    
    searchSelectPrevious() {
        if (this.searchFilteredNodes.length === 0) return;
        this.searchSelectedIndex = (this.searchSelectedIndex - 1 + this.searchFilteredNodes.length) % this.searchFilteredNodes.length;
        this.updateSearchSelection();
    }
    
    updateSearchSelection() {
        document.querySelectorAll('.search-item').forEach((el, index) => {
            el.classList.toggle('selected', index === this.searchSelectedIndex);
        });
        
        // Scroll into view
        const selected = document.querySelector('.search-item.selected');
        if (selected) {
            selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
    
    searchAddSelected() {
        if (this.searchFilteredNodes.length === 0) return;
        
        const nodeDef = this.searchFilteredNodes[this.searchSelectedIndex];
        if (!nodeDef) return;
        
        // Add to recent nodes
        this.recentNodes = this.recentNodes.filter(t => t !== nodeDef.type);
        this.recentNodes.unshift(nodeDef.type);
        if (this.recentNodes.length > 10) this.recentNodes.pop();
        this.saveSearchPreferences();
        
        // PHASE 7: Determine position based on context
        let x, y;
        if (this.searchContext) {
            const canvasPos = this.getCanvasPos(this.searchContext.cx, this.searchContext.cy);
            x = canvasPos.x - 20; 
            y = canvasPos.y - 20;
        } else {
            const viewportRect = this.dom.canvas.getBoundingClientRect();
            x = (viewportRect.width / 2 - this.transform.x) / this.transform.scale - 100;
            y = (viewportRect.height / 2 - this.transform.y) / this.transform.scale - 50;
        }
        
        const newNode = this.spawnNode(nodeDef.type, x, y);
        
        // PHASE 7: AUTO-CONNECT if spawned from wire
        if (this.searchContext && this.searchContext.fromNodeId && newNode) {
            const ctx = this.searchContext;
            const def = LIB[nodeDef.type];
            // Find compatible input port
            const targetPort = def.inputs && def.inputs.find(input => this.canConnectPorts(ctx.dataType, input.type));
            
            if (targetPort) {
                this.wires.push({ 
                    id: `w_${this.nextWireId++}`, 
                    fromNode: ctx.fromNodeId, 
                    fromPort: ctx.fromPortId, 
                    toNode: newNode.id, 
                    toPort: targetPort.id,
                    invalid: false
                });
                this.log(`✅ Auto-connected to ${targetPort.name || targetPort.id}`, 'info');
            }
        }
        
        this.closeQuickSearch();
        this.log(`Added node: ${nodeDef.name}`, 'info');
    }
    
    getAllNodeDefinitions() {
        // PHASE 1A: Dynamically generate from LIB object (all 132 nodes)
        const definitions = [];
        
        Object.keys(LIB).forEach(nodeType => {
            const def = LIB[nodeType];
            if (!def || !def.title || !def.cat) return;
            definitions.push({
                type: nodeType,
                name: def.title,
                category: def.cat,
                description: def.desc || 'No description available'
            });
        });
        
        return definitions;
    }
    
    getCategoryIcon(category) {
        const icons = {
            'Event': 'fas fa-bolt',
            'Flow': 'fas fa-project-diagram',
            'Var': 'fas fa-cube',
            'Math': 'fas fa-calculator',
            'Logic': 'fas fa-sitemap',
            'Entity': 'fas fa-users',
            'Player': 'fas fa-user',
            'Inventory': 'fas fa-box',
            'GameState': 'fas fa-flag',
            'World': 'fas fa-globe',
            'Camera': 'fas fa-video',
            'FX': 'fas fa-magic',
            'Audio': 'fas fa-volume-up',
            'Dialogue': 'fas fa-comments',
            'Time': 'fas fa-clock',
            'Engine': 'fas fa-cog',
            'Debug': 'fas fa-bug'
        };
        return icons[category] || 'fas fa-circle';
    }
    
    getNodeIcon(category) {
        return this.getCategoryIcon(category);
    }
    
    showQuickAdd() {
        // Replace old placeholder with new search
        this.openQuickSearch();
    }
    
    toggleFavoriteNode(nodeType) {
        const index = this.favoriteNodes.indexOf(nodeType);
        if (index === -1) {
            this.favoriteNodes.push(nodeType);
            this.log(`Added ${nodeType} to favorites`, 'info');
        } else {
            this.favoriteNodes.splice(index, 1);
            this.log(`Removed ${nodeType} from favorites`, 'info');
        }
        this.saveSearchPreferences();
        
        // Re-render if search is open
        if (this.searchOverlay && this.searchOverlay.style.display === 'flex') {
            this.performSearch(this.searchInput.value);
        }
    }
    
    // ==================== END PHASE 6 ====================
    
    // ==================== PHASE 7: POLISH & REFINEMENTS ====================
    
    initEnhancements() {
        // Enhanced tooltip system
        this.initEnhancedTooltips();
        
        // Welcome overlay for empty canvas
        this.initWelcomeOverlay();
        
        // Save indicator system
        this.setupSaveIndicator();
        
        // Status bar error pulse
        this.setupStatusBarEffects();
        
        this.log('Phase 7: Polish & Refinements initialized', 'info');
    }
    
    initEnhancedTooltips() {
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.id = 'enhanced-tooltip';
        document.body.appendChild(tooltip);
        
        // Add hover listeners to all buttons with title attribute  
        // Note: This runs after populateLibrary(), so lib items will be included
        try {
            document.querySelectorAll('[title]:not(.lib-item)').forEach(el => {
                el.addEventListener('mouseenter', (e) => {
                    const title = el.getAttribute('title');
                    if (!title) return;
                    
                    tooltip.innerHTML = title;
                    tooltip.classList.add('show');
                    
                    // Position tooltip
                    const rect = el.getBoundingClientRect();
                    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
                    tooltip.style.top = rect.bottom + 8 + 'px';
                });
                
                el.addEventListener('mouseleave', () => {
                    tooltip.classList.remove('show');
                });
            });
            
            this.log('Enhanced tooltips active', 'info');
        } catch (e) {
            this.log('Tooltip init failed: ' + e.message, 'error');
        }
    }
    
    initWelcomeOverlay() {
        // Create welcome overlay
        const welcome = document.createElement('div');
        welcome.className = 'welcome-overlay';
        welcome.id = 'welcome-overlay';
        welcome.innerHTML = `
            <i class="fas fa-project-diagram"></i>
            <h2>ALGORITHM STUDIO</h2>
            <p>Press <strong>Ctrl+K</strong> to add nodes</p>
            <p>Drag from library to get started</p>
            <p><strong>F1-F4</strong> for layout presets</p>
        `;
        
        if (this.dom.canvas) {
            this.dom.canvas.appendChild(welcome);
            // Show/hide based on node count
            this.updateWelcomeOverlay();
        } else {
            this.log('Welcome overlay: Canvas not found', 'warn');
        }
    }
    
    updateWelcomeOverlay() {
        const welcome = document.getElementById('welcome-overlay');
        if (!welcome) return;
        
        if (this.nodes.length === 0) {
            welcome.classList.remove('hidden');
        } else {
            welcome.classList.add('hidden');
        }
    }
    
    setupSaveIndicator() {
        // Save indicator will be created dynamically when saving
        this.lastSaveTime = Date.now();
    }
    
    showSaveIndicator(message = 'SAVED', duration = 2500) {
        // Remove existing indicator
        const existing = document.getElementById('save-indicator');
        if (existing) existing.remove();
        
        // Create new indicator
        const indicator = document.createElement('div');
        indicator.className = 'save-indicator';
        indicator.id = 'save-indicator';
        indicator.innerHTML = `<i class="fas fa-check"></i> ${message}`;
        document.body.appendChild(indicator);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, duration);
    }
    
    setupStatusBarEffects() {
        // Add error pulse animation to validation status when errors exist
        this.statusBarUpdateInterval = setInterval(() => {
            const validationEl = document.getElementById('status-validation');
            if (!validationEl) return;
            
            if (this.validationErrors && this.validationErrors.length > 0) {
                validationEl.classList.add('status-error');
            } else {
                validationEl.classList.remove('status-error');
            }
        }, 100);
    }
    
    // Enhanced save with visual feedback
    saveWithFeedback() {
        const scriptName = this.dom.scriptName.value || 'untitled';
        
        // Show loading spinner briefly
        const saveBtn = document.querySelector('[onclick="studio.save()"]');
        const originalHTML = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
            saveBtn.innerHTML = '<div class="loading-spinner"></div>';
            saveBtn.disabled = true;
        }
        
        // Perform save
        setTimeout(() => {
            this.save();
            
            // Restore button
            if (saveBtn) {
                saveBtn.innerHTML = originalHTML;
                saveBtn.disabled = false;
            }
            
            // Show success indicator
            this.showSaveIndicator();
            this.lastSaveTime = Date.now();
        }, 200);
    }
    
    // Add wire with animation
    addWireAnimated(from, to) {
        const wire = this.addWire(from, to);
        
        if (wire) {
            // Find the wire SVG element and animate it
            const wireEl = document.querySelector(`[data-wire-id="${wire.id}"]`);
            if (wireEl) {
                wireEl.style.strokeDasharray = '1000';
                wireEl.style.strokeDashoffset = '1000';
                wireEl.style.animation = 'wireDraw 0.5s ease-out forwards';
            }
        }
        
        return wire;
    }
    
    // Spawn node with enhanced animation (override existing)
    spawnNodeEnhanced(type, x, y) {
        const node = this.spawnNode(type, x, y);
        
        // Update welcome overlay
        this.updateWelcomeOverlay();
        
        return node;
    }
    
    // Delete with animation
    deleteNodeAnimated(nodeId) {
        const nodeEl = document.getElementById(nodeId);
        if (nodeEl) {
            nodeEl.style.animation = 'nodeSpawn 0.2s ease-in reverse';
            setTimeout(() => {
                this.deleteNode(nodeId);
                this.updateWelcomeOverlay();
            }, 200);
        } else {
            this.deleteNode(nodeId);
            this.updateWelcomeOverlay();
        }
    }
    
    // Performance monitoring
    measurePerformance(label, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        const duration = end - start;
        
        if (duration > 16) { // Slower than 60fps
            this.log(`Performance: ${label} took ${duration.toFixed(2)}ms`, 'warn');
        }
        
        return result;
    }
    
    // Throttled render for large graphs
    throttledRender() {
        if (this._renderTimeout) return;
        
        this._renderTimeout = setTimeout(() => {
            this.renderWires();
            this._renderTimeout = null;
        }, 16); // ~60fps
    }
    
    // Check for performance issues
    checkPerformance() {
        const nodeCount = this.nodes.length;
        const wireCount = this.wires.length;
        
        if (nodeCount > 100) {
            this.log(`Large graph detected: ${nodeCount} nodes. Consider splitting into subgraphs.`, 'warn');
        }
        
        if (wireCount > 200) {
            this.log(`Many wires: ${wireCount}. Performance may be affected.`, 'warn');
        }
    }
    
    // Cleanup on destroy
    cleanup() {
        if (this.statusBarUpdateInterval) {
            clearInterval(this.statusBarUpdateInterval);
        }
        
        if (this._renderTimeout) {
            clearTimeout(this._renderTimeout);
        }
        
        this.log('Algorithm Studio cleaned up', 'info');
    }
    
    // ==================== END PHASE 7 ====================

    toggleViewMode() {
        if (this.viewMode === 'GRAPH') {
            this.viewMode = 'CODE';
            this.dom.canvas.style.display = 'none';
            this.dom.codeView.style.display = 'block';
            this.dom.codeEditor.value = this.compile();
            const btn = document.getElementById('btn-view-toggle');
            if(btn) { btn.innerHTML = '<i class="fas fa-project-diagram"></i>'; btn.title = "Switch to Graph View"; }
        } else {
            if (confirm("Switching back to Graph View will discard manual code edits. Continue?")) {
                this.viewMode = 'GRAPH';
                this.dom.canvas.style.display = 'block';
                this.dom.codeView.style.display = 'none';
                const btn = document.getElementById('btn-view-toggle');
                if(btn) { btn.innerHTML = '<i class="fas fa-code"></i>'; btn.title = "Switch to Code View"; }
            }
        }
    }

    // --- NODE LOGIC ---

    populateLibrary() {
        this.dom.libList.innerHTML = '';
        const cats = {}; 
        
        // 1. Merge Static LIB
        let allDefs = { ...LIB };

        // 2. Merge Dynamic Schema (from Game Engine via window.opener or frame)
        if (window.opener && window.opener.GAME_API_SCHEMA) {
            window.opener.GAME_API_SCHEMA.forEach(def => {
                allDefs[def.type] = def;
            });
        }

        Object.keys(allDefs).forEach(key => {
            const def = allDefs[key];
            // Skip if definition is missing or invalid
            if (!def || !def.cat) {
                console.warn(`[Library] Skipping invalid node type: ${key}`, def);
                return;
            }
            if (!cats[def.cat]) cats[def.cat] = [];
            cats[def.cat].push({ key, ...def });
        });

        Object.keys(cats).forEach(cat => {
            const group = document.createElement('div');
            group.innerHTML = `<div style="padding:6px 10px; font-weight:bold; color:#777; background:#111; text-transform:uppercase; font-size:11px; margin-top:5px; border-top:1px solid #333;">${cat}</div>`;
            cats[cat].forEach(item => {
                const el = document.createElement('div');
                el.className = 'lib-item';
                el.draggable = true;
                el.dataset.type = item.key;
                el.innerHTML = `<div class="lib-icon" style="background:${this.getCatColor(cat)}; width:8px; height:8px; border-radius:50%;"></div> ${item.title}`;
                el.title = item.desc || "";
                el.addEventListener('dragstart', (e) => {
                    if(this.isReadOnly) { e.preventDefault(); return; }
                    e.dataTransfer.setData('type', item.key);
                });
                group.appendChild(el);
            });
            this.dom.libList.appendChild(group);
        });
    }

    getCatColor(cat) {
        if (cat === 'Event') return '#c0392b';
        if (cat === 'Flow') return '#7f8c8d';
        if (cat === 'Math') return '#27ae60';
        if (cat === 'Engine') return '#2980b9';
        if (cat === 'Entity') return '#9b59b6'; // Phase 1.1: Purple for Entity nodes
        if (cat === 'Player') return '#e67e22'; // Phase 1.2: Orange for Player nodes
        if (cat === 'Inventory') return '#16a085'; // Phase 1.2: Teal for Inventory nodes
        if (cat === 'GameState') return '#f39c12'; // Phase 1.3: Gold for GameState nodes
        if (cat === 'World') return '#34495e'; // Phase 1.4: Dark slate for World nodes
        if (cat === 'Camera') return '#3498db'; // Phase 1.5: Blue for Camera nodes
        if (cat === 'FX') return '#e74c3c'; // Phase 1.5: Red for FX nodes
        if (cat === 'Audio') return '#9b59b6'; // Phase 1.6: Purple for Audio nodes
        if (cat === 'Dialogue') return '#1abc9c'; // Phase 1.7: Turquoise for Dialogue nodes
        if (cat === 'Time') return '#95a5a6'; // Phase 1.8: Gray for Time nodes
        return '#8e44ad';
    }

    spawnNode(type, x, y) {
        if (this.isReadOnly) return;
        const def = LIB[type];
        if (!def) return;
        const node = {
            id: `n_${this.nextNodeId++}`,
            type: type,
            x: x, y: y,
            data: { ...def.defaults }
        };
        this.nodes.push(node);
        this.createNodeDOM(node, def);
        
        // PHASE 7: Update welcome overlay
        this.updateWelcomeOverlay();
        
        return node;
    }

    createNodeDOM(node, def) {
        const el = document.createElement('div');
        el.className = 'node';
        el.dataset.cat = def.cat;
        el.id = node.id;
        el.style.left = node.x + 'px'; el.style.top = node.y + 'px';

        // PHASE 7: Special style for reroute nodes
        if (node.type === 'flow_reroute') {
            el.classList.add('reroute-node');
            el.style.width = '12px';
            el.style.height = '12px';
            el.style.borderRadius = '50%';
            el.style.minWidth = '0';
            el.onmousedown = (e) => {
                if (this.isReadOnly) return;
                this.startDragNode(e, node.id);
            };
            
            const pCont = document.createElement('div');
            pCont.className = 'port-container';
            pCont.style.width = '100%'; pCont.style.height = '100%';
            
            const dot = document.createElement('div');
            dot.className = 'port-dot any';
            dot.style.background = this.getPortColor('any');
            dot.style.width = '8px'; dot.style.height = '8px';
            
            pCont.appendChild(dot);
            
            pCont.onmousedown = (e) => {
                e.stopPropagation();
                this.startDragWire(e, node.id, 'out', 'any');
            };
            pCont.onmouseup = (e) => {
                this.endDragWire(e, node.id, 'in', 'any');
            };
            
            el.appendChild(pCont);
            this.dom.nodes.appendChild(el);
            return;
        }

        // PHASE 7: Special style for comment boxes
        if (node.type === 'comment_box') {
            el.classList.add('comment-node');
            el.style.width = (node.data.width || 300) + 'px';
            el.style.height = (node.data.height || 200) + 'px';
            el.style.background = (node.data.color || '#3498db') + '22'; // Transparent
            el.style.borderColor = node.data.color || '#3498db';
            el.style.zIndex = '1';
            
            const header = document.createElement('div');
            header.className = 'comment-header';
            header.style.background = node.data.color || '#3498db';
            header.innerHTML = `<span>${node.data.text || 'Comment'}</span>`;
            header.onmousedown = (e) => {
                if (this.isReadOnly) return;
                this.startDragNode(e, node.id);
            };
            
            // Resize handle
            const resizer = document.createElement('div');
            resizer.className = 'comment-resizer';
            resizer.onmousedown = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const startW = parseInt(el.style.width);
                const startH = parseInt(el.style.height);
                const startX = e.clientX;
                const startY = e.clientY;
                
                const onMove = (me) => {
                    const nw = startW + (me.clientX - startX) / this.transform.scale;
                    const nh = startH + (me.clientY - startY) / this.transform.scale;
                    node.data.width = Math.max(100, nw);
                    node.data.height = Math.max(50, nh);
                    el.style.width = node.data.width + 'px';
                    el.style.height = node.data.height + 'px';
                };
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            };
            
            el.appendChild(header);
            el.appendChild(resizer);
            this.dom.nodes.appendChild(el);
            return;
        }

        // Header (Standard Node)
        const header = document.createElement('div');
        header.className = 'node-header';
        header.innerHTML = `<span>${def.title}</span> <i class="fas fa-info-circle node-info-icon" title="${def.desc || ''}"></i>`;
        header.onmousedown = (e) => {
            if (this.isReadOnly) return;
            this.startDragNode(e, node.id);
        };
        el.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'node-body';

        const addPort = (p, dir) => {
            const row = document.createElement('div');
            row.className = 'port-row';
            row.style.justifyContent = dir === 'in' ? 'flex-start' : 'flex-end';
            
            // Container to increase hit area
            const pCont = document.createElement('div');
            pCont.className = 'port-container';
            
            const dot = document.createElement('div');
            dot.className = `port-dot ${p.type}`;
            dot.style.background = this.getPortColor(p.type);
            
            pCont.appendChild(dot);

            // Listeners on Container
            if (!this.isReadOnly) {
                if(dir === 'out') pCont.onmousedown = (e) => this.startDragWire(e, node.id, p.id, p.type);
                if(dir === 'in') pCont.onmouseup = (e) => this.endDragWire(e, node.id, p.id, p.type);
                
                pCont.onmouseenter = () => this.showTooltip(p.type.toUpperCase(), pCont);
                pCont.onmouseleave = () => this.hideTooltip();
            }

            pCont.dataset.port = p.id;
            pCont.dataset.dir = dir;
            pCont.dataset.node = node.id;

            if (dir === 'in') {
                row.appendChild(pCont);
                row.innerHTML += `<span class="port-label" style="text-align:left;">${p.name}</span>`;
            } else {
                row.innerHTML += `<span class="port-label" style="text-align:right;">${p.name}</span>`;
                row.appendChild(pCont);
            }
            
            // Re-attach listeners after innerHTML
            const newCont = row.querySelector('.port-container');
            if(!this.isReadOnly) {
                if(dir==='out') newCont.onmousedown = (e) => this.startDragWire(e, node.id, p.id, p.type);
                if(dir==='in') newCont.onmouseup = (e) => this.endDragWire(e, node.id, p.id, p.type);
                newCont.onmouseenter = (e) => this.showTooltip(p.type.toUpperCase(), e.target);
                newCont.onmouseleave = () => this.hideTooltip();
            }

            body.appendChild(row);
        };

        if (def.inputs) def.inputs.forEach(p => addPort(p, 'in'));
        if (def.outputs) def.outputs.forEach(p => addPort(p, 'out'));

        el.appendChild(body);
        el.onmousedown = (e) => { 
            if(e.button===0) {
                this.select(node.id, e.ctrlKey || e.metaKey); // PHASE 5: Multi-select with Ctrl
            }
        };
        this.dom.nodes.appendChild(el);
    }

    getPortColor(type) {
        if(type === 'exec') return '#fff';
        if(type === 'bool') return '#e74c3c';
        if(type === 'num') return '#2ecc71';
        if(type === 'string') return '#ff0000';
        if(type === 'entity') return '#3498db';
        return '#888';
    }

    // --- WIRES & LAYOUT ---

    renderWires() {
        while(this.dom.wires.firstChild) this.dom.wires.removeChild(this.dom.wires.firstChild);

        this.wires.forEach(w => {
            const p1 = this.getPortPos(w.fromNode, w.fromPort, 'out');
            const p2 = this.getPortPos(w.toNode, w.toPort, 'in');
            if (p1 && p2) this.drawBezier(p1, p2, false, w);
        });

        if (this.state.dragging && this.state.dragging.type === 'wire') {
            const d = this.state.dragging;
            const p1 = this.getPortPos(d.nodeId, d.port, 'out');
            const p2 = this.getCanvasPos(d.cx, d.cy);
            if(p1) this.drawBezier(p1, p2, true, { type: d.dataType });
        }
    }

    // Fixed: Properly calculates port position based on fixed visual width
    getPortPos(nid, pid, dir) {
        const n = this.getNode(nid);
        if (!n) return null;
        const def = LIB[n.type];
        if (!def) return null;
        
        // PHASE 7: Special position for reroute dots
        if (n.type === 'flow_reroute') {
            return { x: n.x + 6, y: n.y + 6 };
        }
        
        let idx = 0;
        
        // Count previous inputs/outputs to get row index
        if (dir === 'in' && def.inputs) idx = def.inputs.findIndex(p => p.id === pid);
        if (dir === 'out' && def.outputs) idx = def.outputs.findIndex(p => p.id === pid);
        if (idx === -1) idx = 0;

        // FIXED CONSTANTS based on CSS
        const headerHeight = 30; // Scaled down from 36
        const bodyPadding = 6;   // Scaled down from 8
        const rowHeight = 24;    // Scaled down from 28 (20px height + padding)
        const portOffset = 9;    // Center of 18px port
        
        const yOffset = headerHeight + bodyPadding + (idx * rowHeight) + (rowHeight/2);
        const xOffset = dir === 'in' ? portOffset : 200 - portOffset; // 200px is fixed node width (scaled from 220)

        return { x: n.x + xOffset, y: n.y + yOffset };
    }

    drawBezier(p1, p2, isTemp, data) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.classList.add("wire");
        if (data.type) path.classList.add(data.type);
        if (isTemp) path.style.strokeDasharray = "5,5";
        
        // PHASE 2.1: Highlight invalid wires in red
        if (data.invalid) {
            path.style.stroke = '#e74c3c';
            path.style.strokeWidth = '3px';
            path.style.filter = 'drop-shadow(0 0 4px rgba(231, 76, 60, 0.6))';
        }

        // Improved curvature
        const dx = Math.abs(p2.x - p1.x);
        const controlX = Math.max(dx * 0.5, 80); // Minimum 80px curve
        
        const cp1 = { x: p1.x + controlX, y: p1.y };
        const cp2 = { x: p2.x - controlX, y: p2.y };
        
        path.setAttribute("d", `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`);
        
        if (!isTemp && !this.isReadOnly) {
            path.onclick = (e) => {
                if (e.shiftKey) this.deleteWire(data.id);
            };
            path.onmouseenter = () => {
                if (data.invalid) {
                    this.showTooltip("⚠️ Invalid Connection - Shift+Click to Delete");
                } else {
                    const liveVal = this.liveValues?.get(data.id);
                    const label = liveVal !== undefined ? `Value: ${JSON.stringify(liveVal)}` : "Shift+Click to Delete";
                    this.showTooltip(label);
                }
            };
            path.onmouseleave = () => this.hideTooltip();
        }
        this.dom.wires.appendChild(path);
    }

    // --- INTERACTION ---

    setupInput() {
        this.dom.canvas.onmousedown = (e) => {
            if (e.button === 1 || (e.button === 0 && e.target === this.dom.canvas)) {
                this.state.dragging = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: this.transform.x, oy: this.transform.y };
            }
            if (e.button === 2) {
                e.preventDefault();
                this.showContextMenu(e);
            }
        };

        this.dom.canvas.oncontextmenu = (e) => e.preventDefault();

        window.onmousemove = (e) => {
            if (this.tooltip.style.display === 'block') {
                this.tooltip.style.left = (e.clientX + 15) + 'px';
                this.tooltip.style.top = (e.clientY + 15) + 'px';
            }

            if (!this.state.dragging) return;
            const d = this.state.dragging;

            if (d.type === 'pan') {
                this.transform.x = d.ox + (e.clientX - d.sx);
                this.transform.y = d.oy + (e.clientY - d.sy);
            } else if (d.type === 'node') {
                const node = this.getNode(d.id);
                // Snap to grid (10px)
                const rx = (d.ox + (e.clientX - d.sx) / this.transform.scale);
                const ry = (d.oy + (e.clientY - d.sy) / this.transform.scale);
                node.x = Math.round(rx / 10) * 10;
                node.y = Math.round(ry / 10) * 10;
                
                const el = document.getElementById(node.id);
                el.style.left = node.x + 'px'; el.style.top = node.y + 'px';
            } else if (d.type === 'wire') {
                d.cx = e.clientX; d.cy = e.clientY;
            }
        };

        window.onmouseup = (e) => {
            // PHASE 7: Context-sensitive search when wire is dropped in void
            if (this.state.dragging && this.state.dragging.type === 'wire') {
                const d = this.state.dragging;
                this.openQuickSearch(e.clientX, e.clientY, d.nodeId, d.port, d.dataType);
            }
            this.state.dragging = null; 
        };
        this.dom.canvas.onwheel = (e) => { e.preventDefault(); this.handleZoom(e.deltaY > 0 ? -0.1 : 0.1, e.clientX, e.clientY); };
        window.onkeydown = (e) => {
            if (e.ctrlKey && e.key === 's') { e.preventDefault(); this.save(); }
            if (e.ctrlKey && e.key === 'n') { e.preventDefault(); this.createNew(); }
            if (e.ctrlKey && e.key === 'o') { e.preventDefault(); this.showLoadDialog(); }
            if (e.key === 'Delete') { this.deleteSelected(); }
            if (e.key === 'F5') { e.preventDefault(); this.testRun(); }
        };
    }

    handleZoom(delta, cx, cy) {
        this.transform.scale = Math.max(0.2, Math.min(2, this.transform.scale + delta));
    }

    showTooltip(text, el) {
        if (!text) return;
        this.tooltip.innerText = text;
        this.tooltip.style.display = 'block';
    }

    hideTooltip() {
        this.tooltip.style.display = 'none';
    }

    // ... (Keep existing Helper methods: getCanvasPos, getNode, log, renderInspector, etc.) ...
    getCanvasPos(cx, cy) {
        const r = this.dom.canvas.getBoundingClientRect();
        return { x: (cx - r.left - this.transform.x) / this.transform.scale, y: (cy - r.top - this.transform.y) / this.transform.scale };
    }
    getNode(id) { return this.nodes.find(n => n.id === id); }
    
    log(msg, type='info') {
        const div = document.createElement('div');
        div.className = `log-msg log-${type}`;
        div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        this.dom.console.appendChild(div);
        this.dom.console.scrollTop = this.dom.console.scrollHeight;
        
        // PHASE 1: Update console badge counts
        if (type === 'err' || type === 'error') {
            this.layoutState.consoleErrorCount = (this.layoutState.consoleErrorCount || 0) + 1;
        } else if (type === 'warn' || type === 'warning') {
            this.layoutState.consoleWarningCount = (this.layoutState.consoleWarningCount || 0) + 1;
        }
        this.updateConsoleBadge();
    }

    renderInspector() {
        const c = this.dom.inspector;
        c.innerHTML = '';
        if (!this.state.selection) { c.innerHTML = '<div style="color:#555; text-align:center; margin-top:20px;">No Selection</div>'; return; }
        const node = this.getNode(this.state.selection);
        if (!node) return;
        const def = LIB[node.type];
        if (!def) return;
        
        const h = document.createElement('div');
        h.innerText = def.title;
        h.style.color = 'var(--accent)'; h.style.fontWeight = 'bold'; h.style.marginBottom = '5px';
        c.appendChild(h);

        const desc = document.createElement('div');
        desc.innerText = def.desc || "No description available.";
        desc.style.color = '#777'; desc.style.fontSize = '0.9rem'; desc.style.marginBottom = '15px'; desc.style.fontStyle = 'italic';
        c.appendChild(desc);

        if (def.fields) {
            def.fields.forEach(f => {
                const d = document.createElement('div'); d.className = 'prop-group';
                d.innerHTML = `<div class="prop-label">${f.label}</div>`;
                
                if (f.type === 'dropdown') {
                    const sel = document.createElement('select');
                    sel.className = 'prop-input toolbar-select';
                    sel.disabled = this.isReadOnly;
                    
                    // Get options dynamically
                    let options = f.options || [];
                    if (f.source === 'sounds') options = this.projectAssets.sounds;
                    if (f.source === 'prefabs') options = this.projectAssets.prefabs;
                    
                    // Add empty option
                    const defOpt = document.createElement('option');
                    defOpt.value = ""; defOpt.textContent = "-- Select --";
                    sel.appendChild(defOpt);

                    options.forEach(opt => {
                        const o = document.createElement('option');
                        o.value = opt; o.textContent = opt;
                        if (node.data[f.key] === opt) o.selected = true;
                        sel.appendChild(o);
                    });
                    
                    sel.onchange = (e) => node.data[f.key] = e.target.value;
                    d.appendChild(sel);
                } else {
                    const i = document.createElement('input');
                    i.className = 'prop-input'; i.type = f.type || 'text'; i.value = node.data[f.key] || '';
                    i.disabled = this.isReadOnly;
                    i.oninput = (e) => node.data[f.key] = e.target.value;
                    d.appendChild(i);
                }
                c.appendChild(d);
            });
        }
        if (!this.isReadOnly) {
            const del = document.createElement('button'); del.innerText = "DELETE NODE"; del.className = "btn"; del.style.width = "100%"; del.style.marginTop = "20px"; del.style.borderColor = "#e74c3c"; del.style.color = "#e74c3c";
            del.onclick = () => this.deleteNode(node.id); c.appendChild(del);
        }
    }

    startDragNode(e, id) { if(this.isReadOnly) return; e.stopPropagation(); this.select(id); const node = this.getNode(id); this.state.dragging = { type: 'node', id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y }; }
    startDragWire(e, id, port, type) { if(this.isReadOnly) return; e.stopPropagation(); this.state.dragging = { type: 'wire', nodeId: id, port, dataType: type, cx: e.clientX, cy: e.clientY }; }
    endDragWire(e, id, port, type) {
        e.stopPropagation();
        const d = this.state.dragging;
        if (d && d.type === 'wire' && d.nodeId !== id) {
            // PHASE 2.1: Type validation before creating wire
            const fromPort = this.getPortDefinition(d.nodeId, d.port, 'output');
            const toPort = this.getPortDefinition(id, port, 'input');
            
            if (fromPort && toPort) {
                if (!this.canConnectPorts(fromPort.type, toPort.type)) {
                    this.log(`❌ Cannot connect ${fromPort.type} to ${toPort.type}`, 'error');
                    this.showNotification(`Type mismatch: ${fromPort.type} → ${toPort.type}`, 'error');
                    return; // Reject connection
                }
            }
            
            // Create wire if validation passed
            this.wires.push({ 
                id: `w_${this.nextWireId++}`, 
                fromNode: d.nodeId, 
                fromPort: d.port, 
                toNode: id, 
                toPort: port,
                invalid: false
            });
            this.log(`✅ Connected ${fromPort?.name || d.port} → ${toPort?.name || port}`, 'info');
            this.state.dragging = null; // PHASE 7: Clear after connection
        }
    }
    
    // PHASE 2.1: Notification system
    showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notif = document.getElementById('notification-toast');
        if (!notif) {
            notif = document.createElement('div');
            notif.id = 'notification-toast';
            notif.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 4px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                z-index: 10000;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.3s;
            `;
            document.body.appendChild(notif);
        }
        
        // Set color based on type
        const colors = {
            info: '#3498db',
            error: '#e74c3c',
            warning: '#f39c12',
            success: '#27ae60'
        };
        notif.style.background = colors[type] || colors.info;
        notif.style.color = '#fff';
        notif.textContent = message;
        notif.style.opacity = '1';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            notif.style.opacity = '0';
        }, 3000);
    }
    deleteWire(id) { if(this.isReadOnly) return; this.wires = this.wires.filter(w => w.id !== id); }
    select(id, addToSelection = false) {
        if (addToSelection) {
            // Multi-select mode (Ctrl+Click)
            const node = this.nodes.find(n => n.id === id);
            if (node) {
                node.selected = !node.selected;
                const el = document.getElementById(id);
                if (el) el.classList.toggle('selected');
            }
        } else {
            // Single select mode
            this.nodes.forEach(n => n.selected = false);
            document.querySelectorAll('.node').forEach(n => n.classList.remove('selected'));
            const node = this.nodes.find(n => n.id === id);
            if (node) node.selected = true;
            this.state.selection = id;
            const el = document.getElementById(id);
            if (el) el.classList.add('selected');
        }
        this.renderInspector();
    }
    deleteNode(id) { 
        if(this.isReadOnly) return; 
        this.nodes = this.nodes.filter(n => n.id !== id); 
        this.wires = this.wires.filter(w => w.fromNode !== id && w.toNode !== id); 
        document.getElementById(id).remove(); 
        this.state.selection = null; 
        this.renderInspector(); 
        this.updateWelcomeOverlay(); // PHASE 7
    }

    // ... (Keep existing IO/Compiler Logic from v2.0, assuming it's correct)
    // Re-injecting vital parts truncated for brevity in thought process:
    
    // --- COMPILER v2.1 (Same as v2.0 but integrated) ---
    
    // PHASE B: Export graph data for AlgorithmRuntime
    compileGraph() {
        return {
            nodes: this.nodes,
            wires: this.wires,
            variables: this.vars
        };
    }
    
    compileToAST() {
        const entryNodes = this.nodes.filter(n => {
            const def = LIB[n.type];
            return def && def.cat === 'Event';
        });

        const ast = {
            name: this.dom.scriptName.value,
            generatedAt: new Date().toISOString(),
            events: {}
        };

        entryNodes.forEach(entry => {
            // Special handling for input events to key them by key name
            if (entry.type === 'evt_input' && entry.data.key) {
                const eventKey = `evt_input_${entry.data.key}`;
                ast.events[eventKey] = this.walkASTChain(entry, 'out', 0);
            } else {
                ast.events[entry.type] = this.walkASTChain(entry, 'out', 0);
            }
        });

        return ast;
    }

    walkASTChain(node, portId, depth) {
        if (depth > 100) return null;
        
        const wires = this.wires.filter(w => w.fromNode === node.id && w.fromPort === portId);
        const chain = [];

        wires.forEach(wire => {
            const nextNode = this.getNode(wire.toNode);
            if (!nextNode) return;

            const astNode = {
                id: nextNode.id,
                type: nextNode.type,
                data: { ...nextNode.data }
            };

            // Handle flow control branching
            if (nextNode.type === 'flow_branch') {
                astNode.true = this.walkASTChain(nextNode, 'true', depth + 1);
                astNode.false = this.walkASTChain(nextNode, 'false', depth + 1);
            } else if (nextNode.type === 'flow_switch') {
                astNode.cases = {
                    case0: this.walkASTChain(nextNode, 'case0', depth + 1),
                    case1: this.walkASTChain(nextNode, 'case1', depth + 1),
                    case2: this.walkASTChain(nextNode, 'case2', depth + 1),
                    default: this.walkASTChain(nextNode, 'default', depth + 1)
                };
                astNode.next = this.walkASTChain(nextNode, 'out', depth + 1);
            } else if (nextNode.type === 'flow_for_loop' || nextNode.type === 'flow_while' || nextNode.type === 'flow_foreach') {
                astNode.body = this.walkASTChain(nextNode, 'body', depth + 1);
                astNode.next = this.walkASTChain(nextNode, 'out', depth + 1);
            } else if (nextNode.type === 'flow_sequence') {
                astNode.steps = [
                    this.walkASTChain(nextNode, 'step1', depth + 1),
                    this.walkASTChain(nextNode, 'step2', depth + 1),
                    this.walkASTChain(nextNode, 'step3', depth + 1)
                ];
                astNode.next = this.walkASTChain(nextNode, 'out', depth + 1);
            } else {
                astNode.next = this.walkASTChain(nextNode, 'out', depth + 1);
            }

            chain.push(astNode);
        });

        return chain.length > 0 ? chain : null;
    }

    compile() {
        const builder = new CodeBuilder();
        const entryNodes = this.nodes.filter(n => {
            const def = LIB[n.type];
            return def && def.cat === 'Event';
        });
        builder.line(`// Logic: ${this.dom.scriptName.value}`);
        builder.line(`export async function runLogic(context, game, ui) {`);
        builder.in();
        if (this.vars.length > 0) { builder.line(`let vars = {`); builder.in(); this.vars.forEach(v => builder.line(`${v.name}: ${JSON.stringify(v.value)},`)); builder.out(); builder.line(`};`); }
        builder.line(`const helpers = { rand: (min, max) => Math.random() * (max - min) + min, wait: (t) => new Promise(r => setTimeout(r, t * 1000)) };`);
        entryNodes.forEach(entry => {
            builder.line(`if (context.event === '${entry.type}') {`);
            builder.in();
            if (entry.type === 'evt_input') { builder.line(`if (context.key === '${entry.data.key}') {`); builder.in(); this.compileNodeChain(entry, 'out', builder); builder.out(); builder.line(`}`); } 
            else { this.compileNodeChain(entry, 'out', builder); }
            builder.out(); builder.line(`}`);
        });
        builder.out(); builder.line(`}`);
        return builder.toString();
    }
    compileNodeChain(node, outputPortId, builder) {
        const wires = this.wires.filter(w => w.fromNode === node.id && w.fromPort === outputPortId);
        wires.forEach(wire => {
            const nextNode = this.getNode(wire.toNode);
            if (!nextNode) return;
            const resolve = (pid) => this.resolveValue(nextNode, pid);
            switch(nextNode.type) {
                // FLOW CONTROL
                case 'flow_branch': 
                    builder.line(`if (${resolve('cond')}) {`); 
                    builder.in(); 
                    this.compileNodeChain(nextNode, 'true', builder); 
                    builder.out(); 
                    builder.line(`} else {`); 
                    builder.in(); 
                    this.compileNodeChain(nextNode, 'false', builder); 
                    builder.out(); 
                    builder.line(`}`); 
                    return;
                    
                // ADVANCED FLOW (Phase 1.9 - NEW)
                case 'flow_for_loop':
                    builder.line(`for(let ${nextNode.id}_i = 0; ${nextNode.id}_i < ${resolve('count')}; ${nextNode.id}_i++) {`);
                    builder.in();
                    builder.line(`const ${nextNode.id}_index = ${nextNode.id}_i;`);
                    this.compileNodeChain(nextNode, 'body', builder);
                    builder.out();
                    builder.line(`}`);
                    this.compileNodeChain(nextNode, 'out', builder);
                    return;
                case 'flow_while':
                    builder.line(`while(${resolve('condition')}) {`);
                    builder.in();
                    this.compileNodeChain(nextNode, 'body', builder);
                    builder.out();
                    builder.line(`}`);
                    this.compileNodeChain(nextNode, 'out', builder);
                    return;
                case 'flow_foreach':
                    builder.line(`const ${nextNode.id}_array = ${resolve('array')};`);
                    builder.line(`for(let ${nextNode.id}_i = 0; ${nextNode.id}_i < ${nextNode.id}_array.length; ${nextNode.id}_i++) {`);
                    builder.in();
                    builder.line(`const ${nextNode.id}_item = ${nextNode.id}_array[${nextNode.id}_i];`);
                    builder.line(`const ${nextNode.id}_index = ${nextNode.id}_i;`);
                    this.compileNodeChain(nextNode, 'body', builder);
                    builder.out();
                    builder.line(`}`);
                    this.compileNodeChain(nextNode, 'out', builder);
                    return;
                case 'flow_sequence':
                    this.compileNodeChain(nextNode, 'step1', builder);
                    this.compileNodeChain(nextNode, 'step2', builder);
                    this.compileNodeChain(nextNode, 'step3', builder);
                    this.compileNodeChain(nextNode, 'out', builder);
                    return;
                case 'flow_switch':
                    builder.line(`switch(${resolve('value')}) {`);
                    builder.in();
                    builder.line(`case 0:`);
                    builder.in();
                    this.compileNodeChain(nextNode, 'case0', builder);
                    builder.line(`break;`);
                    builder.out();
                    builder.line(`case 1:`);
                    builder.in();
                    this.compileNodeChain(nextNode, 'case1', builder);
                    builder.line(`break;`);
                    builder.out();
                    builder.line(`case 2:`);
                    builder.in();
                    this.compileNodeChain(nextNode, 'case2', builder);
                    builder.line(`break;`);
                    builder.out();
                    builder.line(`default:`);
                    builder.in();
                    this.compileNodeChain(nextNode, 'default', builder);
                    builder.out();
                    builder.line(`}`);
                    this.compileNodeChain(nextNode, 'out', builder);
                    return;
                    
                case 'flow_wait': 
                    builder.line(`await helpers.wait(${resolve('time')});`); 
                    break;
                
                // ENTITY QUERIES (Phase 1.1 - NEW)
                case 'entity_get_nearby':
                    builder.line(`const ${nextNode.id}_entities = runtime.getNearbyEntities(${resolve('range')}, ${resolve('type')});`);
                    break;
                case 'entity_get_by_name':
                    builder.line(`const ${nextNode.id}_entity = runtime.getEntityByName(${resolve('name')});`);
                    break;
                case 'entity_get_closest_enemy':
                    builder.line(`const ${nextNode.id}_entity = runtime.getClosestEnemy();`);
                    break;
                case 'entity_get_all_enemies':
                    builder.line(`const ${nextNode.id}_entities = runtime.getAllEnemies();`);
                    break;
                case 'entity_count_type':
                    builder.line(`const ${nextNode.id}_count = runtime.countEntitiesOfType(${resolve('type')});`);
                    break;
                case 'entity_exists':
                    builder.line(`const ${nextNode.id}_exists = runtime.entityExists(${resolve('entityId')});`);
                    break;
                case 'entity_get_property':
                    builder.line(`const ${nextNode.id}_value = runtime.getEntityProperty(${resolve('entity')}, ${resolve('property')});`);
                    break;
                case 'entity_spawn':
                    builder.line(`const ${nextNode.id}_entity = runtime.spawnEntity(${resolve('type')}, ${resolve('x')}, ${resolve('y')}, {});`);
                    break;
                case 'entity_destroy':
                    builder.line(`runtime.destroyEntity(${resolve('entity')});`);
                    break;
                case 'entity_move_to':
                    builder.line(`runtime.moveEntity(${resolve('entity')}, ${resolve('x')}, ${resolve('y')}, ${resolve('speed')});`);
                    break;
                
                // PLAYER & INVENTORY (Phase 1.2 - NEW)
                case 'player_get_position':
                    builder.line(`const ${nextNode.id}_value = runtime.getPlayerPosition().${resolve('axis')};`);
                    break;
                case 'player_get_stat':
                    builder.line(`const ${nextNode.id}_value = runtime.getPlayerStat(${resolve('stat')});`);
                    break;
                case 'player_set_stat':
                    builder.line(`runtime.setPlayerStat(${resolve('stat')}, ${resolve('value')});`);
                    break;
                case 'player_damage':
                    builder.line(`const currentHp = runtime.getPlayerStat('hp');`);
                    builder.line(`runtime.setPlayerStat('hp', currentHp - ${resolve('damage')});`);
                    break;
                case 'player_heal':
                    builder.line(`const currentHp = runtime.getPlayerStat('hp');`);
                    builder.line(`runtime.setPlayerStat('hp', currentHp + ${resolve('amount')});`);
                    break;
                case 'inventory_has_item':
                    builder.line(`const ${nextNode.id}_hasIt = runtime.hasItem(${resolve('itemId')});`);
                    break;
                case 'inventory_get_count':
                    builder.line(`const ${nextNode.id}_count = runtime.getItemCount(${resolve('itemId')});`);
                    break;
                case 'inventory_add_item':
                    builder.line(`runtime.addItem(${resolve('itemId')}, ${resolve('count')});`);
                    break;
                case 'inventory_remove_item':
                    builder.line(`runtime.removeItem(${resolve('itemId')}, ${resolve('count')});`);
                    break;
                case 'inventory_equip':
                    builder.line(`runtime.equipItem(${resolve('itemId')}, ${resolve('slot')});`);
                    break;
                case 'inventory_unequip':
                    builder.line(`runtime.unequipItem(${resolve('slot')});`);
                    break;
                case 'inventory_get_all':
                    builder.line(`const ${nextNode.id}_items = runtime.getInventory();`);
                    break;
                
                // GAME STATE (Phase 1.3 - NEW)
                case 'flag_set':
                    builder.line(`runtime.setFlag(${resolve('name')}, ${resolve('value')});`);
                    break;
                case 'flag_get':
                    builder.line(`const ${nextNode.id}_value = runtime.getFlag(${resolve('name')});`);
                    break;
                case 'flag_check':
                    builder.line(`const ${nextNode.id}_result = runtime.checkFlag(${resolve('name')});`);
                    break;
                case 'flag_clear':
                    builder.line(`runtime.clearFlag(${resolve('name')});`);
                    break;
                case 'quest_start':
                    builder.line(`runtime.startQuest(${resolve('questId')});`);
                    break;
                case 'quest_complete':
                    builder.line(`runtime.completeQuest(${resolve('questId')});`);
                    break;
                case 'quest_is_active':
                    builder.line(`const ${nextNode.id}_active = runtime.isQuestActive(${resolve('questId')});`);
                    break;
                case 'data_save':
                    builder.line(`runtime.saveCustomData(${resolve('key')}, ${resolve('value')});`);
                    break;
                case 'data_load':
                    builder.line(`const ${nextNode.id}_value = runtime.loadCustomData(${resolve('key')});`);
                    break;
                case 'data_delete':
                    builder.line(`runtime.deleteCustomData(${resolve('key')});`);
                    break;
                
                // WORLD MANIPULATION (Phase 1.4 - NEW)
                case 'world_get_tile':
                    builder.line(`const ${nextNode.id}_tile = runtime.getTileAt(${resolve('x')}, ${resolve('y')});`);
                    break;
                case 'world_set_tile':
                    builder.line(`runtime.setTileAt(${resolve('x')}, ${resolve('y')}, ${resolve('tile')});`);
                    break;
                case 'world_remove_tile':
                    builder.line(`runtime.removeTileAt(${resolve('x')}, ${resolve('y')});`);
                    break;
                case 'world_spawn_at':
                    builder.line(`const ${nextNode.id}_entity = runtime.spawnAtTile(${resolve('type')}, ${resolve('tileX')}, ${resolve('tileY')});`);
                    break;
                case 'world_get_spawn_point':
                    builder.line(`const spawnPoint_${nextNode.id} = runtime.getSpawnPoint(${resolve('name')});`);
                    builder.line(`const ${nextNode.id}_x = spawnPoint_${nextNode.id}.x;`);
                    builder.line(`const ${nextNode.id}_y = spawnPoint_${nextNode.id}.y;`);
                    break;
                
                // CAMERA/FX (Phase 1.5 - NEW)
                case 'camera_shake':
                    builder.line(`runtime.cameraShake(${resolve('duration')}, ${resolve('intensity')});`);
                    break;
                case 'camera_flash':
                    builder.line(`runtime.cameraFlash(${resolve('duration')}, ${resolve('r')}, ${resolve('g')}, ${resolve('b')});`);
                    break;
                case 'camera_fade_in':
                    builder.line(`runtime.fadeIn(${resolve('duration')});`);
                    break;
                case 'camera_fade_out':
                    builder.line(`runtime.fadeOut(${resolve('duration')});`);
                    break;
                case 'camera_zoom':
                    builder.line(`runtime.setZoom(${resolve('zoom')});`);
                    break;
                case 'camera_follow':
                    builder.line(`runtime.setCameraTarget(${resolve('entity')});`);
                    break;
                case 'fx_particle':
                    builder.line(`runtime.spawnParticle(${resolve('type')}, ${resolve('x')}, ${resolve('y')});`);
                    break;
                case 'fx_tint':
                    builder.line(`runtime.setScreenTint(${resolve('r')}, ${resolve('g')}, ${resolve('b')}, ${resolve('alpha')});`);
                    break;
                
                // AUDIO (Phase 1.6 - NEW)
                case 'audio_play':
                    builder.line(`runtime.playAudio(${resolve('audioId')}, ${resolve('loop')}, ${resolve('volume')});`);
                    break;
                case 'audio_stop':
                    builder.line(`runtime.stopAudio(${resolve('audioId')});`);
                    break;
                case 'audio_fade':
                    builder.line(`runtime.fadeAudio(${resolve('audioId')}, ${resolve('targetVolume')}, ${resolve('duration')});`);
                    break;
                
                // DIALOGUE (Phase 1.7 - NEW)
                case 'dialogue_show':
                    builder.line(`runtime.showDialogue(${resolve('speaker')}, ${resolve('text')});`);
                    break;
                case 'dialogue_choice':
                    builder.line(`const ${nextNode.id}_choice = await runtime.showChoices(${resolve('options')}.split(','));`);
                    break;
                case 'dialogue_wait':
                    builder.line(`await runtime.waitForDialogue();`);
                    break;
                case 'dialogue_close':
                    builder.line(`runtime.closeDialogue();`);
                    break;
                
                // TIME (Phase 1.8 - NEW)
                case 'time_wait':
                    builder.line(`await runtime.wait(${resolve('seconds')});`);
                    break;
                case 'time_get':
                    builder.line(`const ${nextNode.id}_time = runtime.getGameTime();`);
                    break;
                
                // EXISTING NODES
                case 'eng_log': 
                    builder.line(`console.log(${resolve('msg')});`); 
                    break;
                case 'eng_move': 
                    builder.line(`if(context.target) { context.target.x = ${resolve('x')}; context.target.y = ${resolve('y')}; }`); 
                    break;
                case 'var_set': 
                    builder.line(`vars['${nextNode.data.name}'] = ${resolve('val')};`); 
                    break;
                
                default: 
                    builder.line(`// Exec: ${nextNode.type}`);
            }
            this.compileNodeChain(nextNode, 'out', builder);
        });
    }
    resolveValue(node, portId) {
        const wire = this.wires.find(w => w.toNode === node.id && w.toPort === portId);
        if (!wire) { 
            const val = node.data[portId]; 
            if (val === undefined) return "0"; 
            return (typeof val === 'string' && isNaN(val)) ? `'${val}'` : val; 
        }
        const fromNode = this.getNode(wire.fromNode);
        const resolve = (pid) => this.resolveValue(fromNode, pid);
        switch(fromNode.type) {
            // Math
            case 'math_add': return `(${resolve('a')} + ${resolve('b')})`;
            case 'logic_eq': return `(${resolve('a')} == ${resolve('b')})`;
            
            // Variables
            case 'var_get': return `vars['${fromNode.data.name}']`;
            case 'data_self': return `context.target`;
            case 'data_player': return `game.player`;
            
            // Entity Queries (Phase 1.1 - NEW)
            case 'entity_get_nearby': return `${fromNode.id}_entities`;
            case 'entity_get_by_name': return `${fromNode.id}_entity`;
            case 'entity_get_closest_enemy': return `${fromNode.id}_entity`;
            case 'entity_get_all_enemies': return `${fromNode.id}_entities`;
            case 'entity_count_type': return `${fromNode.id}_count`;
            case 'entity_exists': return `${fromNode.id}_exists`;
            case 'entity_get_property': return `${fromNode.id}_value`;
            case 'entity_spawn': return `${fromNode.id}_entity`;
            
            // Player & Inventory (Phase 1.2 - NEW)
            case 'player_get_position': return `${fromNode.id}_value`;
            case 'player_get_stat': return `${fromNode.id}_value`;
            case 'inventory_has_item': return `${fromNode.id}_hasIt`;
            case 'inventory_get_count': return `${fromNode.id}_count`;
            case 'inventory_get_all': return `${fromNode.id}_items`;
            
            // Game State (Phase 1.3 - NEW)
            case 'flag_get': return `${fromNode.id}_value`;
            case 'flag_check': return `${fromNode.id}_result`;
            case 'quest_is_active': return `${fromNode.id}_active`;
            case 'data_load': return `${fromNode.id}_value`;
            
            // World Manipulation (Phase 1.4 - NEW)
            case 'world_get_tile': return `${fromNode.id}_tile`;
            case 'world_spawn_at': return `${fromNode.id}_entity`;
            case 'world_get_spawn_point': 
                if (portId === 'x') return `${fromNode.id}_x`;
                if (portId === 'y') return `${fromNode.id}_y`;
                return "null";
            
            // Dialogue (Phase 1.7 - NEW)
            case 'dialogue_choice': return `${fromNode.id}_choice`;
            
            // Time (Phase 1.8 - NEW)
            case 'time_get': return `${fromNode.id}_time`;
            
            // Advanced Flow (Phase 1.9 - NEW)
            case 'flow_for_loop':
                if (portId === 'index') return `${fromNode.id}_index`;
                return "null";
            case 'flow_foreach':
                if (portId === 'item') return `${fromNode.id}_item`;
                if (portId === 'index') return `${fromNode.id}_index`;
                return "null";
            
            default: return "null";
        }
    }
    
    // Stub IO
    async save() { 
        if(this.isReadOnly) return;
        
        // PHASE 2.1: Validate before saving
        const validation = this.validateAllWires();
        if (!validation.valid) {
            const proceed = confirm(
                `⚠️ Found ${validation.errors.length} invalid wire(s):\n\n` +
                validation.errors.map(e => `• ${e.message}`).join('\n') +
                `\n\nSave anyway? (Invalid wires shown in red)`
            );
            if (!proceed) {
                this.log('Save cancelled - fix invalid wires first', 'warn');
                return;
            }
        }
        
        const name = this.dom.scriptName.value;
        // V2.0: Save pure JSON for VisualScriptEngine
        const graphData = { 
            version: "2.0",
            nodes: this.nodes, 
            wires: this.wires, 
            vars: this.vars 
        };
        const ast = this.compileToAST();
        
        try { 
            // We save as .json now, the backend handles the file extension
            await fetch('/api/logic/save', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ 
                    name, 
                    json: JSON.stringify(graphData), 
                    js: "", // JS is deprecated
                    ast: ast 
                }) 
            }); 
            this.log("Saved Graph (v2.0) + AST."); 
            this.showNotification('Saved successfully', 'success');
            this.showSaveIndicator(); 
            broadcastAlgorithmUpdate(name, 'saved');
        } catch(e) { 
            this.log("Save Error: " + e.message, "err"); 
            this.showNotification('Save failed', 'error');
        }
    }
    async loadScript(name) {
        // Check Core
        const isCore = this.coreScripts.includes(name);
        this.setReadOnly(isCore);

        try { 
            const res = await fetch(`/api/logic/${name}`); 
            if(res.ok) { 
                const payload = await res.json();
                // Support both legacy and new formats
                const jsonStr = payload.json || payload.xml || JSON.stringify(payload); 
                let d;
                try { d = JSON.parse(jsonStr); } catch(e) { d = { nodes:[], wires:[] }; }
                
                this.nodes = []; 
                this.wires = []; 
                this.vars = d.vars || []; 
                this.dom.nodes.innerHTML = ''; 
                this.dom.wires.innerHTML = ''; 
                
                // Reconstruct nodes with ORIGINAL IDs to preserve wire connections
                if (d.nodes) {
                    d.nodes.forEach(n => {
                        const node = {
                            id: n.id,
                            type: n.type,
                            x: n.x,
                            y: n.y,
                            data: n.data || {}
                        };
                        // Fallback for defaults if data is missing
                        if (LIB[n.type] && LIB[n.type].defaults) {
                            node.data = { ...LIB[n.type].defaults, ...node.data };
                        }
                        this.nodes.push(node);
                        // Ensure LIB has entry, else fallback to generic
                        if (LIB[n.type]) {
                            this.createNodeDOM(node, LIB[n.type]);
                        } else {
                            // Temporary fallback for missing node types
                            this.createNodeDOM(node, { cat:'Unknown', title:n.type, inputs:[], outputs:[] });
                        }
                    });
                }
                
                this.wires = d.wires || [];
                
                // PHASE 2.1: Validate loaded wires
                const validation = this.validateAllWires();
                if (!validation.valid) {
                    this.log(`⚠️ Found ${validation.errors.length} invalid wire(s)`, 'warn');
                    validation.errors.forEach(err => {
                        this.log(`  - ${err.message}`, 'warn');
                    });
                    this.showNotification(`${validation.errors.length} invalid wire(s) detected`, 'warning');
                }
                
                this.dom.scriptName.value = name;
                this.log(`Loaded ${name}${isCore ? ' [READ-ONLY]' : ''}`);
            } 
        } catch(e){ 
            this.log("Load Error: " + e.message, "err"); 
        } 
    }
    
    showLoadDialog() {
        const dialog = document.getElementById('file-browser');
        if (!dialog) return;
        
        dialog.style.display = 'flex';
        
        // Refresh file list
        fetch('/api/logic/list')
            .then(r => r.json())
            .then(files => {
                const container = document.getElementById('modal-file-list');
                if (!container) return;
                
                container.innerHTML = '';
                
                if (files.length === 0) {
                    container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No scripts found</div>';
                    return;
                }
                
                files.forEach(file => {
                    const btn = document.createElement('button');
                    btn.className = 'tool-btn';
                    btn.style.cssText = 'width:100%; margin:5px 0; padding:10px; text-align:left; justify-content:flex-start;';
                    btn.innerHTML = `<i class="fas fa-file-code" style="margin-right:10px;"></i> ${file}`;
                    btn.onclick = () => {
                        this.loadScript(file);
                        this.hideLoadDialog();
                    };
                    container.appendChild(btn);
                });
            })
            .catch(err => {
                console.error('[LoadDialog] Error:', err);
            });
    }
    
    hideLoadDialog() {
        const dialog = document.getElementById('file-browser');
        if (dialog) {
            dialog.style.display = 'none';
        }
    }
    
    createNew() {
        if (this.isReadOnly) return;
        
        const confirmed = confirm('Create new script? (Unsaved changes will be lost)');
        if (!confirmed) return;
        
        // Clear canvas
        this.nodes = [];
        this.wires = [];
        this.vars = [];
        this.dom.nodes.innerHTML = '';
        this.dom.wires.innerHTML = '';
        
        // Reset script name
        this.dom.scriptName.value = 'new_script';
        
        // Update UI
        this.renderInspector();
        this.updateWelcomeOverlay();
        
        this.log('New script created');
    }
    
    // ... Context Menu, etc. ...
    showContextMenu(e) { 
        if (this.isReadOnly) return;
        const menu = this.dom.contextMenu;
        menu.style.display = 'flex';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.innerHTML = '';
        
        const pos = this.getCanvasPos(e.clientX, e.clientY);
        
        // PHASE 5: Alignment options if multiple nodes selected
        const selected = this.nodes.filter(n => n.selected || this.state.selection === n.id);
        if (selected.length >= 2) {
            const alignHeader = document.createElement('div');
            alignHeader.style.padding = '5px 10px';
            alignHeader.style.color = 'var(--accent)';
            alignHeader.style.fontWeight = 'bold';
            alignHeader.style.fontSize = '0.85rem';
            alignHeader.style.borderBottom = '1px solid #333';
            alignHeader.textContent = `${selected.length} NODES SELECTED`;
            menu.appendChild(alignHeader);
            
            const alignOpts = [
                { text: 'Align Left', action: () => this.alignNodes('left') },
                { text: 'Align Center', action: () => this.alignNodes('center-h') },
                { text: 'Align Right', action: () => this.alignNodes('right') },
                { text: 'Align Top', action: () => this.alignNodes('top') },
                { text: 'Align Middle', action: () => this.alignNodes('center-v') },
                { text: 'Align Bottom', action: () => this.alignNodes('bottom') }
            ];
            
            if (selected.length >= 3) {
                alignOpts.push(
                    { text: '---', separator: true },
                    { text: 'Distribute Horizontally', action: () => this.distributeNodes('horizontal') },
                    { text: 'Distribute Vertically', action: () => this.distributeNodes('vertical') }
                );
            }
            
            alignOpts.forEach(opt => {
                if (opt.separator) {
                    const sep = document.createElement('div');
                    sep.style.height = '1px';
                    sep.style.background = '#333';
                    sep.style.margin = '4px 0';
                    menu.appendChild(sep);
                } else {
                    const item = document.createElement('div');
                    item.className = 'menu-opt';
                    item.textContent = opt.text;
                    item.onclick = () => {
                        opt.action();
                        this.hideContextMenu();
                    };
                    menu.appendChild(item);
                }
            });
            
            const sep = document.createElement('div');
            sep.style.height = '2px';
            sep.style.background = '#444';
            sep.style.margin = '5px 0';
            menu.appendChild(sep);
        }
        
        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = 'SEARCH NODES...';
        search.style.margin = '5px';
        search.style.background = '#000';
        search.style.color = 'var(--accent)';
        search.style.border = '1px solid #444';
        menu.appendChild(search);
        
        const list = document.createElement('div');
        list.style.maxHeight = '300px';
        list.style.overflowY = 'auto';
        menu.appendChild(list);

        const renderOpts = (filter = '') => {
            list.innerHTML = '';
            Object.keys(LIB).forEach(key => {
                const def = LIB[key];
                if (!def || !def.title) return;
                if (!filter || def.title.toLowerCase().includes(filter.toLowerCase())) {
                    const opt = document.createElement('div');
                    opt.className = 'menu-opt';
                    opt.innerHTML = `<span style="color:${this.getCatColor(def.cat)}">●</span> ${def.title}`;
                    opt.onclick = () => {
                        this.spawnNode(key, pos.x, pos.y);
                        this.hideContextMenu();
                    };
                    list.appendChild(opt);
                }
            });
        };

        search.oninput = (e) => renderOpts(e.target.value);
        search.focus();
        renderOpts();
    }
    hideContextMenu() { if(this.dom.contextMenu) this.dom.contextMenu.style.display = 'none'; }
    filterScripts(q) { /* ... */ } 
    filterLib(q) { /* ... */ }
    setupDragDrop() {
        this.dom.canvas.addEventListener('dragover', e => e.preventDefault());
        this.dom.canvas.addEventListener('drop', e => {
            e.preventDefault();
            if(this.isReadOnly) return;
            const type = e.dataTransfer.getData('type');
            if (type) {
                const pos = this.getCanvasPos(e.clientX, e.clientY);
                this.spawnNode(type, pos.x, pos.y);
            }
        });
    }

    addVariable() { const n=prompt("Name:"); if(n) { this.vars.push({name:n, value:0}); } }
    refreshScriptList() { fetch('/api/logic/list').then(r=>r.json()).then(l=>this.renderScriptList(l)); }
    renderScriptList(l) { 
        this.dom.scriptList.innerHTML=''; 
        // Ensure Core Scripts are always listed
        const allScripts = Array.from(new Set([...this.coreScripts, ...l]));
        
        allScripts.forEach(s=>{
            const isCore = this.coreScripts.includes(s);
            const d=document.createElement('div'); 
            d.className='lib-item'; 
            d.style.color = isCore ? '#e74c3c' : '#ccc';
            d.innerHTML = `<div class="lib-icon" style="background:${isCore?'#e74c3c':'#2ecc71'}"></div> ${s} ${isCore?'<i class="fas fa-lock" style="font-size:10px; margin-left:auto;"></i>':''}`;
            d.onclick=()=>this.loadScript(s); 
            this.dom.scriptList.appendChild(d); 
        }); 
    }
    
    // === PHASE B: TEST PANEL METHODS ===
    
    testScript() {
        // Show test panel
        const overlay = document.getElementById('test-panel-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            this.logToTestConsole('✓ Test panel opened. Click an event button to run.', 'success');
        }
    }
    
    testRun() {
        // Alias for testScript (for F5 shortcut)
        this.testScript();
    }
    
    closeTestPanel() {
        const overlay = document.getElementById('test-panel-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
    
    async triggerTestEvent(eventName) {
        this.logToTestConsole(`▶ Triggering event: ${eventName}`, 'log');
        
        // First, save the current script
        const scriptName = this.dom.scriptName.value;
        if (!scriptName) {
            this.logToTestConsole('✗ Error: No script name specified', 'error');
            return;
        }
        
        try {
            // Compile and save
            const data = this.compileGraph();
            data.name = scriptName;
            
            // Save as .algorithm file
            const res = await fetch(`/api/logic/${scriptName}.algorithm`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            
            if (!res.ok) {
                throw new Error(`Failed to save: ${res.statusText}`);
            }
            
            this.logToTestConsole(`✓ Saved ${scriptName}.algorithm`, 'success');
            
            // Check if AlgorithmRuntime is loaded
            if (!window.AlgorithmRuntime) {
                this.logToTestConsole('✗ AlgorithmRuntime not loaded', 'error');
                return;
            }
            
            if (!window.LogicRuntime) {
                this.logToTestConsole('✗ LogicRuntime not loaded', 'error');
                return;
            }
            
            // Create mock game object
            const mockGame = {
                player: { x: 320, y: 240, hp: 100, maxHp: 100 },
                enemies: [],
                npcs: [],
                entities: [],
                time: 0,
                logicFlags: {},
                showNotification: (msg) => this.logToTestConsole(`[Game] ${msg}`, 'log')
            };
            
            // Create mock entity
            const mockEntity = {
                id: 'test_entity',
                name: 'Test Entity',
                x: 100,
                y: 100,
                type: 'test'
            };
            
            // Create runtime
            this.logToTestConsole(`▶ Executing ${eventName} event...`, 'log');
            
            // Capture console.log during execution
            const originalLog = console.log;
            const originalWarn = console.warn;
            const originalError = console.error;
            
            console.log = (...args) => {
                const message = args.join(' ');
                this.logToTestConsole(message, 'log');
                originalLog.apply(console, args);
            };
            console.warn = (...args) => {
                const message = args.join(' ');
                this.logToTestConsole(message, 'warn');
                originalWarn.apply(console, args);
            };
            console.error = (...args) => {
                const message = args.join(' ');
                this.logToTestConsole(message, 'error');
                originalError.apply(console, args);
            };
            
            try {
                const runtime = new window.AlgorithmRuntime(data, mockGame, mockEntity);
                
                // Execute the event
                await runtime.execute(eventName);
                
                this.logToTestConsole(`✓ Script executed successfully`, 'success');
            } finally {
                // Restore console
                console.log = originalLog;
                console.warn = originalWarn;
                console.error = originalError;
            }
            
        } catch (error) {
            this.logToTestConsole(`✗ Error: ${error.message}`, 'error');
            console.error('[TestScript]', error);
            
            // Log stack trace for debugging
            if (error.stack) {
                console.error(error.stack);
            }
        }
    }
    
    logToTestConsole(message, type = 'log') {
        const console = document.getElementById('test-console');
        if (!console) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const div = document.createElement('div');
        div.className = `test-console-${type}`;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'test-console-timestamp';
        timeSpan.textContent = `[${timestamp}]`;
        
        const msgSpan = document.createElement('span');
        msgSpan.textContent = message;
        
        div.appendChild(timeSpan);
        div.appendChild(msgSpan);
        console.appendChild(div);
        
        // Auto-scroll to bottom
        console.scrollTop = console.scrollHeight;
    }
    
    clearTestConsole() {
        const console = document.getElementById('test-console');
        if (console) {
            console.innerHTML = '<div style="padding: 10px; color: #666; font-style: italic;">Console cleared.</div>';
        }
    }
    
    handleRuntimeError(errorData) {
        // Log to test console
        this.logToTestConsole(`✗ Runtime Error in ${errorData.eventName}: ${errorData.error}`, 'error');
        
        // Highlight failing node if available
        if (errorData.nodeId) {
            const node = this.nodes.find(n => n.id === errorData.nodeId);
            if (node && node.dom) {
                node.dom.style.border = '2px solid #ff4444';
                node.dom.style.boxShadow = '0 0 10px rgba(255, 68, 68, 0.5)';
                
                // Reset after 3 seconds
                setTimeout(() => {
                    node.dom.style.border = '';
                    node.dom.style.boxShadow = '';
                }, 3000);
            }
        }
        
        // Log stack trace if available
        if (errorData.stack) {
            this.logToTestConsole(`  Stack: ${errorData.stack.join(' → ')}`, 'error');
        }
    }
}

// --- UPDATED LIBRARY WITH DESCRIPTIONS ---
