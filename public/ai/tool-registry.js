import { PermissionGate } from './permission-gate.js';

/**
 * Ketebe AI - Tool Registry (KAP)
 * Registry of Command Bus actions that the AI can invoke across the Studio.
 */

export class ToolRegistry {
    constructor(eventBus = null) {
        this.eventBus = eventBus || window.KetebeEventBus;
        this.permissionGate = new PermissionGate();
        this.tools = new Map();
        this._setupListeners();
        this._registerDefaults();
        
        // Initial sync with Python Backend
        this._syncWithBackend();
    }

    /**
     * Setup EventBus listeners for tool registration and remote execution.
     */
    _setupListeners() {
        if (!this.eventBus) return;

        // Re-sync tools when connection is established
        this.eventBus.on('system:websocket:connected', () => {
            console.log(`[ToolRegistry] Connection detected. Syncing tools...`);
            this._syncWithBackend();
        });

        // The "Handshake": External tools can announce their presence
        this.eventBus.on('studio:tool:announce', (toolDef) => {
            console.log(`[ToolRegistry] Tool discovered: ${toolDef.name}`);
            this.register(toolDef);
        });

        // Tool removal (e.g., when window closes)
        this.eventBus.on('studio:tool:remove', (data) => {
            console.log(`[ToolRegistry] Tool removing: ${data.name}`);
            this.deregister(data.name);
        });

        // Discovery Request: When a new AI component joins, it asks for all tools
        this.eventBus.on('ai:tool:discover', () => {
            console.log(`[ToolRegistry] Discovery requested. Re-broadcasting all tools.`);
            for (const tool of this.tools.values()) {
                this.eventBus.emit('ai:tool:registered', { name: tool.name, definition: tool });
            }
        });

        // Remote request for tool execution (from IRAB/Assistant)
        this.eventBus.on('ai:command:request', async (request) => {
            try {
                const response = await this.execute(request.method, request.params, request.id);
                this.eventBus.emit('ai:command:result', response);
            } catch (error) {
                // execute() handles emitting its own error response
            }
        });
    }

    /**
     * Register a tool definition.
     */
    register(toolDef) {
        // Ensure defaults for KAP compliance
        const compliantTool = {
            securityLevel: 'high-risk', // Default to safest assumption
            requiresConfirmation: toolDef.securityLevel !== 'safe',
            ...toolDef
        };
        this.tools.set(compliantTool.name, compliantTool);
        
        // Announce registration success (with definition for remote listeners)
        this.eventBus.emit('ai:tool:registered', { name: compliantTool.name, definition: compliantTool });
        
        // Sync with Python Backend
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
        
        // --- Phase 10: Tool Patience ---
        // If tool is missing, wait up to 3 seconds for it to register (useful after navigateTo)
        let tool = this.tools.get(name);
        if (!tool) {
            console.log(`[ToolRegistry] Tool ${name} not found. Waiting for registration...`);
            for (let i = 0; i < 6; i++) { // 6 * 500ms = 3s
                await new Promise(r => setTimeout(r, 500));
                tool = this.tools.get(name);
                if (tool) break;
            }
        }
        
        if (!tool) {
            const error = { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` };
            const response = { id, success: false, error };
            this.eventBus.emit('studio:action:result', response);
            return response;
        }

        console.log(`[ToolRegistry] AI Invoking Tool: ${name}`, args);
        
        try {
            // Check permissions based on security level and manual override
            const allowed = await this.permissionGate.requestPermission(
                name, 
                args, 
                tool.requiresConfirmation || (tool.securityLevel !== 'safe')
            );

            if (!allowed) {
                const error = { code: 'PERMISSION_DENIED', message: `User rejected action: ${name}` };
                const response = { id, success: false, error };
                this.eventBus.emit('ai:tool:rejected', { name, id });
                this.eventBus.emit('studio:action:result', response);
                return response;
            }

            // Emit starting event (UI can show "AI is working...")
            const narrative = this._getNarrative(name);
            if (narrative) {
                this.eventBus.emit('ai:thought', { text: narrative });
            }
            
            this.eventBus.emit('studio:action:execute', { id, method: name, params: args });
            
            const result = await tool.execute(args);
            
            // Record the action for undo/audit
            this.permissionGate.recordAction(name, args, result, tool.undo);
            
            const response = { id, success: true, result };
            this.eventBus.emit('studio:action:result', response);
            this.eventBus.emit('ai:tool:success', { name, id, result });
            
            return response;
        } catch (error) {
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
            },
            undo: async (args, result) => {
                // Not perfectly reversible if overwriting, but createUndoPoint in PermissionGate handles snapshots
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
                    'skills': '/api/skill-defs' // Assuming get exists too, checking...
                };
                // Fallback for simple GETs
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

        // --- STUDIO NAVIGATION (Legacy Compat) ---

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
                // Hub Integration: Use Studio window manager if available
                if (window.openWindow && window.tools) {
                    const tool = window.tools.find(t => t.id === args.target);
                    if (tool) {
                        window.openWindow(tool);
                        return { success: true, message: `Opened ${tool.title}` };
                    }
                }

                // Fallback for standalone mode
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
                if (nav[args.target]) {
                    window.location.href = nav[args.target];
                    return { message: `Redirecting to ${args.target}` };
                }
                throw new Error(`Invalid navigation target: ${args.target}`);
            }
        });
        
        // Aliases for legacy
        this.register({ ...this.tools.get('fs.read'), name: 'readFile' });
        this.register({ ...this.tools.get('fs.list'), name: 'listFiles' });
        this.register({ ...this.tools.get('fs.write'), name: 'saveScript' });
    }
}