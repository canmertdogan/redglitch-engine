// AlgorithmRuntime.js - Executes Algorithm Studio visual scripts in-game
// Connects node-based logic to LogicRuntime API

window.AlgorithmRuntime = class AlgorithmRuntime {
    constructor(algorithmData, game, owner) {
        this.data = algorithmData; // Algorithm Studio JSON (nodes, wires, variables)
        this.game = game;
        this.owner = owner; // Entity running this script
        this.variables = new Map(); // Runtime variable storage
        this.logicAPI = new window.LogicRuntime(game, owner);
        this.isRunning = false;
        this.currentNode = null; // For debugging
        this.breakpoints = new Set(); // Node IDs with breakpoints
        this.debugMode = false;
        this.executionStack = []; // Call stack for error reporting
        
        console.log('[AlgorithmRuntime] Created for', owner.name || owner.id);
        
        // Initialize variables from algorithm data
        if (this.data.variables) {
            this.data.variables.forEach(v => {
                this.variables.set(v.name, v.value);
            });
        }
    }
    
    /**
     * Execute the algorithm starting from a specific event
     * @param {string} eventName - 'start', 'update', 'interact', 'collide', etc.
     * @param {object} context - Additional context data (deltaTime, other entity, etc.)
     */
    async execute(eventName = 'start', context = {}) {
        if (this.isRunning) {
            console.warn('[AlgorithmRuntime] Script already running, ignoring duplicate call');
            return;
        }
        
        this.isRunning = true;
        this.executionStack = [];
        
        try {
            // Find event node(s) matching this event
            const eventNodes = this.findEventNodes(eventName);
            
            if (eventNodes.length === 0) {
                console.log(`[AlgorithmRuntime] No ${eventName} event found in script`);
                this.isRunning = false;
                return;
            }
            
            // Execute each event node chain
            for (const eventNode of eventNodes) {
                await this.executeNodeChain(eventNode, context);
            }
            
            console.log(`[AlgorithmRuntime] Completed ${eventName} event`);
        } catch (error) {
            this.handleError(error, eventName);
        } finally {
            this.isRunning = false;
        }
    }
    
    /**
     * Find all event nodes matching the event name
     */
    findEventNodes(eventName) {
        if (!this.data.nodes) return [];
        
        const eventMap = {
            'start': ['evt_start'],
            'update': ['evt_update', 'evt_tick'],
            'interact': ['evt_interact'],
            'collide': ['evt_collision'],
            'key': ['evt_key', 'evt_input']
        };
        
        const eventTypes = eventMap[eventName] || [eventName];
        
        return this.data.nodes.filter(node => 
            eventTypes.includes(node.type)
        );
    }
    
    /**
     * Execute a node and follow its execution output
     */
    async executeNodeChain(node, context) {
        if (!node) return;
        
        this.currentNode = node;
        this.executionStack.push(node.id);
        
        // Check breakpoint
        if (this.breakpoints.has(node.id) && this.debugMode) {
            await this.handleBreakpoint(node);
        }
        
        try {
            // Execute this node
            await this.executeNode(node, context);
            
            // Find and execute next node(s) in chain
            const nextNodes = this.getNextNodes(node, 'out');
            for (const nextNode of nextNodes) {
                await this.executeNodeChain(nextNode, context);
            }
        } finally {
            this.executionStack.pop();
        }
    }
    
    /**
     * Execute a single node's logic
     */
    async executeNode(node, context) {
        const runtime = this.logicAPI;
        const vars = this.variables;
        
        switch (node.type) {
            // ============ EVENTS (entry points) ============
            case 'evt_start':
            case 'evt_update':
            case 'evt_tick':
            case 'evt_interact':
            case 'evt_collision':
            case 'evt_key':
            case 'evt_input':
                // Events don't execute logic, just entry points
                break;
            
            // ============ FLOW CONTROL ============
            case 'flow_branch':
            case 'flow_if': {
                const condition = this.resolveValue(node, 'condition');
                // Flow handled by getNextNodes() checking condition
                break;
            }
            
            case 'flow_wait':
            case 'flow_delay': {
                const seconds = this.resolveValue(node, 'seconds') || 1;
                await this.delay(seconds * 1000);
                break;
            }
            
            case 'flow_for':
            case 'flow_loop': {
                const count = this.resolveValue(node, 'count') || 10;
                for (let i = 0; i < count; i++) {
                    const loopBodyNode = this.getNextNodes(node, 'loop')[0];
                    if (loopBodyNode) {
                        await this.executeNodeChain(loopBodyNode, { ...context, index: i });
                    }
                }
                break;
            }
            
            // ============ VARIABLES ============
            case 'var_set': {
                const varName = node.data?.varName || this.resolveValue(node, 'name');
                const value = this.resolveValue(node, 'value');
                vars.set(varName, value);
                break;
            }
            
            case 'var_get': {
                // Value resolved when needed by resolveValue()
                break;
            }
            
            case 'var_inc': {
                const varName = node.data?.varName || this.resolveValue(node, 'name');
                const current = vars.get(varName) || 0;
                const amount = this.resolveValue(node, 'amount') || 1;
                vars.set(varName, current + amount);
                break;
            }
            
            case 'var_dec': {
                const varName = node.data?.varName || this.resolveValue(node, 'name');
                const current = vars.get(varName) || 0;
                const amount = this.resolveValue(node, 'amount') || 1;
                vars.set(varName, current - amount);
                break;
            }
            
            // ============ ENTITY OPERATIONS ============
            case 'entity_move':
            case 'eng_move': {
                const entity = this.resolveValue(node, 'entity') || this.owner;
                const x = this.resolveValue(node, 'x');
                const y = this.resolveValue(node, 'y');
                if (entity && x !== undefined && y !== undefined) {
                    entity.x = x;
                    entity.y = y;
                }
                break;
            }
            
            case 'entity_get_nearby': {
                const range = this.resolveValue(node, 'range') || 100;
                const type = this.resolveValue(node, 'type') || null;
                const result = runtime.getNearbyEntities(range, type);
                // Store result for output port
                node._outputCache = node._outputCache || {};
                node._outputCache.entities = result;
                break;
            }
            
            case 'entity_spawn': {
                const entityType = this.resolveValue(node, 'type');
                const x = this.resolveValue(node, 'x') || this.owner.x;
                const y = this.resolveValue(node, 'y') || this.owner.y;
                const spawned = runtime.spawnEntity(entityType, x, y);
                node._outputCache = node._outputCache || {};
                node._outputCache.entity = spawned;
                break;
            }
            
            case 'entity_destroy': {
                const entity = this.resolveValue(node, 'entity');
                if (entity) {
                    runtime.destroyEntity(entity);
                }
                break;
            }
            
            // ============ PLAYER/INVENTORY ============
            case 'player_get_stat': {
                const stat = this.resolveValue(node, 'stat') || 'hp';
                const value = runtime.getPlayerStat(stat);
                node._outputCache = node._outputCache || {};
                node._outputCache.value = value;
                break;
            }
            
            case 'player_set_stat': {
                const stat = this.resolveValue(node, 'stat') || 'hp';
                const value = this.resolveValue(node, 'value');
                runtime.setPlayerStat(stat, value);
                break;
            }
            
            case 'inventory_add_item': {
                const itemId = this.resolveValue(node, 'item');
                const count = this.resolveValue(node, 'count') || 1;
                runtime.addItem(itemId, count);
                break;
            }
            
            // ============ GAME STATE ============
            case 'flag_set': {
                const name = this.resolveValue(node, 'name');
                const value = this.resolveValue(node, 'value');
                runtime.setFlag(name, value);
                break;
            }
            
            case 'flag_get': {
                const name = this.resolveValue(node, 'name');
                const value = runtime.getFlag(name);
                node._outputCache = node._outputCache || {};
                node._outputCache.value = value;
                break;
            }
            
            // ============ AUDIO ============
            case 'audio_play': {
                const sound = this.resolveValue(node, 'sound');
                const volume = this.resolveValue(node, 'volume') || 1.0;
                runtime.playSound(sound, volume);
                break;
            }
            
            case 'audio_play_music': {
                const music = this.resolveValue(node, 'music');
                runtime.playMusic(music);
                break;
            }
            
            // ============ DIALOGUE ============
            case 'dialogue_show': {
                const text = this.resolveValue(node, 'text');
                const speaker = this.resolveValue(node, 'speaker') || '';
                await runtime.showDialogue(speaker, text);
                break;
            }
            
            // ============ DEBUG ============
            case 'debug_log':
            case 'eng_log': {
                const message = this.resolveValue(node, 'message') || this.resolveValue(node, 'msg') || 'Log';
                console.log(`[Algorithm] ${message}`);
                break;
            }
            
            case 'debug_draw_line': {
                const x1 = this.resolveValue(node, 'x1');
                const y1 = this.resolveValue(node, 'y1');
                const x2 = this.resolveValue(node, 'x2');
                const y2 = this.resolveValue(node, 'y2');
                runtime.drawDebugLine(x1, y1, x2, y2);
                break;
            }
            
            default:
                console.warn(`[AlgorithmRuntime] Unknown node type: ${node.type}`);
        }
    }
    
    /**
     * Resolve a node's input port value (from wire or default)
     */
    resolveValue(node, portId) {
        // Check if input port has incoming wire
        const wire = this.findIncomingWire(node.id, portId);
        
        if (wire) {
            // Get value from source node's output
            const sourceNode = this.getNodeById(wire.fromNode);
            if (sourceNode) {
                return this.getNodeOutputValue(sourceNode, wire.fromPort);
            }
        }
        
        // No wire, use default value from node data
        if (node.data && node.data[portId] !== undefined) {
            return node.data[portId];
        }
        
        // Check defaults object
        const nodeDefinition = this.getNodeDefinition(node.type);
        if (nodeDefinition?.defaults && nodeDefinition.defaults[portId] !== undefined) {
            return nodeDefinition.defaults[portId];
        }
        
        return undefined;
    }
    
    /**
     * Get output value from a node's output port
     */
    getNodeOutputValue(node, portId) {
        // Check cached output from execution
        if (node._outputCache && node._outputCache[portId] !== undefined) {
            return node._outputCache[portId];
        }
        
        // Evaluate based on node type
        switch (node.type) {
            case 'var_get': {
                const varName = node.data?.varName;
                return this.variables.get(varName);
            }
            
            case 'math_add': {
                const a = this.resolveValue(node, 'a') || 0;
                const b = this.resolveValue(node, 'b') || 0;
                return a + b;
            }
            
            case 'math_sub': {
                const a = this.resolveValue(node, 'a') || 0;
                const b = this.resolveValue(node, 'b') || 0;
                return a - b;
            }
            
            case 'math_mul': {
                const a = this.resolveValue(node, 'a') || 0;
                const b = this.resolveValue(node, 'b') || 0;
                return a * b;
            }
            
            case 'math_div': {
                const a = this.resolveValue(node, 'a') || 0;
                const b = this.resolveValue(node, 'b') || 1;
                return b !== 0 ? a / b : 0;
            }
            
            case 'math_random': {
                return Math.random();
            }
            
            case 'math_random_range': {
                const min = this.resolveValue(node, 'min') || 0;
                const max = this.resolveValue(node, 'max') || 1;
                return min + Math.random() * (max - min);
            }
            
            case 'logic_equal': {
                const a = this.resolveValue(node, 'a');
                const b = this.resolveValue(node, 'b');
                return a === b;
            }
            
            case 'logic_greater': {
                const a = this.resolveValue(node, 'a');
                const b = this.resolveValue(node, 'b');
                return a > b;
            }
            
            case 'logic_less': {
                const a = this.resolveValue(node, 'a');
                const b = this.resolveValue(node, 'b');
                return a < b;
            }
            
            case 'logic_and': {
                const a = this.resolveValue(node, 'a');
                const b = this.resolveValue(node, 'b');
                return a && b;
            }
            
            case 'logic_or': {
                const a = this.resolveValue(node, 'a');
                const b = this.resolveValue(node, 'b');
                return a || b;
            }
            
            case 'logic_not': {
                const a = this.resolveValue(node, 'a');
                return !a;
            }
            
            case 'data_self': {
                return this.owner;
            }
            
            case 'data_player': {
                return this.game.player;
            }
            
            case 'env_time': {
                return this.game.time || 0;
            }
            
            default:
                return undefined;
        }
    }
    
    /**
     * Get next nodes connected to a node's output port
     */
    getNextNodes(node, portId = 'out') {
        const wires = this.findOutgoingWires(node.id, portId);
        const nextNodes = [];
        
        wires.forEach(wire => {
            const nextNode = this.getNodeById(wire.toNode);
            if (nextNode) {
                // For branch nodes, check condition
                if (node.type === 'flow_branch' || node.type === 'flow_if') {
                    const condition = this.resolveValue(node, 'condition');
                    if ((portId === 'true' && condition) || (portId === 'false' && !condition) || portId === 'out') {
                        nextNodes.push(nextNode);
                    }
                } else {
                    nextNodes.push(nextNode);
                }
            }
        });
        
        return nextNodes;
    }
    
    // ============ HELPER METHODS ============
    
    getNodeById(id) {
        return this.data.nodes?.find(n => n.id === id);
    }
    
    getNodeDefinition(type) {
        // Would reference LIB from algorithm_editor.js
        // For now return null, will be enhanced later
        return null;
    }
    
    findIncomingWire(nodeId, portId) {
        return this.data.wires?.find(w => 
            w.toNode === nodeId && w.toPort === portId
        );
    }
    
    findOutgoingWires(nodeId, portId) {
        return this.data.wires?.filter(w => 
            w.fromNode === nodeId && w.fromPort === portId
        ) || [];
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    handleBreakpoint(node) {
        console.log(`[AlgorithmRuntime] Breakpoint hit at node ${node.id}`);
        // Future: Send message to editor for debugging UI
        return Promise.resolve();
    }
    
    handleError(error, eventName) {
        console.error(`[AlgorithmRuntime] Error in ${eventName}:`, error);
        
        // Send error to editor if opened from Algorithm Studio
        if (window.opener) {
            window.opener.postMessage({
                type: 'algorithmError',
                scriptName: this.data.name,
                eventName: eventName,
                nodeId: this.currentNode?.id,
                error: error.message,
                stack: this.executionStack,
                fullStack: error.stack
            }, '*');
        }
        
        // Show in-game notification
        if (this.game.showNotification) {
            this.game.showNotification(`Script Error: ${error.message}`, 3);
        }
    }
}
