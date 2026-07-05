import { PermissionGate } from './permission-gate.js?v=6';
import { NAMESPACE_ALIAS } from './namespace-router.js';
import { ACTION_STATUS, ERROR_CODE, createActionPlan, normalizeArguments, normalizeToolDefinition, validateSchema } from './automation-contract.mjs';
import { editorForTool } from './editor-catalog.mjs';
import { getAutomationFlags } from './automation-flags.mjs';

/**
 * RedGlitch AI - Tool Registry (KAP)
 * Registry of Command Bus actions that the AI can invoke across the Studio.
 */

export class ToolRegistry {
    constructor(eventBus = null) {
        this.eventBus = eventBus || window.RedGlitchEventBus;
        this.permissionGate = new PermissionGate();
        this.tools = new Map();
        this.inFlight = new Map();
        this.completedRequests = new Map();
        this.flags = getAutomationFlags();
        this.NAMESPACE_ALIAS = NAMESPACE_ALIAS;
        
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
        if (!this._debugThrottle) this._debugThrottle = 0;
        const now = Date.now();
        if (now - this._debugThrottle > 100 || msg.includes('Error')) {
            this.eventBus.emit('ai:debug:trace', trace);
            this._debugThrottle = now;
        }
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
            // Ignore our own announcements
            if (event.source === this.eventBus.getSource()) return;
            
            const toolDef = event.data;
            this._debug(`Tool discovered via announce: ${toolDef.name}`);
            if (this.tools.has(toolDef.name)) {
                this._debug(`Ignoring repeated capability announcement: ${toolDef.name}`);
                this._checkPendingAction(toolDef.name);
                return;
            }
            this.register(toolDef, false); // Register without re-broadcasting
            this._checkPendingAction(toolDef.name);
        });

        // Discovery Request: When a new AI component joins, it asks for all tools
        this.eventBus.on('ai:tool:discover', (event) => {
            // Only respond if we are the primary registry or the discovery came from elsewhere
            this._debug(`Discovery requested. Broadcasting all tools.`);
            for (const tool of this.tools.values()) {
                this.eventBus.emit('ai:tool:registered', { name: tool.name, definition: tool });
            }
        });

        // Remote request for tool execution (from IRAB/Assistant)
        this.eventBus.on('ai:command:request', async (event) => {
            if (!event || !event.data) return;
            // Ignore our own requests
            if (event.source === this.eventBus.getSource()) return;
            
            const request = event.data;
            this._debug(`Remote command request: ${request.method}`, request.params);
            try {
                const response = await this.execute(request.method, request.params, request.id);
                this.eventBus.emit('ai:command:result', response);
            } catch (error) {
                this._debug(`Remote command failed: ${request.method}`, error.message);
                this.eventBus.emit('ai:command:result', {
                    id: request.id,
                    success: false,
                    status: ACTION_STATUS.FAILED,
                    error: {
                        code: error.code || ERROR_CODE.EXECUTION_FAILED,
                        message: error.message || 'Unknown execution error'
                    }
                });
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
    register(toolDef, broadcast = true) {
        const compliantTool = normalizeToolDefinition({
            securityLevel: 'high-risk',
            requiresConfirmation: toolDef.requiresConfirmation !== false && toolDef.securityLevel !== 'safe',
            ...toolDef
        });
        if (this.flags.strictDuplicates && this.tools.has(compliantTool.name)) {
            const error = new Error(`Duplicate tool registration rejected: ${compliantTool.name}`);
            error.code = ERROR_CODE.DUPLICATE_TOOL;
            this._debug(`Error: ${error.message}`);
            throw error;
        }
        this.tools.set(compliantTool.name, compliantTool);
        
        this._debug(`Tool registered locally: ${compliantTool.name}`);

        if (this.eventBus && broadcast) {
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

        async _syncWithBackend() {
        const { syncWithBackend } = await import('./backend-sync.js');
        syncWithBackend(this);
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
     * @returns {Promise<redglitch.ai.ActionResponse>}
     */
    async execute(name, args, requestId = null) {
        const id = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        if (localStorage.getItem('kai_ai_enabled') !== 'true') {
            return { id, success: false, status: ACTION_STATUS.CANCELLED, error: { code: 'AI_DISABLED', message: 'AI features are disabled.' } };
        }

        if (this.completedRequests.has(id)) return this.completedRequests.get(id);
        if (this.inFlight.has(id)) return this.inFlight.get(id);
        const execution = this._execute(name, args, id);
        this.inFlight.set(id, execution);
        try {
            const response = await execution;
            if (!response?.pending) {
                this.completedRequests.set(id, response);
                if (this.completedRequests.size > 100) this.completedRequests.delete(this.completedRequests.keys().next().value);
            }
            return response;
        } finally {
            this.inFlight.delete(id);
        }
    }

    async _execute(name, args, id) {

        // Resolve aliases before any routing decisions
        let { resolvedName, tool } = this._resolveToolName(name);
        name = resolvedName;
        args = normalizeArguments(tool, args);

        const parts = name.split('.');
        const namespace = parts.length > 1 ? parts[0] : null;

        this._debug(`Executing tool: ${name}`, { args, namespace });

        const editor = this.flags.explicitCapabilityRouting ? editorForTool(name) : null;
        if (!tool && editor) {
            // Prevent recursive or multiple redirects
            if (window._ai_redirecting) return { success: false, pending: true };
            window._ai_redirecting = true;

            const target = editor.id;
            this._debug(`Capability ${namespace} unavailable. Navigating to ${target}.`);
            
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
                status: ACTION_STATUS.PENDING_EDITOR,
                error: { 
                    code: 'PENDING_EDITOR',
                    message: `Waiting for ${name}. Navigated to ${target} for tool registration.` 
                }
            };
            if (this.eventBus) this.eventBus.emit('studio:action:result', response);
            return response;
        }
        
        if (!tool) {
            this._debug(`ERROR: Unknown tool ${name}`);
            const error = { code: ERROR_CODE.UNKNOWN_TOOL, message: `Unknown tool: ${name}` };
            const response = { id, success: false, status: ACTION_STATUS.FAILED, error };
            if (this.eventBus) this.eventBus.emit('studio:action:result', response);
            return response;
        }

        const validationErrors = this.flags.contractValidation ? validateSchema(tool.inputSchema, args || {}) : [];
        if (validationErrors.length) {
            const response = { id, success: false, status: ACTION_STATUS.FAILED, error: { code: ERROR_CODE.INVALID_ARGUMENTS, message: validationErrors.join('; '), details: validationErrors } };
            this.eventBus?.emit('studio:action:result', response);
            return response;
        }

        this._debug(`Tool resolved: ${name}. Checking permissions...`);
        
        try {
            const requiresConfirmation = this.flags.approvalFirstMutations && tool.mutates;
            const isLowRisk = tool.risk === 'low';
            const plan = await createActionPlan(tool, args || {});
            
            if (isLowRisk) {
                this.eventBus.emit('ai:thought', { text: `GRRR... QUICK ACTION: ${name}` });
            }

            const allowed = await this.permissionGate.requestPermission(
                name, 
                args,
                requiresConfirmation,
                plan
            );

            if (!allowed) {
                this._debug(`Permission denied for ${name}`);
                const error = { code: ERROR_CODE.PERMISSION_DENIED, message: `User rejected action: ${name}` };
                const response = { id, success: false, status: ACTION_STATUS.CANCELLED, error };
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
            
            let result;
            if (typeof tool.execute === 'function') {
                this._debug(`Invoking local execution for ${name}`);
                result = await this._withTimeout(
                    Promise.resolve().then(() => tool.execute(args)),
                    tool.timeout,
                    `Tool execution timed out: ${name}`,
                    ERROR_CODE.TOOL_TIMEOUT
                );
            } else {
                this._debug(`Invoking remote execution for ${name}. Waiting for result...`);
                if (typeof tool.prepare === 'function') await tool.prepare(args);
                const resultPromise = this._waitForRemoteResult(id, tool.timeout);
                this.eventBus.emit('studio:action:execute', { id, workflowId: null, method: name, params: args });
                result = await resultPromise;
            }
            
            this._debug(`Execution success for ${name}`, result);
            
            // Record the action for undo/audit
            this.permissionGate.recordAction(name, args, result, result?.undoDescriptor || tool.undoDescriptor);
            
            const response = { id, success: true, status: ACTION_STATUS.SUCCEEDED, result };
            this.eventBus.emit('studio:action:result', response);
            this.eventBus.emit('ai:tool:success', { name, id, result });
            
            return response;
        } catch (error) {
            this._debug(`Execution error for ${name}`, error.message);
            const actionError = { 
                code: error.code || ERROR_CODE.EXECUTION_FAILED,
                message: error.message || 'Unknown execution error'
            };
            const response = { id, success: false, status: ACTION_STATUS.FAILED, error: actionError };
            this.eventBus.emit('studio:action:result', response);
            this.eventBus.emit('ai:tool:error', { name, id, error: actionError.message });
            return response;
        }
    }

    _withTimeout(promise, timeoutMs = 15000, message = 'Tool execution timed out', code = ERROR_CODE.EXECUTION_FAILED) {
        const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const error = new Error(message);
                error.code = code;
                reject(error);
            }, ms);

            promise.then(
                (value) => {
                    clearTimeout(timeout);
                    resolve(value);
                },
                (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            );
        });
    }

    async _waitForRemoteResult(requestId, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.eventBus.off('studio:action:result', handler);
                const error = new Error('Editor execution timed out');
                error.code = ERROR_CODE.EDITOR_TIMEOUT;
                reject(error);
            }, timeoutMs);

            const handler = (event) => {
                const response = event.data;
                if (response.id === requestId) {
                    clearTimeout(timeout);
                    this.eventBus.off('studio:action:result', handler);
                    if (response.success) resolve(response.result);
                    else {
                        const error = new Error(response.error?.message || "Remote execution failed");
                        error.code = response.error?.code || ERROR_CODE.EXECUTION_FAILED;
                        reject(error);
                    }
                }
            };

            this.eventBus.on('studio:action:result', handler);
        });
    }

    cancelPendingAction(requestId = null) {
        const raw = localStorage.getItem('ai_pending_action');
        if (!raw) return false;
        try {
            const action = JSON.parse(raw);
            if (requestId && action.id !== requestId) return false;
        } catch (_) {}
        localStorage.removeItem('ai_pending_action');
        window._ai_redirecting = false;
        return true;
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

        async _registerDefaults() {
        const { registerDefaultTools } = await import('./tool-definitions.js');
        registerDefaultTools(this);
    }
}
