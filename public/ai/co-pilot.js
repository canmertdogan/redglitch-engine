/**
 * RedGlitch AI - Co-Pilot (Phase 10)
 * Proactive, context-aware assistance.
 * Monitors EventBus for user patterns and suggests actions.
 */

export class CoPilot {
    constructor(redglitchAI, eventBus) {
        this.ai = redglitchAI;
        this.eventBus = eventBus;
        this.enabled = true;
        this.lastActionTime = Date.now();
        this.actionHistory = [];
        this.preferences = this.loadPreferences();
        this.chaosInterval = null;
        
        this.setupListeners();
        this.startIdleMonitor();
        this.registerInternalTools();
    }

    registerInternalTools() {
        if (!this.ai.toolRegistry) return;

        this.ai.toolRegistry.register({
            name: 'ai.chaosMode',
            description: 'Activate or deactivate dry-run automation validation. No tools are executed.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    active: { type: 'boolean', description: 'Whether to enable or disable chaos.' }
                },
                required: ['active']
            },
            execute: async (args) => {
                if (args.active) this.startChaosMode();
                else this.stopChaosMode();
                return { success: true, message: `Chaos mode ${args.active ? 'activated' : 'deactivated'}` };
            }
        });
    }

    startChaosMode() {
        if (this.chaosInterval) return;
        this.suggest("GRRR... CHAOS MODE ENGAGED! I'm going to try and break your game now. Buckle up.");
        
        this.chaosInterval = setInterval(async () => {
            const tools = this.ai.toolRegistry.listTools().filter(t => t.securityLevel !== 'high-risk');
            if (tools.length === 0) return;

            const tool = tools[Math.floor(Math.random() * tools.length)];
            const args = this._generateRandomArgs(tool);
            
            console.log(`[Chaos] Executing random action: ${tool.name}`, args);
            try {
                this.eventBus.emit('ai:chaos:probe', { tool: tool.name, args, dryRun: true });
            } catch (e) {
                console.warn(`[Chaos] Dry-run probe failed: ${tool.name}`, e);
            }
        }, 2000); // Action every 2 seconds
    }

    stopChaosMode() {
        if (this.chaosInterval) {
            clearInterval(this.chaosInterval);
            this.chaosInterval = null;
            this.suggest("Chaos mode disengaged. Your engine survived... for now.");
        }
    }

    _generateRandomArgs(tool) {
        const args = {};
        if (!tool.parameters || !tool.parameters.properties) return args;

        for (const [key, prop] of Object.entries(tool.parameters.properties)) {
            if (prop.type === 'number') {
                args[key] = Math.floor(Math.random() * 20); // Safe default range
            } else if (prop.type === 'string' && prop.enum) {
                args[key] = prop.enum[Math.floor(Math.random() * prop.enum.length)];
            } else if (key === 'tileID') {
                args[key] = Math.floor(Math.random() * 100);
            } else if (key === 'content' || key === 'code') {
                args[key] = `// Chaos update ${Date.now()}\nconsole.log("IRAB WAS HERE");`;
            }
        }
        return args;
    }

    setupListeners() {
        if (!this.eventBus) return;

        // Listen for all studio events to learn patterns
        this.eventBus.on('*', (event) => {
            if (!this.enabled) return;
            this.handleEvent(event);
        });

        // Listen for errors specifically
        this.eventBus.on('system:error', (data) => this.handleError(data));
        this.eventBus.on('editor:error', (data) => this.handleError(data));
    }

    handleEvent(event) {
        this.lastActionTime = Date.now();
        this.actionHistory.push({ type: event.type, timestamp: event.timestamp });
        if (this.actionHistory.length > 20) this.actionHistory.shift();

        // Pattern: Created a Sprite -> Suggest creating a Script
        if (event.type === 'asset:sprite:created') {
            this.suggest(`I see you created a new sprite: ${event.data.id}. Want me to generate a template logic script for it?`, [
                { label: 'Yes, create script', action: 'code.createTemplate', args: { name: event.data.id } },
                { label: 'No thanks', action: 'dismiss' }
            ]);
        }

        // Pattern: Placed a Door -> Suggest adding a portal trigger
        if (event.type === 'map:updated' && event.data.lastAction === 'placed:door') {
            this.suggest("You placed a door. Should I add a transition trigger to it?", [
                { label: 'Add Trigger', action: 'world.addTrigger', args: { x: event.data.x, y: event.data.y, type: 'portal' } }
            ]);
        }
    }

    handleError(error) {
        if (!this.enabled) return;
        console.log("[Co-Pilot] Error detected:", error);
        this.suggest(`Grrr! I detected an error: ${error.message || 'Unknown error'}. Want me to analyze and try to fix it?`, [
            { label: 'Fix it for me', action: 'ai.analyzeError', args: { error } },
            { label: 'Ignore', action: 'dismiss' }
        ]);
    }

    startIdleMonitor() {
        setInterval(() => {
            if (!this.enabled) return;
            const idleTime = (Date.now() - this.lastActionTime) / 1000 / 60; // minutes
            
            if (idleTime > 5) {
                // Proactive tip when idle
                this.eventBus.emit('ai:thought', { 
                    text: "You've been quiet for a while. Need a random pro tip or a joke?" 
                });
                this.lastActionTime = Date.now(); // Reset to avoid spam
            }
        }, 60000);
    }

    /**
     * Show a proactive suggestion to the user.
     */
    suggest(text, actions = []) {
        if (!this.enabled) return;
        this.eventBus.emit('ai:suggestion', { text, actions });
        // Also use TTS if available
        if (window.RedGlitchThoughtVisualizer) {
            window.RedGlitchThoughtVisualizer.speak(text);
        }
    }

    loadPreferences() {
        const saved = localStorage.getItem('redglitch_ai_prefs');
        return saved ? JSON.parse(saved) : {
            namingStyle: 'snake_case',
            autoSave: true,
            complexity: 'beginner'
        };
    }

    savePreference(key, value) {
        this.preferences[key] = value;
        localStorage.setItem('redglitch_ai_prefs', JSON.stringify(this.preferences));
    }
}
