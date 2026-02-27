/**
 * KETEBE BRAIN ARCHITECT v3.0 (Algorithm Studio Theme)
 * Visual Behavior Tree / FSM Editor for NPCs
 * Integrated with EventBus, SharedProjectState, and AssetManager
 */

// Integration system references
let eventBus, projectState, assetManager;

function initializeBehaviorIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.KetebeEventBus;
        projectState = window.KetebeProjectState;
        assetManager = window.KetebeAssetManager;
        
        if (eventBus) {
            // Listen for NPC/enemy behavior requests
            eventBus.on('behavior:request', (event) => {
                console.log('[BehaviorEditor] Behavior requested:', event.data.behaviorId);
            });
            
            // Listen for enemy updates to sync behavior trees
            eventBus.on('enemy:updated', (event) => {
                console.log('[BehaviorEditor] Enemy updated, may need behavior:', event.data);
            });
            
            console.log('[BehaviorEditor] EventBus connected');
        }
    }
}

function broadcastBehaviorUpdate(brainName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`behavior:${action}`, {
            behaviorId: brainName,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`behaviors.${brainName}`, {
            name: brainName,
            lastModified: Date.now()
        });
    }
}

// ============================================
// BEHAVIOR TEMPLATES
// ============================================

const BEHAVIOR_TEMPLATES = {
    patrol: {
        name: "Patrol Route",
        description: "NPC walks between waypoints in a loop",
        icon: "route",
        category: "movement",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 100, data: {} },
            { type: 'task_goto', x: 300, y: 100, data: { x: 200, y: 200 } },
            { type: 'logic_wait', x: 500, y: 100, data: { time: 1 } },
            { type: 'task_goto', x: 300, y: 200, data: { x: 400, y: 300 } },
            { type: 'logic_wait', x: 500, y: 200, data: { time: 1 } },
            { type: 'task_goto', x: 300, y: 300, data: { x: 200, y: 200 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'out' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 5, port: 'out' },
            { from: 5, to: 1, port: 'out' }
        ]
    },
    chase: {
        name: "Chase Player",
        description: "Detect and pursue player",
        icon: "running",
        category: "combat",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 150, data: {} },
            { type: 'task_wander', x: 300, y: 150, data: { range: 50 } },
            { type: 'logic_check', x: 300, y: 250, data: { flag: 'player_near' } },
            { type: 'expr_say', x: 500, y: 200, data: { text: 'I see you!' } },
            { type: 'task_goto', x: 700, y: 200, data: { x: 0, y: 0 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'true' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 2, port: 'out' },
            { from: 2, to: 1, port: 'false' }
        ]
    },
    flee: {
        name: "Flee from Danger",
        description: "Run when health low",
        icon: "exclamation-triangle",
        category: "survival",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 150, data: {} },
            { type: 'task_wander', x: 300, y: 150, data: { range: 100 } },
            { type: 'logic_check', x: 500, y: 150, data: { flag: 'health_low' } },
            { type: 'expr_say', x: 700, y: 100, data: { text: 'Help!' } },
            { type: 'task_goto', x: 900, y: 100, data: { x: -200, y: -200 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'true' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 2, port: 'out' },
            { from: 2, to: 1, port: 'false' }
        ]
    },
    guard: {
        name: "Guard Post",
        description: "Stand watch",
        icon: "shield-alt",
        category: "combat",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 150, data: {} },
            { type: 'logic_wait', x: 300, y: 150, data: { time: 3 } },
            { type: 'logic_check', x: 500, y: 150, data: { flag: 'heard_sound' } },
            { type: 'expr_say', x: 700, y: 100, data: { text: "Who's there?" } },
            { type: 'task_goto', x: 900, y: 100, data: { x: 300, y: 300 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'true' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 1, port: 'out' },
            { from: 2, to: 1, port: 'false' }
        ]
    },
    conversational: {
        name: "Conversational NPC",
        description: "Friendly greeter",
        icon: "comments",
        category: "social",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 150, data: {} },
            { type: 'task_wander', x: 300, y: 150, data: { range: 30 } },
            { type: 'logic_check', x: 500, y: 150, data: { flag: 'player_near' } },
            { type: 'expr_say', x: 700, y: 100, data: { text: 'Hello!' } },
            { type: 'logic_wait', x: 900, y: 100, data: { time: 3 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'true' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 1, port: 'out' },
            { from: 2, to: 1, port: 'false' }
        ]
    },
    idle: {
        name: "Random Idle",
        description: "Ambient idle",
        icon: "user",
        category: "ambient",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 150, data: {} },
            { type: 'logic_wait', x: 300, y: 150, data: { time: 5 } },
            { type: 'expr_emotion', x: 500, y: 100, data: { type: 'happy' } },
            { type: 'task_wander', x: 500, y: 200, data: { range: 20 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'out' },
            { from: 3, to: 1, port: 'out' }
        ]
    },
    
    // ============================================
    // ADVANCED TEMPLATES
    // ============================================
    
    merchant: {
        name: "Merchant/Shopkeeper",
        description: "Stationary vendor with greeting",
        icon: "store",
        category: "social",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 150, data: {} },
            { type: 'logic_wait', x: 300, y: 150, data: { time: 1 } },
            { type: 'logic_check', x: 500, y: 150, data: { flag: 'player_near' } },
            { type: 'expr_say', x: 700, y: 100, data: { text: 'Welcome! Browse my wares!' } },
            { type: 'logic_wait', x: 900, y: 100, data: { time: 2 } },
            { type: 'expr_say', x: 1100, y: 100, data: { text: 'Best prices in town!' } },
            { type: 'logic_wait', x: 1300, y: 100, data: { time: 4 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'true' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 5, port: 'out' },
            { from: 5, to: 6, port: 'out' },
            { from: 6, to: 1, port: 'out' },
            { from: 2, to: 1, port: 'false' }
        ]
    },
    
    quest_giver: {
        name: "Quest Giver",
        description: "Checks quest status and responds",
        icon: "scroll",
        category: "social",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 200, data: {} },
            { type: 'logic_check', x: 300, y: 200, data: { flag: 'player_near' } },
            { type: 'logic_check', x: 500, y: 150, data: { flag: 'quest_complete' } },
            { type: 'expr_say', x: 700, y: 100, data: { text: 'Thank you, hero!' } },
            { type: 'logic_wait', x: 900, y: 100, data: { time: 3 } },
            { type: 'logic_check', x: 500, y: 250, data: { flag: 'quest_active' } },
            { type: 'expr_say', x: 700, y: 200, data: { text: 'Any progress?' } },
            { type: 'logic_wait', x: 900, y: 200, data: { time: 2 } },
            { type: 'expr_say', x: 700, y: 300, data: { text: 'I need your help!' } },
            { type: 'logic_wait', x: 900, y: 300, data: { time: 3 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'true' },
            { from: 2, to: 3, port: 'true' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 1, port: 'out' },
            { from: 2, to: 5, port: 'false' },
            { from: 5, to: 6, port: 'true' },
            { from: 6, to: 7, port: 'out' },
            { from: 7, to: 1, port: 'out' },
            { from: 5, to: 8, port: 'false' },
            { from: 8, to: 9, port: 'out' },
            { from: 9, to: 1, port: 'out' },
            { from: 1, to: 1, port: 'false' }
        ]
    },
    
    aggressive: {
        name: "Aggressive Enemy",
        description: "Attacks player on sight",
        icon: "skull-crossbones",
        category: "combat",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 200, data: {} },
            { type: 'task_wander', x: 300, y: 200, data: { range: 80 } },
            { type: 'logic_check', x: 500, y: 200, data: { flag: 'player_near' } },
            { type: 'expr_say', x: 700, y: 150, data: { text: 'Die!' } },
            { type: 'task_goto', x: 900, y: 150, data: { x: 0, y: 0 } },
            { type: 'logic_wait', x: 1100, y: 150, data: { time: 0.5 } },
            { type: 'logic_check', x: 900, y: 250, data: { flag: 'health_low' } },
            { type: 'expr_say', x: 1100, y: 250, data: { text: 'Retreat!' } },
            { type: 'task_goto', x: 1300, y: 250, data: { x: -300, y: -300 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'true' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 5, port: 'out' },
            { from: 5, to: 6, port: 'out' },
            { from: 6, to: 7, port: 'true' },
            { from: 7, to: 8, port: 'out' },
            { from: 8, to: 2, port: 'out' },
            { from: 6, to: 4, port: 'false' },
            { from: 2, to: 1, port: 'false' }
        ]
    },
    
    curious: {
        name: "Curious Investigator",
        description: "Investigates nearby sounds/movements",
        icon: "search",
        category: "ambient",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 200, data: {} },
            { type: 'task_wander', x: 300, y: 200, data: { range: 50 } },
            { type: 'logic_wait', x: 500, y: 200, data: { time: 2 } },
            { type: 'logic_check', x: 700, y: 200, data: { flag: 'heard_sound' } },
            { type: 'expr_say', x: 900, y: 150, data: { text: 'Hmm?' } },
            { type: 'task_goto', x: 1100, y: 150, data: { x: 250, y: 250 } },
            { type: 'logic_wait', x: 1300, y: 150, data: { time: 3 } },
            { type: 'expr_say', x: 1500, y: 150, data: { text: 'Must be nothing...' } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'out' },
            { from: 3, to: 4, port: 'true' },
            { from: 4, to: 5, port: 'out' },
            { from: 5, to: 6, port: 'out' },
            { from: 6, to: 7, port: 'out' },
            { from: 7, to: 1, port: 'out' },
            { from: 3, to: 1, port: 'false' }
        ]
    },
    
    follower: {
        name: "Follower/Companion",
        description: "Stays near player and follows",
        icon: "user-friends",
        category: "social",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 200, data: {} },
            { type: 'logic_check', x: 300, y: 200, data: { flag: 'player_far' } },
            { type: 'task_goto', x: 500, y: 150, data: { x: 0, y: 0 } },
            { type: 'logic_wait', x: 700, y: 150, data: { time: 0.5 } },
            { type: 'task_wander', x: 500, y: 250, data: { range: 30 } },
            { type: 'logic_wait', x: 700, y: 250, data: { time: 2 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'true' },
            { from: 2, to: 3, port: 'out' },
            { from: 3, to: 1, port: 'out' },
            { from: 1, to: 4, port: 'false' },
            { from: 4, to: 5, port: 'out' },
            { from: 5, to: 1, port: 'out' }
        ]
    },
    
    boss_phases: {
        name: "Boss Multi-Phase",
        description: "Changes behavior based on health",
        icon: "dragon",
        category: "combat",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 300, data: {} },
            { type: 'logic_check', x: 300, y: 300, data: { flag: 'health_high' } },
            { type: 'expr_say', x: 500, y: 200, data: { text: 'You dare challenge me?' } },
            { type: 'task_goto', x: 700, y: 200, data: { x: 0, y: 0 } },
            { type: 'logic_wait', x: 900, y: 200, data: { time: 1 } },
            { type: 'logic_check', x: 300, y: 400, data: { flag: 'health_medium' } },
            { type: 'expr_say', x: 500, y: 350, data: { text: 'Impossible!' } },
            { type: 'task_wander', x: 700, y: 350, data: { range: 100 } },
            { type: 'logic_wait', x: 900, y: 350, data: { time: 0.5 } },
            { type: 'expr_say', x: 500, y: 500, data: { text: 'ENOUGH!' } },
            { type: 'task_goto', x: 700, y: 500, data: { x: 0, y: 0 } },
            { type: 'logic_wait', x: 900, y: 500, data: { time: 0.3 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'true' },
            { from: 2, to: 3, port: 'out' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 1, port: 'out' },
            { from: 1, to: 5, port: 'false' },
            { from: 5, to: 6, port: 'true' },
            { from: 6, to: 7, port: 'out' },
            { from: 7, to: 8, port: 'out' },
            { from: 8, to: 5, port: 'out' },
            { from: 5, to: 9, port: 'false' },
            { from: 9, to: 10, port: 'out' },
            { from: 10, to: 11, port: 'out' },
            { from: 11, to: 9, port: 'out' }
        ]
    },
    
    coward_advanced: {
        name: "Coward (Advanced)",
        description: "Flees, hides, and peeks",
        icon: "running",
        category: "survival",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 250, data: {} },
            { type: 'task_wander', x: 300, y: 250, data: { range: 60 } },
            { type: 'logic_check', x: 500, y: 250, data: { flag: 'player_near' } },
            { type: 'expr_say', x: 700, y: 200, data: { text: 'Eek!' } },
            { type: 'task_goto', x: 900, y: 200, data: { x: -200, y: -200 } },
            { type: 'logic_wait', x: 1100, y: 200, data: { time: 3 } },
            { type: 'expr_say', x: 1300, y: 200, data: { text: 'Are they gone?' } },
            { type: 'logic_wait', x: 1500, y: 200, data: { time: 2 } },
            { type: 'logic_check', x: 1300, y: 300, data: { flag: 'player_near' } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 3, port: 'true' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 5, port: 'out' },
            { from: 5, to: 6, port: 'out' },
            { from: 6, to: 7, port: 'out' },
            { from: 7, to: 8, port: 'out' },
            { from: 8, to: 4, port: 'true' },
            { from: 8, to: 1, port: 'false' },
            { from: 2, to: 1, port: 'false' }
        ]
    },
    
    patrol_alert: {
        name: "Patrol & Alert",
        description: "Patrols and alerts allies",
        icon: "bell",
        category: "combat",
        nodes: [
            { type: 'sensor_spawn', x: 100, y: 250, data: {} },
            { type: 'task_goto', x: 300, y: 250, data: { x: 300, y: 300 } },
            { type: 'logic_wait', x: 500, y: 250, data: { time: 2 } },
            { type: 'task_goto', x: 700, y: 250, data: { x: 500, y: 300 } },
            { type: 'logic_wait', x: 900, y: 250, data: { time: 2 } },
            { type: 'logic_check', x: 500, y: 150, data: { flag: 'see_player' } },
            { type: 'expr_say', x: 700, y: 100, data: { text: 'INTRUDER!' } },
            { type: 'logic_var_set', x: 900, y: 100, data: { key: 'alert_triggered', val: 'true' } },
            { type: 'task_goto', x: 1100, y: 100, data: { x: 0, y: 0 } },
        ],
        wires: [
            { from: 0, to: 1, port: 'out' },
            { from: 1, to: 2, port: 'out' },
            { from: 2, to: 5, port: 'out' },
            { from: 5, to: 6, port: 'true' },
            { from: 6, to: 7, port: 'out' },
            { from: 7, to: 8, port: 'out' },
            { from: 8, to: 5, port: 'out' },
            { from: 5, to: 3, port: 'false' },
            { from: 3, to: 4, port: 'out' },
            { from: 4, to: 1, port: 'out' }
        ]
    }
};

