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
        this.MAX_RECURSION_DEPTH = 100; // Phase 16: Prevent infinite loops
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
                        await this.executeNode({ ...ctx, node: nextNode }, ctx.depth);
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
            
            // --- PHASE 6: MATH EXPANSION & PHASE 16: SAFE EVAL ---
            'math_expression': (ctx) => {
                const expr = ctx.node.data.expression;
                const vars = {
                    a: this.resolveInput(ctx, 'a'),
                    b: this.resolveInput(ctx, 'b'),
                    c: this.resolveInput(ctx, 'c')
                };
                return this._safeMathEval(expr, vars);
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
     * Phase 16: Secure math evaluator (no eval/new Function)
     */
    _safeMathEval(expr, vars) {
        if (!expr) return 0;
        // Strict whitelist: numbers, a/b/c, math ops, parens
        if (!/^[0-9abc\+\-\*\/\(\)\.\s]+$/.test(expr)) {
            console.warn(`[VSL] Blocked unsafe math expression: ${expr}`);
            return 0;
        }
        
        try {
            // Replace variables
            let processed = expr
                .replace(/\ba\b/g, vars.a || 0)
                .replace(/\bb\b/g, vars.b || 0)
                .replace(/\bc\b/g, vars.c || 0);
            
            // Simple stack-based evaluator for basic arithmetic
            return this._parseInfix(processed);
        } catch(e) {
            return 0;
        }
    }

    _parseInfix(str) {
        const tokens = str.match(/\d+\.?\d*|[\+\-\*\/\(\)]/g);
        if (!tokens) return 0;

        const ops = [];
        const vals = [];
        const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };

        const applyOp = () => {
            const op = ops.pop();
            const right = vals.pop();
            const left = vals.pop();
            if (op === '+') vals.push(left + right);
            if (op === '-') vals.push(left - right);
            if (op === '*') vals.push(left * right);
            if (op === '/') vals.push(left / right);
        };

        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t === '(') {
                ops.push(t);
            } else if (t === ')') {
                while (ops.length && ops[ops.length - 1] !== '(') applyOp();
                ops.pop();
            } else if (precedence[t]) {
                while (ops.length && precedence[ops[ops.length - 1]] >= precedence[t]) applyOp();
                ops.push(t);
            } else {
                vals.push(parseFloat(t));
            }
        }
        while (ops.length) applyOp();
        return vals[0] || 0;
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
            currentNode: null,
            depth: 0
        };

        // Execute all matching entry points
        for (const node of entryNodes) {
            context.node = node;
            await this.executeNode(context, 0);
        }
    }

    async executeNode(ctx, depth = 0) {
        if (depth > this.MAX_RECURSION_DEPTH) {
            console.error(`[VSL] Max recursion depth (${this.MAX_RECURSION_DEPTH}) reached! Possible loop in graph.`);
            return;
        }
        ctx.depth = depth;

        // --- PHASE 5: LIVE DEBUGGING ---
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.emit('vsl:node_exec', {
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
                await this.executeNode(nextCtx, ctx.depth + 1);
            }
        }
    }

    resolveInput(ctx, portName) {
        let value = null;

        // 1. Check for incoming wire
        const wire = ctx.graph.wires.find(w => w.toNode === ctx.node.id && w.toPort === portName);
        if (wire) {
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
        if (window.RedGlitchEventBus && wire) {
            window.RedGlitchEventBus.emit('vsl:value_update', {
                wireId: wire.id,
                value: value,
                timestamp: Date.now()
            });
        }

        return value;
    }
}
