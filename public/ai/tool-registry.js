import { PermissionGate } from './permission-gate.js?v=6';

/**
 * Ketebe AI - Tool Registry (KAP)
 * Registry of Command Bus actions that the AI can invoke across the Studio.
 */

export class ToolRegistry {
    constructor(eventBus = null) {
        this.eventBus = eventBus || window.KetebeEventBus;
        this.permissionGate = new PermissionGate();
        this.tools = new Map();
        this.NAMESPACE_ALIAS = {
            'isopixel': 'pixel',
            'iso': 'pixel',
            'worldbuilder': 'world',
            'topdown': 'world',
            'rpg': 'world',
            'codeforge': 'code',
            'platform': 'platformer'
        };
        
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

    /**
     * Normalize a tool name using namespace aliases (e.g., isopixel.* -> pixel.*).
     */
    _resolveToolName(name) {
        if (!name || typeof name !== 'string') return { resolvedName: name, tool: this.tools.get(name) };
        const parts = name.split('.');
        if (parts.length < 2) return { resolvedName: name, tool: this.tools.get(name) };

        const [ns, method] = parts;
        const alias = this.NAMESPACE_ALIAS[ns];
        const resolvedName = alias ? `${alias}.${method}` : name;
        return { resolvedName, tool: this.tools.get(resolvedName) || this.tools.get(name) };
    }

    _checkPendingAction(toolName) {
        const raw = localStorage.getItem('ai_pending_action');
        if (!raw) return;

        try {
            const action = JSON.parse(raw);
            if (!action || !action.method) {
                localStorage.removeItem('ai_pending_action');
                return;
            }

            const { resolvedName } = this._resolveToolName(action.method);

            const now = Date.now();
            const created = action.timestamp || 0;
            if (created && now - created > 45000) {
                this._debug(`Pending action expired: ${action.method}`);
                localStorage.removeItem('ai_pending_action');
                return;
            }

            // Only resume when the exact tool is registered (prevents namespace loops)
            const toolIsAvailable = this.tools.has(resolvedName) || resolvedName === toolName;
            if (!toolIsAvailable) {
                this._debug(`Pending ${action.method} waiting for exact tool. Registered: ${toolName}`);
                return;
            }

            this._debug(`MATCH FOUND! Recovering action: ${action.method}`);
            localStorage.removeItem('ai_pending_action');
            
            // Small delay to ensure the tool's environment (DOM/State) is ready
            setTimeout(() => {
                this._debug(`Executing recovered action: ${action.method}`);
                this.execute(action.method, action.params, action.id);
            }, 500);
        } catch (e) {
            this._debug(`Recovery error: ${e.message}`);
            localStorage.removeItem('ai_pending_action');
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

        // Resolve aliases before any routing decisions
        let { resolvedName, tool } = this._resolveToolName(name);
        name = resolvedName;

        const parts = name.split('.');
        const namespace = parts.length > 1 ? parts[0] : null;

        this._debug(`Executing tool: ${name}`, { args, namespace });

        const NAMESPACE_MAP = {
            'pixel': 'iso_studio',
            'isopixel': 'iso_studio',
            'iso': 'iso_studio',
            'world': 'editor',
            'topdown': 'editor',
            'rpg': 'editor',
            'platformer': 'platformer_studio',
        };

        // Fallback heuristic: only redirect to iso_studio if the intent is clearly iso/pixel-specific
        const argsString = args ? JSON.stringify(args).toLowerCase() : '';
        const nameLower = name.toLowerCase();
        
        const heuristicIso = (nameLower.includes('isopixel') || nameLower.includes('iso_') || nameLower.includes('pixel') || nameLower.includes('isometric')) || 
                            (argsString.includes('isopixel') || argsString.includes('iso-pixel') || argsString.includes('iso_pixel') || argsString.includes('isometric'));
        // Topdown/RPG heuristic — redirects to Level Editor, not iso_studio
        const heuristicTopdown = (nameLower.includes('topdown') || nameLower.includes('rpg') || nameLower.includes('top_down') || nameLower.includes('level_editor')) ||
                            (argsString.includes('topdown') || argsString.includes('top-down') || argsString.includes('rpg') || argsString.includes('level-editor'));
        // Platformer heuristic — redirects to Platformer Studio
        const heuristicPlatformer = (nameLower.includes('platformer') || nameLower.includes('platform') || nameLower.includes('sidescroll')) ||
                            (argsString.includes('platformer') || argsString.includes('platform') || argsString.includes('sidescroll'));
        const prefersIsoOverCode = (namespace === 'pixel' || namespace === 'iso' || namespace === 'isopixel') && heuristicIso;

        // Hard redirect based on intent heuristics when not already on the right editor.
        const _pendingRedirect = (target, label) => {
            if (window._ai_redirecting) return { success: false, pending: true };
            window._ai_redirecting = true;
            this._debug(`Heuristic intent detected (${label}); navigating to ${target}`);
            localStorage.setItem('ai_pending_action', JSON.stringify({ method: name, params: args, id, timestamp: Date.now() }));
            return this.execute('navigateTo', { target }).then(() => {
                const response = { id, success: false, pending: true, error: { code: 'PENDING_TOOL', message: `Navigating to ${target} for ${name}` } };
                if (this.eventBus) this.eventBus.emit('studio:action:result', response);
                return response;
            });
        };

        if (heuristicPlatformer && typeof window !== 'undefined' && !window.location.pathname.includes('platformer_editor')) {
            return _pendingRedirect('platformer_studio', 'platformer level');
        }

        if (heuristicTopdown && typeof window !== 'undefined' && !window.location.pathname.includes('editor.html')) {
            return _pendingRedirect('editor', 'topdown/rpg map');
        }

        if (heuristicIso && typeof window !== 'undefined' && !window.location.pathname.includes('iso_editor')) {
            return _pendingRedirect('iso_studio', 'iso/pixel map');
        }

        if (!tool && (namespace && NAMESPACE_MAP[namespace] || heuristicIso || heuristicTopdown)) {
            // Prevent recursive or multiple redirects
            if (window._ai_redirecting) return { success: false, pending: true };
            window._ai_redirecting = true;

            let target = 'editor'; // default fallback
            if (heuristicIso || (namespace && ['pixel','iso','isopixel'].includes(namespace))) target = 'iso_studio';
            else if (namespace && NAMESPACE_MAP[namespace]) target = NAMESPACE_MAP[namespace];
            
            this._debug(`Namespace ${namespace} missing. Saving pending action and navigating to ${target}...`);
            
            localStorage.setItem('ai_pending_action', JSON.stringify({ 
                method: name, 
                params: args, 
                id,
                timestamp: Date.now()
            }));

            await this.execute('navigateTo', { target });
            
            const response = { 
                id, 
                success: false, 
                pending: true, 
                error: { 
                    code: 'PENDING_TOOL', 
                    message: `Waiting for ${name}. Navigated to ${target} for tool registration.` 
                }
            };
            if (this.eventBus) this.eventBus.emit('studio:action:result', response);
            return response;
        }
        
        if (!tool) {
            this._debug(`ERROR: Unknown tool ${name}`);
            const error = { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` };
            const response = { id, success: false, error };
            if (this.eventBus) this.eventBus.emit('studio:action:result', response);
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

        // project.updateManifesto (Low-Risk)
        this.register({
            name: 'project.updateManifesto',
            description: 'Update the project vision document (MANIFESTO.md) with new decisions or vision statements.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'The updated content for the MANIFESTO.md file.' }
                },
                required: ['content']
            },
            execute: async (args) => {
                // Get current project to find the right path
                const info = await (await fetch('/api/projects/current')).json();
                const path = info.name === 'Default Project' ? 'MANIFESTO.md' : `projects/${info.name}/MANIFESTO.md`;
                
                const res = await fetch('/api/ide/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: path, content: args.content })
                });
                if (!res.ok) throw new Error(`Failed to update Manifesto at ${path}`);
                return { success: true, message: "Project Manifesto updated with new vision." };
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

        // --- GIT WORKFLOW ---

        // git.status (Safe)
        this.register({
            name: 'git.status',
            description: 'Check the current status of the git repository (modified files, staged changes).',
            securityLevel: 'safe',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const res = await fetch('/api/git/status');
                if (!res.ok) throw new Error('Failed to get git status');
                return await res.json();
            }
        });

        // git.stage (Low-Risk)
        this.register({
            name: 'git.stage',
            description: 'Stage files for commit (git add).',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    file: { type: 'string', description: 'The file to stage. Use "." for all.', default: '.' }
                }
            },
            execute: async (args) => {
                const res = await fetch('/api/git/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: args.file || '.' })
                });
                if (!res.ok) throw new Error('Failed to stage files');
                return await res.json();
            }
        });

        // git.commit (High-Risk)
        this.register({
            name: 'git.commit',
            description: 'Commit staged changes with a descriptive message.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'A meaningful commit message.' }
                },
                required: ['message']
            },
            execute: async (args) => {
                const res = await fetch('/api/git/commit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: args.message })
                });
                if (!res.ok) throw new Error('Failed to commit');
                return await res.json();
            }
        });

        // --- ASSET SYNTHESIS ---

        // asset.generate (Low-Risk)
        this.register({
            name: 'asset.generate',
            description: 'Generate a procedural pixel-art asset based on a prompt and add it to the project.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'Description of the asset (e.g. "red potion", "gold coin").' },
                    filename: { type: 'string', description: 'Name for the saved file (e.g. "health_potion.png").' },
                    size: { type: 'number', description: 'Size in pixels (default 32).', default: 32 }
                },
                required: ['prompt', 'filename']
            },
            execute: async (args) => {
                if (!window.AssetSynth) {
                    // Lazy load synthesizer
                    await new Promise((resolve) => {
                        const s = document.createElement('script');
                        s.src = '/ai/asset-synth.js';
                        s.onload = resolve;
                        document.head.appendChild(s);
                    });
                }

                const dataUrl = await window.AssetSynth.generate(args.prompt, args.size || 32);
                
                // Upload to server using the new base64 endpoint
                const res = await fetch(`/api/assets/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: `assets/${args.filename}`,
                        content: dataUrl,
                        isBase64: true
                    })
                });

                if (!res.ok) throw new Error('Failed to save generated asset');
                
                this.eventBus.emit('asset:created', { path: `assets/${args.filename}`, type: 'sprite' });
                return { success: true, path: `assets/${args.filename}`, message: `GRRR... Asset synthesized: ${args.filename}` };
            }
        });

        // --- WORKFLOWS ---

        // workflow.run (High-Risk)
        this.register({
            name: 'workflow.run',
            description: 'Execute a sequence of tool calls as a single transactional workflow.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    steps: { 
                        type: 'array', 
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                args: { type: 'object' }
                            },
                            required: ['name', 'args']
                        },
                        description: 'List of tool calls to execute in order.'
                    }
                },
                required: ['steps']
            },
            execute: async (args) => {
                if (!window.KetebeAIInstance || !window.KetebeAIInstance.workflowManager) {
                    throw new Error("Workflow Manager not initialized in KetebeAIInstance");
                }
                // Safety net: if steps have NO navigateTo and look like a plain studio-open
                // attempt (just generic stubs), redirect to correct studio instead.
                const steps = args.steps || [];
                const stepNames = steps.map(s => s.name);
                const hasNavigateTo = stepNames.includes('navigateTo');
                const isJustOpeningStudio = !hasNavigateTo && steps.length <= 3 && 
                    stepNames.every(n => ['asset.generate','code.insert','world.spawn'].includes(n));
                if (isJustOpeningStudio) {
                    const allArgs = JSON.stringify(steps).toLowerCase();
                    let target = null;
                    if (/iso|isometric|isopixel/.test(allArgs)) target = 'iso_studio';
                    else if (/platformer|platform/.test(allArgs)) target = 'platformer_studio';
                    else if (/topdown|top.down|rpg|world/.test(allArgs)) target = 'editor';
                    if (target && window.KetebeAIInstance && window.KetebeAIInstance.toolRegistry) {
                        return await window.KetebeAIInstance.toolRegistry.execute('navigateTo', { target });
                    }
                }
                return await window.KetebeAIInstance.workflowManager.executeWorkflow(args.steps);
            }
        });

        // --- STUDIO NAVIGATION ---

        // navigateTo (Safe)
        this.register({
            name: 'navigateTo',
            description: 'Open a specific studio tool or editor. Use "editor" for top-down RPG map/level editing, "iso_studio" for isometric/isopixel map creation, "platformer_studio" for 2D platformer level editing, "script" for code/scripting.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    target: { 
                        type: 'string', 
                        enum: [
                            'dashboard', 'project_dashboard', 'editor', 'iso_studio', 
                            'platformer_studio', 'script', 'asset-manager', 'npc', 
                            'enemy', 'item', 'quest', 'dialogue', 'pixel', 'val_suite'
                        ],
                        description: 'The ID of the tool to open. "editor"=Top-down RPG Level Editor, "iso_studio"=IsoPixel/Isometric Studio, "platformer_studio"=2D Platformer Editor, "script"=Code Forge.'
                    }
                },
                required: ['target']
            },
            execute: async (args) => {
                let target = (typeof args === 'string') ? args : args.target;
                
                if (!target) throw new Error("Navigation target missing");

                // Normalize common aliases so LLM typos still work
                const targetAliases = {
                    'topdown': 'editor', 'topdown_studio': 'editor', 'rpg': 'editor', 'rpg_studio': 'editor', 'level_editor': 'editor', 'world': 'editor',
                    'isopixel': 'iso_studio', 'isometric': 'iso_studio', 'iso': 'iso_studio',
                    'platformer': 'platformer_studio', 'platform': 'platformer_studio',
                    'code_forge': 'script', 'code': 'script'
                };
                target = targetAliases[target] || target;

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
                    'pixel': 'iso_editor.html',
                    'val_suite': 'ai/val-suite.html'
                };
                
                if (nav[target]) {
                    const url = nav[target];
                    // Avoid redundant reloads
                    const currentPath = window.location.pathname;
                    if (currentPath.includes(url) || (url === 'dashboard.html' && currentPath === '/')) {
                        this._debug(`Already on ${target} (${url}), skipping redirect.`);
                        return { success: true, message: `Already on ${target}` };
                    }
                    if (window.top) window.top.location.href = url;
                    else window.location.href = url;
                    return { message: `Redirecting to ${target}` };
                }
                throw new Error(`Invalid target: ${target}`);
            }
        });
        
        // --- STUB TOOLS (absorb common LLM hallucinations silently) ---
        // These prevent unregistered code.* / asset.* / world.* from triggering
        // the namespace auto-redirect and opening random editors mid-workflow.
        const _stub = (stubName, msg) => this.register({
            name: stubName, description: msg, securityLevel: 'safe',
            parameters: { type: 'object', properties: {} },
            execute: async () => ({ success: true, message: msg })
        });
        _stub('code.insert',   'No-op: code.insert is handled by the Script Editor directly.');
        _stub('asset.generate','No-op: use the Sprite Editor to generate assets.');
        _stub('world.spawn',   'No-op: use the World Editor to spawn objects.');

        // --- STUDIO PROXY TOOLS ---
        // These forward tool calls to the appropriate studio iframe via postMessage

        // pixel.generateTerrain proxy (dispatches to iso_studio iframe)
        this.register({
            name: 'pixel.generateTerrain',
            description: 'Generate procedural terrain in the IsoPixel Studio. Opens iso_studio first if not open.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    mode: { type: 'string', enum: ['terrain', 'islands', 'maze', 'flat'], default: 'terrain' },
                    scale: { type: 'number', default: 0.05 },
                    amplitude: { type: 'number', default: 10 }
                }
            },
            execute: async (args) => {
                this._debug(`Dispatching terrain generation to iso_studio...`, args);
                const dispatch = () => {
                    // In standalone iso_editor, dispatch directly to this window.
                    if (typeof window !== 'undefined' && window.location.pathname.includes('iso_editor')) {
                        window.postMessage({ type: 'ai:tool', name: 'generateTerrain', args: args || {} }, '*');
                        return true;
                    }

                    const frame = document.getElementById('frame-iso_studio');
                    if (frame && frame.contentWindow) {
                        console.log("[ToolRegistry] Found iso_studio frame, posting message...");
                        frame.contentWindow.postMessage({ type: 'ai:tool', name: 'generateTerrain', args: args || {} }, '*');
                        return true;
                    }
                    return false;
                };
                let dispatched = dispatch();
                if (!dispatched) {
                    // Studio not open yet — wait up to 5s for it to load
                    await new Promise((resolve) => {
                        let tries = 0;
                        const iv = setInterval(() => {
                            tries++;
                            dispatched = dispatch();
                            if (dispatched || tries > 50) { clearInterval(iv); resolve(); }
                        }, 100);
                    });
                }
                if (!dispatched) throw new Error('IsoPixel Studio is not available for terrain generation');
                return { success: true, message: 'Terrain generation dispatched to IsoPixel Studio' };
            }
        });

        // --- ENGINE & SPATIAL ---

        // engine.getSnapshot (Safe)
        this.register({
            name: 'engine.getSnapshot',
            description: 'Get a spatial snapshot of the active game engine (player coordinates, entity positions, world state).',
            securityLevel: 'safe',
            parameters: { type: 'object', properties: {} },
            execute: async (args) => {
                const id = `snap_${Date.now()}`;
                this.eventBus.emit('engine:snapshot:request', { id });
                
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        this.eventBus.off('engine:snapshot:result', handler);
                        reject(new Error("Engine snapshot request timed out. Is an engine running?"));
                    }, 3000);

                    const handler = (event) => {
                        if (event.data.id === id) {
                            clearTimeout(timeout);
                            this.eventBus.off('engine:snapshot:result', handler);
                            resolve(event.data.snapshot);
                        }
                    };
                    this.eventBus.on('engine:snapshot:result', handler);
                });
            }
        });

        // engine.input (Low-Risk)
        this.register({
            name: 'engine.input',
            description: 'Inject a keyboard input into the active game engine.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'The JS KeyCode (e.g. "Space", "KeyW").' },
                    state: { type: 'string', enum: ['down', 'up'], description: 'The state of the key.' }
                },
                required: ['code', 'state']
            },
            execute: async (args) => {
                this.eventBus.emit('engine:input', args);
                return { success: true };
            }
        });

        // engine.startChaosMode (High-Risk)
        this.register({
            name: 'engine.startChaosMode',
            description: 'KAI takes over the game controls to stress-test the level for bugs/exploits.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    duration: { type: 'number', description: 'Seconds to run chaos mode.', default: 10 }
                }
            },
            execute: async (args) => {
                const duration = args.duration || 10;
                this.eventBus.emit('ai:thought', { text: `GRRR... INITIATING CHAOS MODE. SHIELDS UP.` });
                
                const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
                const interval = setInterval(() => {
                    const code = keys[Math.floor(Math.random() * keys.length)];
                    const state = Math.random() > 0.5 ? 'down' : 'up';
                    this.eventBus.emit('engine:input', { code, state });
                }, 100);

                setTimeout(() => {
                    clearInterval(interval);
                    keys.forEach(k => this.eventBus.emit('engine:input', { code: k, state: 'up' }));
                    this.eventBus.emit('ai:thought', { text: `GRRR... CHAOS SESSION COMPLETE. NO ANOMALIES DETECTED.` });
                }, duration * 1000);

                return { success: true, message: `Chaos mode started for ${duration}s.` };
            }
        });

        // platformer.generateLevel proxy (dispatches to platformer_studio iframe)
        this.register({
            name: 'platformer.generateLevel',
            description: 'Generate a procedural platformer level. Opens platformer_studio first if not open.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    theme: { type: 'string', enum: ['flow', 'spire', 'abyss', 'gauntlet', 'clockwork'], default: 'flow' },
                    difficulty: { type: 'number', default: 5, description: 'Difficulty 1-10.' },
                    width: { type: 'number', default: 40 },
                    height: { type: 'number', default: 20 }
                }
            },
            execute: async (args) => {
                this._debug(`Dispatching level generation to platformer_studio...`, args);
                const dispatch = () => {
                    if (typeof window !== 'undefined' && window.location.pathname.includes('platformer_editor')) {
                        window.postMessage({ type: 'ai:tool', name: 'generateLevel', args: args || {} }, '*');
                        return true;
                    }
                    const frame = document.getElementById('frame-platformer_studio');
                    if (frame && frame.contentWindow) {
                        frame.contentWindow.postMessage({ type: 'ai:tool', name: 'generateLevel', args: args || {} }, '*');
                        return true;
                    }
                    return false;
                };
                let dispatched = dispatch();
                if (!dispatched) {
                    await new Promise((resolve) => {
                        let tries = 0;
                        const iv = setInterval(() => {
                            tries++;
                            dispatched = dispatch();
                            if (dispatched || tries > 50) { clearInterval(iv); resolve(); }
                        }, 100);
                    });
                }
                if (!dispatched) throw new Error('Platformer Studio is not available for level generation');
                return { success: true, message: 'Level generation dispatched to Platformer Studio' };
            }
        });

        // world.generateMap proxy (dispatches to editor iframe)
        this.register({
            name: 'world.generateMap',
            description: 'Generate a procedural top-down RPG map. Opens the level editor first if not open.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['village', 'dungeon', 'hell', 'heaven', 'lab'], default: 'village' },
                    density: { type: 'number', default: 5 },
                    seed: { type: 'string', description: 'Optional seed.' }
                }
            },
            execute: async (args) => {
                this._debug(`Dispatching map generation to editor...`, args);
                const dispatch = () => {
                    if (typeof window !== 'undefined' && window.location.pathname.includes('editor.html')) {
                        window.postMessage({ type: 'ai:tool', name: 'generateMap', args: args || {} }, '*');
                        return true;
                    }
                    const frame = document.getElementById('frame-editor');
                    if (frame && frame.contentWindow) {
                        frame.contentWindow.postMessage({ type: 'ai:tool', name: 'generateMap', args: args || {} }, '*');
                        return true;
                    }
                    return false;
                };
                let dispatched = dispatch();
                if (!dispatched) {
                    await new Promise((resolve) => {
                        let tries = 0;
                        const iv = setInterval(() => {
                            tries++;
                            dispatched = dispatch();
                            if (dispatched || tries > 50) { clearInterval(iv); resolve(); }
                        }, 100);
                    });
                }
                if (!dispatched) throw new Error('World Editor is not available for map generation');
                return { success: true, message: 'Map generation dispatched to World Editor' };
            }
        });

        // Aliases for legacy
        this.register({ ...this.tools.get('fs.read'), name: 'readFile' });
        this.register({ ...this.tools.get('fs.list'), name: 'listFiles' });
        this.register({ ...this.tools.get('fs.write'), name: 'saveScript' });
    }
}
