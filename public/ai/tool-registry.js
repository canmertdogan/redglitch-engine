import { PermissionGate } from './permission-gate.js?v=5';

/**
 * Ketebe AI - Tool Registry (KAP)
 * Registry of Command Bus actions that the AI can invoke across the Studio.
 */

export class ToolRegistry {
    constructor(eventBus = null) {
        this.eventBus = eventBus || window.KetebeEventBus;
        this.permissionGate = new PermissionGate();
        this.tools = new Map();
        
        console.log(`[ToolRegistry] Initialized in ${window.location.pathname}`);
        this._debug(`Registry startup. Origin: ${window.location.origin}`);
        
        // Setup listeners and defaults
        this._setupListeners();
        this._registerDefaults();
        
        // Initial sync with Python Backend
        if (this.eventBus) {
            this._syncWithBackend();
        }
    }

    _debug(msg, data = null) {
        if (!this.eventBus) {
            console.log(`[AI-DEBUG-NO-BUS] ${msg}`, data || '');
            return;
        }
        const trace = {
            timestamp: new Date().toLocaleTimeString(),
            location: window.location.pathname.split('/').pop(),
            message: msg,
            data: data
        };
        console.log(`%c[AI-DEBUG]%c ${msg}`, 'background: #7289da; color: white; padding: 2px 5px; border-radius: 2px;', '', data || '');
        this.eventBus.emit('ai:debug:trace', trace);
    }

    /**
     * Setup EventBus listeners for tool registration and remote execution.
     */
    _setupListeners() {
        if (!this.eventBus) {
            console.warn('[ToolRegistry] EventBus missing during _setupListeners');
            return;
        }

        // --- Phase 3 & 4: Pending Action Recovery ---
        this.eventBus.on('ai:tool:registered', (event) => {
            if (!event || !event.data) return;
            const data = event.data;
            this._debug(`External tool registered: ${data.name}. Checking for pending actions...`);
            this._checkPendingAction(data.name);
        });

        // Re-sync tools when connection is established
        this.eventBus.on('system:websocket:connected', () => {
            this._debug(`WebSocket connected. Syncing tools...`);
            this._syncWithBackend();
        });

        // The "Handshake": External tools can announce their presence
        this.eventBus.on('studio:tool:announce', (event) => {
            if (!event || !event.data) return;
            const toolDef = event.data;
            this._debug(`Tool discovered via announce: ${toolDef.name}`);
            this.register(toolDef);
        });

        // Discovery Request: When a new AI component joins, it asks for all tools
        this.eventBus.on('ai:tool:discover', () => {
            this._debug(`Discovery requested. Broadcasting all tools.`);
            for (const tool of this.tools.values()) {
                this.eventBus.emit('ai:tool:registered', { name: tool.name, definition: tool });
            }
        });

        // Remote request for tool execution (from IRAB/Assistant)
        this.eventBus.on('ai:command:request', async (event) => {
            if (!event || !event.data) return;
            const request = event.data;
            this._debug(`Remote command request: ${request.method}`, request.params);
            try {
                const response = await this.execute(request.method, request.params, request.id);
                this.eventBus.emit('ai:command:result', response);
            } catch (error) {
                this._debug(`Remote command failed: ${request.method}`, error.message);
            }
        });
    }

    _checkPendingAction(toolName) {
        const pending = localStorage.getItem('ai_pending_action');
        if (pending) {
            try {
                const action = JSON.parse(pending);
                const [ns] = toolName.split('.');
                const [pendingNs] = action.method.split('.');
                
                this._debug(`Checking pending: ${action.method} vs ${toolName} (NS: ${pendingNs} vs ${ns})`);

                if (action.method === toolName || (ns === pendingNs && ns !== null)) {
                    this._debug(`MATCH FOUND! Recovering action: ${action.method}`);
                    localStorage.removeItem('ai_pending_action');
                    
                    // Small delay to ensure the tool's environment (DOM/State) is fully ready
                    setTimeout(() => {
                        this._debug(`Executing recovered action: ${action.method}`);
                        this.execute(action.method, action.params, action.id);
                    }, 1000);
                }
            } catch (e) {
                this._debug(`Recovery error: ${e.message}`);
                localStorage.removeItem('ai_pending_action');
            }
        }
    }

