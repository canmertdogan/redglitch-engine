/**
 * VisualScriptEngine.js — Rewired (Phase 2026)
 * Full 80+ node type runtime for JSON graph execution.
 * ES module imported by Core.js for in-game visual script execution.
 */

export class VisualScriptEngine {
    constructor(gameContext) {
        this.game = gameContext;
        this.activeScripts = new Map();
        this.nodeRegistry = this.buildNodeRegistry();
        this.MAX_RECURSION_DEPTH = 100;
    }

    buildNodeRegistry() {
        const api = (ctx) => {
            if (!ctx._api) ctx._api = new window.LogicRuntime(this.game, ctx.entity);
            return ctx._api;
        };

        return {
            'evt_start': async (ctx) => this.executeOutputs(ctx, 'out'),
            'evt_tick': async (ctx) => this.executeOutputs(ctx, 'out'),
            'evt_interact': async (ctx) => this.executeOutputs(ctx, 'out'),
            'evt_collision': async (ctx) => this.executeOutputs(ctx, 'out'),
            'evt_input': async (ctx) => this.executeOutputs(ctx, 'out'),

            'flow_branch': async (ctx) => {
                const cond = this.resolveInput(ctx, 'cond');
                return this.executeOutputs(ctx, cond ? 'true' : 'false');
            },
            'flow_wait': async (ctx) => {
                const time = this.resolveInput(ctx, 'time') || 1;
                await new Promise(r => setTimeout(r, time * 1000));
                return this.executeOutputs(ctx, 'out');
            },
            'flow_reroute': (ctx) => this.resolveInput(ctx, 'in'),
            'flow_for': async (ctx) => {
                const count = this.resolveInput(ctx, 'count') || 10;
                for (let i = 0; i < count; i++) {
                    ctx.memory._loopIndex = i;
                    await this.executeOutputs(ctx, 'loop');
                }
                return this.executeOutputs(ctx, 'out');
            },
            'flow_for_loop': async (ctx) => {
                const count = this.resolveInput(ctx, 'count') || 10;
                for (let i = 0; i < count; i++) {
                    ctx.memory._loopIndex = i;
                    await this.executeOutputs(ctx, 'body');
                }
                return this.executeOutputs(ctx, 'out');
            },
            'flow_while': async (ctx) => {
                while (this.resolveInput(ctx, 'condition')) {
                    await this.executeOutputs(ctx, 'body');
                }
                return this.executeOutputs(ctx, 'out');
            },
            'flow_foreach': async (ctx) => {
                const arr = this.resolveInput(ctx, 'array') || [];
                for (let i = 0; i < arr.length; i++) {
                    ctx.memory._item = arr[i];
                    ctx.memory._loopIndex = i;
                    await this.executeOutputs(ctx, 'body');
                }
                return this.executeOutputs(ctx, 'out');
            },
            'flow_sequence': async (ctx) => {
                for (const port of ['step1', 'step2', 'step3']) {
                    await this.executeOutputs(ctx, port);
                }
                return this.executeOutputs(ctx, 'out');
            },
            'flow_switch': async (ctx) => {
                const val = String(this.resolveInput(ctx, 'value'));
                const cases = ['case0', 'case1', 'case2'];
                for (let i = 0; i < cases.length; i++) {
                    if (val === String(i)) {
                        await this.executeOutputs(ctx, cases[i]);
                        return this.executeOutputs(ctx, 'out');
                    }
                }
                await this.executeOutputs(ctx, 'default');
                return this.executeOutputs(ctx, 'out');
            },
            'comment_box': () => {},

            'eng_log': async (ctx) => {
                console.log(`[VSL] ${this.resolveInput(ctx, 'msg') || ''}`);
                return this.executeOutputs(ctx, 'out');
            },
            'eng_move': async (ctx) => {
                const entity = ctx.entity;
                if (entity) {
                    entity.x = this.resolveInput(ctx, 'x') || entity.x;
                    entity.y = this.resolveInput(ctx, 'y') || entity.y;
                }
                return this.executeOutputs(ctx, 'out');
            },
            'eng_ui': async (ctx) => {
                if (this.game?.showScreen) this.game.showScreen(ctx.node.data.screen || 'main_menu');
            },

            'data_self': (ctx) => ctx.entity,
            'data_player': (ctx) => this.game?.player,
            'env_time': (ctx) => this.game?.gameTime || 0,

            'math_add': (ctx) => (this.resolveInput(ctx, 'a') || 0) + (this.resolveInput(ctx, 'b') || 0),
            'math_sub': (ctx) => (this.resolveInput(ctx, 'a') || 0) - (this.resolveInput(ctx, 'b') || 0),
            'math_mul': (ctx) => (this.resolveInput(ctx, 'a') || 0) * (this.resolveInput(ctx, 'b') || 0),
            'math_div': (ctx) => {
                const b = this.resolveInput(ctx, 'b') || 1;
                return b !== 0 ? ((this.resolveInput(ctx, 'a') || 0) / b) : 0;
            },
            'math_rand': (ctx) => {
                const min = this.resolveInput(ctx, 'min') || 0;
                const max = this.resolveInput(ctx, 'max') || 1;
                return min + Math.random() * (max - min);
            },
            'math_expression': (ctx) => {
                const expr = ctx.node.data.expression || '';
                const a = this.resolveInput(ctx, 'a') || 0;
                const b = this.resolveInput(ctx, 'b') || 0;
                const c = this.resolveInput(ctx, 'c') || 0;
                if (!/^[0-9abc+\-*/().\s]+$/.test(expr)) return 0;
                try { return new Function('a', 'b', 'c', `return (${expr})`)(a, b, c); }
                catch { return 0; }
            },
            'vec2_dist': (ctx) => {
                const x1 = this.resolveInput(ctx, 'x1') || 0, y1 = this.resolveInput(ctx, 'y1') || 0;
                const x2 = this.resolveInput(ctx, 'x2') || 0, y2 = this.resolveInput(ctx, 'y2') || 0;
                return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            },
            'vec2_split': (ctx) => {
                const vec = this.resolveInput(ctx, 'vec') || { x: 0, y: 0 };
                return { x: vec.x, y: vec.y };
            },
            'vec2_combine': (ctx) => ({
                x: this.resolveInput(ctx, 'x') || 0,
                y: this.resolveInput(ctx, 'y') || 0
            }),
            'logic_eq': (ctx) => this.resolveInput(ctx, 'a') == this.resolveInput(ctx, 'b'),
            'logic_gt': (ctx) => this.resolveInput(ctx, 'a') > this.resolveInput(ctx, 'b'),
            'logic_gte': (ctx) => this.resolveInput(ctx, 'a') >= this.resolveInput(ctx, 'b'),
            'logic_lt': (ctx) => this.resolveInput(ctx, 'a') < this.resolveInput(ctx, 'b'),
            'logic_lte': (ctx) => this.resolveInput(ctx, 'a') <= this.resolveInput(ctx, 'b'),

            'var_get': (ctx) => {
                const name = ctx.node.data.name;
                return ctx.memory[name] !== undefined ? ctx.memory[name] : (this.game?.logicFlags?.[name] ?? 0);
            },
            'var_set': async (ctx) => {
                ctx.memory[ctx.node.data.name] = this.resolveInput(ctx, 'val');
                return this.executeOutputs(ctx, 'out');
            },

            'entity_get_nearby': (ctx) => api(ctx).getNearbyEntities(this.resolveInput(ctx, 'range') || 200, this.resolveInput(ctx, 'type') || null),
            'entity_get_by_name': (ctx) => api(ctx).getEntityByName(this.resolveInput(ctx, 'name') || ''),
            'entity_get_closest_enemy': (ctx) => api(ctx).getClosestEnemy(),
            'entity_get_all_enemies': (ctx) => api(ctx).getAllEnemies(),
            'entity_count_type': (ctx) => api(ctx).countEntitiesOfType(this.resolveInput(ctx, 'type') || ''),
            'entity_exists': (ctx) => api(ctx).entityExists(this.resolveInput(ctx, 'entityId') || ''),
            'entity_get_property': (ctx) => {
                const e = this.resolveInput(ctx, 'entity');
                const p = this.resolveInput(ctx, 'property') || 'hp';
                return e ? e[p] : null;
            },
            'entity_spawn': (ctx) => api(ctx).spawnEntity(this.resolveInput(ctx, 'type') || 'enemy', this.resolveInput(ctx, 'x') || 0, this.resolveInput(ctx, 'y') || 0),
            'entity_destroy': (ctx) => { const t = this.resolveInput(ctx, 'entity'); if (t?.id) api(ctx).destroyEntity(t.id); },
            'entity_move_to': (ctx) => api(ctx).moveEntity(this.resolveInput(ctx, 'entity'), this.resolveInput(ctx, 'x') || 0, this.resolveInput(ctx, 'y') || 0, this.resolveInput(ctx, 'speed') || 100),

            'player_get_position': (ctx) => api(ctx).getPlayerPosition(),
            'player_get_stat': (ctx) => api(ctx).getPlayerStat(this.resolveInput(ctx, 'stat') || 'hp'),
            'player_set_stat': (ctx) => api(ctx).setPlayerStat(this.resolveInput(ctx, 'stat') || 'hp', this.resolveInput(ctx, 'value') || 0),
            'player_damage': (ctx) => {
                const dmg = this.resolveInput(ctx, 'damage') || 10;
                api(ctx).setPlayerStat('hp', api(ctx).getPlayerStat('hp') - dmg);
            },
            'player_heal': (ctx) => {
                const amt = this.resolveInput(ctx, 'amount') || 20;
                api(ctx).setPlayerStat('hp', api(ctx).getPlayerStat('hp') + amt);
            },

            'inventory_has_item': (ctx) => api(ctx).hasItem(this.resolveInput(ctx, 'itemId') || ''),
            'inventory_get_count': (ctx) => api(ctx).getItemCount(this.resolveInput(ctx, 'itemId') || ''),
            'inventory_add_item': (ctx) => api(ctx).addItem(this.resolveInput(ctx, 'itemId') || '', this.resolveInput(ctx, 'count') || 1),
            'inventory_remove_item': (ctx) => api(ctx).removeItem(this.resolveInput(ctx, 'itemId') || '', this.resolveInput(ctx, 'count') || 1),
            'inventory_equip': (ctx) => api(ctx).equipItem(this.resolveInput(ctx, 'itemId') || '', this.resolveInput(ctx, 'slot') || 0),
            'inventory_unequip': (ctx) => api(ctx).unequipItem(this.resolveInput(ctx, 'slot') || 0),
            'inventory_get_all': (ctx) => api(ctx).getInventory(),

            'flag_set': (ctx) => api(ctx).setFlag(this.resolveInput(ctx, 'name') || '', this.resolveInput(ctx, 'value') !== undefined ? this.resolveInput(ctx, 'value') : true),
            'flag_get': (ctx) => api(ctx).getFlag(this.resolveInput(ctx, 'name') || ''),
            'flag_check': (ctx) => !!api(ctx).getFlag(this.resolveInput(ctx, 'name') || ''),
            'flag_clear': (ctx) => api(ctx).setFlag(this.resolveInput(ctx, 'name') || '', false),

            'quest_start': (ctx) => api(ctx).startQuest(this.resolveInput(ctx, 'questId') || ''),
            'quest_complete': (ctx) => api(ctx).completeQuest(this.resolveInput(ctx, 'questId') || ''),
            'quest_is_active': (ctx) => {
                const q = api(ctx).getQuestProgress(this.resolveInput(ctx, 'questId') || '');
                return q && q.status === 'active';
            },

            'data_save': (ctx) => api(ctx).saveGameState(this.resolveInput(ctx, 'key') || '', this.resolveInput(ctx, 'value')),
            'data_load': (ctx) => api(ctx).loadGameState(this.resolveInput(ctx, 'key') || ''),
            'data_delete': (ctx) => api(ctx).saveGameState(this.resolveInput(ctx, 'key') || '', undefined),

            'world_get_tile': (ctx) => {
                const tile = api(ctx).getTileAt(this.resolveInput(ctx, 'x') || 0, this.resolveInput(ctx, 'y') || 0);
                return tile ? tile.type || tile : null;
            },
            'world_set_tile': (ctx) => api(ctx).setTileAt(this.resolveInput(ctx, 'x') || 0, this.resolveInput(ctx, 'y') || 0, this.resolveInput(ctx, 'tile') || 'floor'),
            'world_remove_tile': (ctx) => api(ctx).setTileAt(this.resolveInput(ctx, 'x') || 0, this.resolveInput(ctx, 'y') || 0, null),
            'world_spawn_at': (ctx) => api(ctx).spawnEntity(this.resolveInput(ctx, 'type') || 'enemy', (this.resolveInput(ctx, 'tileX') || 0) * 48, (this.resolveInput(ctx, 'tileY') || 0) * 48),
            'world_get_spawn_point': (ctx) => {
                if (this.game?.getSpawnPoint) return this.game.getSpawnPoint(this.resolveInput(ctx, 'name') || 'player_start');
                return { x: 0, y: 0 };
            },

            'camera_shake': (ctx) => api(ctx).shakeCamera(this.resolveInput(ctx, 'intensity') || 5, this.resolveInput(ctx, 'duration') || 0.3),
            'camera_flash': (ctx) => api(ctx).flashScreen(`rgb(${this.resolveInput(ctx, 'r') || 255},${this.resolveInput(ctx, 'g') || 255},${this.resolveInput(ctx, 'b') || 255})`, this.resolveInput(ctx, 'duration') || 0.2),
            'camera_fade_in': (ctx) => api(ctx).fadeScreen('transparent', this.resolveInput(ctx, 'duration') || 1),
            'camera_fade_out': (ctx) => api(ctx).fadeScreen('#000000', this.resolveInput(ctx, 'duration') || 1),
            'camera_zoom': (ctx) => api(ctx).zoomCamera(this.resolveInput(ctx, 'zoom') || 1),
            'camera_follow': (ctx) => api(ctx).setCameraTarget(this.resolveInput(ctx, 'entity')),

            'fx_particle': (ctx) => api(ctx).spawnFX(this.resolveInput(ctx, 'type') || 'explosion', this.resolveInput(ctx, 'x') || 0, this.resolveInput(ctx, 'y') || 0),
            'fx_tint': (ctx) => { if (this.game?.applyTint) this.game.applyTint((this.resolveInput(ctx, 'r') || 0) / 255, (this.resolveInput(ctx, 'g') || 0) / 255, (this.resolveInput(ctx, 'b') || 0) / 255, this.resolveInput(ctx, 'alpha') || 0.3); },

            'audio_play': (ctx) => api(ctx).playSound(this.resolveInput(ctx, 'audioId') || '', this.resolveInput(ctx, 'volume') || 1, this.resolveInput(ctx, 'loop') || false),
            'audio_stop': (ctx) => { const id = this.resolveInput(ctx, 'audioId') || 'all'; if (id === 'all' && this.game?.audio?.stopAll) this.game.audio.stopAll(); else api(ctx).stopSound(id); },
            'audio_fade': (ctx) => api(ctx).fadeMusic(this.resolveInput(ctx, 'targetVolume') || 0, this.resolveInput(ctx, 'duration') || 1),

            'dialogue_show': async (ctx) => {
                await api(ctx).showDialogue(this.resolveInput(ctx, 'text') || '', this.resolveInput(ctx, 'speaker') || '');
            },
            'dialogue_choice': async (ctx) => {
                const options = (this.resolveInput(ctx, 'options') || 'Yes,No').split(',').map(s => s.trim());
                api(ctx).showDialogue('Choose:', null, options);
                if (this.game?.dialogueSystem) {
                    return new Promise(resolve => { this.game.dialogueSystem.onChoice = (idx) => resolve(parseInt(idx) || 0); });
                }
                return 0;
            },
            'dialogue_wait': async () => {
                if (this.game?.dialogueSystem?.active) {
                    await new Promise(resolve => {
                        const check = () => { if (!this.game?.dialogueSystem?.active) resolve(); else setTimeout(check, 100); };
                        check();
                    });
                }
            },
            'dialogue_close': (ctx) => { if (this.game?.dialogueSystem?.hide) this.game.dialogueSystem.hide(); },

            'time_wait': async (ctx) => { await new Promise(r => setTimeout(r, (this.resolveInput(ctx, 'seconds') || 1) * 1000)); },
            'time_get': (ctx) => api(ctx).getGameTime(),

            'custom': async (ctx) => {
                const customId = ctx.node.data.customId;
                if (this.game?.customNodeHandlers?.[customId]) {
                    await this.game.customNodeHandlers[customId](ctx, api(ctx));
                }
            }
        };
    }