class BrainArchitect {
    constructor() {
        this.nodes = [];
        this.wires = [];
        this.comments = []; // Comments system
        this.commentsVisible = true;
        this.transform = { x: 0, y: 0, scale: 1 };
        this.nextNodeId = 1;
        this.nextCommentId = 1;
        this.selection = null;
        this.dragState = null;
        
        // Undo/Redo system
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        
        // Clipboard
        this.clipboard = null;
        
        // Settings
        this.gridVisible = true;
        this.snapToGrid = true;
        this.gridSize = 10;
        
        // Comments
        this.comments = [];
        this.nextCommentId = 1;
        this.commentsVisible = true;
        
        // Variables system
        this.variables = {}; // { varName: { name, type, initialValue, exposed, usedBy: [], description, min, max, category, presets } }
        
        // Variable categories
        this.variableCategories = ['Movement', 'Combat', 'AI State', 'Quest', 'Custom'];
        
        // Subgraph system
        this.subgraphs = {}; // Library of saved subgraphs { id: subgraphData }
        this.navigationStack = [{ name: 'Main', graphId: 'main', nodes: [], wires: [] }]; // Current navigation path
        this.currentGraphId = 'main'; // Which graph we're viewing
        this.subgraphLibraryVisible = false;
        
        // Port type system
        this.portTypes = ['any', 'string', 'number', 'boolean', 'entity', 'position', 'vector'];
        
        // Multi-select
        this.multiSelection = [];
        
        // Recently used nodes
        this.recentNodes = [];
        this.maxRecentNodes = 5;
        
        // Inspector tab
        this.currentInspectorTab = 'properties';

        // DOM Cache
        this.dom = {
            viewport: document.getElementById('viewport'),
            graph: document.getElementById('graph'),
            nodeLayer: document.getElementById('node-layer'),
            wireLayer: document.getElementById('wire-layer'),
            inspector: document.getElementById('inspector'),
            nameInput: document.getElementById('script-name'),
            brainSelector: document.getElementById('brain-selector'),
            zoomLevel: document.getElementById('zoom-level'),
            undoBtn: document.getElementById('btn-undo'),
            redoBtn: document.getElementById('btn-redo'),
            gridToggle: document.getElementById('grid-toggle'),
            snapToggle: document.getElementById('snap-toggle')
        };

        this.init();
    }

    async init() {
        // Initialize integration first
        initializeBehaviorIntegration();
        
        this.setupInput();
        this.setupDragDrop();
        this.setupKeyboardShortcuts();
        this.setupContextMenu();
        this.setupMenuBar();
        this.setupTemplates();
        await this.fetchBrainList();
        
        // Hide breadcrumbs initially
        this.hideBreadcrumbs();
        
        // Auto-load or default
        const params = new URLSearchParams(window.location.search);
        const script = params.get('script');
        if (script) {
            this.dom.nameInput.value = script.toUpperCase();
            await this.loadBrain(script);
        } else {
            // Default start node
            this.addNode('sensor_spawn', 100, 100);
        }
        
        // Initial state save
        this.saveState();
        this.updateUndoRedoButtons();
        this.updateZoomDisplay();
    }
    
    // ============================================
    // MENU BAR
    // ============================================
    
