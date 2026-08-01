/**
 * IsoEntity - Base class for dynamic entities in IsoPixel engine (NPCs, Enemies)
 */
class IsoEntity {
    constructor(game, def) {
        this.game = game;
        this.def = def;
        
        // Position
        this.x = def.x || 0;
        this.y = def.y || 0;
        this.z = def.z || 0;
        
        // Render position (interpolation)
        this.renderX = this.x;
        this.renderY = this.y;
        this.renderZ = this.z;
        
        // Velocity
        this.velocity = { x: 0, y: 0, z: 0 };
        
        // Properties
        this.type = def.type || 'npc'; // 'npc' or 'enemy'
        this.id = def.instanceId || def.id || crypto.randomUUID();
        this.spriteId = def.spriteId || (def.data && def.data.spriteId) || (typeof def.data === 'string' ? def.data.replace('.json', '') : null);
        this.prefabId = def.prefabId || (typeof def.data === 'string' && def.data.endsWith('.json') ? def.data.replace('.json', '') : null);
        
        // Stats
        this.hp = def.hp || 100;
        this.maxHp = def.maxHp || 100;
        this.speed = def.speed || 0.04;
        this.range = def.range || 8; // Detection range
        
        // Apply Instance Overrides
        if (def.overrides) {
            for (const key in def.overrides) {
                this[key] = def.overrides[key];
            }
        }
        
        // Physics
        this.grounded = false;
        this.width = 0.5; // Physics width (tiles)
        this.height = 0.5;
        
        // AI State
        this.state = 'idle';
        this.stateTimer = 0;
        this.direction = 'down';
        this.target = null;
        this.wanderTarget = null;
        this.homeX = this.x;
        this.homeY = this.y;
        this.wanderRadius = 6;
        this.jumpForce = 0.45; // Match player jump force
        
        // Snap to floor initially
        const floorZ = this.game.getZAt(this.x, this.y);
        if (this.z < floorZ) this.z = floorZ;

        // Brain System
        this.brainRuntime = null;
        if (def.behavior && def.behavior.script) {
            this.attachBrain(def.behavior.script);
        }
    }

    async attachBrain(name) {
        if (this.game.logicSystem) {
            await this.game.logicSystem.attachToEntity(this, name);
        }
    }

    async say(text) {
        console.log(`[IsoNPC ${this.id}] says: ${text}`);
        if (this.game.hud && this.game.hud.showDialogue) {
            this.game.hud.showDialogue(this, text);
        }
    }

