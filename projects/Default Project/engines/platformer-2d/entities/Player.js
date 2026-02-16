class Player extends Entity {
    constructor(x, y) {
        super(x, y, 24, 32);
        this.color = '#e74c3c';
        
        const config = window.PlatformerConfig || {};
        
        // Stats
        this.hp = 100;
        this.maxHp = 100;
        this.coins = 0;
        
        // Movement Config
        this.moveSpeed = 1.5; 
        this.maxSpeed = config.MAX_RUN_SPEED || 6;
        this.jumpForce = config.JUMP_FORCE || -10;
        
        // Game Feel
        this.coyoteTimer = 0;
        this.coyoteTimeMax = config.COYOTE_TIME || 0.15; 
        this.jumpBufferTimer = 0;
        this.jumpBufferMax = config.JUMP_BUFFER || 0.1; 
        
        // Special Features
        this.isWorm = config.DEFAULT_PLAYER_MODE === 'WORM';
        this.history = [];
        this.segmentCount = 8;
        this.segmentSpacing = 4;
        this.glowColor = '#e74c3c';

        // Dash
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashCooldownTimer = 0;
        this.dashDirection = { x: 0, y: 0 };
        this.canDash = true;
        this.ghosts = []; // For dash trail
        this.isClimbing = false;
        this.isAttacking = false;
        
        // Animation
        this.spriteName = 'player'; 
        this.animator.add('idle', 1, 0.2);
        this.animator.add('walk', 4, 0.15);
        this.animator.add('run', 4, 0.1);
        this.animator.add('jump', 1, 0.1);
        this.animator.add('fall', 1, 0.1);
        this.animator.add('climb', 4, 0.15);
        this.animator.add('wall_slide', 1, 0.1);
        this.animator.add('attack', 4, 0.08, false);

        // Light
        this.light = {
            radius: 200,
            color: 'rgba(231, 76, 60, 0.3)',
            intensity: 0.8
        };
    }

    handleInput(keys) {
        this.keys = keys; // Store for physics system access
        const config = window.PlatformerConfig || {};
        const isRunning = keys['ShiftLeft'] || keys['ShiftRight'];
        const currentMaxSpeed = isRunning ? (config.MAX_RUN_SPEED || 6) : (config.MAX_WALK_SPEED || 4);
        
        // Horizontal
        let horizontalInput = false;
        if (keys['ArrowLeft'] || keys['KeyA']) {
            this.vx -= this.moveSpeed;
            this.facingRight = false;
            horizontalInput = true;
        }
        if (keys['ArrowRight'] || keys['KeyD']) {
            this.vx += this.moveSpeed;
            this.facingRight = true;
            horizontalInput = true;
        }

        if (!horizontalInput && this.onGround) {
            this.vx *= (config.FRICTION || 0.8); // Faster stopping on ground
        }

        // Limit speed
        if (this.vx > currentMaxSpeed) this.vx = currentMaxSpeed;
        if (this.vx < -currentMaxSpeed) this.vx = -currentMaxSpeed;

        // Jump Request (Buffering)
        if (keys['ArrowUp'] || keys['Space'] || keys['KeyW']) {
            this.jumpBufferTimer = this.jumpBufferMax;
        }

        // Dash Request
        if ((keys['KeyK'] || keys['ShiftRight']) && this.canDash && this.dashCooldownTimer <= 0) {
            this.startDash();
        }

        // Attack Request
        if ((keys['KeyJ'] || keys['KeyZ']) && !this.isAttacking) {
            this.startAttack();
        }
    }

    startAttack() {
        this.isAttacking = true;
        this.setAnimation('attack', 0.08);
        
        // Spawn hitbox
        if (window.game?.combat) {
            window.game.combat.spawnMeleeHitbox(this, 8, 0, 48, 32, 10, 0.2);
        }

        // Auto-reset after animation (roughly)
        setTimeout(() => {
            this.isAttacking = false;
        }, 320);
    }

    startDash() {
        const config = window.PlatformerConfig || {};
        this.isDashing = true;
        this.canDash = false;
        this.dashTimer = config.DASH_DURATION || 0.2;
        this.dashCooldownTimer = config.DASH_COOLDOWN || 0.5;
        
        // Determine direction
        let dx = 0, dy = 0;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx = -1;
        else if (this.keys['ArrowRight'] || this.keys['KeyD']) dx = 1;
        else dx = this.facingRight ? 1 : -1;

        if (this.keys['ArrowUp'] || this.keys['KeyW']) dy = -1;
        else if (this.keys['ArrowDown'] || this.keys['KeyS']) dy = 1;

        // Normalize
        if (dx !== 0 && dy !== 0) {
            const mag = Math.sqrt(dx*dx + dy*dy);
            dx /= mag; dy /= mag;
        }

        this.dashDirection = { x: dx, y: dy };
        this.vx = dx * (config.DASH_FORCE || 12);
        this.vy = dy * (config.DASH_FORCE || 12);

        if (window.game?.fx) {
            window.game.fx.shake(5, 0.1);
            window.game.fx.spawnParticles(this.x + this.w/2, this.y + this.h/2, 'smoke', 8);
        }
    }

    onLand() {
        if (window.game?.fx) {
            window.game.fx.spawnParticles(this.x + this.w/2, this.y + this.h, 'smoke', 5);
            // Stronger landing if falling fast
            if (this.vy > 8) {
                window.game.renderer.shake(3, 0.1);
            }
        }
    }

    update(dt, map) {
        // Ghost Trail Update
        this.ghosts = this.ghosts.filter(g => {
            g.alpha -= dt * 5;
            return g.alpha > 0;
        });

        if (this.isDashing) {
            this.dashTimer -= dt;
            
            // Spawn ghost every frame or every other frame
            this.ghosts.push({
                x: this.x,
                y: this.y,
                alpha: 0.6,
                sprite: this.spriteName,
                frame: this.animFrame,
                facingRight: this.facingRight,
                isWorm: this.isWorm
            });

            if (this.dashTimer <= 0) {
                this.isDashing = false;
                // Preserve some momentum or stop? Most games preserve some.
                this.vx *= 0.5;
                this.vy *= 0.5;
            }

            // During dash, we override horizontal movement logic but PhysicsSystem still applies vx/vy
            // PhysicsSystem applies gravity though. I should probably tell it to skip gravity if dashing.
            // Or I can just counteract it here if PhysicsSystem is called after.
            // Actually, I'll add an 'ignoreGravity' flag.
            this.ignoreGravity = true;
        } else {
            this.ignoreGravity = false;
            if (this.onGround) {
                this.canDash = true;
            }
        }

        if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;

        // Ladder Logic
        if (this.onLadder) {
            const up = this.keys['ArrowUp'] || this.keys['KeyW'];
            const down = this.keys['ArrowDown'] || this.keys['KeyS'];
            if (up || down) this.isClimbing = true;
        } else {
            this.isClimbing = false;
        }

        if (this.isClimbing) {
            this.ignoreGravity = true;
            this.vx = 0; 
            const up = this.keys['ArrowUp'] || this.keys['KeyW'];
            const down = this.keys['ArrowDown'] || this.keys['KeyS'];
            if (up) this.vy = -3;
            else if (down) this.vy = 3;
            else this.vy = 0;

            if (this.jumpBufferTimer > 0) {
                this.isClimbing = false;
                this.vy = this.jumpForce;
                this.jumpBufferTimer = 0;
            }
        }

        super.update(dt, map);

        // Update Timers
        if (this.onGround) {
            this.coyoteTimer = this.coyoteTimeMax;
        } else {
            this.coyoteTimer -= dt;
        }
        this.jumpBufferTimer -= dt;

        // Wall Slide Logic
        this.isWallSliding = false;
        if (!this.onGround && this.vy > 0 && window.game?.physics) {
            this.wallContact = window.game.physics.checkWallContact(this, map);
            if (this.wallContact) {
                const pressingWall = (this.wallContact === 'left' && (this.keys['ArrowLeft'] || this.keys['KeyA'])) ||
                                    (this.wallContact === 'right' && (this.keys['ArrowRight'] || this.keys['KeyD']));
                
                if (pressingWall) {
                    this.isWallSliding = true;
                    const slideSpeed = window.PlatformerConfig?.WALL_SLIDE_SPEED || 2;
                    if (this.vy > slideSpeed) this.vy = slideSpeed;
                }
            }
        }

        // Execute Jump
        if (this.jumpBufferTimer > 0) {
            if (this.coyoteTimer > 0) {
                // Normal Jump
                this.vy = this.jumpForce;
                this.onGround = false;
                this.coyoteTimer = 0;
                this.jumpBufferTimer = 0;
            } else if (this.isWallSliding) {
                // Wall Jump
                const config = window.PlatformerConfig || {};
                const dir = this.wallContact === 'left' ? 1 : -1;
                this.vx = dir * (config.WALL_JUMP_FORCE_X || 5);
                this.vy = config.WALL_JUMP_FORCE_Y || -8;
                this.facingRight = dir > 0;
                this.jumpBufferTimer = 0;
                this.isWallSliding = false;
                if (window.game?.fx) window.game.fx.spawnParticles(this.x + (dir > 0 ? 0 : this.w), this.y + this.h/2, 'smoke', 5);
            }
        }

        if (this.isWorm) {
            this.history.unshift({ x: this.x, y: this.y, dir: this.facingRight ? 1 : -1 });
            if (this.history.length > 100) this.history.pop();
        }

        // Particle Triggers
        if (this.onGround && Math.abs(this.vx) > 3) {
            this.walkParticleTimer = (this.walkParticleTimer || 0) + dt;
            if (this.walkParticleTimer > 0.15) {
                this.walkParticleTimer = 0;
                if (window.game?.fx) window.game.fx.spawnParticles(this.x + this.w/2, this.y + this.h, 'smoke', 1);
            }
        }
        if (this.isWallSliding) {
            this.wallParticleTimer = (this.wallParticleTimer || 0) + dt;
            if (this.wallParticleTimer > 0.1) {
                this.wallParticleTimer = 0;
                const px = this.wallContact === 'left' ? this.x : this.x + this.w;
                if (window.game?.fx) window.game.fx.spawnParticles(px, this.y + this.h/2, 'smoke', 1);
            }
        }

        // Animation State Logic
        if (!this.isWorm) {
            if (this.isAttacking) {
                this.setAnimation('attack', 0.08);
            } else if (this.isClimbing) {
                this.setAnimation('climb', Math.abs(this.vy) > 0.1 ? 0.15 : 0);
            } else if (this.isWallSliding) {
                this.setAnimation('wall_slide', 0.1);
            } else if (!this.onGround) {
                this.setAnimation(this.vy < 0 ? 'jump' : 'fall', 0.1);
            } else if (Math.abs(this.vx) > 0.5) {
                this.setAnimation('run', 0.1);
            } else {
                this.setAnimation('idle', 0.2);
            }
        }
    }

    draw(renderer) {
        // Draw Ghosts
        this.ghosts.forEach(g => renderer.drawGhost(g));

        if (this.isWorm) {
            renderer.drawWorm(this);
        } else {
            super.draw(renderer);
        }
    }
}

window.Player = Player;