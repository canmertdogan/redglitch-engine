/**
 * LogicInterpreter.js
 * Executes JSON-based Algorithm ASTs at runtime.
 * Provides a safe, sandboxed execution environment for visual scripts.
 */

window.LogicInterpreter = class LogicInterpreter {
    constructor(game) {
        this.game = game;
        this.nodeRegistry = this.buildNodeRegistry();
        this.MAX_RECURSION_DEPTH = 100;
    }

    /**
     * Define handlers for all node types.
     * Handlers receive (ctx) and return a value or a promise.
     */
    buildNodeRegistry() {
        const api = (ctx) => new window.LogicRuntime(this.game, ctx.entity);

        return {
            // --- FLOW CONTROL ---
            'flow_branch': async (ctx) => {
                const condition = await this.resolveValue(ctx, 'cond');
                if (condition) await this.executeChain(ctx.node.true, ctx);
                else await this.executeChain(ctx.node.false, ctx);
            },
            'flow_wait': async (ctx) => {
                const time = await this.resolveValue(ctx, 'time');
                await api(ctx).wait(time || 1.0);
            },
            'flow_sequence': async (ctx) => {
                if (ctx.node.steps) {
                    for (const step of ctx.node.steps) {
                        await this.executeChain(step, ctx);
                    }
                }
            },
            'flow_for_loop': async (ctx) => {
                const count = await this.resolveValue(ctx, 'count') || 0;
                for (let i = 0; i < count; i++) {
                    // Inject loop index into local memory
                    const localCtx = { ...ctx, memory: { ...ctx.memory, index: i } };
                    await this.executeChain(ctx.node.body, localCtx);
                }
            },

            // --- ENGINE ACTIONS ---
            'eng_log': async (ctx) => {
                const msg = await this.resolveValue(ctx, 'msg');
                console.log(`[LogicInterpreter] ${msg}`);
            },
            'entity_spawn': async (ctx) => {
                const type = await this.resolveValue(ctx, 'type');
                const x = await this.resolveValue(ctx, 'x');
                const y = await this.resolveValue(ctx, 'y');
                return api(ctx).spawnEntity(type, x, y);
            },
            'entity_destroy': async (ctx) => {
                const target = await this.resolveValue(ctx, 'entity');
                if (target && target.id) api(ctx).destroyEntity(target.id);
            },
            'entity_move_to': async (ctx) => {
                const target = await this.resolveValue(ctx, 'entity');
                const x = await this.resolveValue(ctx, 'x');
                const y = await this.resolveValue(ctx, 'y');
                const speed = await this.resolveValue(ctx, 'speed');
                api(ctx).moveEntity(target, x, y, speed);
            },

            // --- PLAYER & WORLD ---
            'player_add_item': async (ctx) => {
                const item = await this.resolveValue(ctx, 'item');
                const count = await this.resolveValue(ctx, 'count');
                api(ctx).addItem(item, count);
            },
            'flag_set': async (ctx) => {
                const name = await this.resolveValue(ctx, 'name');
                const val = await this.resolveValue(ctx, 'value');
                api(ctx).setFlag(name, val);
            },
            'dialogue_show': async (ctx) => {
                const text = await this.resolveValue(ctx, 'text');
                const speaker = await this.resolveValue(ctx, 'speaker');
                api(ctx).showDialogue(text, speaker);
            },

            // --- MATH & LOGIC ---
            'math_add': async (ctx) => (await this.resolveValue(ctx, 'a') || 0) + (await this.resolveValue(ctx, 'b') || 0),
            'math_sub': async (ctx) => (await this.resolveValue(ctx, 'a') || 0) - (await this.resolveValue(ctx, 'b') || 0),
            'logic_eq': async (ctx) => (await this.resolveValue(ctx, 'a')) == (await this.resolveValue(ctx, 'b')),
            'logic_gt': async (ctx) => (await this.resolveValue(ctx, 'a')) > (await this.resolveValue(ctx, 'b')),

            // --- DATA SOURCES ---
            'data_self': (ctx) => ctx.entity,
            'data_player': (ctx) => this.game.player,
            'var_get': (ctx) => {
                const name = ctx.node.data.name;
                return ctx.memory[name] || (this.game.logicFlags ? this.game.logicFlags[name] : 0);
            }
        };
    }

    /**
     * Run an AST for a specific event trigger.
     */
    async runEvent(ast, entity, eventName, customData = {}) {
        if (!ast || !ast.events || !ast.events[eventName]) return;

        // Ensure entity has memory
        if (!entity.logicMemory) entity.logicMemory = {};
        
        const context = {
            ast: ast,
            entity: entity,
            memory: entity.logicMemory,
            customData: customData,
            depth: 0
        };

        const chain = ast.events[eventName];
        if (Array.isArray(chain)) {
            await this.executeChain(chain, context);
        }
    }

    /**
     * Execute a sequential chain of AST nodes.
     */
    async executeChain(chain, ctx) {
        if (!chain || !Array.isArray(chain)) return;

        for (const node of chain) {
            await this.executeNode(node, ctx);
        }
    }

    /**
     * Execute a single node and recursively its 'next' links.
     */
    async executeNode(node, ctx) {
        if (ctx.depth > this.MAX_RECURSION_DEPTH) return;
        
        const currentCtx = { ...ctx, node: node, depth: ctx.depth + 1 };

        // Debugging
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.emit('vsl:node_exec', {
                nodeId: node.id,
                entityId: ctx.entity.id,
                timestamp: Date.now()
            });
        }

        const handler = this.nodeRegistry[node.type];
        if (handler) {
            const result = await handler(currentCtx);
            
            // If the handler didn't already handle 'next' (like branch/loop), handle it here
            if (node.next && !['flow_branch', 'flow_switch', 'flow_for_loop', 'flow_while', 'flow_foreach'].includes(node.type)) {
                await this.executeChain(node.next, currentCtx);
            }
            
            return result;
        } else {
            console.warn(`[LogicInterpreter] Unhandled node type: ${node.type}`);
            if (node.next) await this.executeChain(node.next, currentCtx);
        }
    }

    /**
     * Resolve an input value (either hardcoded in data or from a nested source).
     * In the new AST, data is already populated, but we might eventually support
     * nested value nodes in the AST. For now, it mostly reads from node.data.
     */
    async resolveValue(ctx, portName) {
        // Future proofing: check if the port data is actually another node to evaluate
        const val = ctx.node.data[portName];
        
        // If the value is a placeholder for a variable or expression, handle it
        if (typeof val === 'string' && val.startsWith('$')) {
            const varName = val.substring(1);
            return ctx.memory[varName] || (this.game.logicFlags ? this.game.logicFlags[varName] : 0);
        }
        
        return val;
    }
};
