/**
 * Enemy.js
 * Basic AI-controlled entity for the Platformer Engine.
 */

class PlatformerEnemy extends PlatformerEntity {
    constructor(x, y, type = 'slime') {
        super(x, y, 32, 32);
        this.type = type;
        this.color = '#9b59b6';
        this.speed = 1;
        this.direction = 1; // 1 for right, -1 for left
        this.hp = 1;
        
        // AI State
        this.behavior = 'patrol'; // 'patrol', 'chase', 'wait'
        this.visionRange = 200;
        this.spriteName = type;

        this.animator.add('idle', 1, 0.2);
        this.animator.add('walk', 4, 0.15);
        this.animator.add('run', 4, 0.1);
        this.animator.add('hit', 1, 0.1, false);

        // Light
        this.light = {
            radius: 100,
            color: 'rgba(155, 89, 182, 0.3)',
            intensity: 0.5
        };
    }

    update(dt, map) {
        if (this.isDead) return;

        if (this.behavior === 'patrol') {
            this.updatePatrol(dt, map);
        } else if (this.behavior === 'chase') {
            this.updateChase(dt, map);
        }

        super.update(dt, map);
    }

    updatePatrol(dt, map) {
        this.vx = this.direction * this.speed;

        // Check for walls or edges
        const nextX = this.x + (this.vx > 0 ? this.w : 0) + this.vx;
        const tileX = Math.floor(nextX / 32);
        const tileY = Math.floor((this.y + this.h / 2) / 32);
        const tileBelowY = Math.floor((this.y + this.h + 2) / 32);

        const wall = window.game.physics.getTile(map, tileX, tileY);
        const floor = window.game.physics.getTile(map, tileX, tileBelowY);

        if (wall === 1 || floor === 0) {
            this.direction *= -1;
            this.vx = 0;
        }
        
        this.facingRight = this.direction > 0;
    }

    updateChase(dt, map) {
        const player = window.game.player;
        const dx = player.x - this.x;
        const dist = Math.abs(dx);

        if (dist < this.visionRange) {
            this.direction = Math.sign(dx);
            this.vx = this.direction * (this.speed * 1.5);
        } else {
            this.behavior = 'patrol';
        }
        
        this.facingRight = this.direction > 0;
    }

    onHit() {
        this.hp--;
        if (this.hp <= 0) {
            this.isDead = true;
            if (window.game && window.game.fx) window.game.fx.spawnParticles(this.x + this.w/2, this.y + this.h/2, 'spark', 10);
        }
    }
}

window.PlatformerEnemy = PlatformerEnemy;