    setupMenuBar() {
        // Click menu items to toggle dropdowns
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const menuName = item.dataset.menu;
                const dropdown = document.getElementById(`menu-${menuName}`);
                
                // Close all other dropdowns
                document.querySelectorAll('.menu-dropdown').forEach(d => {
                    if (d !== dropdown) d.classList.remove('visible');
                });
                document.querySelectorAll('.menu-item').forEach(m => {
                    if (m !== item) m.classList.remove('active');
                });
                
                // Toggle this dropdown
                dropdown.classList.toggle('visible');
                item.classList.toggle('active');
                
                e.stopPropagation();
            });
        });
        
        // Close menus when clicking outside
        document.addEventListener('click', () => {
            document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('visible'));
            document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        });
        
        // Prevent menu from closing when clicking inside dropdown
        document.querySelectorAll('.menu-dropdown').forEach(dropdown => {
            dropdown.addEventListener('click', (e) => {
                // Close after action
                setTimeout(() => {
                    dropdown.classList.remove('visible');
                    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
                }, 100);
            });
        });
    }
    
    // ============================================
    // SIDEBAR TOGGLES
    // ============================================
    
    toggleSidebar(side) {
        if (side === 'left') {
            const sidebar = document.getElementById('sidebar');
            const icon = document.getElementById('sidebar-icon-left');
            sidebar.classList.toggle('collapsed');
            icon.className = sidebar.classList.contains('collapsed') ? 'fas fa-angle-right' : 'fas fa-angle-left';
        } else if (side === 'right') {
            const inspector = document.getElementById('inspector-panel');
            const icon = document.getElementById('sidebar-icon-right');
            inspector.classList.toggle('collapsed');
            icon.className = inspector.classList.contains('collapsed') ? 'fas fa-angle-left' : 'fas fa-angle-right';
        }
    }
    
    // ============================================
    // MENU ACTIONS
    // ============================================
    
    newBrain() {
        if (confirm('Create new brain? Unsaved changes will be lost.')) {
            this.nodes = [];
            this.wires = [];
            this.selection = null;
            this.multiSelection = [];
            this.history = [];
            this.historyIndex = -1;
            this.dom.nameInput.value = 'NPC_NEW_BRAIN';
            this.renderWires();
            this.dom.nodeLayer.innerHTML = '';
            this.renderInspector();
        }
    }
    
    saveAs() {
        const newName = prompt('Enter new brain name:', this.dom.nameInput.value);
        if (newName) {
            this.dom.nameInput.value = newName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            this.save();
        }
    }
    
    exportJSON() {
        const data = JSON.stringify({ nodes: this.nodes, wires: this.wires }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.dom.nameInput.value}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    importJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        this.nodes = data.nodes || [];
                        this.wires = data.wires || [];
                        this.nodes.forEach(n => {
                            const def = BRAIN_LIB[n.type];
                            if (def) this.createNodeDOM(n, def);
                        });
                        this.renderWires();
                        alert('Brain imported successfully!');
                    } catch (err) {
                        alert('Failed to import: Invalid JSON');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }
    
    selectAll() {
        this.multiSelection = this.nodes.map(n => n.id);
        this.selection = this.nodes[0]?.id || null;
        
        document.querySelectorAll('.node').forEach(n => {
            n.classList.remove('selected', 'multi-selected');
            if (this.multiSelection.includes(n.id)) {
                n.classList.add('multi-selected');
            }
        });
        if (this.selection) {
            document.getElementById(this.selection)?.classList.add('selected');
        }
    }
    
    validateBrain() {
        const errors = [];
        
        // Check for start node
        const hasStart = this.nodes.some(n => n.cat === 'sensor');
        if (!hasStart) errors.push('No sensor/start node found');
        
        // Check for orphaned nodes
        const orphans = this.nodes.filter(n => {
            const hasIncoming = this.wires.some(w => w.to === n.id);
            const hasOutgoing = this.wires.some(w => w.from === n.id);
            return !hasIncoming && !hasOutgoing && n.cat !== 'sensor';
        });
        if (orphans.length > 0) errors.push(`${orphans.length} orphaned nodes`);
        
        if (errors.length === 0) {
            alert('✅ Brain validation passed!');
        } else {
            alert('⚠️ Validation issues:\n' + errors.join('\n'));
        }
    }
    
    cleanupOrphans() {
        const orphans = this.nodes.filter(n => {
            const hasIncoming = this.wires.some(w => w.to === n.id);
            const hasOutgoing = this.wires.some(w => w.from === n.id);
            return !hasIncoming && !hasOutgoing && n.cat !== 'sensor';
        });
        
        if (orphans.length === 0) {
            alert('No orphaned nodes found.');
            return;
        }
        
        if (confirm(`Delete ${orphans.length} orphaned nodes?`)) {
            orphans.forEach(n => this.deleteNode(n.id));
            alert(`Removed ${orphans.length} nodes.`);
        }
    }
    
    autoLayout() {
        // Simple left-to-right layout
        alert('Auto-layout coming soon! For now, use alignment tools.');
    }
    
    showKeyboardShortcuts() {
        const shortcuts = `
KEYBOARD SHORTCUTS
==================

Navigation:
  Mouse Wheel     - Zoom in/out
  Middle Drag     - Pan canvas
  
Selection:
  Click           - Select node
  Shift+Click     - Multi-select
  Ctrl+A          - Select all
  
Editing:
  Ctrl+C          - Copy node
  Ctrl+V          - Paste node
  Ctrl+D          - Duplicate node
  Delete          - Delete selected
  
History:
  Ctrl+Z          - Undo
  Ctrl+Y          - Redo
  
View:
  G               - Toggle grid
  F1              - Toggle library
  F2              - Toggle inspector
  0               - Reset zoom
  +/-             - Zoom in/out
  
File:
  Ctrl+S          - Save
  Ctrl+N          - New brain
  Ctrl+O          - Open brain
  
Tools:
  F3              - View code
        `.trim();
        
        alert(shortcuts);
    }
    
    showAbout() {
        alert(`
BRAIN ARCHITECT v1.0
====================

Visual NPC behavior programming tool for Ketebe Engine.

Features:
  • Node-based behavior design
  • Real-time code generation
  • Undo/redo system
  • Multi-select & alignment tools
  • Collapsible UI panels

Created for Ketebe Game Engine
        `.trim());
    }
    
    // ============================================
    // VARIABLE MANAGER SYSTEM
    // ============================================
    
    detectVariables() {
        // Scan all nodes for variable usage
        const detectedVars = {};
        
        this.nodes.forEach(node => {
            if (node.type === 'logic_var_set' || node.type === 'logic_var_check') {
                const varName = node.data.key || 'unknown';
                const varValue = node.data.val || '';
                
                if (!detectedVars[varName]) {
                    detectedVars[varName] = {
                        name: varName,
                        type: this.inferType(varValue),
                        initialValue: varValue,
                        exposed: false,
                        usedBy: [],
                        description: '',
                        min: null,
                        max: null,
                        category: 'Custom',
                        presets: []
                    };
                }
                
                // Track which nodes use this variable
                if (!detectedVars[varName].usedBy.includes(node.id)) {
                    detectedVars[varName].usedBy.push(node.id);
                }
            }
        });
        
        // Merge with existing variables (preserve user edits)
        Object.keys(detectedVars).forEach(varName => {
            if (!this.variables[varName]) {
                this.variables[varName] = detectedVars[varName];
            } else {
                // Update usedBy list but keep other settings
                this.variables[varName].usedBy = detectedVars[varName].usedBy;
                
                // Ensure new properties exist
                if (!this.variables[varName].description) this.variables[varName].description = '';
                if (!this.variables[varName].category) this.variables[varName].category = 'Custom';
                if (!this.variables[varName].presets) this.variables[varName].presets = [];
            }
        });
        
        // Remove variables that are no longer used
        Object.keys(this.variables).forEach(varName => {
            if (!detectedVars[varName]) {
                if (confirm(`Variable "${varName}" is no longer used. Remove it?`)) {
                    delete this.variables[varName];
                }
            }
        });
        
        this.renderVariablesList();
    }
    
    inferType(value) {
        // Type inference from value
        if (value === 'true' || value === 'false') return 'boolean';
        if (!isNaN(value) && value !== '') return 'number';
        if (value.includes(',')) return 'position';
        return 'string';
    }
    
    getDefaultPresets(type, category) {
        // Return default presets based on type and category
        const presetMap = {
            'number': {
                'Movement': [
                    { label: 'Slow', value: '2' },
                    { label: 'Medium', value: '5' },
                    { label: 'Fast', value: '8' },
                    { label: 'Very Fast', value: '12' }
                ],
                'Combat': [
                    { label: 'Weak', value: '10' },
                    { label: 'Normal', value: '25' },
                    { label: 'Strong', value: '50' },
                    { label: 'Boss', value: '100' }
                ],
                'Custom': [
                    { label: 'Low', value: '1' },
                    { label: 'Medium', value: '5' },
                    { label: 'High', value: '10' }
                ]
            },
            'boolean': {
                'default': [
                    { label: 'Yes', value: 'true' },
                    { label: 'No', value: 'false' }
                ]
            },
            'string': {
                'AI State': [
                    { label: 'Idle', value: 'idle' },
                    { label: 'Patrol', value: 'patrol' },
                    { label: 'Alert', value: 'alert' },
                    { label: 'Combat', value: 'combat' }
                ],
                'Quest': [
                    { label: 'Not Started', value: 'not_started' },
                    { label: 'Active', value: 'active' },
                    { label: 'Complete', value: 'complete' }
                ]
            }
        };
        
        if (type === 'boolean') return presetMap.boolean.default;
        if (presetMap[type] && presetMap[type][category]) return presetMap[type][category];
        if (presetMap[type] && presetMap[type]['Custom']) return presetMap[type]['Custom'];
        return [];
    }
    
    addManualVariable() {
        const varName = prompt('Enter variable name:');
        if (!varName) return;
        
        // Check if already exists
        if (this.variables[varName]) {
            alert('Variable already exists!');
            return;
        }
        
        this.variables[varName] = {
            name: varName,
            type: 'string',
            initialValue: '',
            exposed: false,
            usedBy: [],
            description: '',
            min: null,
            max: null,
            category: 'Custom',
            presets: []
        };
        
        this.renderVariablesList();
    }
    
    deleteVariable(varName) {
        if (confirm(`Delete variable "${varName}"?`)) {
            delete this.variables[varName];
            this.renderVariablesList();
        }
    }
    
    updateVariableType(varName, newType) {
        if (this.variables[varName]) {
            this.variables[varName].type = newType;
            
            // Update initial value based on type
            const typeDefaults = {
                'number': '0',
                'string': '',
                'boolean': 'false',
                'position': '0,0'
            };
            
            if (!this.variables[varName].initialValue) {
                this.variables[varName].initialValue = typeDefaults[newType];
            }
            
            // Update presets based on new type and category
            this.variables[varName].presets = this.getDefaultPresets(newType, this.variables[varName].category);
            
            // Re-render to show updated UI
            this.renderVariablesList();
        }
    }
    
    updateVariableValue(varName, newValue) {
        if (this.variables[varName]) {
            this.variables[varName].initialValue = newValue;
            
            // Validate against min/max if set
            if (this.variables[varName].type === 'number') {
                const numVal = parseFloat(newValue);
                const min = this.variables[varName].min;
                const max = this.variables[varName].max;
                
                if (min !== null && numVal < min) {
                    alert(`Value ${numVal} is below minimum ${min}`);
                }
                if (max !== null && numVal > max) {
                    alert(`Value ${numVal} exceeds maximum ${max}`);
                }
            }
        }
    }
    
    updateVariableDescription(varName, newDesc) {
        if (this.variables[varName]) {
            this.variables[varName].description = newDesc;
        }
    }
    
    updateVariableMin(varName, newMin) {
        if (this.variables[varName]) {
            this.variables[varName].min = newMin === '' ? null : parseFloat(newMin);
        }
    }
    
    updateVariableMax(varName, newMax) {
        if (this.variables[varName]) {
            this.variables[varName].max = newMax === '' ? null : parseFloat(newMax);
        }
    }
    
    updateVariableCategory(varName, newCategory) {
        if (this.variables[varName]) {
            this.variables[varName].category = newCategory;
            // Update presets when category changes
            this.variables[varName].presets = this.getDefaultPresets(this.variables[varName].type, newCategory);
            this.renderVariablesList();
        }
    }
    
    applyPreset(varName, presetValue) {
        if (this.variables[varName]) {
            this.variables[varName].initialValue = presetValue;
            this.renderVariablesList();
        }
    }
    
    toggleVariableExposed(varName) {
        if (this.variables[varName]) {
            this.variables[varName].exposed = !this.variables[varName].exposed;
        }
    }
    
    jumpToVariableNode(nodeId) {
        // Select and scroll to node
        this.select(nodeId);
        
        const node = document.getElementById(nodeId);
        if (node) {
            const rect = node.getBoundingClientRect();
            const viewportRect = this.dom.viewport.getBoundingClientRect();
            
            // Center the node in viewport
            this.dom.viewport.scrollLeft = node.offsetLeft - viewportRect.width / 2;
            this.dom.viewport.scrollTop = node.offsetTop - viewportRect.height / 2;
            
            // Flash effect
            node.style.animation = 'none';
            setTimeout(() => {
                node.style.animation = 'flash 0.5s';
            }, 10);
        }
    }
    
    renderVariablesList() {
        const container = document.getElementById('variables-list');
        
        const varNames = Object.keys(this.variables);
        
        if (varNames.length === 0) {
            container.innerHTML = '<div style="color: #888; font-size: 11px; padding: 10px;">No variables detected. Click DETECT VARS or add manually.</div>';
            return;
        }
        
        let html = '';
        
        varNames.sort().forEach(varName => {
            const v = this.variables[varName];
            const usageCount = v.usedBy.length;
            const exposedBadge = v.exposed ? '<span style="color: var(--accent); font-size: 10px;">[EXPOSED]</span>' : '';
            const categoryBadge = v.category ? `<span style="color: #888; font-size: 9px;">[${v.category.toUpperCase()}]</span>` : '';
            
            // Generate presets HTML
            let presetsHTML = '';
            const presets = v.presets || this.getDefaultPresets(v.type, v.category);
            if (presets.length > 0) {
                presetsHTML = '<div class="variable-presets" style="margin-top: 5px;">';
                presetsHTML += '<label style="font-size: 9px; color: #666;">QUICK VALUES:</label><div style="display: flex; gap: 3px; flex-wrap: wrap; margin-top: 2px;">';
                presets.forEach(preset => {
                    presetsHTML += `<button onclick="editor.applyPreset('${varName}', '${preset.value}')" 
                                         class="preset-btn" 
                                         style="font-size: 9px; padding: 2px 5px; background: #222; border: 1px solid #444; color: #888; cursor: pointer;"
                                         onmouseover="this.style.borderColor='var(--accent)'; this.style.color='var(--accent)'"
                                         onmouseout="this.style.borderColor='#444'; this.style.color='#888'">${preset.label}</button>`;
                });
                presetsHTML += '</div></div>';
            }
            
            // Min/Max for numbers
            let constraintsHTML = '';
            if (v.type === 'number') {
                constraintsHTML = `
                    <div class="variable-constraints" style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 5px;">
                        <div class="variable-field" style="margin: 0;">
                            <label style="font-size: 9px;">MIN:</label>
                            <input type="number" value="${v.min !== null ? v.min : ''}" 
                                   onchange="editor.updateVariableMin('${varName}', this.value)"
                                   placeholder="No limit"
                                   style="font-size: 10px; padding: 2px;">
                        </div>
                        <div class="variable-field" style="margin: 0;">
                            <label style="font-size: 9px;">MAX:</label>
                            <input type="number" value="${v.max !== null ? v.max : ''}" 
                                   onchange="editor.updateVariableMax('${varName}', this.value)"
                                   placeholder="No limit"
                                   style="font-size: 10px; padding: 2px;">
                        </div>
                    </div>
                `;
            }
            
            html += `
                <div class="variable-item">
                    <div class="variable-item-header">
                        <div class="variable-name">${varName} ${exposedBadge} ${categoryBadge}</div>
                        <div class="variable-actions">
                            <button onclick="editor.deleteVariable('${varName}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="variable-field">
                        <label>DESCRIPTION:</label>
                        <input type="text" value="${v.description || ''}" 
                               onchange="editor.updateVariableDescription('${varName}', this.value)"
                               placeholder="What does this variable do?"
                               style="font-size: 11px;">
                    </div>
                    
                    <div class="variable-field">
                        <label>CATEGORY:</label>
                        <select onchange="editor.updateVariableCategory('${varName}', this.value)">
                            ${this.variableCategories.map(cat => 
                                `<option value="${cat}" ${v.category === cat ? 'selected' : ''}>${cat}</option>`
                            ).join('')}
                        </select>
                    </div>
                    
                    <div class="variable-field">
                        <label>TYPE:</label>
                        <select onchange="editor.updateVariableType('${varName}', this.value)">
                            <option value="string" ${v.type === 'string' ? 'selected' : ''}>String</option>
                            <option value="number" ${v.type === 'number' ? 'selected' : ''}>Number</option>
                            <option value="boolean" ${v.type === 'boolean' ? 'selected' : ''}>Boolean</option>
                            <option value="position" ${v.type === 'position' ? 'selected' : ''}>Position</option>
                        </select>
                    </div>
                    
                    ${constraintsHTML}
                    
                    <div class="variable-field">
                        <label>INITIAL VALUE:</label>
                        <input type="text" value="${v.initialValue}" 
                               onchange="editor.updateVariableValue('${varName}', this.value)"
                               placeholder="${v.type}">
                    </div>
                    
                    ${presetsHTML}
                    
                    <div class="variable-exposed">
                        <input type="checkbox" id="exposed-${varName}" 
                               ${v.exposed ? 'checked' : ''}
                               onchange="editor.toggleVariableExposed('${varName}'); editor.renderVariablesList();">
                        <label for="exposed-${varName}">Exposed (per-NPC configurable)</label>
                    </div>
                    
                    <div class="variable-usage">
                        Used by ${usageCount} node${usageCount !== 1 ? 's' : ''}
                        ${usageCount > 0 ? `<button onclick="editor.jumpToVariableNode('${v.usedBy[0]}')" style="background: none; border: none; color: var(--accent); cursor: pointer; font-size: 10px;">[JUMP]</button>` : ''}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }
    
    // ============================================
    // END VARIABLE MANAGER
    // ============================================
    
    // ============================================
    // SUBGRAPH NAVIGATION SYSTEM
    // ============================================
    
    enterSubgraph(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node || node.type !== 'subgraph') {
            console.error('Not a subgraph node:', nodeId);
            return;
        }
        
        const subgraphId = node.data.subgraphId;
        if (!subgraphId) {
            alert('This subgraph has no content. Create content first.');
            return;
        }
        
        // Save current graph state
        const currentLevel = {
            name: this.navigationStack[this.navigationStack.length - 1].name,
            graphId: this.currentGraphId,
            nodes: JSON.parse(JSON.stringify(this.nodes)),
            wires: JSON.parse(JSON.stringify(this.wires)),
            comments: JSON.parse(JSON.stringify(this.comments)),
            variables: JSON.parse(JSON.stringify(this.variables))
        };
        
        // Update stack
        this.navigationStack[this.navigationStack.length - 1] = currentLevel;
        
        // Load subgraph
        const subgraphData = this.subgraphs[subgraphId];
        if (subgraphData) {
            // Enter subgraph with existing data
            this.navigationStack.push({
                name: node.data.name || 'Subgraph',
                graphId: subgraphId,
                nodes: JSON.parse(JSON.stringify(subgraphData.nodes || [])),
                wires: JSON.parse(JSON.stringify(subgraphData.wires || [])),
                comments: JSON.parse(JSON.stringify(subgraphData.comments || [])),
                variables: JSON.parse(JSON.stringify(subgraphData.variables || {}))
            });
        } else {
            // Create new empty subgraph
            this.navigationStack.push({
                name: node.data.name || 'Subgraph',
                graphId: subgraphId,
                nodes: [],
                wires: [],
                comments: [],
                variables: {}
            });
            
            // Add starter input/output nodes
            const inputNode = this.addNode('subgraph_input', 100, 200, null, { paramName: 'input1' });
            const outputNode = this.addNode('subgraph_output', 500, 200, null, { outputName: 'result' });
        }
        
        this.currentGraphId = subgraphId;
        this.renderCurrentGraph();
        this.showBreadcrumbs();
    }
    
    exitSubgraph() {
        if (this.navigationStack.length <= 1) {
            console.log('Already at root level');
            return;
        }
        
        // Save current subgraph
        const currentLevel = this.navigationStack[this.navigationStack.length - 1];
        this.subgraphs[currentLevel.graphId] = {
            id: currentLevel.graphId,
            name: currentLevel.name,
            nodes: JSON.parse(JSON.stringify(this.nodes)),
            wires: JSON.parse(JSON.stringify(this.wires)),
            comments: JSON.parse(JSON.stringify(this.comments)),
            variables: JSON.parse(JSON.stringify(this.variables))
        };
        
        // Go up one level
        this.navigationStack.pop();
        const parentLevel = this.navigationStack[this.navigationStack.length - 1];
        
        this.currentGraphId = parentLevel.graphId;
        this.renderCurrentGraph();
        
        // Update subgraph container ports in parent
        const subgraphContainers = this.nodes.filter(n => 
            n.type === 'subgraph' && n.data.subgraphId === currentLevel.graphId
        );
        subgraphContainers.forEach(container => {
            this.updateSubgraphPorts(container.id);
        });
        
        if (this.navigationStack.length === 1) {
            this.hideBreadcrumbs();
        } else {
            this.showBreadcrumbs();
        }
    }
    
    renderCurrentGraph() {
        const currentLevel = this.navigationStack[this.navigationStack.length - 1];
        
        // Clear canvas
        this.dom.nodeLayer.innerHTML = '';
        
        // Restore state
        this.nodes = JSON.parse(JSON.stringify(currentLevel.nodes));
        this.wires = JSON.parse(JSON.stringify(currentLevel.wires));
        this.comments = JSON.parse(JSON.stringify(currentLevel.comments));
        this.variables = JSON.parse(JSON.stringify(currentLevel.variables));
        
        // Render everything
        this.nodes.forEach(n => {
            const def = BRAIN_LIB[n.type];
            if (def) this.createNodeDOM(n, def);
        });
        
        this.comments.forEach(c => this.createCommentDOM(c));
        this.renderWires();
        this.renderVariablesList();
    }
    
    showBreadcrumbs() {
        const breadcrumbBar = document.getElementById('breadcrumb-bar');
        const breadcrumbContent = document.getElementById('breadcrumb-content');
        
        breadcrumbBar.style.display = 'flex';
        
        // Render breadcrumb trail
        let html = '';
        this.navigationStack.forEach((level, index) => {
            const isLast = index === this.navigationStack.length - 1;
            const classes = isLast ? 'breadcrumb-item active' : 'breadcrumb-item';
            
            html += `<span class="${classes}" onclick="editor.navigateToLevel(${index})">${level.name}</span>`;
            
            if (!isLast) {
                html += '<span class="breadcrumb-separator">></span>';
            }
        });
        
        breadcrumbContent.innerHTML = html;
    }
    
    hideBreadcrumbs() {
        const breadcrumbBar = document.getElementById('breadcrumb-bar');
        breadcrumbBar.style.display = 'none';
    }
    
    navigateToLevel(levelIndex) {
        if (levelIndex < 0 || levelIndex >= this.navigationStack.length) return;
        if (levelIndex === this.navigationStack.length - 1) return; // Already here
        
        // Save current level
        const currentLevel = this.navigationStack[this.navigationStack.length - 1];
        this.subgraphs[currentLevel.graphId] = {
            id: currentLevel.graphId,
            name: currentLevel.name,
            nodes: JSON.parse(JSON.stringify(this.nodes)),
            wires: JSON.parse(JSON.stringify(this.wires)),
            comments: JSON.parse(JSON.stringify(this.comments)),
            variables: JSON.parse(JSON.stringify(this.variables))
        };
        
        // Jump to target level
        this.navigationStack.splice(levelIndex + 1);
        const targetLevel = this.navigationStack[levelIndex];
        
        this.currentGraphId = targetLevel.graphId;
        this.renderCurrentGraph();
        
        if (levelIndex === 0) {
            this.hideBreadcrumbs();
        } else {
            this.showBreadcrumbs();
        }
    }
    
    // ============================================
    // END SUBGRAPH NAVIGATION
    // ============================================
    
    // ============================================
    // SUBGRAPH PORT SYSTEM
    // ============================================
    
    updateSubgraphPorts(subgraphNodeId) {
        const node = this.nodes.find(n => n.id === subgraphNodeId);
        if (!node || node.type !== 'subgraph') return;
        
        const subgraphId = node.data.subgraphId;
        const subgraphData = this.subgraphs[subgraphId];
        
        if (!subgraphData) {
            // Empty subgraph - no ports yet
            node.data.inputs = [];
            node.data.outputs = [];
            return;
        }
        
        // Scan for input nodes
        const inputs = subgraphData.nodes
            .filter(n => n.type === 'subgraph_input')
            .map(n => ({
                name: n.data.paramName || 'input',
                type: n.data.type || 'any',
                nodeId: n.id,
                defaultValue: n.data.defaultValue || ''
            }));
        
        // Scan for output nodes
        const outputs = subgraphData.nodes
            .filter(n => n.type === 'subgraph_output')
            .map(n => ({
                name: n.data.outputName || 'output',
                type: n.data.type || 'any',
                nodeId: n.id
            }));
        
        // Update container node data
        node.data.inputs = inputs;
        node.data.outputs = outputs;
        
        // Recreate DOM to show new ports
        const def = BRAIN_LIB[node.type];
        if (def) {
            const oldEl = document.getElementById(node.id);
            if (oldEl) oldEl.remove();
            this.createNodeDOM(node, def);
        }
    }
    
    updateAllSubgraphPorts() {
        // Update all subgraph nodes in current graph
        this.nodes
            .filter(n => n.type === 'subgraph')
            .forEach(n => this.updateSubgraphPorts(n.id));
    }
    
    // ============================================
    // END SUBGRAPH PORT SYSTEM
    // ============================================
    
    // ============================================
    // TEMPLATES SYSTEM
    // ============================================
    
    setupTemplates() {
        // Make template items draggable
        document.querySelectorAll('.template-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('template', item.dataset.template);
                item.style.opacity = '0.5';
            });
            item.addEventListener('dragend', (e) => {
                item.style.opacity = '1';
            });
            
            // Double-click to instant add
            item.addEventListener('dblclick', () => {
                this.instantiateTemplate(item.dataset.template);
            });
        });
    }
    
    instantiateTemplate(templateKey) {
        const template = BEHAVIOR_TEMPLATES[templateKey];
        if (!template) {
            console.error('Template not found:', templateKey);
            return;
        }
        
        // Clear existing brain
        if (this.nodes.length > 0) {
            if (!confirm(`Replace current brain with "${template.name}" template?`)) {
                return;
            }
        }
        
        // Clear workspace
        this.nodes = [];
        this.wires = [];
        this.comments = [];
        this.dom.nodeLayer.innerHTML = '';
        this.dom.wireLayer.innerHTML = '';
        
        // Create nodes from template
        const nodeMap = [];
        template.nodes.forEach((nodeData, index) => {
            const node = this.addNode(
                nodeData.type,
                nodeData.x,
                nodeData.y,
                null, // auto-generate ID
                nodeData.data
            );
            nodeMap[index] = node.id;
        });
        
        // Create wires using node map
        template.wires.forEach(wire => {
            const fromId = nodeMap[wire.from];
            const toId = nodeMap[wire.to];
            if (fromId && toId) {
                this.wires.push({
                    id: 'w_' + Date.now() + '_' + Math.random(),
                    from: fromId,
                    port: wire.port,
                    to: toId
                });
            }
        });
        
        this.renderWires();
        this.saveState();
        
        // Add comment explaining the template
        this.addComment('info', 200, 50);
        const comment = this.comments[this.comments.length - 1];
        comment.text = `Template: ${template.name}\n${template.description}\n\nCustomize the parameters and logic as needed!`;
        comment.width = 300;
        const commentElem = document.getElementById(comment.id);
        if (commentElem) {
            commentElem.querySelector('.comment-text').value = comment.text;
            commentElem.style.width = '300px';
        }
        
        alert(`✅ Template "${template.name}" loaded!\n\nCustomize nodes and save when ready.`);
    }
    
    // ============================================
    // UNDO/REDO SYSTEM
    // ============================================
    
    saveState() {
        // Remove any states after current index
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // Add new state
        const state = {
            nodes: JSON.parse(JSON.stringify(this.nodes)),
            wires: JSON.parse(JSON.stringify(this.wires))
        };
        this.history.push(state);
        
        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
        
        this.updateUndoRedoButtons();
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
            this.updateUndoRedoButtons();
        }
    }
    
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
            this.updateUndoRedoButtons();
        }
    }
    
    restoreState(state) {
        // Clear current nodes
        this.nodes = [];
        this.wires = [];
        this.dom.nodeLayer.innerHTML = '';
        
        // Restore nodes
        state.nodes.forEach(n => this.addNode(n.type, n.x, n.y, n.id, n.data));
        
        // Restore wires
        this.wires = JSON.parse(JSON.stringify(state.wires));
        this.renderWires();
        
        this.selection = null;
        this.renderInspector();
    }
    
    updateUndoRedoButtons() {
        if (this.dom.undoBtn) {
            this.dom.undoBtn.disabled = this.historyIndex <= 0;
        }
        if (this.dom.redoBtn) {
            this.dom.redoBtn.disabled = this.historyIndex >= this.history.length - 1;
        }
    }
    
    // ============================================
    // COPY/PASTE SYSTEM
    // ============================================
    
    copyNode() {
        if (!this.selection) return;
        const node = this.nodes.find(n => n.id === this.selection);
        if (node) {
            this.clipboard = JSON.parse(JSON.stringify(node));
            console.log('[BrainArchitect] Node copied:', node.type);
        }
    }
    
    pasteNode() {
        if (!this.clipboard) return;
        
        // Paste at offset position
        const offsetX = 50;
        const offsetY = 50;
        const newNode = this.addNode(
            this.clipboard.type,
            this.clipboard.x + offsetX,
            this.clipboard.y + offsetY,
            null,
            JSON.parse(JSON.stringify(this.clipboard.data))
        );
        
        this.saveState();
        console.log('[BrainArchitect] Node pasted:', newNode.type);
    }
    
    deleteSelected() {
        if (this.selection) {
            this.deleteNode(this.selection);
        }
    }
    
    // ============================================
    // VIEW CONTROLS
    // ============================================
    
    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        if (this.gridVisible) {
            this.dom.viewport.classList.remove('grid-hidden');
            this.dom.gridToggle.classList.add('active');
        } else {
            this.dom.viewport.classList.add('grid-hidden');
            this.dom.gridToggle.classList.remove('active');
        }
    }
    
    toggleSnap() {
        this.snapToGrid = !this.snapToGrid;
        if (this.snapToGrid) {
            this.dom.snapToggle.classList.add('active');
        } else {
            this.dom.snapToggle.classList.remove('active');
        }
    }
    
    updateZoomDisplay() {
        if (this.dom.zoomLevel) {
            const zoomPercent = Math.round(this.transform.scale * 100);
            this.dom.zoomLevel.textContent = zoomPercent + '%';
        }
    }
    
    viewCode() {
        const code = this.compile();
        console.log('[BrainArchitect] Generated Code:\n' + code);
        
        // Create modal to show code
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.9); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: #000; border: 2px solid #333;
            padding: 20px; max-width: 800px; width: 100%;
            max-height: 80vh; overflow: auto;
        `;
        
        content.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="color: var(--accent); margin: 0;">GENERATED CODE</h3>
                <button onclick="this.closest('.modal').remove()" 
                        style="background: #222; border: 1px solid #444; color: #aaa; padding: 6px 12px; cursor: pointer;">
                    [CLOSE]
                </button>
            </div>
            <pre style="background: #0a0a0a; padding: 15px; border: 1px solid #333; overflow-x: auto; color: #2ecc71; font-family: 'VT323', monospace; font-size: 1rem;"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
        `;
        
        modal.className = 'modal';
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }
    
    // ============================================
    // NODE SEARCH/FILTER
    // ============================================
    
    filterNodes(query) {
        query = query.toLowerCase();
        const items = document.querySelectorAll('.node-item');
        
        items.forEach(item => {
            const type = item.dataset.type;
            const def = BRAIN_LIB[type];
            const title = def ? def.title.toLowerCase() : '';
            
            if (title.includes(query) || type.includes(query)) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });
    }
    
    // ============================================
    // KEYBOARD SHORTCUTS
    // ============================================
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // ESC - Exit subgraph if in one
            if (e.key === 'Escape' && this.navigationStack.length > 1) {
                e.preventDefault();
                this.exitSubgraph();
                return;
            }
            
            // Ctrl+Z - Undo
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }
            // Ctrl+Y or Ctrl+Shift+Z - Redo
            else if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                this.redo();
            }
            // Ctrl+C - Copy
            else if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                this.copyNode();
            }
            // Ctrl+V - Paste
            else if (e.ctrlKey && e.key === 'v') {
                e.preventDefault();
                this.pasteNode();
            }
            // Delete - Delete selected
            else if (e.key === 'Delete' && this.selection) {
                e.preventDefault();
                this.deleteSelected();
            }
            // Ctrl+S - Save
            else if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.save();
            }
            // Ctrl+D - Duplicate
            else if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                this.copyNode();
                this.pasteNode();
            }
            // G - Toggle grid
            else if (e.key === 'g' && !e.ctrlKey) {
                this.toggleGrid();
            }
            // F1 - Toggle left sidebar
            else if (e.key === 'F1') {
                e.preventDefault();
                this.toggleSidebar('left');
            }
            // F2 - Toggle right sidebar
            else if (e.key === 'F2') {
                e.preventDefault();
                this.toggleSidebar('right');
            }
            // F3 - View code
            else if (e.key === 'F3') {
                e.preventDefault();
                this.viewCode();
            }
        });
    }
    
    // ============================================
    // CONTEXT MENU
    // ============================================
    
    setupContextMenu() {
        const menu = document.getElementById('context-menu');
        
        // Show context menu on right-click
        this.dom.viewport.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            // Check if clicking on a node
            const target = e.target.closest('.node');
            if (target) {
                this.select(target.id);
            }
            
            // Position menu
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            menu.classList.add('visible');
        });
        
        // Hide context menu on click outside
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.remove('visible');
            }
        });
        
        // Hide on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                menu.classList.remove('visible');
            }
        });
    }
    
    contextMenuAction(action) {
        const menu = document.getElementById('context-menu');
        menu.classList.remove('visible');
        
        switch(action) {
            case 'copy':
                this.copyNode();
                break;
            case 'paste':
                this.pasteNode();
                break;
            case 'duplicate':
                this.copyNode();
                this.pasteNode();
                break;
            case 'delete':
                this.deleteSelected();
                break;
        }
    }
    
    // ============================================
    // COLLAPSIBLE CATEGORIES
    // ============================================
    
    toggleCategory(catName) {
        const body = document.querySelector(`#cat-${catName}-body`);
        if (!body) {
            // Handle recent category
            const recentBody = document.getElementById('recent-nodes');
            if (recentBody && catName === 'recent') {
                recentBody.classList.toggle('expanded');
                const icon = document.querySelector('#cat-recent .expand-icon');
                if (icon) {
                    icon.textContent = recentBody.classList.contains('expanded') ? '[-]' : '[+]';
                }
            }
            return;
        }
        
        body.classList.toggle('expanded');
        
        // Update icon
        const header = body.parentElement.querySelector('.category-header');
        const icon = header.querySelector('.expand-icon');
        if (icon) {
            icon.textContent = body.classList.contains('expanded') ? '[-]' : '[+]';
        }
    }
    
    // ============================================
    // INSPECTOR TABS
    // ============================================
    
    switchInspectorTab(tab) {
        this.currentInspectorTab = tab;
        
        // Update tab styling
        document.querySelectorAll('.inspector-tab').forEach(t => {
            t.classList.remove('active');
            if (t.dataset.tab === tab) {
                t.classList.add('active');
            }
        });
        
        // Update content tabs
        document.querySelectorAll('.inspector-content-tab').forEach(t => {
            t.classList.remove('active');
        });
        
        const contentTab = document.getElementById(`inspector-content-${tab}`);
        if (contentTab) {
            contentTab.classList.add('active');
        }
        
        // Special handling for variables tab
        if (tab === 'variables') {
            this.renderVariablesList();
        }
        
        // Re-render inspector content for properties/info/code tabs
        if (tab === 'properties' || tab === 'info' || tab === 'code') {
            this.renderInspector();
        }
    }
    
    // ============================================
    // RECENTLY USED NODES
    // ============================================
    
    addToRecentNodes(type) {
        // Remove if already exists
        this.recentNodes = this.recentNodes.filter(t => t !== type);
        
        // Add to front
        this.recentNodes.unshift(type);
        
        // Limit size
        if (this.recentNodes.length > this.maxRecentNodes) {
            this.recentNodes.pop();
        }
        
        this.updateRecentNodesDisplay();
    }
    
    updateRecentNodesDisplay() {
        const container = document.getElementById('recent-nodes');
        const category = document.getElementById('cat-recent');
        
        if (!container || !category) return;
        
        if (this.recentNodes.length === 0) {
            category.style.display = 'none';
            return;
        }
        
        category.style.display = 'block';
        container.innerHTML = '';
        
        // Update count
        const count = category.querySelector('.node-count');
        if (count) count.textContent = `(${this.recentNodes.length})`;
        
        this.recentNodes.forEach(type => {
            const def = BRAIN_LIB[type];
            if (!def) return;
            
            const item = document.createElement('div');
            item.className = 'node-item';
            item.draggable = true;
            item.dataset.type = type;
            item.dataset.cat = def.cat;
            
            let icon = 'cube';
            if (def.cat === 'sensor') icon = 'eye';
            if (def.cat === 'task') icon = 'running';
            if (def.cat === 'express') icon = 'comment';
            if (def.cat === 'logic') icon = 'code-branch';
            
            item.innerHTML = `<i class="fas fa-${icon}"></i> ${def.title}`;
            
            // Make draggable
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('type', type);
            });
            
            container.appendChild(item);
        });
    }

    
    // ============================================
    // ALIGNMENT TOOLS
    // ============================================
    
    getSelectedNodes() {
        // Return all selected nodes (multi-select or single)
        if (this.multiSelection.length > 0) {
            return this.nodes.filter(n => this.multiSelection.includes(n.id));
        } else if (this.selection) {
            return this.nodes.filter(n => n.id === this.selection);
        }
        return [];
    }
    
    alignNodes(direction) {
        const selected = this.getSelectedNodes();
        if (selected.length < 2) {
            console.log('Select at least 2 nodes to align');
            return;
        }
        
        if (direction === 'left') {
            // Align to leftmost X
            const minX = Math.min(...selected.map(n => n.x));
            selected.forEach(n => {
                n.x = minX;
                const el = document.getElementById(n.id);
                if (el) el.style.left = `${n.x}px`;
            });
        } else if (direction === 'center') {
            // Align to average X
            const avgX = selected.reduce((sum, n) => sum + n.x, 0) / selected.length;
            selected.forEach(n => {
                n.x = Math.round(avgX);
                const el = document.getElementById(n.id);
                if (el) el.style.left = `${n.x}px`;
            });
        } else if (direction === 'top') {
            // Align to topmost Y
            const minY = Math.min(...selected.map(n => n.y));
            selected.forEach(n => {
                n.y = minY;
                const el = document.getElementById(n.id);
                if (el) el.style.top = `${n.y}px`;
            });
        }
        
        this.renderWires();
        this.saveState();
    }
    
    distributeNodes(direction) {
        const selected = this.getSelectedNodes();
        if (selected.length < 3) {
            console.log('Select at least 3 nodes to distribute');
            return;
        }
        
        if (direction === 'horizontal') {
            // Sort by X position
            selected.sort((a, b) => a.x - b.x);
            const first = selected[0].x;
            const last = selected[selected.length - 1].x;
            const spacing = (last - first) / (selected.length - 1);
            
            selected.forEach((n, i) => {
                n.x = Math.round(first + (spacing * i));
                const el = document.getElementById(n.id);
                if (el) el.style.left = `${n.x}px`;
            });
        } else if (direction === 'vertical') {
            // Sort by Y position
            selected.sort((a, b) => a.y - b.y);
            const first = selected[0].y;
            const last = selected[selected.length - 1].y;
            const spacing = (last - first) / (selected.length - 1);
            
            selected.forEach((n, i) => {
                n.y = Math.round(first + (spacing * i));
                const el = document.getElementById(n.id);
                if (el) el.style.top = `${n.y}px`;
            });
        }
        
        this.renderWires();
        this.saveState();
    }
    
    // ============================================
    // COMMENTS SYSTEM
    // ============================================
    
    addComment(type = 'note', x = null, y = null) {
        // Get position from context menu or use center
        if (x === null || y === null) {
            const rect = this.dom.viewport.getBoundingClientRect();
            x = (-this.transform.x + rect.width / 2) / this.transform.scale;
            y = (-this.transform.y + rect.height / 2) / this.transform.scale;
        }
        
        const comment = {
            id: `comment_${this.nextCommentId++}`,
            type, // note, warning, todo, info
            x, y,
            width: 200,
            height: 100,
            text: 'Comment text here...'
        };
        
        this.comments.push(comment);
        this.createCommentDOM(comment);
        this.saveState();
    }
    
    createCommentDOM(comment) {
        const div = document.createElement('div');
        div.className = `comment ${comment.type}`;
        div.id = comment.id;
        div.style.left = `${comment.x}px`;
        div.style.top = `${comment.y}px`;
        div.style.width = `${comment.width}px`;
        div.style.height = `${comment.height}px`;
        div.style.display = this.commentsVisible ? 'block' : 'none';
        
        // Header
        const header = document.createElement('div');
        header.className = 'comment-header';
        header.innerHTML = `
            <div class="comment-type">${comment.type}</div>
            <div class="comment-close" onclick="editor.deleteComment('${comment.id}')">✕</div>
        `;
        
        // Make header draggable
        header.onmousedown = (e) => {
            if (e.target.classList.contains('comment-close')) return;
            this.startDragComment(e, comment.id);
        };
        
        div.appendChild(header);
        
        // Text area
        const textarea = document.createElement('textarea');
        textarea.className = 'comment-text';
        textarea.value = comment.text;
        textarea.oninput = (e) => {
            comment.text = e.target.value;
        };
        div.appendChild(textarea);
        
        // Right-click menu on comment
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showCommentContextMenu(e, comment.id);
        });
        
        // Track resize
        const resizeObserver = new ResizeObserver(() => {
            comment.width = div.offsetWidth;
            comment.height = div.offsetHeight;
        });
        resizeObserver.observe(div);
        
        this.dom.nodeLayer.appendChild(div);
    }
    
    startDragComment(e, id) {
        const comment = this.comments.find(c => c.id === id);
        if (!comment) return;
        
        this.dragState = {
            type: 'comment',
            id,
            startX: e.clientX,
            startY: e.clientY,
            ox: comment.x,
            oy: comment.y
        };
    }
    
    deleteComment(id) {
        this.comments = this.comments.filter(c => c.id !== id);
        const elem = document.getElementById(id);
        if (elem) elem.remove();
        this.saveState();
    }
    
    showCommentContextMenu(e, commentId) {
        const comment = this.comments.find(c => c.id === commentId);
        if (!comment) return;
        
        const menu = document.createElement('div');
        menu.className = 'context-menu visible';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.innerHTML = `
            <div class="ctx-item" onclick="editor.changeCommentType('${commentId}', 'note')">
                <i class="fas fa-sticky-note"></i> NOTE (Yellow)
            </div>
            <div class="ctx-item" onclick="editor.changeCommentType('${commentId}', 'warning')">
                <i class="fas fa-exclamation-triangle"></i> WARNING (Red)
            </div>
            <div class="ctx-item" onclick="editor.changeCommentType('${commentId}', 'todo')">
                <i class="fas fa-check-circle"></i> TODO (Green)
            </div>
            <div class="ctx-item" onclick="editor.changeCommentType('${commentId}', 'info')">
                <i class="fas fa-info-circle"></i> INFO (Blue)
            </div>
            <div class="ctx-separator"></div>
            <div class="ctx-item" onclick="editor.deleteComment('${commentId}')">
                <i class="fas fa-trash"></i> DELETE
            </div>
        `;
        
        document.body.appendChild(menu);
        
        const closeMenu = () => {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        };
        
        setTimeout(() => document.addEventListener('click', closeMenu), 100);
    }
    
    changeCommentType(id, type) {
        const comment = this.comments.find(c => c.id === id);
        if (!comment) return;
        
        comment.type = type;
        const elem = document.getElementById(id);
        if (elem) {
            elem.className = `comment ${type}`;
            elem.querySelector('.comment-type').textContent = type;
        }
    }
    
    toggleComments() {
        this.commentsVisible = !this.commentsVisible;
        document.querySelectorAll('.comment').forEach(elem => {
            elem.style.display = this.commentsVisible ? 'block' : 'none';
        });
        
        const btn = document.getElementById('comments-toggle');
        if (btn) {
            btn.classList.toggle('active', this.commentsVisible);
        }
    }

    // --- DATA IO ---

    async fetchBrainList() {
        try {
            const res = await fetch('/api/brains/list');
            if (res.ok) {
                const files = await res.json();
                if (this.dom.brainSelector) {
                    this.dom.brainSelector.innerHTML = '<option value="">-- NEW BRAIN --</option>';
                    files.forEach(f => {
                        const opt = document.createElement('option');
                        opt.value = f; opt.innerText = f;
                        this.dom.brainSelector.appendChild(opt);
                    });
                }
            }
        } catch(e) { console.warn("List fetch failed"); }
    }

    async save() {
        // Save current level before saving brain
        if (this.navigationStack.length > 0) {
            const currentLevel = this.navigationStack[this.navigationStack.length - 1];
            currentLevel.nodes = JSON.parse(JSON.stringify(this.nodes));
            currentLevel.wires = JSON.parse(JSON.stringify(this.wires));
            currentLevel.comments = JSON.parse(JSON.stringify(this.comments));
            currentLevel.variables = JSON.parse(JSON.stringify(this.variables));
            
            // If in subgraph, also save to subgraphs collection
            if (this.navigationStack.length > 1) {
                this.subgraphs[currentLevel.graphId] = {
                    id: currentLevel.graphId,
                    name: currentLevel.name,
                    nodes: currentLevel.nodes,
                    wires: currentLevel.wires,
                    comments: currentLevel.comments,
                    variables: currentLevel.variables
                };
            }
        }
        
        const name = this.dom.nameInput.value || "npc_brain";
        const json = JSON.stringify({ 
            nodes: this.navigationStack[0].nodes,  // Save root level
            wires: this.navigationStack[0].wires,
            comments: this.navigationStack[0].comments,
            variables: this.navigationStack[0].variables,
            subgraphs: this.subgraphs  // Include all subgraphs
        });
        const js = this.compile();
        try {
            await fetch('/api/brains/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name, json, js })
            });
            alert("BRAIN SAVED.");
            await this.fetchBrainList();
        } catch(e) { alert("SAVE FAILED."); }
    }

    async loadBrain(name) {
        try {
            const res = await fetch(`/api/brains/${name}`);
            if (res.ok) {
                const data = await res.json();
                const brain = JSON.parse(data.json);
                
                // Reset subgraph state
                this.navigationStack = [{
                    name: 'Main',
                    graphId: 'main',
                    nodes: brain.nodes || [],
                    wires: brain.wires || [],
                    comments: brain.comments || [],
                    variables: brain.variables || {}
                }];
                this.currentGraphId = 'main';
                this.subgraphs = brain.subgraphs || {};
                this.hideBreadcrumbs();
                
                // Load root level
                this.nodes = []; 
                this.wires = [];
                this.comments = brain.comments || [];
                this.variables = brain.variables || {};
                this.dom.nodeLayer.innerHTML = '';
                brain.nodes.forEach(n => this.addNode(n.type, n.x, n.y, n.id, n.data));
                this.wires = brain.wires;
                this.comments.forEach(c => this.createCommentDOM(c));
                this.renderWires();
                this.renderVariablesList();
                if(this.dom.brainSelector) this.dom.brainSelector.value = name;
                this.dom.nameInput.value = name;
            }
        } catch(e) { console.warn("Load failed", e); }
    }

    load() {
        const val = this.dom.brainSelector.value;
        if (val) this.loadBrain(val);
        else {
            this.nodes = []; 
            this.wires = []; 
            this.comments = [];
            this.dom.nodeLayer.innerHTML = ''; 
            this.dom.wireLayer.innerHTML = '';
            this.addNode('sensor_spawn', 100, 100);
            this.dom.nameInput.value = "npc_new_brain";
        }
    }

    // --- NODE MANAGEMENT ---

    addNode(type, x, y, id = null, data = {}) {
        const def = BRAIN_LIB[type];
        if (!def) return;
        
        // Snap to grid if enabled
        if (this.snapToGrid) {
            x = Math.round(x / this.gridSize) * this.gridSize;
            y = Math.round(y / this.gridSize) * this.gridSize;
        }

        const nid = id || `${type}_${this.nextNodeId++}_${Math.random().toString(36).substr(2,3).toUpperCase()}`;
        const node = { id: nid, type, cat: def.cat, x, y, data: { ...def.defaults, ...data } };
        this.nodes.push(node);
        this.createNodeDOM(node, def);
        this.select(nid);
        
        // Track recently used (only for user-created nodes)
        if (!id) {
            this.addToRecentNodes(type);
            this.saveState();
        }
        
        return node;
    }

    createNodeDOM(node, def) {
        const div = document.createElement('div');
        div.className = 'node';
        div.id = node.id;
        div.dataset.cat = node.cat;
        div.style.left = `${node.x}px`;
        div.style.top = `${node.y}px`;

        // Icon lookup
        let icon = 'cube';
        if (node.cat === 'sensor') icon = 'eye';
        if (node.cat === 'task') icon = 'running';
        if (node.cat === 'express') icon = 'comment';
        if (node.cat === 'logic') icon = 'code-branch';
        if (node.cat === 'subgraph') icon = 'box';
        
        // Special rendering for subgraph nodes
        if (node.type === 'subgraph') {
            const subgraphName = node.data.name || 'Unnamed';
            const hasData = node.data.subgraphId && this.subgraphs[node.data.subgraphId];
            const inputs = node.data.inputs || [];
            const outputs = node.data.outputs || [];
            
            // Build port list HTML
            let portsHTML = '';
            const maxPorts = Math.max(inputs.length, outputs.length, 1);
            
            for (let i = 0; i < maxPorts; i++) {
                const input = inputs[i];
                const output = outputs[i];
                
                portsHTML += `<div style="display: flex; justify-content: space-between; min-height: 20px; margin: 5px 0;">`;
                
                if (input) {
                    portsHTML += `<span class="port-label-in" style="font-size: 10px; color: #999;">${input.name}</span>`;
                } else {
                    portsHTML += `<span></span>`;
                }
                
                if (output) {
                    portsHTML += `<span class="port-label-out" style="font-size: 10px; color: #999;">${output.name}</span>`;
                } else {
                    portsHTML += `<span></span>`;
                }
                
                portsHTML += `</div>`;
            }
            
            div.innerHTML = `
                <div class="node-header">
                    <span><i class="fas fa-${icon}"></i> ${subgraphName.toUpperCase()}</span>
                </div>
                <div class="node-body" style="padding: 10px;">
                    ${portsHTML}
                    <div style="text-align: center; color: #666; font-size: 10px; margin-top: 10px;">
                        ${hasData ? '✓ Double-click to enter' : '⚠ No subgraph data'}
                    </div>
                </div>
            `;
            
            // Adjust node height based on ports
            const minHeight = 80 + maxPorts * 25;
            div.style.minHeight = `${minHeight}px`;
            
            // Add input ports (left side)
            inputs.forEach((input, index) => {
                const port = document.createElement('div');
                port.className = 'port in subgraph-port';
                port.dataset.id = node.id;
                port.dataset.port = input.name;
                port.dataset.portType = input.type;
                port.style.top = `${45 + index * 25}px`;
                port.style.left = '-5px';
                port.onmousedown = (e) => this.startDragWire(e, node.id, input.name);
                div.appendChild(port);
            });
            
            // Add output ports (right side)
            outputs.forEach((output, index) => {
                const port = document.createElement('div');
                port.className = 'port out subgraph-port';
                port.dataset.id = node.id;
                port.dataset.port = output.name;
                port.dataset.portType = output.type;
                port.style.top = `${45 + index * 25}px`;
                port.style.right = '-5px';
                port.onmousedown = (e) => this.startDragWire(e, node.id, output.name);
                div.appendChild(port);
            });
            
            // Double-click to enter subgraph
            div.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (node.data.subgraphId) {
                    this.enterSubgraph(node.id);
                } else {
                    alert('This subgraph has no content yet. Configure it in the inspector.');
                }
            });
        } else {
            // Normal node rendering
            div.innerHTML = `
                <div class="node-header">
                    <span><i class="fas fa-${icon}"></i> ${def.title}</span>
                </div>
                <div class="node-body">
                    <span style="color:#666; font-size:0.8rem; padding-left:10px;">ID: ${node.id.split('_')[1]}</span>
                </div>
            `;
        }

        // INPUT PORT
        if (node.cat !== 'sensor' && node.type !== 'subgraph_input') {
            const pin = document.createElement('div');
            pin.className = 'port in';
            pin.dataset.id = node.id;
            pin.dataset.type = 'in';
            div.appendChild(pin);
        }

        // OUTPUT PORTS
        if (node.type === 'logic_check' || node.type === 'logic_var_check') {
            div.appendChild(this.createPort(node.id, 'true', 'true'));
            div.appendChild(this.createPort(node.id, 'false', 'false'));
            
            // Labels
            const lblT = document.createElement('div'); lblT.className = 'port-label'; lblT.innerText = 'TRUE'; lblT.style.top = '12px'; lblT.style.right = '10px'; lblT.style.color = '#2ecc71';
            div.appendChild(lblT);
            const lblF = document.createElement('div'); lblF.className = 'port-label'; lblF.innerText = 'FALSE'; lblF.style.top = '37px'; lblF.style.right = '10px'; lblF.style.color = '#e74c3c';
            div.appendChild(lblF);

        } else if (node.type !== 'subgraph_output') {
            div.appendChild(this.createPort(node.id, 'out', 'out'));
        }

        // Dragging
        div.onmousedown = (e) => {
            if (e.target.classList.contains('port')) return;
            // Support Shift+click for multi-select
            if (e.shiftKey) {
                this.select(node.id, true);
            } else {
                this.startDragNode(e, node.id);
            }
        };

        this.dom.nodeLayer.appendChild(div);
    }

    createPort(nodeId, name, type) {
        const p = document.createElement('div');
        p.className = `port ${type}`;
        p.dataset.id = nodeId;
        p.dataset.port = name;
        p.onmousedown = (e) => this.startDragWire(e, nodeId, name);
        return p;
    }

    deleteNode(id) {
        if (!confirm("DELETE NODE?")) return;
        this.nodes = this.nodes.filter(n => n.id !== id);
        this.wires = this.wires.filter(w => w.from !== id && w.to !== id);
        const el = document.getElementById(id); if(el) el.remove();
        this.selection = null; 
        this.renderWires(); 
        this.renderInspector();
        this.saveState();
    }

    select(id, addToSelection = false) {
        // Multi-select with Shift
        if (addToSelection && this.selection) {
            if (this.multiSelection.length === 0) {
                // Start multi-select by adding current selection
                this.multiSelection.push(this.selection);
            }
            if (!this.multiSelection.includes(id)) {
                this.multiSelection.push(id);
            }
        } else if (!addToSelection) {
            // Clear multi-select
            this.multiSelection = [];
        }
        
        this.selection = id;
        
        // Update visual state
        document.querySelectorAll('.node').forEach(n => {
            n.classList.remove('selected', 'multi-selected');
            if (this.multiSelection.includes(n.id)) {
                n.classList.add('multi-selected');
            }
        });
        
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('selected');
        }
        
        this.renderInspector();
    }

    // --- WIRES & GRAPH ---

    renderWires() {
        // Clear existing
        this.dom.wireLayer.innerHTML = '';

        // Draw connections
        this.wires.forEach(w => {
            const p1 = this.getPortPos(w.from, w.port, 'out');
            const p2 = this.getPortPos(w.to, 'in', 'in');
            if (p1 && p2) {
                this.drawWire(p1, p2, false, w.id);
            }
        });

        // Draw active drag
        if (this.dragState && this.dragState.type === 'wire') {
            const p1 = this.getPortPos(this.dragState.nodeId, this.dragState.port, 'out');
            const p2 = this.getCanvasPos(this.dragState.curX, this.dragState.curY);
            if (p1 && p2) {
                this.drawWire(p1, p2, true);
            }
        }
    }

    drawWire(p1, p2, isTemp, id) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.classList.add("wire");
        if (isTemp) path.classList.add("temp");

        // BEZIER CURVE
        const cp1 = { x: p1.x + 80, y: p1.y };
        const cp2 = { x: p2.x - 80, y: p2.y };

        const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
        path.setAttribute("d", d);
        path.setAttribute("stroke", isTemp ? "#666" : "#888");
        path.setAttribute("fill", "none");

        if (!isTemp && id) {
            path.style.pointerEvents = 'auto';
            path.style.cursor = 'pointer';
            path.onclick = () => { 
                if(confirm("DELETE WIRE?")) {
                    this.deleteWire(id); 
                }
            };
        }

        this.dom.wireLayer.appendChild(path);
    }

    deleteWire(id) {
        this.wires = this.wires.filter(w => w.id !== id);
        this.renderWires();
        this.saveState();
    }

    getPortPos(nid, port, dir) {
        const n = this.nodes.find(n => n.id === nid);
        if (!n) return null;
        
        // Offset relative to node position
        // Standard node width = 180px (from CSS min-width)
        // Standard Header height ~ 32px
        let x = n.x;
        let y = n.y;

        if (dir === 'in') {
            x -= 0; // Left edge
            y += 21; // ~Center of header/top body
        } else {
            x += 180; // Right edge
            if (port === 'false') y += 46; // Lower port for False
            else y += 21; // Standard top port
        }
        return { x, y };
    }

    // --- INTERACTION ---

    setupDragDrop() {
        document.querySelectorAll('.node-item').forEach(item => {
            item.setAttribute('draggable', true);
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('type', item.dataset.type);
            });
        });

        this.dom.viewport.addEventListener('dragover', (e) => e.preventDefault());
        this.dom.viewport.addEventListener('drop', (e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData('type');
            const template = e.dataTransfer.getData('template');
            
            if (template) {
                // Template dropped - instant install
                this.instantiateTemplate(template);
            } else if (type) {
                // Regular node dropped
                const pos = this.getCanvasPos(e.clientX, e.clientY);
                this.addNode(type, pos.x, pos.y);
            }
        });
    }

    setupInput() {
        // Pan
        this.dom.viewport.addEventListener('mousedown', (e) => {
            if (e.button === 2 || e.target === this.dom.viewport) { // Right click or bg
                this.dragState = { type: 'pan', startX: e.clientX, startY: e.clientY, ox: this.transform.x, oy: this.transform.y };
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.dragState) return;

            if (this.dragState.type === 'pan') {
                this.transform.x = this.dragState.ox + (e.clientX - this.dragState.startX);
                this.transform.y = this.dragState.oy + (e.clientY - this.dragState.startY);
                this.updateTransform();
            }
            else if (this.dragState.type === 'node') {
                const dx = (e.clientX - this.dragState.startX) / this.transform.scale;
                const dy = (e.clientY - this.dragState.startY) / this.transform.scale;
                
                // Move all selected nodes
                const nodesToMove = this.dragState.draggedNodes || [this.dragState.id];
                nodesToMove.forEach(nodeId => {
                    const n = this.nodes.find(n => n.id === nodeId);
                    if (n && this.dragState.initialPositions[nodeId]) {
                        const initial = this.dragState.initialPositions[nodeId];
                        n.x = Math.round((initial.x + dx)/10)*10;
                        n.y = Math.round((initial.y + dy)/10)*10;
                        
                        const el = document.getElementById(n.id);
                        if (el) {
                            el.style.left = `${n.x}px`;
                            el.style.top = `${n.y}px`;
                        }
                    }
                });
                
                this.renderWires();
            }
            else if (this.dragState.type === 'comment') {
                const dx = (e.clientX - this.dragState.startX) / this.transform.scale;
                const dy = (e.clientY - this.dragState.startY) / this.transform.scale;
                const comment = this.comments.find(c => c.id === this.dragState.id);
                if (comment) {
                    comment.x = this.dragState.ox + dx;
                    comment.y = this.dragState.oy + dy;
                    const elem = document.getElementById(comment.id);
                    if (elem) {
                        elem.style.left = `${comment.x}px`;
                        elem.style.top = `${comment.y}px`;
                    }
                }
            }
            else if (this.dragState.type === 'wire') {
                this.dragState.curX = e.clientX;
                this.dragState.curY = e.clientY;
                this.renderWires();
            }
        });

        window.addEventListener('mouseup', (e) => {
            const wasDraggingNode = this.dragState && this.dragState.type === 'node';
            
            if (this.dragState && this.dragState.type === 'wire') {
                // Check drop target
                const el = document.elementFromPoint(e.clientX, e.clientY);
                if (el && el.classList.contains('port') && el.classList.contains('in')) {
                    const targetId = el.dataset.id;
                    // Prevent self-loop and duplicates
                    if (targetId !== this.dragState.nodeId) {
                        this.wires.push({ id: 'w_'+Date.now(), from: this.dragState.nodeId, port: this.dragState.port, to: targetId });
                        this.saveState();
                    }
                }
            }
            
            // Save state after node drag
            if (wasDraggingNode) {
                this.saveState();
            }
            
            this.dragState = null;
            this.renderWires();
        });

        // Zoom
        this.dom.viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.zoom(e.deltaY > 0 ? -0.1 : 0.1);
        });
    }

    startDragNode(e, id) {
        if(e.button !== 0) return;
        if (!e.shiftKey) {
            this.select(id);
        }
        const n = this.nodes.find(n => n.id === id);
        
        // Store initial positions for all selected nodes
        const draggedNodes = this.multiSelection.length > 0 ? this.multiSelection : [id];
        const initialPositions = {};
        draggedNodes.forEach(nodeId => {
            const node = this.nodes.find(n => n.id === nodeId);
            if (node) {
                initialPositions[nodeId] = { x: node.x, y: node.y };
            }
        });
        
        this.dragState = { 
            type: 'node', 
            id, 
            startX: e.clientX, 
            startY: e.clientY, 
            ox: n.x, 
            oy: n.y,
            draggedNodes,
            initialPositions
        };
    }

    startDragWire(e, id, port) {
        e.stopPropagation();
        this.dragState = { type: 'wire', nodeId: id, port, curX: e.clientX, curY: e.clientY };
    }

    getCanvasPos(cx, cy) {
        const r = this.dom.viewport.getBoundingClientRect();
        return {
            x: (cx - r.left - this.transform.x) / this.transform.scale,
            y: (cy - r.top - this.transform.y) / this.transform.scale
        };
    }

    updateTransform() {
        this.dom.graph.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
    }

    zoom(delta) {
        this.transform.scale = Math.max(0.2, Math.min(2, this.transform.scale + delta));
        this.updateTransform();
        this.updateZoomDisplay();
    }
    resetZoom() {
        this.transform = { x: 0, y: 0, scale: 1 };
        this.updateTransform();
        this.updateZoomDisplay();
    }

    // --- INSPECTOR ---

    renderInspector() {
        const propsContainer = document.getElementById('inspector-content-properties');
        const infoContainer = document.getElementById('inspector-content-info');
        const codeContainer = document.getElementById('inspector-content-code');
        
        // Clear all containers
        if (propsContainer) propsContainer.innerHTML = '';
        if (infoContainer) infoContainer.innerHTML = '';
        if (codeContainer) codeContainer.innerHTML = '';
        
        if (!this.selection) {
            if (propsContainer) {
                propsContainer.innerHTML = `<div style="text-align:center; color:#555; margin-top:50px;">NO NODE SELECTED</div>`;
            }
            return;
        }

        const n = this.nodes.find(n => n.id === this.selection);
        const def = BRAIN_LIB[n.type];
        
        // Render content based on active tab
        if (this.currentInspectorTab === 'properties') {
            this.renderPropsTab(n, def, propsContainer);
        } else if (this.currentInspectorTab === 'info') {
            this.renderInfoTab(n, def, infoContainer);
        } else if (this.currentInspectorTab === 'code') {
            this.renderCodeTab(n, def, codeContainer);
        }
    }
    
    renderPropsTab(n, def, container) {
        const addProp = (key, label, type='text') => {
            const row = document.createElement('div'); row.className = 'prop-row';
            row.innerHTML = `<label class="prop-label">${label}</label>`;
            const inp = document.createElement('input'); 
            inp.className = 'prop-input';
            inp.type = type; 
            inp.value = n.data[key] !== undefined ? n.data[key] : '';
            inp.oninput = (e) => { n.data[key] = e.target.value; };
            row.appendChild(inp); 
            container.appendChild(row);
        };

        // SUBGRAPH NODE PROPERTIES
        if (n.type === 'subgraph') {
            // Initialize subgraph data if not exists
            if (!n.data.subgraphId) {
                n.data.subgraphId = `subgraph_${Date.now()}`;
            }
            if (!n.data.name) {
                n.data.name = 'My Subgraph';
            }
            
            addProp('name', 'Subgraph Name');
            
            const idRow = document.createElement('div');
            idRow.className = 'prop-row';
            idRow.innerHTML = `
                <label class="prop-label">Subgraph ID:</label>
                <div class="prop-value" style="color: #f39c12;">${n.data.subgraphId}</div>
            `;
            container.appendChild(idRow);
            
            const btn = document.createElement('button');
            btn.className = 'btn-full';
            btn.style.background = '#f39c12';
            btn.innerText = 'ENTER SUBGRAPH';
            btn.onclick = () => this.enterSubgraph(n.id);
            container.appendChild(btn);
        }
        // SUBGRAPH INPUT PROPERTIES
        else if (n.type === 'subgraph_input') {
            addProp('paramName', 'Parameter Name');
            
            // Type selector
            const typeRow = document.createElement('div');
            typeRow.className = 'prop-row';
            typeRow.innerHTML = `<label class="prop-label">Type:</label>`;
            const typeSelect = document.createElement('select');
            typeSelect.className = 'prop-input';
            this.portTypes.forEach(type => {
                const opt = document.createElement('option');
                opt.value = type;
                opt.textContent = type;
                if (n.data.type === type) opt.selected = true;
                typeSelect.appendChild(opt);
            });
            typeSelect.onchange = (e) => { n.data.type = e.target.value; };
            typeRow.appendChild(typeSelect);
            container.appendChild(typeRow);
            
            addProp('defaultValue', 'Default Value');
            addProp('description', 'Description');
        }
        // SUBGRAPH OUTPUT PROPERTIES
        else if (n.type === 'subgraph_output') {
            addProp('outputName', 'Output Name');
            
            // Type selector
            const typeRow = document.createElement('div');
            typeRow.className = 'prop-row';
            typeRow.innerHTML = `<label class="prop-label">Type:</label>`;
            const typeSelect = document.createElement('select');
            typeSelect.className = 'prop-input';
            this.portTypes.forEach(type => {
                const opt = document.createElement('option');
                opt.value = type;
                opt.textContent = type;
                if (n.data.type === type) opt.selected = true;
                typeSelect.appendChild(opt);
            });
            typeSelect.onchange = (e) => { n.data.type = e.target.value; };
            typeRow.appendChild(typeSelect);
            container.appendChild(typeRow);
            
            addProp('description', 'Description');
        }
        // REGULAR NODE PROPERTIES
        else {
            // Render properties based on type
            if (n.type === 'expr_say') addProp('text', 'Dialogue Text');
            if (n.type === 'expr_emotion') addProp('type', 'Emotion (happy, sad)');
            if (n.type === 'task_wander') addProp('range', 'Wander Radius', 'number');
            if (n.type === 'task_goto') { addProp('x', 'Target X', 'number'); addProp('y', 'Target Y', 'number'); }
            if (n.type === 'logic_check') addProp('flag', 'Game Flag Name');
            if (n.type === 'logic_wait') addProp('time', 'Wait Seconds', 'number');
            if (n.type === 'logic_var_set' || n.type === 'logic_var_check') { 
                addProp('key', 'Variable Name'); addProp('val', 'Value'); 
            }
        }

        // Delete Button
        const btn = document.createElement('button');
        btn.className = 'btn-full danger';
        btn.innerText = 'DELETE NODE';
        btn.onclick = () => this.deleteNode(this.selection);
        container.appendChild(btn);
    }
    
    renderInfoTab(n, def, container) {
        container.innerHTML = `
            <div class="prop-row">
                <label class="prop-label">Type:</label>
                <div class="prop-value">${n.type}</div>
            </div>
            <div class="prop-row">
                <label class="prop-label">Category:</label>
                <div class="prop-value">${n.cat}</div>
            </div>
            <div class="prop-row">
                <label class="prop-label">ID:</label>
                <div class="prop-value">${n.id}</div>
            </div>
            <div class="prop-row">
                <label class="prop-label">Position:</label>
                <div class="prop-value">${Math.round(n.x)}, ${Math.round(n.y)}</div>
            </div>
            <div class="prop-row">
                <label class="prop-label">Description:</label>
                <div class="prop-value">${def ? (def.desc || 'No description available') : 'Unknown node type'}</div>
            </div>
        `;
    }
    
    renderCodeTab(n, def, container) {
        // Generate code snippet for this node
        let codeSnippet = `// ${def ? def.title : n.type}\n`;
        
        if (n.cat === 'sensor') {
            codeSnippet += `// Triggers when: ${def ? (def.desc || n.type) : n.type}\n`;
        } else if (n.cat === 'task') {
            codeSnippet += `await npc.${n.type.replace('task_', '')}(`;
            const fields = def ? (def.fields || []) : [];
            const params = fields.map(f => n.data[f.key] || f.key).join(', ');
            codeSnippet += params + ');\nyield;';
        } else if (n.cat === 'express') {
            codeSnippet += `await npc.say("${n.data.text || 'Hello'}");\nyield;`;
        } else if (n.cat === 'logic') {
            codeSnippet += `if (/* condition */) {\n  // do something\n}`;
        }
        
        container.innerHTML = `
            <div class="prop-row">
                <label class="prop-label">Code Preview:</label>
            </div>
            <pre style="background: #000; padding: 10px; border: 1px solid #f1c40f; color: #0f0; font-family: VT323; font-size: 16px; overflow-x: auto; margin: 10px;">${codeSnippet}</pre>
        `;
    }

    // --- COMPILER (Export Logic) ---
    compile() {
        // Generate JS code for this behavior
        const start = this.nodes.find(n => n.type === 'sensor_spawn') || this.nodes[0];
        if (!start) return "// No start node found";

        let code = `/**
 * Auto-generated Brain Script
 * Generated: ${new Date().toISOString()}
 */

export async function* runBehavior(npc, game, system) {
  // Initialize
  yield;
  
  // Main behavior loop
  while (true) {
`;
        code += this.walk(start, 2);
        code += `
    yield; // Allow game loop to continue
  }
}
`;
        return code;
    }

    walk(node, depth) {
        if (!node || depth > 50) return ""; // Prevent infinite recursion
        const pad = "  ".repeat(depth);
        let out = "";

        // Logic translation
        const d = node.data;
        
        if (node.type === 'expr_say') {
            out += `${pad}await npc.say("${d.text || '...'}");\n${pad}yield;\n`;
        }
        else if (node.type === 'task_wander') {
            out += `${pad}await npc.wander(${d.range || 100}, ${d.duration || 3});\n${pad}yield;\n`;
        }
        else if (node.type === 'task_goto') {
            out += `${pad}await npc.moveToPosition(${d.x || 0}, ${d.y || 0});\n${pad}yield;\n`;
        }
        else if (node.type === 'task_follow') {
            out += `${pad}if (npc.canSee(game.player, 200)) {\n`;
            out += `${pad}  await npc.moveToPosition(game.player.x, game.player.y);\n`;
            out += `${pad}  yield;\n`;
            out += `${pad}}\n`;
        }
        else if (node.type === 'logic_wait') {
            out += `${pad}await npc.wait(${d.time || 1.0});\n${pad}yield;\n`;
        }
        else if (node.type === 'logic_var_set') {
            out += `${pad}npc.setVariable('${d.key || 'var'}', '${d.val || '0'}');\n`;
        }
        else if (node.type === 'expr_emotion') {
            out += `${pad}npc.setEmotion('${d.type || 'neutral'}');\n`;
        }
        
        // Traverse
        if (node.type === 'logic_check') {
            out += `${pad}if (npc.checkFlag('${d.flag || 'flag'}')) {\n`;
            out += this.follow(node.id, 'true', depth + 1);
            out += `${pad}} else {\n`;
            out += this.follow(node.id, 'false', depth + 1);
            out += `${pad}}\n`;
        }
        else if (node.type === 'logic_var_check') {
            out += `${pad}if (npc.getVariable('${d.key || 'var'}') == '${d.val || '0'}') {\n`;
            out += this.follow(node.id, 'true', depth + 1);
            out += `${pad}} else {\n`;
            out += this.follow(node.id, 'false', depth + 1);
            out += `${pad}}\n`;
        }
        else if (node.type === 'sensor_see_player') {
            out += `${pad}if (npc.canSee(game.player, ${d.range || 150})) {\n`;
            out += this.follow(node.id, 'out', depth + 1);
            out += `${pad}}\n`;
        }
        else if (node.type === 'sensor_near_player') {
            out += `${pad}if (npc.getDistance(game.player) < ${d.range || 100}) {\n`;
            out += this.follow(node.id, 'out', depth + 1);
            out += `${pad}}\n`;
        }
        else {
            out += this.follow(node.id, 'out', depth);
        }
        
        return out;
    }

    follow(nid, port, depth) {
        const wire = this.wires.find(w => w.from === nid && w.port === port);
        if (wire) {
            const nextNode = this.nodes.find(n => n.id === wire.to);
            return this.walk(nextNode, depth);
        }
        return "";
    }
}

