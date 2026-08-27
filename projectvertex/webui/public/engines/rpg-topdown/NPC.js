/**
 * NPC Class - Enhanced with Brain System Support
 * RedGlitch Engine - RPG Top-Down
 */

window.NPC = class NPC {
    constructor(x, y, id, game) {
        this.x = x;
        this.y = y;
        this.id = id;
        this.game = game;
        this.width = 16;
        this.height = 16;
        this.scale = 3;
        
        // Definition migration
        let def = game.npcDefs[id];
        if (!def || !def.stats) {
            const oldDef = def || { name: 'Stranger', sprite: 'player', dialogue: 'demo', range: 60 };
            def = {
                id: id,
                name: oldDef.name || 'Stranger',
                type: 'npc',
                stats: { speed: 50 },
                interaction: { dialogue: oldDef.dialogue || 'demo', range: oldDef.range || 60 },
                behavior: { type: 'wander', range: 100, idleTime: 3.0 },
                animations: {
                    idle: { sprite: oldDef.sprite || 'player', speed: 0.2 },
                    walk: { sprite: oldDef.sprite || 'player', speed: 0.15 },
                    talk: { sprite: oldDef.sprite || 'player', speed: 0.2 }
                }
            };
        }
        
        this.def = def;
        this.name = def.name;
        this.range = def.interaction.range;
        this.speed = def.stats.speed;
        
        // Load sprites (handle both old flat sprite and new directional format)
        this.sprites = {};
        if (def.animations) {
            Object.keys(def.animations).forEach(state => {
                const animDef = def.animations[state];
                // New directional format
                if (animDef.down || animDef.up || animDef.side) {
                    this.sprites[state] = {
                        down: animDef.down ? window.createPixelImage(animDef.down) : null,
                        up: animDef.up ? window.createPixelImage(animDef.up) : null,
                        side: animDef.side ? window.createPixelImage(animDef.side) : null
                    };
                }
                // Old flat sprite format (fallback)
                else if (animDef.sprite) {
                    this.sprites[state] = window.createPixelImage(animDef.sprite);
                }
                // Talk state might use base
                else if (animDef.base) {
                    this.sprites[state] = window.createPixelImage(animDef.base);
                }
            });
        }
        
        // State
        this.state = 'idle';
        this.direction = 'down';
        this.facing = 1; // -1 for left, 1 for right
        this.animTimer = 0;
        this.animFrame = 0;
        this.timer = 0;
        this.dir = { x: 0, y: 0 };
        this.origin = { x: x, y: y };
        
        // Brain system
        this.brainState = {}; // Persistent state for brain scripts
        this.brainRuntime = null;
        this.script = null;
        
        // Movement promises (for async brain API)
        this._movementPromise = null;
        this._movementResolve = null;
        this._waitPromise = null;
        this._waitResolve = null;
        this._waitTimer = 0;
        
        // Load brain if defined
        if (this.def.behavior && this.def.behavior.script) {
            this.attachBrain(this.def.behavior.script);
        }
    }
    
    // ============================================
    // BRAIN LOADING & EXECUTION
    // ============================================
    
    async attachBrain(name) {
        if (!this.game.logicSystem) {
            console.warn('[NPC] Cannot attach brain: LogicSystem not found in game context');
            return;
        }
        await this.game.logicSystem.attachToEntity(this, name);
    }

    refreshSprites() {
        console.log(`[NPC:${this.id}] Refreshing sprites...`);
        const def = this.def;
        if (def.animations) {
            Object.keys(def.animations).forEach(state => {
                const animDef = def.animations[state];
                if (animDef.down || animDef.up || animDef.side) {
                    if (animDef.down) this.sprites[state].down = window.createPixelImage(animDef.down);
                    if (animDef.up) this.sprites[state].up = window.createPixelImage(animDef.up);
                    if (animDef.side) this.sprites[state].side = window.createPixelImage(animDef.side);
                } else if (animDef.sprite) {
                    this.sprites[state] = window.createPixelImage(animDef.sprite);
                } else if (animDef.base) {
                    this.sprites[state] = window.createPixelImage(animDef.base);
                }
            });
        }
    }
    
    // ============================================
    // BRAIN API - Movement
    // ============================================
    
    async moveToPosition(x, y, speed) {
        return new Promise((resolve) => {
            this._movementPromise = { x, y, speed: speed || this.speed, resolve };
            this.state = 'walk';
        });
    }
    
    async wander(radius, duration) {
        radius = radius || 100;
        duration = duration || 3.0;
        
        return new Promise((resolve) => {
            // Set random direction
            const angle = Math.random() * Math.PI * 2;
            this.dir = { x: Math.cos(angle), y: Math.sin(angle) };
            this.state = 'walk';
            
            // Set timer for wander duration
            this._waitTimer = duration;
            this._waitResolve = () => {
                this.state = 'idle';
                this.dir = { x: 0, y: 0 };
                resolve();
            };
        });
    }
    
    async walkTo(tx, ty) {
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 5) {
            this.state = 'idle';
            return;
        }
        
        this.state = 'walk';
        this.dir = { x: dx / dist, y: dy / dist };
    }
    
    // ============================================
    // BRAIN API - Timing
    // ============================================
    
    async wait(seconds) {
        return new Promise((resolve) => {
            this._waitTimer = seconds;
            this._waitResolve = resolve;
        });
    }
    
    // ============================================
    // BRAIN API - Communication
    // ============================================
    
    async say(text) {
        console.log(`${this.name} says: ${text}`);
        
        // Show overhead bubble if system supports it
        if (this.game.dialogueSystem && this.game.dialogueSystem.showOverhead) {
            this.game.dialogueSystem.showOverhead(this, text);
        }
        
        // Auto-wait for readability
        await this.wait(text.length * 0.05 + 1.0);
    }
    
    async speak(text, duration) {
        console.log(`${this.name} speaks: ${text}`);
        
        if (this.game.dialogueSystem && this.game.dialogueSystem.showOverhead) {
            this.game.dialogueSystem.showOverhead(this, text);
        }
        
        await this.wait(duration || 2.0);
    }
    
    // ============================================
    // BRAIN API - Sensing
    // ============================================
    
    canSee(entity, range, fov) {
        if (!entity) return false;
        
        const dx = entity.x - this.x;
        const dy = entity.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > range) return false;
        
        // Optional FOV check
        if (fov !== undefined) {
            const angle = Math.atan2(dy, dx);
            const dirAngle = Math.atan2(this.dir.y, this.dir.x);
            const angleDiff = Math.abs(angle - dirAngle);
            if (angleDiff > fov / 2) return false;
        }
        
        return true;
    }
    
    getDistance(entity) {
        if (!entity) return Infinity;
        const dx = entity.x - this.x;
        const dy = entity.y - this.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getNearbyEntities(range, type) {
        const nearby = [];
        
        // Check NPCs
        if (!type || type === 'npc') {
            this.game.npcs.forEach(npc => {
                if (npc !== this && this.getDistance(npc) <= range) {
                    nearby.push(npc);
                }
            });
        }
        
        // Check player
        if (!type || type === 'player') {
            if (this.game.player && this.getDistance(this.game.player) <= range) {
                nearby.push(this.game.player);
            }
        }
        
        // Check enemies
        if (!type || type === 'enemy') {
            this.game.enemies.forEach(enemy => {
                if (this.getDistance(enemy) <= range) {
                    nearby.push(enemy);
                }
            });
        }
        
        return nearby;
    }
    
    // ============================================
    // BRAIN API - State Management
    // ============================================
    
    setVariable(key, value) {
        this.brainState[key] = value;
    }
    
    getVariable(key, defaultValue) {
        return this.brainState[key] !== undefined ? this.brainState[key] : defaultValue;
    }
    
    checkFlag(flag) {
        return this.game.flags && this.game.flags[flag];
    }
    
    setEmotion(type) {
        // Placeholder for emotion system
        console.log(`${this.name} feels ${type}`);
    }
    
    // ============================================
    // UPDATE LOOP
    // ============================================
    
    update(deltaTime) {
        // Update direction based on movement
        if (this.dir) {
            if (Math.abs(this.dir.y) > Math.abs(this.dir.x)) {
                this.direction = this.dir.y > 0 ? 'down' : 'up';
            } else if (this.dir.x !== 0) {
                this.direction = 'side';
                this.facing = this.dir.x > 0 ? 1 : -1; // Track horizontal facing
            }
        }
        
        // Animation
        const currentAnimConfig = this.def.animations[this.state] || this.def.animations['idle'];
        const frameSpeed = currentAnimConfig.speed || 0.2;
        
        // Get sprite (handle both directional and flat format)
        let sprite = this.sprites[this.state];
        if (sprite && typeof sprite === 'object' && sprite.down) {
            // Directional sprite
            sprite = sprite[this.direction] || sprite.down;
        }
        if (!sprite) sprite = this.sprites['idle'];
        if (sprite && typeof sprite === 'object' && sprite.down) {
            sprite = sprite[this.direction] || sprite.down;
        }
        
        const frameCount = (sprite && sprite.width) ? Math.max(1, Math.floor(sprite.width / 16)) : 1;
        
        this.animTimer += deltaTime;
        if (this.animTimer > frameSpeed) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % frameCount;
        }
        
        // Pause if dialogue active
        if (this.game.dialogueSystem.active) return;
        
        // Update wait timers
        if (this._waitTimer > 0) {
            this._waitTimer -= deltaTime;
            if (this._waitTimer <= 0 && this._waitResolve) {
                const resolve = this._waitResolve;
                this._waitResolve = null;
                this._waitTimer = 0;
                resolve();
            }
        }
        
        // Update movement promises
        if (this._movementPromise) {
            const target = this._movementPromise;
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 5) {
                this.state = 'idle';
                this.dir = { x: 0, y: 0 };
                const resolve = target.resolve;
                this._movementPromise = null;
                resolve();
            } else {
                this.dir = { x: dx / dist, y: dy / dist };
                this.state = 'walk';
                this.game.moveEntity(this, this.dir.x, this.dir.y, target.speed, deltaTime);
            }
            return;
        }
        
        // Brain runtime execution
        if (this.brainRuntime) {
            this.brainRuntime.update(deltaTime);
            
            // Movement for brain-controlled NPCs
            if (this.state === 'walk' && (this.dir.x !== 0 || this.dir.y !== 0)) {
                this.game.moveEntity(this, this.dir.x, this.dir.y, this.speed, deltaTime);
            }
            return;
        }
        
        // Legacy script execution
        if (this.script) {
            this.script({ event: 'evt_tick', target: this, dt: deltaTime }, this.game, this.game.uiSystem);
            if (this.state === 'walk') {
                this.game.moveEntity(this, this.dir.x, this.dir.y, this.speed, deltaTime);
            }
            return;
        }
        
        // Built-in behaviors
        if (this.def.behavior.type === 'static') {
            this.state = 'idle';
            return;
        }
        
        if (this.def.behavior.type === 'wander') {
            this.timer -= deltaTime;
            
            if (this.timer <= 0) {
                if (this.state === 'walk') {
                    this.state = 'idle';
                    this.timer = this.def.behavior.idleTime || 3.0;
                    this.dir = { x: 0, y: 0 };
                } else {
                    this.state = 'walk';
                    this.timer = 2.0 + Math.random();
                    const angle = Math.random() * Math.PI * 2;
                    this.dir = { x: Math.cos(angle), y: Math.sin(angle) };
                }
            }
            
            if (this.state === 'walk') {
                const dist = Math.sqrt((this.x - this.origin.x) ** 2 + (this.y - this.origin.y) ** 2);
                if (dist < (this.def.behavior.range || 100)) {
                    this.game.moveEntity(this, this.dir.x, this.dir.y, this.speed, deltaTime);
                } else {
                    this.timer = 0;
                }
            }
        }
    }
    
    // ============================================
    // RENDERING
    // ============================================
    
    draw(ctx, cameraX, cameraY) {
        ctx.imageSmoothingEnabled = false;
        
        // Get sprite (handle both directional and flat format)
        let sprite = this.sprites[this.state];
        if (sprite && typeof sprite === 'object' && sprite.down) {
            // Directional sprite
            sprite = sprite[this.direction] || sprite.down;
        }
        if (!sprite) {
            sprite = this.sprites['idle'];
            if (sprite && typeof sprite === 'object' && sprite.down) {
                sprite = sprite[this.direction] || sprite.down;
            }
        }
        if (!sprite) return;
        
        const frameCount = Math.floor(sprite.width / 16) || 1;
        const safeFrame = this.animFrame % frameCount;
        const sourceX = safeFrame * 16;
        
        // Handle horizontal flipping for side sprites
        const flipX = (this.direction === 'side' && this.facing === -1);
        
        ctx.save();
        if (flipX) {
            ctx.translate(Math.floor(this.x - cameraX) + 48, Math.floor(this.y - cameraY));
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, sourceX, 0, 16, 16, 0, 0, 48, 48);
        } else {
            ctx.drawImage(
                sprite,
                sourceX, 0, 16, 16,
                Math.floor(this.x - cameraX),
                Math.floor(this.y - cameraY),
                48, 48
            );
        }
        ctx.restore();
    }
    
    // Legacy compatibility
    startWander(radius) {
        if (this.state !== 'walk') {
            this.state = 'walk';
            const angle = Math.random() * Math.PI * 2;
            this.dir = { x: Math.cos(angle), y: Math.sin(angle) };
            this.timer = 2.0;
        }
    }
};
