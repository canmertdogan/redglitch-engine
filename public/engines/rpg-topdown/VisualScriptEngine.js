/**
 * VisualScriptEngine.js
 * Executes JSON-based Algorithm Graphs at runtime.
 * Replaces the old "String Builder" compiler.
 */

export class VisualScriptEngine {
    constructor(gameContext) {
        this.game = gameContext;
        this.activeScripts = new Map(); // entityId -> scriptState
        this.nodeRegistry = this.buildNodeRegistry();
    }

    /**
     * Define the behavior for every node type.
     */
    buildNodeRegistry() {
        return {
            // --- EVENTS ---
            'evt_start': async (ctx) => this.executeOutputs(ctx, 'out'),
            'evt_tick': async (ctx) => this.executeOutputs(ctx, 'out'),
            
            // --- FLOW ---
            'flow_branch': async (ctx) => {
                const condition = this.resolveInput(ctx, 'cond');
                if (condition) return this.executeOutputs(ctx, 'true');
                else return this.executeOutputs(ctx, 'false');
            },
            'flow_wait': async (ctx) => {
                const duration = this.resolveInput(ctx, 'time');
                await new Promise(r => setTimeout(r, duration * 1000));
                return this.executeOutputs(ctx, 'out');
            },
            'flow_reroute': async (ctx) => {
                const val = this.resolveInput(ctx, 'in');
                // Pass value through to any connected outputs
                const wires = ctx.graph.wires.filter(w => w.fromNode === ctx.node.id && w.fromPort === 'out');
                for (const wire of wires) {
                    const nextNode = ctx.graph.nodes.find(n => n.id === wire.toNode);
                    if (nextNode) {
                        await this.executeNode({ ...ctx, node: nextNode });
                    }
                }
                return val;
            },
            'eng_log': async (ctx) => {
                const msg = this.resolveInput(ctx, 'msg');
                console.log(`[VSL] ${msg}`);
                return this.executeOutputs(ctx, 'out');
            },

            // --- MATH ---
            'math_add': (ctx) => this.resolveInput(ctx, 'a') + this.resolveInput(ctx, 'b'),
            'math_sub': (ctx) => this.resolveInput(ctx, 'a') - this.resolveInput(ctx, 'b'),
            'logic_eq': (ctx) => this.resolveInput(ctx, 'a') == this.resolveInput(ctx, 'b'),

            // --- VARS ---
            'var_set': async (ctx) => {
                const name = ctx.node.data.name;
                const val = this.resolveInput(ctx, 'val');
                ctx.memory[name] = val;
                return this.executeOutputs(ctx, 'out');
            },
            'var_get': (ctx) => {
                const name = ctx.node.data.name;
                return ctx.memory[name] || 0;
            },
            
            // --- PHASE 6: MATH EXPANSION ---
            'math_expression': (ctx) => {
                const expr = ctx.node.data.expression;
                const a = this.resolveInput(ctx, 'a');
                const b = this.resolveInput(ctx, 'b');
                const c = this.resolveInput(ctx, 'c');
                try {
                    // Safe evaluation of simple math
                    const fn = new Function('a', 'b', 'c', `return ${expr}`);
                    return fn(a, b, c);
                } catch(e) { return 0; }
            },
            'vec2_dist': (ctx) => {
                const x1 = this.resolveInput(ctx, 'x1'), y1 = this.resolveInput(ctx, 'y1');
                const x2 = this.resolveInput(ctx, 'x2'), y2 = this.resolveInput(ctx, 'y2');
                return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
            },
            'vec2_normalize': (ctx) => {
                const x = this.resolveInput(ctx, 'x'), y = this.resolveInput(ctx, 'y');
                const len = Math.sqrt(x*x + y*y);
                return len > 0 ? { x: x/len, y: y/len } : { x: 0, y: 0 };
            },
            'vec2_split': (ctx) => {
                const vec = this.resolveInput(ctx, 'vec') || {x:0, y:0};
                return { x: vec.x, y: vec.y }; // Will be resolved by port
            },
            'vec2_combine': (ctx) => {
                return { x: this.resolveInput(ctx, 'x'), y: this.resolveInput(ctx, 'y') };
            },

            'data_self': (ctx) => {
                return ctx.entity;
            },
            'data_player': (ctx) => {
                return this.game.player;
            }
        };
    }

    /**
     * Run a script graph for a specific entity.
     */
    async runGraph(graph, entity, triggerEvent) {
        // Find entry nodes for this event
        const entryNodes = graph.nodes.filter(n => n.type === triggerEvent);
        if (entryNodes.length === 0) return;

        // Ensure entity has its own private memory
        if (!entity.scriptMemory) {
            entity.scriptMemory = {};
            // Initialize with default values from graph variables
            if (graph.vars) {
                graph.vars.forEach(v => {
                    entity.scriptMemory[v.name] = v.value;
                });
            }
        }

        const context = {
            graph: graph,
            entity: entity,
            memory: entity.scriptMemory,
            currentNode: null
        };

        // Execute all matching entry points
        for (const node of entryNodes) {
            context.node = node;
            await this.executeNode(context);
        }
    }

    async executeNode(ctx) {
        // --- PHASE 5: LIVE DEBUGGING ---
        if (window.VortexEventBus) {
            window.VortexEventBus.emit('vsl:node_exec', {
                nodeId: ctx.node.id,
                entityId: ctx.entity.id,
                timestamp: Date.now()
            });
        }

        const handler = this.nodeRegistry[ctx.node.type];
        if (!handler) {
            console.warn(`[VSL] Unknown node type: ${ctx.node.type}`);
            return;
        }
        await handler(ctx);
    }

    async executeOutputs(ctx, portName) {
        // Find wires connected to this output port
        const wires = ctx.graph.wires.filter(w => w.fromNode === ctx.node.id && w.fromPort === portName);
        
        for (const wire of wires) {
            const nextNode = ctx.graph.nodes.find(n => n.id === wire.toNode);
            if (nextNode) {
                // Create new context for next node, preserving memory/entity
                const nextCtx = { ...ctx, node: nextNode };
                await this.executeNode(nextCtx);
            }
        }
    }

    resolveInput(ctx, portName) {
        let value = null;
        let sourceNodeId = null;

        // 1. Check for incoming wire
        const wire = ctx.graph.wires.find(w => w.toNode === ctx.node.id && w.toPort === portName);
        if (wire) {
            sourceNodeId = wire.fromNode;
            const sourceNode = ctx.graph.nodes.find(n => n.id === wire.fromNode);
            if (sourceNode) {
                // If source is a reroute node, recursively resolve its input
                if (sourceNode.type === 'flow_reroute') {
                    value = this.resolveInput({ ...ctx, node: sourceNode }, 'in');
                } else {
                    const handler = this.nodeRegistry[sourceNode.type];
                    if (handler) {
                        const result = handler({ ...ctx, node: sourceNode });
                        // If result is object, route based on output port (for Split nodes)
                        if (typeof result === 'object' && result !== null && result[wire.fromPort] !== undefined) {
                            value = result[wire.fromPort];
                        } else {
                            value = result;
                        }
                    }
                }
            }
        } else {
            // 2. Fallback to hardcoded value
            value = ctx.node.data[portName];
        }

        // --- PHASE 5: DATA PROBES ---
        if (window.VortexEventBus && wire) {
            window.VortexEventBus.emit('vsl:value_update', {
                wireId: wire.id,
                value: value,
                timestamp: Date.now()
            });
        }

        return value;
    }
}