// LIBRARY DEFINITIONS
const BRAIN_LIB = {
    sensor_spawn: { cat: 'sensor', title: 'ON SPAWN', defaults: {} },
    sensor_see_player: { cat: 'sensor', title: 'SEE PLAYER', defaults: {} },
    sensor_near_player: { cat: 'sensor', title: 'NEAR PLAYER', defaults: { range: 100 } },
    sensor_damaged: { cat: 'sensor', title: 'ON DAMAGED', defaults: {} },
    task_wander: { cat: 'task', title: 'WANDER', defaults: { range: 150 } },
    task_goto: { cat: 'task', title: 'GO TO', defaults: { x: 0, y: 0 } },
    task_follow: { cat: 'task', title: 'FOLLOW', defaults: {} },
    task_flee: { cat: 'task', title: 'FLEE', defaults: {} },
    task_patrol: { cat: 'task', title: 'PATROL', defaults: {} },
    expr_emotion: { cat: 'express', title: 'SET EMOTION', defaults: { type: 'happy' } },
    expr_say: { cat: 'express', title: 'SPEAK', defaults: { text: "..." } },
    expr_emote: { cat: 'express', title: 'EMOTE', defaults: { type: 'exclamation' } },
    logic_check: { cat: 'logic', title: 'CHECK FLAG', defaults: { flag: 'met_hero' } },
    logic_var_set: { cat: 'logic', title: 'SET VAR', defaults: { key: 'state', val: '1' } },
    logic_var_check: { cat: 'logic', title: 'CHECK VAR', defaults: { key: 'state', val: '1' } },
    logic_wait: { cat: 'logic', title: 'WAIT', defaults: { time: 1.0 } },
    
    // Subgraph nodes
    subgraph: { cat: 'subgraph', title: 'SUBGRAPH', defaults: { name: 'MySubgraph', subgraphId: null, inputs: [], outputs: [] } },
    subgraph_input: { cat: 'subgraph', title: 'INPUT', defaults: { paramName: 'param1', paramType: 'string' } },
    subgraph_output: { cat: 'subgraph', title: 'OUTPUT', defaults: { outputName: 'result', outputType: 'string', value: '' } }
};

window.editor = new BrainArchitect();