    /**
     * Register a tool definition.
     */
    register(toolDef) {
        const compliantTool = {
            securityLevel: 'high-risk',
            requiresConfirmation: toolDef.requiresConfirmation !== false && toolDef.securityLevel !== 'safe',
            ...toolDef
        };
        this.tools.set(compliantTool.name, compliantTool);
        
        this._debug(`Tool registered locally: ${compliantTool.name}`);

        if (this.eventBus) {
            this.eventBus.emit('ai:tool:registered', { 
                name: compliantTool.name, 
                namespace: compliantTool.name.split('.')[0],
                definition: compliantTool 
            });
        }
        
        this._syncWithBackend();
    }

    /**
     * Remove a tool from the registry.
     */
    deregister(name) {
        if (this.tools.has(name)) {
            this.tools.delete(name);
            this.eventBus.emit('ai:tool:removed', { name });
            this._syncWithBackend();
        }
    }

    _syncWithBackend() {
        if (!this.eventBus) return;
        const toolList = Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));
        
        // Broadcast to Native AI Bridge (bridge.js will forward to WebSocket)
        this.eventBus.emit('ai:command:sync', { type: 'SYNC_TOOLS', data: toolList });
    }

    /**
     * Get JSON Schema descriptions of all tools for the system prompt.
     */
    getToolPrompt() {
        const descriptions = Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            securityLevel: t.securityLevel
        }));
        return JSON.stringify(descriptions, null, 2);
    }

    /**
     * List all registered tools.
     */
    listTools() {
        return Array.from(this.tools.values());
    }

    /**
     * Execute a tool call from the AI using the KAP protocol.
     * @param {string} name - The tool method name.
     * @param {Record<string, any>} args - Arguments for the tool.
     * @param {string} requestId - Optional ID for tracking.
     * @returns {Promise<ketebe.ai.ActionResponse>}
     */
    async execute(name, args, requestId = null) {
        const id = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const parts = name.split('.');
        const namespace = parts.length > 1 ? parts[0] : null;

        this._debug(`Executing tool: ${name}`, { args, namespace });

        const NAMESPACE_MAP = {
            'pixel': 'iso_studio',
            'world': 'editor',
            'code': 'script',
            'npc': 'npc',
            'dialogue': 'dialogue'
        };

        let tool = this.tools.get(name);
        
        if (!tool && namespace && NAMESPACE_MAP[namespace]) {
            this._debug(`Namespace ${namespace} missing. Saving pending action and navigating...`);
            
            localStorage.setItem('ai_pending_action', JSON.stringify({ method: name, params: args, id }));

            await this.execute('navigateTo', { target: NAMESPACE_MAP[namespace] });
            
            return { id, success: true, message: `Pending: Navigating to ${NAMESPACE_MAP[namespace]}` };
        }
        
        if (!tool) {
            this._debug(`ERROR: Unknown tool ${name}`);
            const error = { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` };
            const response = { id, success: false, error };
            this.eventBus.emit('studio:action:result', response);
            return response;
        }

        this._debug(`Tool resolved: ${name}. Checking permissions...`);
        
        try {
            const requiresConfirmation = tool.securityLevel === 'high-risk';
            const isLowRisk = tool.securityLevel === 'low-risk';
            
            if (isLowRisk) {
                this.eventBus.emit('ai:thought', { text: `GRRR... QUICK ACTION: ${name}` });
            }

            const allowed = await this.permissionGate.requestPermission(
                name, 
                args, 
                requiresConfirmation || (tool.requiresConfirmation && !isLowRisk)
            );

            if (!allowed) {
                this._debug(`Permission denied for ${name}`);
                const error = { code: 'PERMISSION_DENIED', message: `User rejected action: ${name}` };
                const response = { id, success: false, error };
                this.eventBus.emit('ai:tool:rejected', { name, id });
                this.eventBus.emit('studio:action:result', response);
                return response;
            }

            this._debug(`Permission granted. Invoking execute() for ${name}`);

            // Emit starting event (UI can show "AI is working...")
            const narrative = this._getNarrative(name);
            if (narrative) {
                this.eventBus.emit('ai:thought', { text: narrative });
            }
            
            this.eventBus.emit('studio:action:execute', { id, method: name, params: args });
            
            let result;
            if (typeof tool.execute === 'function') {
                this._debug(`Invoking local execution for ${name}`);
                result = await tool.execute(args);
            } else {
                this._debug(`Invoking remote execution for ${name}. Waiting for result...`);
                result = await this._waitForRemoteResult(id);
            }
            
            this._debug(`Execution success for ${name}`, result);
            
            // Record the action for undo/audit
            this.permissionGate.recordAction(name, args, result, tool.undo);
            
            const response = { id, success: true, result };
            this.eventBus.emit('studio:action:result', response);
            this.eventBus.emit('ai:tool:success', { name, id, result });
            
            return response;
        } catch (error) {
            this._debug(`Execution error for ${name}`, error.message);
            const actionError = { 
                code: 'EXECUTION_FAILED', 
                message: error.message || 'Unknown execution error',
                data: error
            };
            const response = { id, success: false, error: actionError };
            this.eventBus.emit('studio:action:result', response);
            this.eventBus.emit('ai:tool:error', { name, id, error: actionError.message });
            return response;
        }
    }

    async _waitForRemoteResult(requestId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.eventBus.off('studio:action:result', handler);
                reject(new Error("Remote execution timed out"));
            }, 10000); // 10s timeout

            const handler = (event) => {
                const response = event.data;
                if (response.id === requestId) {
                    clearTimeout(timeout);
                    this.eventBus.off('studio:action:result', handler);
                    if (response.success) resolve(response.result);
                    else reject(new Error(response.error?.message || "Remote execution failed"));
                }
            };

            this.eventBus.on('studio:action:result', handler);
        });
    }

    _getNarrative(toolName) {
        const flavor = {
            'navigateTo': [
                "Greasing the gears of the navigation drive...",
                "Teleporting to the requested sector...",
                "Shifting dimensional planes...",
                "Loading pixels... please hold your breath."
            ],
            'saveScript': [
                "Smashing this code into the file system...",
                "Writing bytes with a tiny digital chisel...",
                "Committing sins... I mean, scripts... to disk.",
                "Injecting logic into the mainframe."
            ],
            'readFile': [
                "Reading the forbidden scrolls...",
                "Extracting data from the void...",
                "Peeking at your messy code...",
                "Decrypting the matrix..."
            ]
        };
        
        const options = flavor[toolName];
        if (options) {
            return options[Math.floor(Math.random() * options.length)];
        }
        return null;
    }

    _registerDefaults() {
        // --- FILE SYSTEM (fs) ---

        // fs.read (Safe)
        this.register({
            name: 'fs.read',
            description: 'Read the contents of a file in the project.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to the file.' }
                },
                required: ['path']
            },
            execute: async (args) => {
                const res = await fetch(`/api/ide/read?file=${encodeURIComponent(args.path)}`);
                if (!res.ok) throw new Error(`Could not read ${args.path}`);
                const content = await res.text();
                return { content, path: args.path };
            }
        });

        // fs.list (Safe)
        this.register({
            name: 'fs.list',
            description: 'List files and directories in a specific project directory.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    dir: { type: 'string', description: 'Relative path (e.g. "data/logic").', default: '' }
                }
            },
            execute: async (args) => {
                const dir = args.dir || '';
                const res = await fetch(`/api/ide/list?dir=${encodeURIComponent(dir)}`);
                if (!res.ok) throw new Error(`Could not list ${dir}`);
                return await res.json();
            }
        });

        // fs.write (Low-Risk)
        this.register({
            name: 'fs.write',
            description: 'Write or update a file in the project.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Target file path.' },
                    content: { type: 'string', description: 'New content for the file.' }
                },
                required: ['path', 'content']
            },
            execute: async (args) => {
                const res = await fetch('/api/ide/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: args.path, content: args.content })
                });
                if (!res.ok) throw new Error(`Failed to write to ${args.path}`);
                return { success: true, path: args.path };
            }
        });

        // fs.delete (High-Risk)
        this.register({
            name: 'fs.delete',
            description: 'Delete a file from the project. PERMANENT ACTION.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File to delete.' }
                },
                required: ['path']
            },
            execute: async (args) => {
                const res = await fetch('/api/ide/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: args.path })
                });
                if (!res.ok) throw new Error(`Failed to delete ${args.path}`);
                return { success: true, message: `${args.path} deleted.` };
            }
        });

        // fs.mkdir (Low-Risk)
        this.register({
            name: 'fs.mkdir',
            description: 'Create a new directory.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Directory path to create.' }
                },
                required: ['path']
            },
            execute: async (args) => {
                const res = await fetch('/api/ide/mkdir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dir: args.path })
                });
                if (!res.ok) throw new Error(`Failed to create directory ${args.path}`);
                return { success: true, path: args.path };
            }
        });

        // fs.search (Safe)
        this.register({
            name: 'fs.search',
            description: 'Search for text within all project files.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Text to search for.' },
                    include: { type: 'string', description: 'Glob pattern (e.g. "*.js").' }
                },
                required: ['query']
            },
            execute: async (args) => {
                const res = await fetch(`/api/ide/search?q=${encodeURIComponent(args.query)}&include=${encodeURIComponent(args.include || '')}`);
                if (!res.ok) throw new Error('Search failed');
                return await res.json();
            }
        });

        // --- PROJECT ---

        // project.getInfo (Safe)
        this.register({
            name: 'project.getInfo',
            description: 'Get metadata about the current project (name, author, engine version).',
            securityLevel: 'safe',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const res = await fetch('/api/projects/current');
                if (!res.ok) throw new Error('Failed to get project info');
                return await res.json();
            }
        });

        // --- GAME DATA (Quests, NPCs, Items) ---

        // data.list (Safe)
        this.register({
            name: 'data.list',
            description: 'List global game definitions (npcs, items, quests, skills).',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['npcs', 'items', 'quests', 'skills'] }
                },
                required: ['type']
            },
            execute: async (args) => {
                const endpoint = {
                    'npcs': '/api/npcs',
                    'items': '/api/items',
                    'quests': '/api/quests',
                    'skills': '/api/skill-defs' 
                };
                const res = await fetch(endpoint[args.type] || `/api/${args.type}`);
                if (!res.ok) throw new Error(`Could not list ${args.type}`);
                return await res.json();
            }
        });

        // data.update (Low-Risk)
        this.register({
            name: 'data.update',
            description: 'Update or add a global game definition (e.g. adding a new quest or NPC).',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['npcs', 'items', 'quests', 'skills'] },
                    data: { type: 'array', description: 'The entire array of definitions.' }
                },
                required: ['type', 'data']
            },
            execute: async (args) => {
                const endpoint = {
                    'npcs': '/api/npc-defs',
                    'items': '/api/item-defs',
                    'quests': '/api/quests',
                    'skills': '/api/skill-defs'
                };
                const res = await fetch(endpoint[args.type], {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(args.data)
                });
                if (!res.ok) throw new Error(`Failed to update ${args.type}`);
                return { success: true };
            }
        });

        // --- STUDIO NAVIGATION ---

        // navigateTo (Safe)
        this.register({
            name: 'navigateTo',
            description: 'Open a specific studio tool or editor.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    target: { 
                        type: 'string', 
                        enum: [
                            'dashboard', 'project_dashboard', 'editor', 'iso_studio', 
                            'platformer_studio', 'script', 'asset-manager', 'npc', 
                            'enemy', 'item', 'quest', 'dialogue', 'pixel'
                        ],
                        description: 'The ID of the tool to open.'
                    }
                },
                required: ['target']
            },
            execute: async (args) => {
                const target = (typeof args === 'string') ? args : args.target;
                
                if (!target) throw new Error("Navigation target missing");

                this._debug(`Navigating to: ${target}`);

                let hub = window;
                if (!hub.openWindow && window.parent && window.parent.openWindow) hub = window.parent;
                if (!hub.openWindow && window.top && window.top.openWindow) hub = window.top;

                if (hub.openWindow && hub.tools) {
                    const tool = hub.tools.find(t => t.id === target);
                    if (tool) {
                        hub.openWindow(tool);
                        return { success: true, message: `Opened ${tool.title}` };
                    }
                }

                const nav = {
                    'dashboard': 'dashboard.html',
                    'project_dashboard': 'project_dashboard.html',
                    'editor': 'editor.html',
                    'iso_studio': 'iso_editor.html',
                    'platformer_studio': 'platformer_editor.html',
                    'script': 'script_editor.html',
                    'asset-manager': 'asset_manager.html',
                    'npc': 'npc_editor.html',
                    'enemy': 'enemy_editor.html',
                    'item': 'item_editor.html',
                    'quest': 'quest_editor.html',
                    'dialogue': 'dialogue_editor.html',
                    'pixel': 'pixel_editor.html'
                };
                
                if (nav[target]) {
                    const url = nav[target];
                    if (window.top) window.top.location.href = url;
                    else window.location.href = url;
                    return { message: `Redirecting to ${target}` };
                }
                throw new Error(`Invalid target: ${target}`);
            }
        });
        
        // Aliases for legacy
        this.register({ ...this.tools.get('fs.read'), name: 'readFile' });
        this.register({ ...this.tools.get('fs.list'), name: 'listFiles' });
        this.register({ ...this.tools.get('fs.write'), name: 'saveScript' });
    }
}
