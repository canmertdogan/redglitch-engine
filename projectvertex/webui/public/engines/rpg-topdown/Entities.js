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
        let def = game.enemyDefs[id]; 
        if (!def || !def.stats) { const oldDef = def || { hp: 50, speed: 100, ai: 'patrol', range: 250, sprite: 'monster' }; def = { id: id, name: oldDef.name || id, stats: { hp: oldDef.hp || 50, speed: oldDef.speed || 100, xp: 20, damage: 10 }, ai: { type: oldDef.ai || 'patrol', range: oldDef.range || 250, attackRange: 150, patrolRadius: 100, cooldown: 1.5 }, animations: { idle: { sprite: oldDef.sprite || 'monster', speed: 0.15 }, run: { sprite: oldDef.sprite || 'monster', speed: 0.15 }, attack: { sprite: oldDef.sprite || 'monster', speed: 0.15 }, hit: { sprite: oldDef.sprite || 'monster', speed: 0.15 }, death: { sprite: oldDef.sprite || 'monster', speed: 0.15 } } }; } 
        this.def = def; this.hp = def.stats.hp; this.maxHp = def.stats.hp; this.speed = def.stats.speed; this.ai = def.ai;
        
        // --- SPRITES ---
        this.sprites = {}; 
        if (def.animations) { Object.keys(def.animations).forEach(key => { this.sprites[key] = window.createPixelImage(def.animations[key].sprite); }); } 
        else { this.sprites.idle = window.createPixelImage(def.sprite || 'monster'); } 
        
        // --- ANIMATION STATE ---
        this.visualState = 'idle'; // decoupled from logic state
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

    move(dx, dy, speed, dt) {
        this.game.moveEntity(this, dx, dy, speed, dt);
    }

    update(deltaTime) {
        // Animation Tick
        const currentAnimConfig = this.def.animations[this.visualState] || this.def.animations['idle']; 
        const frameSpeed = currentAnimConfig.speed || 0.15; 
        const sprite = this.sprites[this.visualState] || this.sprites['idle']; 
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
    draw(ctx, cameraX, cameraY) { ctx.imageSmoothingEnabled = false; const sprite = this.sprites[this.visualState] || this.sprites['idle']; if (!sprite) return; const frameCount = Math.floor(sprite.width / 16) || 1; const safeFrame = this.animFrame % frameCount; const sourceX = safeFrame * 16; ctx.drawImage(sprite, sourceX, 0, 16, 16, Math.floor(this.x - cameraX), Math.floor(this.y - cameraY), 48, 48); if (this.hp < this.maxHp) { ctx.fillStyle = '#000'; ctx.fillRect(this.x-cameraX, this.y-cameraY-10, 48, 6); ctx.fillStyle = '#e74c3c'; ctx.fillRect(this.x-cameraX+1, this.y-cameraY-9, (this.hp/this.maxHp)*46, 4); } }
}

window.Fireball = class Fireball {
    constructor() { this.active = false; this.x = 0; this.y = 0; this.dx = 0; this.dy = 0; this.sprite = null; this.width = 0; this.height = 0; this.life = 0; this.speed = 400; this.scale = 2; this.isEnemy = false; this.isText = false; }
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