    update(dt) {
        // 1. AI Logic
        this.updateAI(dt);
        
        // 2. Physics (Gravity)
        if (!this.grounded) {
            this.velocity.z -= this.game.GRAVITY;
            if (this.velocity.z < -0.8) this.velocity.z = -0.8;
        }
        
        // 3. Movement & Collision
        let nextX = this.x + this.velocity.x;
        let nextY = this.y + this.velocity.y;
        let nextZ = this.z + this.velocity.z;
        
        // Horizontal Collision
        const floorAtTarget = this.game.getZAt(nextX, nextY);
        const stepThreshold = this.z + this.game.MAX_STEP_HEIGHT;
        
        // Helper: Check if position is walkable (not a wall and not too high/low)
        const isWalkable = (nx, ny, currentZ) => {
            const fZ = this.game.getZAt(nx, ny);
            // Can't step up too high (unless jumping)
            if (fZ > currentZ + this.game.MAX_STEP_HEIGHT) return false;
            // Can't drop down too far (safety for AI)
            if (fZ < currentZ - 2.0) return false;
            return true;
        };
        
        let wallHit = false;

        // Check if we hit a wall that we can jump over
        if (floorAtTarget > stepThreshold) {
            // Check if jumpable (height difference < 1.5 tiles)
            if (floorAtTarget <= this.z + 1.5 && this.grounded) {
                // JUMP!
                this.velocity.z = this.jumpForce;
                this.grounded = false;
                nextZ = this.z + this.velocity.z; // Apply immediate lift
            } else {
                wallHit = true;
            }
        }

        // Try moving full step if not wall hit
        if (!wallHit && isWalkable(nextX, nextY, this.z)) {
            // OK
        } else if (!wallHit) {
            // Try sliding X
            if (isWalkable(nextX, this.y, this.z)) {
                nextY = this.y;
                this.velocity.y = 0;
            } 
            // Try sliding Y
            else if (isWalkable(this.x, nextY, this.z)) {
                nextX = this.x;
                this.velocity.x = 0;
            } 
            // Blocked
            else {
                nextX = this.x;
                nextY = this.y;
                this.velocity.x = 0;
                this.velocity.y = 0;
                wallHit = true;
            }
        } else {
            // Wall hit confirmed
            nextX = this.x;
            nextY = this.y;
            this.velocity.x = 0;
            this.velocity.y = 0;
        }
        
        // If wandering and hit wall, pick new target
        if (wallHit && this.state === 'wander') {
            this.wanderTarget = null;
            this.state = 'idle';
            this.stateTimer = 500;
        }
        
        // Map bounds
        if (this.game.levelMetadata) {
            nextX = Math.max(0.1, Math.min(this.game.levelMetadata.width - 0.1, nextX));
            nextY = Math.max(0.1, Math.min(this.game.levelMetadata.height - 0.1, nextY));
        }
        
        this.x = nextX;
        this.y = nextY;
        
        // Vertical Collision (Floor)
        const floorHeight = this.game.getZAt(this.x, this.y);
        
        // If jumping/falling
        if (nextZ <= floorHeight) {
            nextZ = floorHeight;
            this.velocity.z = 0;
            this.grounded = true;
        } else {
            this.grounded = false;
        }
        this.z = nextZ;
        
        // 4. Interpolation
        const interp = 0.2;
        this.renderX += (this.x - this.renderX) * interp;
        this.renderY += (this.y - this.renderY) * interp;
        this.renderZ += (this.z - this.renderZ) * interp;
        
        // 5. Update Direction for rendering
        if (Math.abs(this.velocity.x) > 0.001 || Math.abs(this.velocity.y) > 0.001) {
            const screenVelX = this.velocity.x - this.velocity.y;
            const screenVelY = this.velocity.x + this.velocity.y;
            if (Math.abs(screenVelX) > Math.abs(screenVelY)) {
                this.direction = screenVelX > 0 ? 'right' : 'left';
            } else {
                this.direction = screenVelY > 0 ? 'down' : 'up';
            }
        }
    }
    
