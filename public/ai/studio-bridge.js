/**
 * RedGlitch AI - Studio Bridge (KAP)
 * Helper for Studio tools to register their capabilities with the AI ToolRegistry.
 * 
 * Usage:
 * const bridge = new StudioBridge('isopixel');
 * bridge.register({
 *   name: 'setPixel',
 *   description: 'Sets a pixel color at x, y',
 *   securityLevel: 'low-risk',
 *   parameters: { ... },
 *   execute: (args) => { ... }
 * });
 */

export class StudioBridge {
    /**
     * @param {string} namespace - The namespace for this tool (e.g., 'isopixel', 'world')
     * @param {redglitch.EventBus} eventBus - The global EventBus instance
     */
    constructor(namespace, eventBus = null) {
        this.namespace = namespace;
        this.eventBus = eventBus || window.RedGlitchEventBus;
        this.tools = new Map();
        
        if (!this.eventBus) {
            console.error(`[StudioBridge:${namespace}] EventBus not found. AI integration disabled.`);
            return;
        }

        this._setupListeners();
    }

    /**
     * Setup listeners for AI commands targeting this namespace.
     */
    _setupListeners() {
        // Listen for execution requests from ToolRegistry
        this.eventBus.on('studio:action:execute', async (event) => {
            if (!event || !event.data) return;
            const request = event.data;
            if (!request || !request.method) return;

            // PREVENT LOOPS: Only process if this bridge is in the window meant to handle this namespace
            const methodParts = request.method.split('.');
            if (methodParts.length < 2) return;

            const [ns, method] = methodParts;

            if (ns === this.namespace && this.tools.has(method)) {
                // Ignore our own events (local echoes from the same instance)
                if (event.source === this.eventBus.getSource()) {
                    return;
                }

                console.log(`%c[StudioBridge:${this.namespace}]%c Executing AI command: ${method}`, 'background: #2ecc71; color: #000; padding: 2px 5px;', '', request.params);

                
                try {
                    const tool = this.tools.get(method);
                    const result = await tool.execute(request.params);
                    
                    console.log(`%c[StudioBridge:${this.namespace}]%c Success: ${method}`, 'background: #2ecc71; color: #000; padding: 2px 5px;', '');

                    // Respond back through the registry's result channel
                    this.eventBus.emit('studio:action:result', {
                        id: request.id,
                        success: true,
                        result: result
                    });
                } catch (error) {
                    console.error(`[StudioBridge:${this.namespace}] Execution failed:`, error);
                    this.eventBus.emit('studio:action:result', {
                        id: request.id,
                        success: false,
                        error: {
                            code: 'EXECUTION_ERROR',
                            message: error.message || 'Unknown error during execution'
                        }
                    });
                }
            }
        });

        // Listen for discovery requests (if ToolRegistry reboots)
        this.eventBus.on('ai:tool:discover', () => {
            this.announceAll();
        });
    }

    /**
     * Register a tool capability.
     * @param {redglitch.ai.ToolDefinition} toolDef 
     */
    register(toolDef) {
        const fullName = `${this.namespace}.${toolDef.name}`;
        
        // Wrap the definition with the full name for the registry
        const registryDef = {
            ...toolDef,
            name: fullName
        };

        this.tools.set(toolDef.name, registryDef);
        
        // --- SMART ANNOUNCE ---
        // If we are in an iframe, we MUST ensure the PARENT'S registry knows about us.
        // If we are the parent, we announce to our own registry.
        this.eventBus.emit('studio:tool:announce', registryDef);
        
        console.log(`[StudioBridge:${this.namespace}] Registered tool: ${fullName}`);
    }

    /**
     * Re-announce all registered tools to the registry.
     */
    announceAll() {
        for (const tool of this.tools.values()) {
            this.eventBus.emit('studio:tool:announce', tool);
        }
    }
}

// Global export for non-module scripts
if (typeof window !== 'undefined') {
    window.StudioBridge = StudioBridge;
}
