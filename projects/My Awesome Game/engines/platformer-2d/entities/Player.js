class Player extends Entity {
    constructor(x, y) {
        super(x, y, 24, 32);
        this.color = '#e74c3c';
        
        // Stats
        this.hp = 100;
        this.maxHp = 100;
        this.coins = 0;
        
        // Movement Config
        this.moveSpeed = 1.5; 
        this.maxSpeed = 6;
        this.jumpForce = -10;
        
        // Game Feel
        this.coyoteTimer = 0;
        this.coyoteTimeMax = 0.1; // 100ms grace period to jump after falling
        this.jumpBufferTimer = 0;
        this.jumpBufferMax = 0.15; // 150ms buffer for jump inputs
        
        // Special Features
        this.isWorm = false;
        this.history = [];
        this.segmentCount = 8;
        this.segmentSpacing = 4;
        this.glowColor = '#e74c3c';
        
        // Animation
        this.spriteName = 'player'; 
    }

    handleInput(keys) {
        // Horizontal
        if (keys['ArrowLeft'] || keys['KeyA']) {
            this.vx -= this.moveSpeed;
            this.facingRight = false;
        }
        if (keys['ArrowRight'] || keys['KeyD']) {
            this.vx += this.moveSpeed;
            this.facingRight = true;
        }

        // Jump Request (Buffering)
        if (keys['ArrowUp'] || keys['Space'] || keys['KeyW']) {
            this.jumpBufferTimer = this.jumpBufferMax;
        }
    }

    update(dt, map) {
        super.update(dt, map);

        // Update Timers
        if (this.onGround) {
            this.coyoteTimer = this.coyoteTimeMax;
        } else {
            this.coyoteTimer -= dt;
        }
        this.jumpBufferTimer -= dt;

        // Execute Jump
        if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
            this.vy = this.jumpForce;
            this.onGround = false;
            this.coyoteTimer = 0;
            this.jumpBufferTimer = 0;
        }

        // Variable Jump Height (Release early to jump lower)
        // Note: This requires access to keys state in update or a flag
        // For now, we keep it simple.

        if (this.vx > this.maxSpeed) this.vx = this.maxSpeed;
        if (this.vx < -this.maxSpeed) this.vx = -this.maxSpeed;

        if (this.isWorm) {
            this.history.unshift({ x: this.x, y: this.y, dir: this.facingRight ? 1 : -1 });
            if (this.history.length > 100) this.history.pop();
        }

        // Animation State Logic
        if (!this.isWorm) {
            if (!this.onGround) {
                this.setAnimation(this.vy < 0 ? 'jump' : 'fall', 0.1);
            } else if (Math.abs(this.vx) > 0.5) {
                this.setAnimation('run', 0.1);
            } else {
                this.setAnimation('idle', 0.2);
            }
        }
    }

    draw(renderer) {
        if (this.isWorm) {
            renderer.drawWorm(this);
        } else {
            super.draw(renderer);
        }
    }
}

window.Player = Player;