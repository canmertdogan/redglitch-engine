window.Particle = class Particle {
    constructor(x, y, vx, vy, color, life, size = 4, spriteFrames = null) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.color = color; this.life = life; this.maxLife = life; this.size = size; this.spriteFrames = spriteFrames;
    }
    update(deltaTime) { this.x += this.vx * deltaTime; this.y += this.vy * deltaTime; this.life -= deltaTime; }
    draw(ctx, camX, camY) {
        const alpha = Math.max(0, this.life / this.maxLife); ctx.globalAlpha = alpha;
        if (this.spriteFrames && this.spriteFrames.length > 0) {
            const frameIdx = Math.floor(((this.maxLife - this.life) / this.maxLife) * this.spriteFrames.length);
            const frame = this.spriteFrames[Math.min(frameIdx, this.spriteFrames.length - 1)];
            ctx.drawImage(frame, Math.floor(this.x - camX), Math.floor(this.y - camY), this.size, this.size);
        } else { ctx.fillStyle = this.color; ctx.fillRect(Math.floor(this.x - camX), Math.floor(this.y - camY), this.size, this.size); }
        ctx.globalAlpha = 1.0;
    }
}

window.Enemy = class Enemy {
    constructor(x, y, id, game) {
        this.x = x; this.y = y; this.id = id; this.game = game; this.width = 16; this.height = 16; this.scale = 3;
        
        // --- DEFINITION & STATS ---
        let def = game && game.enemyDefs ? game.enemyDefs[id] : null;
        if (!def || !def.stats) {
            const oldDef = def || { hp: 50, speed: 100, ai: 'patrol', range: 250, sprite: 'monster' };
            const aiType = typeof oldDef.ai === 'string' ? oldDef.ai : (oldDef.ai && oldDef.ai.type) || 'patrol';
            def = {
                id: id,
                name: oldDef.name || id,
                stats: { hp: oldDef.hp || 50, speed: oldDef.speed || 100, xp: oldDef.xp || 20, damage: oldDef.damage || 10 },
                ai: { type: aiType, range: oldDef.range || 250, attackRange: 150, patrolRadius: 100, cooldown: 1.5, ...(typeof oldDef.ai === 'object' ? oldDef.ai : {}) },
                loot: oldDef.loot || {},
                resistances: oldDef.resistances || {},
                category: oldDef.category || null,
                animations: oldDef.animations || {
                    idle: { sprite: oldDef.sprite || 'monster', speed: 0.15 },
                    run: { sprite: oldDef.sprite || 'monster', speed: 0.15 },
                    attack: { sprite: oldDef.sprite || 'monster', speed: 0.15 },
                    hit: { sprite: oldDef.sprite || 'monster', speed: 0.15 },
                    death: { sprite: oldDef.sprite || 'monster', speed: 0.15 }
                }
            };
        }
        this.takeDamage = (dmg, type = 'physical') => {
            const r = this.resistances || {};
            const dmgType = String(type || 'physical').toLowerCase();
            if (Array.isArray(r.resist) && r.resist.some(t => String(t).trim().toLowerCase() === dmgType)) {
                return 0;
            }
            let mult = 1;
            if (Array.isArray(r.weakness) && r.weakness.some(t => String(t).trim().toLowerCase() === dmgType)) {
                mult = 1.5;
            }
            if (typeof r[type] === 'number' || typeof r[dmgType] === 'number') {
                const resist = typeof r[type] === 'number' ? r[type] : r[dmgType];
                mult *= Math.max(0, 1 - resist);
            } else if (dmgType === 'physical' && Number.isFinite(Number(r.armor)) && Number(r.armor) > 0) {
                mult *= 100 / (100 + Number(r.armor));
            } else if (dmgType !== 'physical' && Number.isFinite(Number(r.magicResist)) && Number(r.magicResist) > 0) {
                mult *= 100 / (100 + Number(r.magicResist));
            }
            const eff = Math.max(0, dmg * mult);
            this.hp -= eff;
            if (this.hp <= 0) this.die();
            return eff;
        };
        if (def.ai && def.ai.script && game && game.logicSystem) { try { game.logicSystem.attachToEntity(this, def.ai.script); } catch {} }
        this.def = def;
        this.resistances = def.resistances || {};
        this.loot = def.loot || {};
        this.category = def.category || null;
        this.hp = def.stats.hp;
        this.maxHp = def.stats.hp;
        this.speed = def.stats.speed;
        this.ai = (typeof def.ai === 'string')
            ? { type: def.ai, range: def.range || 250, attackRange: 150, patrolRadius: 100, cooldown: 1.5 }
            : (def.ai || { type: 'patrol', range: 250, attackRange: 150, patrolRadius: 100, cooldown: 1.5 });
        
        // --- SPRITES (directional, base, and legacy flat) ---
        const makeImg = (key) => (typeof window !== 'undefined' && typeof window.createPixelImage === 'function') ? window.createPixelImage(key) : null;
        this.sprites = {};
        if (def.animations) {
            Object.keys(def.animations).forEach(key => {
                const anim = def.animations[key];
                if (!anim) return;
                if (typeof anim === 'string') {
                    this.sprites[key] = makeImg(anim);
                } else if (anim.down || anim.up || anim.side) {
                    this.sprites[key] = {
                        down: anim.down ? makeImg(anim.down) : null,
                        up: anim.up ? makeImg(anim.up) : null,
                        side: anim.side ? makeImg(anim.side) : null
                    };
                } else if (anim.sprite || anim.base) {
                    this.sprites[key] = makeImg(anim.sprite || anim.base);
                }
            });
        }
        if (!this.sprites.idle) {
            this.sprites.idle = makeImg(def.sprite || 'monster');
        }
        
        // --- ANIMATION STATE ---
        this.visualState = 'idle'; // decoupled from logic state
        this.facingDir = 'down';
        this.facing = 1;
        this.animTimer = 0; this.animFrame = 0; 
        this.dir = { x: 1, y: 0 };
        this.origin = { x: x, y: y };
        
        // --- STATE MACHINE ---
        const fsmStates = {
            IDLE: {
                enter: (en) => { en.visualState = 'idle'; },
                update: (en, dt, timer) => {
                    const dist = en.distToPlayer();
                    if (dist < en.ai.range) { en.fsm.change('CHASE'); return; }
                    
                    if (en.ai.type === 'patrol' && timer > 2.0) {
                        en.fsm.change('PATROL');
                    }
                }
            },
            PATROL: {
                enter: (en) => {
                    en.visualState = 'run';
                    const angle = Math.random() * Math.PI * 2;
                    en.patrolDir = { x: Math.cos(angle), y: Math.sin(angle) };
                },
                update: (en, dt, timer) => {
                    if (en.distToPlayer() < en.ai.range) { en.fsm.change('CHASE'); return; }
                    if (timer > 2.0) { en.fsm.change('IDLE'); return; }
                    
                    en.move(en.patrolDir.x, en.patrolDir.y, en.speed * 0.5, dt);
                }
            },
            CHASE: {
                enter: (en) => { en.visualState = 'run'; },
                update: (en, dt) => {
                    const dist = en.distToPlayer();
                    if (dist > en.ai.range * 1.5) { en.fsm.change('IDLE'); return; }
                    
                    if (dist < en.ai.attackRange) { 
                         // Check cooldown
                         if (en.shootTimer <= 0) { en.fsm.change('ATTACK'); return; }
                    }
                    
                    // Move towards player
                    const dx = en.game.player.x - en.x;
                    const dy = en.game.player.y - en.y;
                    const angle = Math.atan2(dy, dx);
                    en.move(Math.cos(angle), Math.sin(angle), en.speed, dt);
                    en.shootTimer -= dt;
                }
            },
            ATTACK: {
                enter: (en) => { 
                    en.visualState = 'attack'; 
                    en.animFrame = 0;
                    // Shoot immediately or at specific frame? Let's shoot now for simplicity
                    const dx = en.game.player.x - en.x;
                    const dy = en.game.player.y - en.y;
                    en.shoot(Math.atan2(dy, dx));
                    en.shootTimer = en.ai.cooldown || 1.5;
                },
                update: (en, dt, timer) => {
                    if (timer > 0.5) { // Attack anim duration
                        en.fsm.change('CHASE');
                    }
                }
            }
        };

        this.fsm = new window.StateMachine(this, fsmStates);
        this.fsm.change('IDLE');
        this.shootTimer = 0;
    }
    
    distToPlayer() {
        const sw = this.width * this.scale, sh = this.height * this.scale;
        return Math.sqrt((this.game.player.x + 24 - (this.x + sw/2))**2 + (this.game.player.y + 24 - (this.y + sh/2))**2);
    }

    _getSprite(state) {
        const entry = this.sprites && this.sprites[state];
        if (!entry) return null;
        if (typeof entry === 'object' && ('down' in entry || 'up' in entry || 'side' in entry)) {
            return entry[this.facingDir] || entry.down || entry.side || entry.up || null;
        }
        return entry;
    }

    move(dx, dy, speed, dt) {
        if (Math.abs(dy) > Math.abs(dx)) {
            this.facingDir = dy > 0 ? 'down' : 'up';
        } else if (dx !== 0) {
            this.facingDir = 'side';
            this.facing = dx < 0 ? -1 : 1;
        }
        this.game.moveEntity(this, dx, dy, speed, dt);
    }

    /**
     * Enemy death: remove from the active list, award XP, and resolve loot.
     * Idempotent so double damage in the same frame (e.g. two projectiles)
     * cannot award loot twice.
     */
    die() {
        if (this.dead) return;
        this.dead = true;
        const game = this.game;
        if (!game) return;
        try {
            game.createExplosion(this.x + (this.width * this.scale) / 2, this.y + (this.height * this.scale) / 2, '#e74c3c', 15);
        } catch (_) { /* rendering is optional */ }
        const idx = Array.isArray(game.enemies) ? game.enemies.indexOf(this) : -1;
        if (idx > -1) game.enemies.splice(idx, 1);
        const xp = this.def && this.def.stats && Number(this.def.stats.xp);
        if (Number.isFinite(xp) && xp > 0 && game.player) {
            if (typeof game.awardXP === 'function') game.awardXP(xp);
            else game.player.xp = (game.player.xp || 0) + xp;
        }
        if (game.achievementSystem && typeof game.achievementSystem.unlock === 'function') {
            const targetId = this.id || this.type || (this.def && this.def.id) || '';
            game.achievementSystem.unlock('ENEMY_KILL', { target: targetId, enemyId: targetId });
        }
        this._dropLoot(game);
        if (game.updateHUD) { try { game.updateHUD(); } catch (_) {} }
    }

    /**
     * Loot supports all shapes the editors produce:
     *  - legacy array: ['apple', 'gold_coin']
     *  - prefab component: { table, chance, goldMin, goldMax, items? }
     *  - EnemyEditor schema: { gold: [min, max], dropChance (0..100), items? }
     * Gold is credited to `player.coins`, items are resolved against
     * `game.itemDefs` and pushed onto `game.inventory`.
     */
    _dropLoot(game) {
        const loot = this.loot;
        if (!loot) return;
        const addItem = (id) => {
            if (!id) return;
            const defs = Array.isArray(game.itemDefs) ? game.itemDefs : [];
            const def = defs.find(i => i && i.id === id);
            if (!def) return;
            if (!Array.isArray(game.inventory)) game.inventory = [];
            game.inventory.push({ ...def });
            if (game.achievementSystem && typeof game.achievementSystem.unlock === 'function') {
                game.achievementSystem.unlock('ITEM_GET', { target: id, itemId: id });
            }
            if (game.updateInventoryHUD) { try { game.updateInventoryHUD(); } catch (_) {} }
            if (game.fx && game.fx.popText) { try { game.fx.popText(this.x + 24, this.y, `+${def.name || id}`, '#f1c40f'); } catch (_) {} }
        };

        if (Array.isArray(loot)) { loot.forEach(addItem); return; }

        let chance = 1;
        if (Number.isFinite(loot.chance)) {
            chance = loot.chance;
        } else if (Number.isFinite(loot.dropChance)) {
            chance = Math.max(0, Math.min(1, loot.dropChance / 100));
        }
        if (Math.random() > chance) return;

        const items = Array.isArray(loot.items) ? loot.items : (loot.item ? [loot.item] : []);
        items.forEach(entry => {
            if (typeof entry === 'string') {
                addItem(entry);
                return;
            }
            if (!entry || !entry.id) return;
            if (Number.isFinite(entry.chance)) {
                const itemChance = entry.chance > 1 ? entry.chance / 100 : entry.chance;
                if (Math.random() > itemChance) return;
            }
            const qtyMin = Number.isFinite(entry.min) ? entry.min : 1;
            const qtyMax = Number.isFinite(entry.max) ? entry.max : qtyMin;
            const lo = Math.min(qtyMin, qtyMax);
            const hi = Math.max(qtyMin, qtyMax);
            const qty = Math.max(1, Math.floor(lo + Math.random() * (hi - lo + 1)));
            for (let i = 0; i < qty; i++) addItem(entry.id);
        });

        const min = Number.isFinite(loot.goldMin)
            ? loot.goldMin
            : (Array.isArray(loot.gold) && Number.isFinite(Number(loot.gold[0])) ? Number(loot.gold[0]) : 0);
        const max = Number.isFinite(loot.goldMax)
            ? loot.goldMax
            : (Array.isArray(loot.gold) && Number.isFinite(Number(loot.gold[1])) ? Number(loot.gold[1]) : (Number.isFinite(loot.gold) ? Number(loot.gold) : min));
        if (max > 0 || min > 0) {
            const lo = Math.min(min, max);
            const hi = Math.max(min, max);
            const gold = Math.max(lo, Math.floor(lo + Math.random() * (hi - lo + 1)));
            if (gold > 0 && game.player) {
                game.player.coins = (game.player.coins || 0) + gold;
                if (game.fx && game.fx.popText) { try { game.fx.popText(this.x + 24, this.y - 10, `+${gold}g`, '#f1c40f'); } catch (_) {} }
            }
        }
    }

    update(deltaTime) {
        // Animation Tick
        const anims = (this.def && this.def.animations) || {};
        const currentAnimConfig = anims[this.visualState] || anims['idle'] || { speed: 0.15 }; 
        const frameSpeed = currentAnimConfig.speed || 0.15; 
        const sprite = this._getSprite(this.visualState) || this._getSprite('idle'); 
        const frameCount = (sprite && sprite.width) ? Math.max(1, Math.floor(sprite.width / 16)) : 1;
        
        this.animTimer += deltaTime; 
        if (this.animTimer > frameSpeed) { 
            this.animTimer = 0; 
            this.animFrame = (this.animFrame + 1) % frameCount; 
        }

        // Logic Tick
        if (this.ai.type === 'static') { 
            this.handleStaticAI(deltaTime); 
            this.visualState = 'idle'; 
        } else {
            this.fsm.update(deltaTime);
        }
    }
    handleStaticAI(deltaTime) { const distToPlayer = Math.sqrt((this.game.player.x - this.x)**2 + (this.game.player.y - this.y)**2); if (distToPlayer < this.ai.range) { const dx = this.game.player.x - this.x; const dy = this.game.player.y - this.y; const angle = Math.atan2(dy, dx); this.shootTimer -= deltaTime; if (this.shootTimer <= 0) { this.shootTimer = this.ai.cooldown || 2.0; this.shoot(angle); } } } 
    shoot(angle) { const vx = Math.cos(angle); const vy = Math.sin(angle); const spawnX = this.x + (this.width * this.scale) / 2; const spawnY = this.y + (this.height * this.scale) / 2; const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#8e44ad'; ctx.fillRect(4, 4, 8, 8); ctx.fillStyle = '#2c3e50'; ctx.fillRect(6, 6, 4, 4); const projectile = this.game.spawnFireball(spawnX, spawnY, vx, vy, canvas); if(projectile) { projectile.speed = 250; projectile.isEnemy = true; } }
    draw(ctx, cameraX, cameraY) { ctx.imageSmoothingEnabled = false; const sprite = this._getSprite(this.visualState) || this._getSprite('idle'); if (!sprite) return; const frameCount = Math.floor(sprite.width / 16) || 1; const safeFrame = this.animFrame % frameCount; const sourceX = safeFrame * 16; ctx.drawImage(sprite, sourceX, 0, 16, 16, Math.floor(this.x - cameraX), Math.floor(this.y - cameraY), 48, 48); if (this.hp < this.maxHp) { ctx.fillStyle = '#000'; ctx.fillRect(this.x-cameraX, this.y-cameraY-10, 48, 6); ctx.fillStyle = '#e74c3c'; ctx.fillRect(this.x-cameraX+1, this.y-cameraY-9, (this.hp/this.maxHp)*46, 4); } }
}

window.Fireball = class Fireball {
    constructor() { this.active = false; this.x = 0; this.y = 0; this.dx = 0; this.dy = 0; this.sprite = null; this.width = 0; this.height = 0; this.life = 0; this.speed = 400; this.scale = 2; this.isEnemy = false; this.isText = false; this.damage = 25; }
    reset(x, y, dx, dy, sprite) {
        this.active = true;
        this.x = x; this.y = y; this.dx = dx; this.dy = dy; this.sprite = sprite; 
        this.width = sprite.width; this.height = sprite.height; 
        this.life = 2.0; this.speed = 400; this.scale = 2; 
        this.isEnemy = false; 
        this.isText = (sprite instanceof HTMLCanvasElement);
    }
    update(deltaTime, mapSystem) { 
        if (!this.active) return;
        this.life -= deltaTime; 
        this.x += this.dx * this.speed * deltaTime; 
        this.y += this.dy * this.speed * deltaTime; 
        const sw = this.width * this.scale, sh = this.height * this.scale; 
        const cx = this.x + sw / 2; 
        const cy = this.y + sh / 2; 
        
        // Projectiles pass over half-height obstacles but are blocked by solid walls
        const collType = mapSystem.getCollisionType(cx, cy);
        if (collType === 1 || collType === 2) { // Solid or shadowless wall
            this.life = 0;
        }
        // Passes through half-height (3), one-way (4-7), and trigger zones (8)
    }
}
