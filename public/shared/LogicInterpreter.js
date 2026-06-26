/**
 * LogicInterpreter.js — Rewired (Phase 2026)
 * Full 80+ node type runtime for Algorithm Studio ASTs.
 * Executes the compiled AST format from AlgorithmStudio.compileToAST().
 */
window.LogicInterpreter = class LogicInterpreter {
    constructor(game) {
        this.game = game;
        this.nodeRegistry = this.buildNodeRegistry();
        this.MAX_RECURSION_DEPTH = 100;
    }

    buildNodeRegistry() {
        const api = (ctx) => {
            if (!ctx._api) ctx._api = new window.LogicRuntime(this.game, ctx.entity);
            return ctx._api;
        };

        return {
            'eng_log': async (ctx) => {
                console.log(`[VSL] ${await this.resolveValue(ctx, 'msg') || ''}`);
            },
            'eng_move': async (ctx) => {
                const entity = ctx.entity;
                if (!entity) return;
                entity.x = await this.resolveValue(ctx, 'x') || entity.x;
                entity.y = await this.resolveValue(ctx, 'y') || entity.y;
            },
            'data_self': (ctx) => ctx.entity,
            'data_player': (ctx) => this.game.player,
            'env_time': (ctx) => this.game.gameTime || 0,

            'math_add': async (ctx) => (await this.resolveValue(ctx, 'a') || 0) + (await this.resolveValue(ctx, 'b') || 0),
            'math_sub': async (ctx) => (await this.resolveValue(ctx, 'a') || 0) - (await this.resolveValue(ctx, 'b') || 0),
            'math_mul': async (ctx) => (await this.resolveValue(ctx, 'a') || 0) * (await this.resolveValue(ctx, 'b') || 0),
            'math_div': async (ctx) => {
                const b = await this.resolveValue(ctx, 'b') || 1;
                return b !== 0 ? ((await this.resolveValue(ctx, 'a') || 0) / b) : 0;
            },
            'math_rand': async (ctx) => {
                const min = await this.resolveValue(ctx, 'min') || 0;
                const max = await this.resolveValue(ctx, 'max') || 1;
                return min + Math.random() * (max - min);
            },
            'math_expression': async (ctx) => {
                const expr = ctx.node.data.expression || '';
                const a = await this.resolveValue(ctx, 'a') || 0;
                const b = await this.resolveValue(ctx, 'b') || 0;
                const c = await this.resolveValue(ctx, 'c') || 0;
                if (!/^[0-9abc\+\-\*\/\(\)\.\s]+$/.test(expr)) return 0;
                try {
                    const fn = new Function('a', 'b', 'c', `return (${expr})`);
                    return fn(a, b, c);
                } catch { return 0; }
            },
            'vec2_dist': async (ctx) => {
                const x1 = await this.resolveValue(ctx, 'x1') || 0, y1 = await this.resolveValue(ctx, 'y1') || 0;
                const x2 = await this.resolveValue(ctx, 'x2') || 0, y2 = await this.resolveValue(ctx, 'y2') || 0;
                return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            },
            'vec2_split': async (ctx) => {
                const vec = await this.resolveValue(ctx, 'vec') || { x: 0, y: 0 };
                return { x: vec.x, y: vec.y };
            },
            'vec2_combine': async (ctx) => ({
                x: await this.resolveValue(ctx, 'x') || 0,
                y: await this.resolveValue(ctx, 'y') || 0
            }),
            'logic_eq': async (ctx) => (await this.resolveValue(ctx, 'a')) == (await this.resolveValue(ctx, 'b')),
            'logic_gt': async (ctx) => (await this.resolveValue(ctx, 'a')) > (await this.resolveValue(ctx, 'b')),
            'logic_gte': async (ctx) => (await this.resolveValue(ctx, 'a')) >= (await this.resolveValue(ctx, 'b')),
            'logic_lt': async (ctx) => (await this.resolveValue(ctx, 'a')) < (await this.resolveValue(ctx, 'b')),
            'logic_lte': async (ctx) => (await this.resolveValue(ctx, 'a')) <= (await this.resolveValue(ctx, 'b')),

            'var_get': (ctx) => {
                const name = ctx.node.data.name;
                return ctx.memory[name] !== undefined ? ctx.memory[name] : (this.game.logicFlags ? this.game.logicFlags[name] : 0);
            },
            'var_set': async (ctx) => {
                const name = ctx.node.data.name;
                const val = await this.resolveValue(ctx, 'val');
                ctx.memory[name] = val;
            },
            'eng_ui': async (ctx) => {
                const screen = ctx.node.data.screen || 'main_menu';
                if (this.game.showScreen) this.game.showScreen(screen);
            },

            'flow_branch': async (ctx) => {
                const condition = await this.resolveValue(ctx, 'cond');
                if (condition) await this.executeChain(ctx.node.true, ctx);
                else await this.executeChain(ctx.node.false, ctx);
            },
            'flow_wait': async (ctx) => {
                const time = await this.resolveValue(ctx, 'time') || 1;
                await api(ctx).wait(time);
            },
            'flow_reroute': async (ctx) => {
                const val = await this.resolveValue(ctx, 'in');
                return val !== undefined ? val : ctx.node.data.val;
            },
            'flow_for': async (ctx) => {
                // Legacy flow_for — maps 'loop' (body) and 'out' (done) ports
                const count = await this.resolveValue(ctx, 'count') || 0;
                for (let i = 0; i < count; i++) {
                    const local = { ...ctx, memory: { ...ctx.memory, index: i } };
                    await this.executeChain(ctx.node.body || ctx.node.loop, local);
                }
                if (ctx.node.next) await this.executeChain(ctx.node.next, ctx);
            },
            'flow_for_loop': async (ctx) => {
                const count = await this.resolveValue(ctx, 'count') || 0;
                for (let i = 0; i < count; i++) {
                    const local = { ...ctx, memory: { ...ctx.memory, index: i } };
                    await this.executeChain(ctx.node.body, local);
                }
                if (ctx.node.next) await this.executeChain(ctx.node.next, ctx);
            },
            'flow_while': async (ctx) => {
                while (await this.resolveValue(ctx, 'condition')) {
                    await this.executeChain(ctx.node.body, ctx);
                }
                if (ctx.node.next) await this.executeChain(ctx.node.next, ctx);
            },
            'flow_foreach': async (ctx) => {
                const arr = await this.resolveValue(ctx, 'array') || [];
                for (let i = 0; i < arr.length; i++) {
                    const local = { ...ctx, memory: { ...ctx.memory, item: arr[i], index: i } };
                    await this.executeChain(ctx.node.body, local);
                }
                if (ctx.node.next) await this.executeChain(ctx.node.next, ctx);
            },
            'flow_sequence': async (ctx) => {
                if (ctx.node.steps) {
                    for (const step of ctx.node.steps) {
                        await this.executeChain(step, ctx);
                    }
                }
            },
            'flow_switch': async (ctx) => {
                const val = await this.resolveValue(ctx, 'value');
                const strVal = String(val);
                if (ctx.node.cases) {
                    for (let i = 0; i <= 2; i++) {
                        const caseKey = `case${i}`;
                        if (strVal === String(i) && ctx.node.cases[caseKey]) {
                            await this.executeChain(ctx.node.cases[caseKey], ctx);
                            return;
                        }
                    }
                    if (ctx.node.cases.default) await this.executeChain(ctx.node.cases.default, ctx);
                }
            },

            'entity_get_nearby': async (ctx) => {
                const range = await this.resolveValue(ctx, 'range') || 200;
                const type = await this.resolveValue(ctx, 'type') || null;
                return api(ctx).getNearbyEntities(range, type);
            },
            'entity_get_by_name': async (ctx) => {
                const name = await this.resolveValue(ctx, 'name') || '';
                return api(ctx).getEntityByName(name);
            },
            'entity_get_closest_enemy': (ctx) => api(ctx).getClosestEnemy(),
            'entity_get_all_enemies': (ctx) => api(ctx).getAllEnemies(),
            'entity_count_type': async (ctx) => {
                const type = await this.resolveValue(ctx, 'type') || '';
                return api(ctx).countEntitiesOfType(type);
            },
            'entity_exists': async (ctx) => {
                const id = await this.resolveValue(ctx, 'entityId') || '';
                return api(ctx).entityExists(id);
            },
            'entity_get_property': async (ctx) => {
                const entity = await this.resolveValue(ctx, 'entity');
                const prop = await this.resolveValue(ctx, 'property') || 'hp';
                return entity ? entity[prop] : null;
            },
            'entity_spawn': async (ctx) => {
                const type = await this.resolveValue(ctx, 'type') || 'enemy';
                const x = await this.resolveValue(ctx, 'x') || 0;
                const y = await this.resolveValue(ctx, 'y') || 0;
                return api(ctx).spawnEntity(type, x, y);
            },
            'entity_destroy': async (ctx) => {
                const target = await this.resolveValue(ctx, 'entity');
                if (target && target.id) api(ctx).destroyEntity(target.id);
            },
            'entity_move_to': async (ctx) => {
                const target = await this.resolveValue(ctx, 'entity');
                const x = await this.resolveValue(ctx, 'x') || 0;
                const y = await this.resolveValue(ctx, 'y') || 0;
                const speed = await this.resolveValue(ctx, 'speed') || 100;
                api(ctx).moveEntity(target, x, y, speed);
            },

            'player_get_position': (ctx) => api(ctx).getPlayerPosition(),
            'player_get_stat': async (ctx) => {
                const stat = await this.resolveValue(ctx, 'stat') || 'hp';
                return api(ctx).getPlayerStat(stat);
            },
            'player_set_stat': async (ctx) => {
                const stat = await this.resolveValue(ctx, 'stat') || 'hp';
                const value = await this.resolveValue(ctx, 'value') || 0;
                api(ctx).setPlayerStat(stat, value);
            },
            'player_damage': async (ctx) => {
                const dmg = await this.resolveValue(ctx, 'damage') || 10;
                const hp = api(ctx).getPlayerStat('hp');
                api(ctx).setPlayerStat('hp', hp - dmg);
            },
            'player_heal': async (ctx) => {
                const amt = await this.resolveValue(ctx, 'amount') || 20;
                const hp = api(ctx).getPlayerStat('hp');
                api(ctx).setPlayerStat('hp', hp + amt);
            },

            'inventory_has_item': async (ctx) => {
                const itemId = await this.resolveValue(ctx, 'itemId') || '';
                return api(ctx).hasItem(itemId);
            },
            'inventory_get_count': async (ctx) => {
                const itemId = await this.resolveValue(ctx, 'itemId') || '';
                return api(ctx).getItemCount(itemId);
            },
            'inventory_add_item': async (ctx) => {
                const itemId = await this.resolveValue(ctx, 'itemId') || '';
                const count = await this.resolveValue(ctx, 'count') || 1;
                api(ctx).addItem(itemId, count);
            },
            'inventory_remove_item': async (ctx) => {
                const itemId = await this.resolveValue(ctx, 'itemId') || '';
                const count = await this.resolveValue(ctx, 'count') || 1;
                api(ctx).removeItem(itemId, count);
            },
            'inventory_equip': async (ctx) => {
                const itemId = await this.resolveValue(ctx, 'itemId') || '';
                const slot = await this.resolveValue(ctx, 'slot') || 0;
                api(ctx).equipItem(itemId, slot);
            },
            'inventory_unequip': async (ctx) => {
                const slot = await this.resolveValue(ctx, 'slot') || 0;
                api(ctx).unequipItem(slot);
            },
            'inventory_get_all': (ctx) => api(ctx).getInventory(),

            'flag_set': async (ctx) => {
                const name = await this.resolveValue(ctx, 'name') || '';
                const value = await this.resolveValue(ctx, 'value') !== undefined ? await this.resolveValue(ctx, 'value') : true;
                api(ctx).setFlag(name, value);
            },
            'flag_get': async (ctx) => {
                const name = await this.resolveValue(ctx, 'name') || '';
                return api(ctx).getFlag(name);
            },
            'flag_check': async (ctx) => {
                const name = await this.resolveValue(ctx, 'name') || '';
                return !!api(ctx).getFlag(name);
            },
            'flag_clear': async (ctx) => {
                const name = await this.resolveValue(ctx, 'name') || '';
                api(ctx).setFlag(name, false);
            },

            'quest_start': async (ctx) => {
                const questId = await this.resolveValue(ctx, 'questId') || '';
                api(ctx).startQuest(questId);
            },
            'quest_complete': async (ctx) => {
                const questId = await this.resolveValue(ctx, 'questId') || '';
                api(ctx).completeQuest(questId);
            },
            'quest_is_active': async (ctx) => {
                const questId = await this.resolveValue(ctx, 'questId') || '';
                const q = api(ctx).getQuestProgress(questId);
                return q && q.status === 'active';
            },

            'data_save': async (ctx) => {
                const key = await this.resolveValue(ctx, 'key') || '';
                const value = await this.resolveValue(ctx, 'value');
                api(ctx).saveGameState(key, value);
            },
            'data_load': async (ctx) => {
                const key = await this.resolveValue(ctx, 'key') || '';
                return api(ctx).loadGameState(key);
            },
            'data_delete': async (ctx) => {
                const key = await this.resolveValue(ctx, 'key') || '';
                api(ctx).saveGameState(key, undefined);
            },

            'world_get_tile': async (ctx) => {
                const x = await this.resolveValue(ctx, 'x') || 0;
                const y = await this.resolveValue(ctx, 'y') || 0;
                const tile = api(ctx).getTileAt(x, y);
                return tile ? tile.type || tile : null;
            },
            'world_set_tile': async (ctx) => {
                const x = await this.resolveValue(ctx, 'x') || 0;
                const y = await this.resolveValue(ctx, 'y') || 0;
                const tile = await this.resolveValue(ctx, 'tile') || 'floor';
                api(ctx).setTileAt(x, y, tile);
            },
            'world_remove_tile': async (ctx) => {
                const x = await this.resolveValue(ctx, 'x') || 0;
                const y = await this.resolveValue(ctx, 'y') || 0;
                api(ctx).setTileAt(x, y, null);
            },
            'world_spawn_at': async (ctx) => {
                const type = await this.resolveValue(ctx, 'type') || 'enemy';
                const tileX = await this.resolveValue(ctx, 'tileX') || 0;
                const tileY = await this.resolveValue(ctx, 'tileY') || 0;
                return api(ctx).spawnEntity(type, tileX * 48, tileY * 48);
            },
            'world_get_spawn_point': async (ctx) => {
                const name = await this.resolveValue(ctx, 'name') || 'player_start';
                if (this.game.getSpawnPoint) return this.game.getSpawnPoint(name);
                return { x: 0, y: 0 };
            },

            'camera_shake': async (ctx) => {
                const intensity = await this.resolveValue(ctx, 'intensity') || 5;
                const duration = await this.resolveValue(ctx, 'duration') || 0.3;
                api(ctx).shakeCamera(intensity, duration);
            },
            'camera_flash': async (ctx) => {
                const r = await this.resolveValue(ctx, 'r') || 255;
                const g = await this.resolveValue(ctx, 'g') || 255;
                const b = await this.resolveValue(ctx, 'b') || 255;
                const duration = await this.resolveValue(ctx, 'duration') || 0.2;
                api(ctx).flashScreen(`rgb(${r},${g},${b})`, duration);
            },
            'camera_fade_in': async (ctx) => {
                const duration = await this.resolveValue(ctx, 'duration') || 1;
                api(ctx).fadeScreen('transparent', duration);
            },
            'camera_fade_out': async (ctx) => {
                const duration = await this.resolveValue(ctx, 'duration') || 1;
                api(ctx).fadeScreen('#000000', duration);
            },
            'camera_zoom': async (ctx) => {
                const zoom = await this.resolveValue(ctx, 'zoom') || 1;
                api(ctx).zoomCamera(zoom);
            },
            'camera_follow': async (ctx) => {
                const entity = await this.resolveValue(ctx, 'entity');
                api(ctx).setCameraTarget(entity);
            },

            'fx_particle': async (ctx) => {
                const type = await this.resolveValue(ctx, 'type') || 'explosion';
                const x = await this.resolveValue(ctx, 'x') || 0;
                const y = await this.resolveValue(ctx, 'y') || 0;
                api(ctx).spawnFX(type, x, y);
            },
            'fx_tint': async (ctx) => {
                const r = await this.resolveValue(ctx, 'r') || 0;
                const g = await this.resolveValue(ctx, 'g') || 0;
                const b = await this.resolveValue(ctx, 'b') || 0;
                const alpha = await this.resolveValue(ctx, 'alpha') || 0.3;
                if (this.game.applyTint) this.game.applyTint(r / 255, g / 255, b / 255, alpha);
            },

            'audio_play': async (ctx) => {
                const audioId = await this.resolveValue(ctx, 'audioId') || '';
                const volume = await this.resolveValue(ctx, 'volume') || 1;
                const loop = await this.resolveValue(ctx, 'loop') || false;
                api(ctx).playSound(audioId, volume, loop);
            },
            'audio_stop': async (ctx) => {
                const audioId = await this.resolveValue(ctx, 'audioId') || 'all';
                if (audioId === 'all' && this.game.audio?.stopAll) this.game.audio.stopAll();
                else api(ctx).stopSound(audioId);
            },
            'audio_fade': async (ctx) => {
                const targetVolume = await this.resolveValue(ctx, 'targetVolume') || 0;
                const duration = await this.resolveValue(ctx, 'duration') || 1;
                api(ctx).fadeMusic(targetVolume, duration);
            },

            'dialogue_show': async (ctx) => {
                const text = await this.resolveValue(ctx, 'text') || '';
                const speaker = await this.resolveValue(ctx, 'speaker') || '';
                await api(ctx).showDialogue(text, speaker);
            },
            'dialogue_choice': async (ctx) => {
                const options = (await this.resolveValue(ctx, 'options') || 'Yes,No').split(',').map(s => s.trim());
                api(ctx).showDialogue('Choose:', null, options);
                if (this.game.dialogueSystem) {
                    return new Promise(resolve => {
                        this.game.dialogueSystem.onChoice = (idx) => resolve(parseInt(idx) || 0);
                    });
                }
                return 0;
            },
            'dialogue_wait': async (ctx) => {
                if (this.game.dialogueSystem?.active) {
                    await new Promise(resolve => {
                        const check = () => {
                            if (!this.game.dialogueSystem?.active) resolve();
                            else setTimeout(check, 100);
                        };
                        check();
                    });
                }
            },
            'dialogue_close': (ctx) => {
                if (this.game.dialogueSystem?.hide) this.game.dialogueSystem.hide();
            },

            'time_wait': async (ctx) => {
                const seconds = await this.resolveValue(ctx, 'seconds') || 1;
                await api(ctx).wait(seconds);
            },
            'time_get': (ctx) => api(ctx).getGameTime(),

            'comment_box': () => {},

            'custom': async (ctx) => {
                const customId = ctx.node.data.customId;
                if (this.game.customNodeHandlers?.[customId]) {
                    await this.game.customNodeHandlers[customId](ctx, api(ctx));
                }
            }
        };
    }

    async runEvent(ast, entity, eventName, customData = {}) {
        if (!ast || !ast.events) return;
        const eventKey = Object.keys(ast.events).find(k =>
            k === eventName || k === `evt_${eventName}` || k === eventName.replace('evt_', '')
        );
        if (!eventKey) return;
        if (!entity.logicMemory) entity.logicMemory = {};
        const astVars = ast.vars || [];
        for (const v of astVars) {
            if (entity.logicMemory[v.name] === undefined) entity.logicMemory[v.name] = v.value;
        }
        const context = { ast, entity, memory: entity.logicMemory, customData, depth: 0, _api: null };
        const chain = ast.events[eventKey];
        if (Array.isArray(chain)) await this.executeChain(chain, context);
    }

    async executeChain(chain, ctx) {
        if (!chain || !Array.isArray(chain)) return;
        for (const node of chain) {
            await this.executeNode(node, ctx);
        }
    }

    async executeNode(node, ctx) {
        if (ctx.depth > this.MAX_RECURSION_DEPTH) return;
        const currentCtx = { ...ctx, node, depth: ctx.depth + 1 };
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.emit('vsl:node_exec', { nodeId: node.id, entityId: ctx.entity?.id, timestamp: Date.now() });
        }
        const handler = this.nodeRegistry[node.type];
        if (handler) {
            await handler(currentCtx);
            if (node.next && !['flow_branch', 'flow_switch', 'flow_for_loop', 'flow_while', 'flow_foreach', 'flow_sequence'].includes(node.type)) {
                await this.executeChain(node.next, currentCtx);
            }
        } else {
            if (node.next) await this.executeChain(node.next, currentCtx);
        }
    }

    async resolveValue(ctx, portName) {
        const data = ctx.node.data || {};
        let val = data[portName];
        if (typeof val === 'string' && val.startsWith('$')) {
            const varName = val.substring(1);
            return ctx.memory[varName] !== undefined ? ctx.memory[varName] : (this.game.logicFlags ? this.game.logicFlags[varName] : 0);
        }
        if (val === undefined && ctx.node._inputs && ctx.node._inputs[portName]) {
            return this.evalInputRef(ctx, ctx.node._inputs[portName]);
        }
        return val;
    }

    async evalInputRef(ctx, ref) {
        if (ref.type === 'literal') return ref.value;
        if (ref.type === 'node') {
            const innerCtx = { ...ctx, node: ref.node };
            const handler = this.nodeRegistry[ref.node.type];
            if (!handler) return 0;
            return handler(innerCtx);
        }
        return 0;
    }
};
