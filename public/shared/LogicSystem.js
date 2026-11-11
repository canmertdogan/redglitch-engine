/**
 * Redglitch Engine - Shared Logic System
 * Manages entity logic, visual scripts, and algorithm runtimes
 */
window.LogicSystem = class LogicSystem {
    constructor(game) {
        this.game = game;
        this.scripts = new Map();
        this.runtimes = new Map();
        this.algorithmRuntimes = new Map();
        this.algorithms = new Map();
        this.loadedScripts = new Set();
        this._algorithmEntities = new Map();
        
        this.interpreter = new window.LogicInterpreter(game);
        this.behaviorRunners = new Map();
    }

    static ensure(game, { tick = false } = {}) {
        if (!window.LogicSystem) return null;
        if (!game.logicSystem) {
            game.logicSystem = new window.LogicSystem(game);
        }
        if (tick) {
            const orig = game._logicTickBound || null;
            if (!orig) {
                const bound = (dt) => { try { game.logicSystem.updateAll(dt); } catch (e) { console.error('LogicSystem Error:', e); } };
                game._logicTickBound = bound;
                game._tickLogic = bound;
            }
        }
        return game.logicSystem;
    }
    
    async loadScript(scriptName) {
        if (this.loadedScripts.has(scriptName)) {
            return this.scripts.get(scriptName);
        }
        
        try {
            const url = `/api/logic/js/${scriptName}`;
            const module = await import(url);
            this.scripts.set(scriptName, module);
            this.loadedScripts.add(scriptName);
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
            const astUrl = `/api/logic/ast/${algorithmName}`;
            const astRes = await fetch(astUrl);
            if (astRes.ok) {
                const ast = await astRes.json();
                this.algorithms.set(algorithmName, ast);
                return ast;
            }

            const url = `/api/logic/${algorithmName}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            this.algorithms.set(algorithmName, data);
            return data;
        } catch (error) {
            console.error(`[LogicSystem] Failed to load algorithm ${algorithmName}:`, error);
            return null;
        }
    }

    async loadBrainAST(brainName) {
        try {
            const res = await fetch(`/api/brains/ast/${brainName}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {}
        return null;
    }
    
    async attachToEntity(entity, scriptName, events = ['start', 'update']) {
        if (!entity || !scriptName) return;
        
        // Detect if this is an Algorithm Studio script (.algorithm) or regular .js
        const isAlgorithm = scriptName.endsWith('.algorithm') || scriptName.includes('.algorithm');
        
        if (isAlgorithm) {
            // Load algorithm data
            const algorithmData = await this.loadAlgorithm(scriptName);
            if (!algorithmData) {
                return;
            }
            
            entity.algorithmScript = scriptName;
            entity.algorithmEvents = events;
            this.trackAlgorithmEntity(entity);
            
            if (algorithmData.events) {
            } else {
                const AlgorithmRuntime = window.AlgorithmRuntime;
                if (!AlgorithmRuntime) {
                    console.error('[LogicSystem] AlgorithmRuntime class not loaded!');
                    return;
                }
                
                const runtime = new AlgorithmRuntime(algorithmData, this.game, entity);
                this.algorithmRuntimes.set(entity.id, runtime);
                entity.algorithmRuntime = runtime;
            }
            
            if (events.includes('start')) {
                await this.trigger(entity, 'start');
            }
        } else {
            const brainAST = await this.loadBrainAST(scriptName);
            if (brainAST) {
                const runner = new window.BehaviorTreeRunner(this.game, entity);
                this.behaviorRunners.set(entity.id, runner);
                entity.behaviorAST = scriptName;
                runner.start(brainAST);
                return;
            }

            const module = await this.loadScript(scriptName);
            if (!module) return;
            // Generator-style brains (BrainRuntime coroutine): instantiate if module exports a brain function
            if (window.BrainRuntime && (module.brain || module.default || module.generator)) {
                const fn = module.brain || module.default || module.generator;
                if (typeof fn === 'function') { try { entity.brainRuntime = new window.BrainRuntime(entity, fn); this.behaviorRunners.set(entity.id, entity.brainRuntime); this.trackAlgorithmEntity(entity); entity.algorithmEvents = ['update']; entity.algorithmScript = scriptName; } catch(e){ console.warn('[LogicSystem] BrainRuntime failed', e);} }
                return;
            }
            
            const runtime = new window.LogicRuntime(this.game, entity);
            this.runtimes.set(entity.id, runtime);
            
            entity.logicScript = scriptName;
            entity.logicRuntime = runtime;
            entity.logicEvents = events;
            entity.logicState = {};
            
            if (events.includes('start')) {
                await this.trigger(entity, 'start');
            }
        }
    }
    
    async trigger(entity, eventName, data = {}) {
        if (!entity) return;
        
        // V2.0: Check for Visual Script AST
        if (entity.algorithmScript) {
            const scriptName = entity.algorithmScript;
            const ast = this.algorithms.get(scriptName);
            
            if (ast && ast.events) {
                // Execute using new LogicInterpreter
                await this.interpreter.runEvent(ast, entity, `evt_${eventName}`, data);
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
            return;
        }
        
        try {
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
            }
        } catch (error) {
            console.error(`[LogicSystem] Error executing ${eventName} for ${entity.logicScript}:`, error);
        }
    }
    
    async updateAll(dt) {
        // regular script runtimes
        for (const [entityId, runtime] of this.runtimes) {
            const entity = runtime.owner;
            if (entity && entity.logicScript && entity.logicEvents?.includes('update')) {
                await this.trigger(entity, 'update', { dt });
            }
        }
        // algorithm (AST) entities — attached via attachToEntity but not in runtimes
        for (const [entityId, entity] of this._algorithmEntities || []) {
            if (entity && entity.algorithmEvents?.includes('update')) {
                await this.trigger(entity, 'update', { dt });
            }
        }
    }

    trackAlgorithmEntity(entity) {
        if (!entity) return;
        if (!this._algorithmEntities) this._algorithmEntities = new Map();
        this._algorithmEntities.set(entity.id, entity);
    }
    
    detach(entity) {
        if (!entity) return;
        
        this.runtimes.delete(entity.id);
        delete entity.logicScript;
        delete entity.logicRuntime;
        delete entity.logicEvents;
        delete entity.logicState;
    }
    
    async reload(scriptName) {
        this.loadedScripts.delete(scriptName);
        this.scripts.delete(scriptName);
        
        for (const [entityId, runtime] of this.runtimes) {
            if (runtime.owner.logicScript === scriptName) {
                await this.loadScript(scriptName);
            }
        }
    }

    async reloadAlgorithm(algorithmName) {
        this.algorithms.delete(algorithmName);
        
        await this.loadAlgorithm(algorithmName);
        
        for (const [entityId, runtime] of this.algorithmRuntimes) {
            if (runtime.owner && runtime.owner.algorithmScript === algorithmName) {
                const entity = runtime.owner;
                this.algorithmRuntimes.delete(entityId);
                await this.attachToEntity(entity, algorithmName, entity.algorithmEvents || ['start', 'update']);
            }
        }
    }
};