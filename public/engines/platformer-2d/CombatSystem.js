/**
 * CombatSystem.js
 * Handles hitboxes, hurtboxes, and projectiles for the 2D Platformer Engine.
 */

class Hitbox {
    constructor(owner, xOffset, yOffset, w, h, damage = 10, lifetime = (window.PlatformerConfig && window.PlatformerConfig.COMBAT_LIFETIME) || 0.1) {
        this.owner = owner; // Entity
        this.xOffset = xOffset;
        this.yOffset = yOffset;
        this.w = w;
        this.h = h;
        this.damage = damage;
        this.lifetime = lifetime;
        this.active = true;
        this.hitEntities = new Set(); // To prevent hitting same entity multiple times in one attack
    }

    getRect() {
        // If owner is facing right, hitbox is in front of them
        // If owner is facing left, hitbox is in front of them (mirrored)
        const x = this.owner.facingRight ? (this.owner.x + this.owner.w + this.xOffset) : (this.owner.x - this.xOffset - this.w);
        return {
            x: x,
            y: this.owner.y + this.yOffset,
            w: this.w,
            h: this.h
        };
    }

    update(dt) {
        this.lifetime -= dt;
        if (this.lifetime <= 0) this.active = false;
    }
}

class PlatformerCombatSystem {
    constructor(game) {
        this.game = game;
        this.hitboxes = [];
        this.projectiles = [];
    }

    spawnMeleeHitbox(owner, xOffset, yOffset, w, h, damage, duration) {
        const hb = new Hitbox(owner, xOffset, yOffset, w, h, damage, duration);
        this.hitboxes.push(hb);
        return hb;
    }

    spawnProjectile(owner, x, y, vx, vy, config) {
        const proj = new PlatformerProjectile(owner, x, y, vx, vy, config);
        this.projectiles.push(proj);
        return proj;
    }

    update(dt) {
        // Update Hitboxes
        this.hitboxes = this.hitboxes.filter(hb => {
            hb.update(dt);
            if (!hb.active) return false;

            // Check collisions with potential targets
            const rect = hb.getRect();
            
            // If owner is player, target enemies
            if (hb.owner === this.game.player) {
                this.game.entities.forEach(ent => {
                    if ((ent.type === 'enemy' || ent.hp !== undefined) && !ent.isDead && !hb.hitEntities.has(ent)) {
                        if (this.checkCollision(rect, ent)) {
                            this.hitEntity(hb, ent);
                        }
                    }
                });
            } else {
                // If owner is enemy, target player
                if (!hb.hitEntities.has(this.game.player)) {
                    if (this.checkCollision(rect, this.game.player)) {
                        this.hitEntity(hb, this.game.player);
                    }
                }
            }

            return true;
        });

        // Update Projectiles
        this.projectiles = this.projectiles.filter(proj => {
            proj.update(dt, this.game.map);
            if (proj.isDead) return false;

            // Collision check
            if (proj.isEnemy) {
                // Enemy hits player
                if (this.checkCollision(proj, this.game.player)) {
                    this.hitEntity({ damage: proj.damage, owner: proj.owner, getRect: () => proj, hitEntities: new Set() }, this.game.player);
                    proj.isDead = true;
                    return false;
                }
            } else {
                // Player hits enemies
                for (let ent of this.game.entities) {
                    if ((ent.type === 'enemy' || ent.hp !== undefined) && !ent.isDead) {
                        if (this.checkCollision(proj, ent)) {
                            this.hitEntity({ damage: proj.damage, owner: proj.owner, getRect: () => proj, hitEntities: new Set() }, ent);
                            proj.isDead = true;
                            return false;
                        }
                    }
                }
            }

            return true;
        });
    }

    checkCollision(rect, ent) {
        return rect.x < ent.x + ent.w &&
               rect.x + rect.w > ent.x &&
               rect.y < ent.y + ent.h &&
               rect.y + rect.h > ent.y;
    }

    hitEntity(hb, target) {
        hb.hitEntities.add(target);
        
        // Apply Damage
        if (target.onHit) {
            target.onHit(hb.damage, hb.owner);
        } else if (target.hp !== undefined) {
            target.hp -= hb.damage;
            if (target.hp <= 0) target.isDead = true;
        }

        // Apply Knockback
        if (!target.isDead && typeof target.vx !== 'undefined') {
            const dir = hb.owner.facingRight ? 1 : -1;
            target.vx = dir * 6;
            target.vy = -4;
        }

        // Apply Hit Stop (Freeze Frames)
        this.game.freezeFrames = 4; // Pause engine loop for 4 frames

        // FX
        if (this.game.fx) {
            const rect = hb.getRect();
            // Spawn spark at contact point
            const sparkX = hb.owner.facingRight ? (rect.x) : (rect.x + rect.w);
            this.game.fx.spawnParticles(sparkX, target.y + target.h/2, 'spark', 5);
            
            // Damage Number
            if (this.game.fx.popText) {
                this.game.fx.popText(target.x + target.w/2, target.y, `-${hb.damage}`, '#ff1e27');
            }

            if (this.game.renderer.shake) {
                this.game.renderer.shake(4, 0.15); // Stronger shake
            }
        }
    }

    draw(renderer) {
        // Draw Projectiles
        this.projectiles.forEach(proj => proj.draw(renderer));

        // Debug draw hitboxes
        if (window.DEBUG_HITBOXES) {
            const ctx = renderer.ctx;
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            this.hitboxes.forEach(hb => {
                const r = hb.getRect();
                ctx.strokeRect(r.x, r.y, r.w, r.h);
            });
        }
    }
}

window.PlatformerCombatSystem = PlatformerCombatSystem;
