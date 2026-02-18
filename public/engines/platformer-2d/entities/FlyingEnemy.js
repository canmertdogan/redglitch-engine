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
        this.bobAmount = 32;
        this.bobSpeed = 0.003;
        this.w = 32;
        this.h = 24;
    }

    update(dt, map) {
        if (this.isDead) return;

        if (this.behavior === 'patrol') {
            // Horizontal patrol
            this.vx = this.direction * this.speed;
            this.x += this.vx;
            
            // Bobbing motion
            this.y = this.targetY + Math.sin(Date.now() * this.bobSpeed) * this.bobAmount;

            // Check for walls
            const nextX = this.x + (this.vx > 0 ? this.w : 0) + this.vx;
            const tileX = Math.floor(nextX / 32);
            const tileY = Math.floor((this.y + this.h / 2) / 32);
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
                this.vx = (dx / dist) * this.speed;
                this.vy = (dy / dist) * this.speed;
                this.x += this.vx;
                this.y += this.vy;
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
