class PhysicsSystem {
    constructor() {
        const cfg = window.PlatformerConfig || {};
        const config = Object.assign({ GRAVITY: 0.5, FRICTION: 0.8, TILE_SIZE: 32 }, cfg);
        this.gravity = config.GRAVITY;
        this.friction = config.FRICTION;
        this.terminalVelocity = config.TERMINAL_VELOCITY || 12;
        this.tileSize = config.TILE_SIZE || (window.PlatformerConfig && window.PlatformerConfig.TILE_SIZE) || 32;
    }

    apply(entity, map, platforms = [], dt = 1/60) {
        // Convert dt to an equivalent "ticks" scale where 1 tick == 1/60s
        const scale = Math.max(0, Math.min(dt * 60, 4));
        if (!entity || !map || !map.collision) return;

        // Sanitize entity state to prevent NaN crashes
        if (isNaN(entity.x)) entity.x = 0;
        if (isNaN(entity.y)) entity.y = 0;
        if (isNaN(entity.vx)) entity.vx = 0;
        if (isNaN(entity.vy)) entity.vy = 0;

        entity.wallContact = null;
        entity.onLadder = false;
        const config = window.PlatformerConfig || {};

        // 1. Moving Platform Carrier Logic
        this.handlePlatforms(entity, platforms);

        // 2. Apply Gravity (scaled) & Variable Jump Height
        if (!entity.ignoreGravity) {
            entity.vy += this.gravity * scale;
            if (entity.vy > this.terminalVelocity) entity.vy = this.terminalVelocity;
            
            // Variable jump height: cut velocity if jump key is released while moving up
            if (entity.vy < 0 && entity.keys) {
                const jumpHeld = entity.keys['ArrowUp'] || entity.keys['Space'] || entity.keys['KeyW'];
                if (!jumpHeld) {
                    entity.vy *= 0.5; // Cut velocity by half
                }
            }
        }
        
        // 3. Apply Friction (Horizontal) - approximate per-tick multiplicative friction using pow
        if (entity.onGround) {
            entity.vx *= Math.pow(this.friction, scale);
        } else {
            entity.vx *= Math.pow((config.AIR_RESISTANCE || 0.95), scale);
        }
        
        if (Math.abs(entity.vx) < 0.01) entity.vx = 0;

        // 4. X Movement & Collision (scale velocities to current dt)
        entity.x += entity.vx * scale;
        this.checkCollisions(entity, map, 'x');

        // 5. Y Movement & Collision
        entity.y += entity.vy * scale;
        entity.onGround = false; 
        this.checkCollisions(entity, map, 'y');
        
        // 6. Map Bounds & Void Protection
        const mapMaxX = (map.width || 0) * this.tileSize;
        const mapMaxY = (map.height || 0) * this.tileSize;

        if (entity.x < 0) { entity.x = 0; entity.vx = 0; }
        if (entity.x + entity.w > mapMaxX) { entity.x = mapMaxX - entity.w; entity.vx = 0; }
        
        // Prevent falling forever into the void
        if (entity.y > mapMaxY + 500) {
            if (entity.respawn) entity.respawn();
            else { entity.y = 0; entity.vy = 0; }
        }

        // --- NEW: Trigger Overlaps ---
        if (entity === window.game?.player) {
            window.game.entities.forEach(ent => {
                if (window.PlatformerTrigger && ent instanceof window.PlatformerTrigger) {
                    if (this.checkOverlap(entity, ent)) {
                        ent.onOverlap(entity);
                    }
                }
            });
        }
    }

    checkOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    handlePlatforms(entity, platforms) {
        // Clear previous platform reference if not grounded or vy < 0
        if (!entity.onGround || entity.vy < 0) {
            entity.ridingPlatform = null;
        }

        platforms.forEach(plat => {
            const footY = entity.y + entity.h;
            // Detection: check if entity is just above the platform
            const isAbove = footY >= plat.y - 4 && footY <= plat.y + 8;
            const isWithinX = (entity.x + entity.w > plat.x) && (entity.x < plat.x + plat.w);

            if (isAbove && isWithinX && entity.vy >= 0) {
                entity.ridingPlatform = plat;
                entity.y = plat.y - entity.h; 
                entity.vy = 0;
                entity.onGround = true;
            }
        });

        // Apply platform displacement if riding (use platform velocity helper if available)
        if (entity.ridingPlatform) {
            const plat = entity.ridingPlatform;
            let dx = 0, dy = 0;
            if (typeof plat.getVelocity === 'function') {
                const v = plat.getVelocity() || { x: 0, y: 0 };
                dx = v.x || 0;
                dy = v.y || 0;
            } else {
                dx = (typeof plat.x === 'number' && typeof plat.lastX === 'number') ? (plat.x - plat.lastX) : 0;
                dy = (typeof plat.y === 'number' && typeof plat.lastY === 'number') ? (plat.y - plat.lastY) : 0;
            }

            if (dx !== 0 || dy !== 0) {
                entity.x += dx;
                entity.y += dy;
            }
        }
    }

