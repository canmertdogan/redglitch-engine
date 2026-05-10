/**
 * Ketebe Engine - Shared Logic System
 * Manages entity logic, visual scripts, and algorithm runtimes
 */
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
};