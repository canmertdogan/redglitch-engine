/**
 * Projectile.js
 * A moving object that deals damage on collision.
 */

class PlatformerProjectile extends PlatformerEntity {
    constructor(owner, x, y, vx, vy, config = {}) {
        super(x, y, config.w || 12, config.h || 12);
        this.owner = owner;
        this.vx = vx;
        this.vy = vy;
        this.damage = config.damage || 10;
        this.lifetime = config.lifetime || 2.0;
        this.color = config.color || '#ff0000';
        this.type = 'projectile';
        this.ignoreGravity = config.ignoreGravity !== false;
        this.isEnemy = config.isEnemy || false;
    }

    update(dt, map) {
        this.lifetime -= dt;
        if (this.lifetime <= 0) this.isDead = true;

        const scale = Math.max(0, Math.min(dt * 60, 4));
        const ts = window.game?.tileSize || window.PlatformerConfig?.TILE_SIZE || 32;
        const physics = window.game?.physics;
        const dx = this.vx * scale;
        const dy = this.vy * scale;

        // Sub-step sweep so fast projectiles can't tunnel through walls
        const dist = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(dist / (ts * 0.5)));
        const sx = dx / steps;
        const sy = dy / steps;
        for (let i = 0; i < steps; i++) {
            this.x += sx;
            this.y += sy;
            if (physics) {
                const tx = Math.floor((this.x + this.w / 2) / ts);
                const ty = Math.floor((this.y + this.h / 2) / ts);
                if (physics.getTile(map, tx, ty) === 1) {
                    this.onHitWall();
                    return;
                }
            }
        }
    }

    onHitWall() {
        this.isDead = true;
        if (window.game?.fx) {
            window.game.fx.spawnParticles(this.x, this.y, 'spark', 3);
        }
    }

    draw(renderer) {
        const ctx = renderer.ctx;
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(this.x + this.w/2, this.y + this.h/2, this.w/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

window.PlatformerProjectile = PlatformerProjectile;
