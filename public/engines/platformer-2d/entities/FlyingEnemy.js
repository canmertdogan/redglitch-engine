/**
 * FlyingEnemy.js
 * An enemy that ignores gravity and can move in any direction.
 */

class PlatformerFlyingEnemy extends PlatformerEnemy {
    constructor(x, y, type = 'bat') {
        super(x, y, type);
        this.ignoreGravity = true;
        this.speed = 2;
        this.targetY = this.y;
        const ts = (window.PlatformerConfig && window.PlatformerConfig.TILE_SIZE) || 32;
        this.bobAmount = ts;
        this.bobSpeed = 0.003;
        this.w = ts;
        this.h = Math.floor(ts * 0.75);
    }

    update(dt, map) {
        if (this.isDead) return;

        if (this.behavior === 'patrol') {
            // Horizontal patrol
            this.vx = this.direction * this.speed;
            const scale = Math.max(0, Math.min(dt * 60, 4));
            this.x += this.vx * scale;
            
            // Bobbing motion (absolute)
            this.y = this.targetY + Math.sin(Date.now() * this.bobSpeed) * this.bobAmount;

            // Check for walls
            const nextX = this.x + (this.vx > 0 ? this.w : 0) + this.vx;
            const ts = window.game?.tileSize || window.PlatformerConfig?.TILE_SIZE || 32;
            const tileX = Math.floor(nextX / ts);
            const tileY = Math.floor((this.y + this.h / 2) / ts);
            if (window.game?.physics && window.game.physics.getTile(map, tileX, tileY) === 1) {
                this.direction *= -1;
            }
            this.facingRight = this.direction > 0;
        } else if (this.behavior === 'chase') {
            // Move directly towards player
            const player = window.game.player;
            const dx = (player.x + player.w/2) - (this.x + this.w/2);
            const dy = (player.y + player.h/2) - (this.y + this.h/2);
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < this.visionRange) {
                const scale = Math.max(0, Math.min(dt * 60, 4));
                this.vx = (dx / dist) * this.speed;
                this.vy = (dy / dist) * this.speed;
                this.x += this.vx * scale;
                this.y += this.vy * scale;
                this.targetY = this.y; // Update patrol base
            } else {
                this.behavior = 'patrol';
                this.targetY = this.y;
            }
            this.facingRight = this.vx > 0;
        }

        this.animator.update(dt);
    }
}

window.PlatformerFlyingEnemy = PlatformerFlyingEnemy;