    checkCollisions(entity, map, axis) {
        if (!map || !map.collision) return;
        const tileSize = this.tileSize || (window.PlatformerConfig && window.PlatformerConfig.TILE_SIZE) || 32;

        const left = Math.floor(entity.x / tileSize);
        const right = Math.floor((entity.x + entity.w - 0.01) / tileSize);
        const top = Math.floor(entity.y / tileSize);
        const bottom = Math.floor((entity.y + entity.h - 0.01) / tileSize);

        for(let tx = left; tx <= right; tx++) {
            for(let ty = top; ty <= bottom; ty++) {
                const tileType = this.getTile(map, tx, ty);
                if (tileType === 0) continue;

                // 1-3: Solid / Platform / Hazard
                if (tileType === 1 || tileType === 2 || tileType === 3) {
                    this.resolveAABB(entity, tx, ty, tileSize, axis);
                }
                
                // One-Way Up (4)
                else if (tileType === 4 && axis === 'y' && entity.vy >= 0) {
                    const tileTop = ty * tileSize;
                    const isDropping = entity.keys && (entity.keys['ArrowDown'] || entity.keys['KeyS']);
                    
                    if (entity.y + entity.h - entity.vy <= tileTop + 1 && !isDropping) {
                         this.resolvePlatform(entity, tileTop);
                    }
                }

                // One-Way Down (5) - Solid from bottom
                else if (tileType === 5 && axis === 'y' && entity.vy <= 0) {
                    const tileBottom = (ty + 1) * tileSize;
                    if (entity.y - entity.vy >= tileBottom - 1) {
                        entity.y = tileBottom;
                        entity.vy = 0;
                    }
                }

                // One-Way Left (6) - Solid from right
                else if (tileType === 6 && axis === 'x' && entity.vx <= 0) {
                    const tileRight = (tx + 1) * tileSize;
                    if (entity.x - entity.vx >= tileRight - 1) {
                        entity.x = tileRight;
                        entity.vx = 0;
                    }
                }

                // One-Way Right (7) - Solid from left
                else if (tileType === 7 && axis === 'x' && entity.vx >= 0) {
                    const tileLeft = tx * tileSize;
                    if (entity.x + entity.w - entity.vx <= tileLeft + 1) {
                        entity.x = tileLeft - entity.w;
                        entity.vx = 0;
                    }
                }
                
                // Trigger Zone (8)
                else if (tileType === 8) {
                    if (entity.onTrigger) entity.onTrigger(tx, ty, map);
                }
                
                // Slopes (9, 10)
                else if (tileType === 9 || tileType === 10) {
                    // Slopes are always Y-resolution
                    if (axis === 'y') this.resolveSlope(entity, tx, ty, tileSize, tileType);
                }

                // Ladder (11)
                else if (tileType === 11) {
                    entity.onLadder = true;
                }
            }
        }
    }

    resolveAABB(entity, tx, ty, tileSize, axis) {
        if (axis === 'x') {
            if (entity.vx > 0) {
                entity.x = tx * tileSize - entity.w;
                entity.wallContact = 'right';
            } else if (entity.vx < 0) {
                entity.x = (tx + 1) * tileSize;
                entity.wallContact = 'left';
            }
            entity.vx = 0;
        } else {
            if (entity.vy > 0) {
                const wasOnGround = entity.onGround;
                entity.y = ty * tileSize - entity.h;
                entity.onGround = true;
                if (!wasOnGround && entity.onLand) entity.onLand();
            } else if (entity.vy < 0) {
                entity.y = (ty + 1) * tileSize;
            }
            entity.vy = 0;
        }
    }

    resolvePlatform(entity, tileTop) {
        const wasOnGround = entity.onGround;
        entity.y = tileTop - entity.h;
        entity.vy = 0;
        entity.onGround = true;
        if (!wasOnGround && entity.onLand) entity.onLand();
    }

    resolveSlope(entity, tx, ty, tileSize, type) {
        // Find center X but also check edges to prevent falling through at boundaries
        const checkPoints = [entity.x + 2, entity.x + entity.w / 2, entity.x + entity.w - 2];
        let highestSlopeY = Infinity;

        checkPoints.forEach(px => {
            const localX = px - (tx * tileSize);
            if (localX >= 0 && localX <= tileSize) {
                let localY = (type === 9) ? (tileSize - localX) : localX;
                const slopeY = ty * tileSize + localY;
                if (slopeY < highestSlopeY) highestSlopeY = slopeY;
            }
        });

        if (highestSlopeY !== Infinity && entity.y + entity.h > highestSlopeY) {
            // Only snap if we were above it or close to it
            if (entity.y + entity.h - entity.vy <= highestSlopeY + 10) {
                entity.y = highestSlopeY - entity.h;
                entity.vy = 0;
                entity.onGround = true;
            }
        }
    }

    getTile(map, x, y) {
        if(!map || y < 0 || y >= map.height) return null;
        if(x < 0 || x >= map.width) return null;
        return map.collision[y * map.width + x];
    }

    checkWallContact(entity, map) {
        const tileSize = this.tileSize || (window.PlatformerConfig && window.PlatformerConfig.TILE_SIZE) || 32;
        const margin = 2;
        
        // Left
        const leftX = Math.floor((entity.x - margin) / tileSize);
        const topY = Math.floor(entity.y / tileSize);
        const midY = Math.floor((entity.y + entity.h / 2) / tileSize);
        const botY = Math.floor((entity.y + entity.h - 0.01) / tileSize);
        
        const leftContact = this.getTile(map, leftX, topY) === 1 || 
                            this.getTile(map, leftX, midY) === 1 || 
                            this.getTile(map, leftX, botY) === 1;
                            
        if (leftContact) return 'left';
        
        // Right
        const rightX = Math.floor((entity.x + entity.w + margin) / tileSize);
        const rightContact = this.getTile(map, rightX, topY) === 1 || 
                             this.getTile(map, rightX, midY) === 1 || 
                             this.getTile(map, rightX, botY) === 1;
                             
        if (rightContact) return 'right';
        
        return null;
    }
}

window.PhysicsSystem = PhysicsSystem;