    updateAI(dt) {
        // Run brain runtime if attached (VSL/Behavior)
        if (this.brainRuntime) {
            this.brainRuntime.update(dt / 1000); // dt is in ms here? Let's check.
            // ... movement handled by brainRuntime calls to entity methods ...
            return;
        }

        const p = this.game.player;
        const dist = Math.sqrt((this.x - p.x)**2 + (this.y - p.y)**2);
        
        // 1. CHASE Logic (Enemies only)
        if (this.type === 'enemy' && dist < this.range) {
            this.state = 'chase';
        } 
        // 2. IDLE/WANDER Logic
        else if (this.state === 'chase') {
            // Lost player
            this.state = 'idle';
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.stateTimer = 1000;
        }

        // State Machine execution
        if (this.state === 'chase') {
            // Move towards player
            const dx = p.x - this.x;
            const dy = p.y - this.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len > 0.5) { 
                this.velocity.x = (dx / len) * this.speed;
                this.velocity.y = (dy / len) * this.speed;
                
                // Random jump while chasing (excitement/obstacle traversal)
                if (this.grounded && Math.random() < 0.01) {
                    this.velocity.z = this.jumpForce;
                    this.grounded = false;
                }
            } else {
                this.velocity.x = 0;
                this.velocity.y = 0;
            }
        } 
        else if (this.state === 'idle') {
            this.velocity.x = 0;
            this.velocity.y = 0;
            
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                // Decide to wander or stay idle
                if (Math.random() < 0.7) {
                    this.state = 'wander';
                    // Pick random point near home position
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.random() * this.wanderRadius;
                    this.wanderTarget = {
                        x: this.homeX + Math.cos(angle) * r,
                        y: this.homeY + Math.sin(angle) * r
                    };
                    // Clamp to map bounds
                    if (this.game.levelMetadata) {
                         this.wanderTarget.x = Math.max(1, Math.min(this.game.levelMetadata.width - 1, this.wanderTarget.x));
                         this.wanderTarget.y = Math.max(1, Math.min(this.game.levelMetadata.height - 1, this.wanderTarget.y));
                    }
                } else {
                    this.stateTimer = 1000 + Math.random() * 2000; // Stay idle longer
                }
            }
        }
        else if (this.state === 'wander') {
            if (this.wanderTarget) {
                const dx = this.wanderTarget.x - this.x;
                const dy = this.wanderTarget.y - this.y;
                const len = Math.sqrt(dx*dx + dy*dy);
                
                if (len < 0.5) {
                    // Reached target
                    this.state = 'idle';
                    this.stateTimer = 1000 + Math.random() * 2000;
                    this.velocity.x = 0;
                    this.velocity.y = 0;
                } else {
                    // Move to target
                    const moveSpeed = this.speed * 0.5; // Walk slower than chase
                    this.velocity.x = (dx / len) * moveSpeed;
                    this.velocity.y = (dy / len) * moveSpeed;
                    
                    // Random hop while wandering (rarely)
                    if (this.grounded && Math.random() < 0.005) {
                        this.velocity.z = this.jumpForce;
                        this.grounded = false;
                    }
                }
            } else {
                this.state = 'idle';
            }
        }
    }

    draw(ctx, strategy, config, tileset, sprites) {
        // Use the strategy to project world coords to screen
        const dims = strategy.getTileDims(config);
        const screenPos = strategy.project(this.renderX, this.renderY, this.renderZ, dims);
        
        // Resolve sprite
        // Prioritize: 
        // 1. this.spriteId (from editor)
        // 2. this.def.data.sprite (legacy)
        // 3. Fallback: Try keys like "npc", "enemy", "monster" based on type/id
        
        let sprite = null;
        let spriteName = this.spriteId || (this.def.data && this.def.data.sprite);
        
        // Try direct match
        if (spriteName && sprites[spriteName]) {
            sprite = sprites[spriteName];
        } 
        // Try adding 'npc_' prefix if not found (e.g. 'blacksmith' -> 'npc_blacksmith')
        else if (spriteName && sprites['npc_' + spriteName]) {
            sprite = sprites['npc_' + spriteName];
        }
        // Try type-based fallback
        else if (sprites[this.type]) {
            sprite = sprites[this.type];
        }
        // Last resort generic fallbacks
        else if (this.type === 'enemy' && sprites['monster']) {
            sprite = sprites['monster'];
        }
        else if (this.type === 'npc' && sprites['npc']) {
            sprite = sprites['npc'];
        }

        if (sprite) {
            // Draw Sprite
            const scale = 2; // Entity scale
            const sw = sprite.width * scale;
            const sh = sprite.height * scale;
            
            // Center bottom of sprite at position
            ctx.drawImage(sprite, 
                screenPos.x - sw / 2, 
                screenPos.y - sh + (dims.h/2), // Adjust for anchor
                sw, sh
            );
        } else {
            // Draw Placeholder (Improved to look 3D/Grounded)
            
            // 1. Shadow (Grounding)
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            // Isometric shadow shape
            ctx.ellipse(screenPos.x, screenPos.y + dims.h/2, 10, 5, 0, 0, Math.PI*2);
            ctx.fill();
            
            // 2. Body (Floating slightly above anchor to look like a standing object)
            const bodyHeight = 20;
            const yOffset = -bodyHeight/2 + dims.h/2;
            
            ctx.fillStyle = this.type === 'enemy' ? '#e74c3c' : '#2ecc71';
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y + yOffset, 10, 0, Math.PI * 2);
            ctx.fill();
            
            // Debug Text
            if (this.spriteId) {
                ctx.fillStyle = "white";
                ctx.font = "10px monospace";
                ctx.textAlign = "center";
                ctx.fillText(this.spriteId, screenPos.x, screenPos.y - 20);
            }
        }
        
        // Draw HP Bar for enemies
        if (this.type === 'enemy' && this.hp < this.maxHp) {
            const barW = 30;
            ctx.fillStyle = '#000';
            ctx.fillRect(screenPos.x - barW/2, screenPos.y - 40, barW, 4);
            ctx.fillStyle = '#f00';
            ctx.fillRect(screenPos.x - barW/2, screenPos.y - 40, barW * (this.hp / this.maxHp), 4);
        }
    }
}

window.IsoEntity = IsoEntity;