/**
 * ShooterEnemy.js
 * An enemy that stays at a distance and fires projectiles at the player.
 */

class ShooterEnemy extends Enemy {
    constructor(x, y, type = 'goblin') {
        super(x, y, type);
        this.fireRate = 2.0;
        this.fireTimer = 0;
        this.range = 400;
        this.animator.add('attack', 4, 0.1, false);
    }

    update(dt, map) {
        if (this.isDead) return;

        const player = window.game?.player;
        if (!player) return;

        const dx = (player.x + player.w/2) - (this.x + this.w/2);
        const dy = (player.y + player.h/2) - (this.y + this.h/2);
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < this.range) {
            this.facingRight = dx > 0;
            this.vx = 0;

            this.fireTimer += dt;
            if (this.fireTimer >= this.fireRate) {
                this.fireTimer = 0;
                this.shoot();
            }
        } else {
            this.updatePatrol(dt, map);
        }

        super.update(dt, map);
    }

    shoot() {
        if (!window.game?.combat) return;
        
        const player = window.game.player;
        const dx = (player.x + player.w/2) - (this.x + this.w/2);
        const dy = (player.y + player.h/2) - (this.y + this.h/2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Normalize and speed up
        const vx = (dx / dist) * 6;
        const vy = (dy / dist) * 6;

        window.game.combat.spawnProjectile(this, this.x + this.w/2, this.y + this.h/2, vx, vy, {
            isEnemy: true,
            damage: 5,
            color: '#e74c3c'
        });
        
        this.animator.play('attack', true);
    }
}

window.ShooterEnemy = ShooterEnemy;
