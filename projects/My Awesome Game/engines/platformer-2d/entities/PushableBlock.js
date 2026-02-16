/**
 * PushableBlock.js
 * An entity that can be pushed by the player and is affected by physics.
 */

class PushableBlock extends Entity {
    constructor(x, y, w = 32, h = 32) {
        super(x * 32, y * 32, w, h);
        this.color = '#7f8c8d';
        this.vx = 0;
        this.vy = 0;
        this.hp = Infinity; // Invulnerable
        this.type = 'pushable';
    }

    update(dt, map) {
        // Friction for the block itself when not being pushed
        this.vx *= 0.9;
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
        
        super.update(dt, map);
    }

    draw(renderer) {
        const ctx = renderer.ctx;
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.w, this.h);
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.floor(this.x), Math.floor(this.y), this.w, this.h);
        
        // Pattern
        ctx.beginPath();
        ctx.moveTo(this.x + 4, this.y + 4);
        ctx.lineTo(this.x + this.w - 4, this.y + this.h - 4);
        ctx.moveTo(this.x + this.w - 4, this.y + 4);
        ctx.lineTo(this.x + 4, this.y + this.h - 4);
        ctx.stroke();
    }
}

window.PushableBlock = PushableBlock;