    async runGraph(graph, entity, triggerEvent) {
        const entryNodes = graph.nodes.filter(n => {
            const t = n.type;
            return t === triggerEvent || t === `evt_${triggerEvent}` || triggerEvent === t.replace('evt_', '');
        });
        if (entryNodes.length === 0) return;
        if (!entity.scriptMemory) {
            entity.scriptMemory = {};
            if (graph.vars) graph.vars.forEach(v => { entity.scriptMemory[v.name] = v.value; });
        }
        const context = { graph, entity, memory: entity.scriptMemory, currentNode: null, depth: 0, _api: null };
        for (const node of entryNodes) {
            context.node = node;
            await this.executeNode(context, 0);
        }
    }

    async executeNode(ctx, depth = 0) {
        if (depth > this.MAX_RECURSION_DEPTH) return;
        ctx.depth = depth;
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.emit('vsl:node_exec', { nodeId: ctx.node.id, entityId: ctx.entity?.id, timestamp: Date.now() });
        }
        const handler = this.nodeRegistry[ctx.node.type];
        if (!handler) return;
        await handler(ctx);
    }

    async executeOutputs(ctx, portName) {
        const wires = ctx.graph.wires.filter(w => w.fromNode === ctx.node.id && w.fromPort === portName);
        for (const wire of wires) {
            const nextNode = ctx.graph.nodes.find(n => n.id === wire.toNode);
            if (nextNode) {
                const nextCtx = { ...ctx, node: nextNode };
                await this.executeNode(nextCtx, ctx.depth + 1);
            }
        }
    }

    resolveInput(ctx, portName) {
        let value = null;
        const wire = ctx.graph.wires.find(w => w.toNode === ctx.node.id && w.toPort === portName);
        if (wire) {
            const sourceNode = ctx.graph.nodes.find(n => n.id === wire.fromNode);
            if (sourceNode) {
                if (sourceNode.type === 'flow_reroute') {
                    value = this.resolveInput({ ...ctx, node: sourceNode }, 'in');
                } else {
                    const handler = this.nodeRegistry[sourceNode.type];
                    if (handler) {
                        const result = handler({ ...ctx, node: sourceNode });
                        if (result && typeof result === 'object' && result[wire.fromPort] !== undefined) {
                            value = result[wire.fromPort];
                        } else if (wire.fromPort === 'val' || wire.fromPort === 'res' || wire.fromPort === 'value' || wire.fromPort === 'time' || wire.fromPort === 'count' || wire.fromPort === 'dist') {
                            value = result;
                        } else if (wire.fromPort === 'x' || wire.fromPort === 'y') {
                            value = result?.[wire.fromPort];
                        } else {
                            value = result;
                        }
                    }
                }
            }
        } else {
            value = ctx.node.data[portName];
        }
        if (window.RedGlitchEventBus && wire) {
            window.RedGlitchEventBus.emit('vsl:value_update', { wireId: wire.id, value, timestamp: Date.now() });
        }
        return value;
    }
}
