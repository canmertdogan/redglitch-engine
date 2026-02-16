class PhysicsSystem {
    constructor() {
        this.gravity = 0.5;
        this.friction = 0.8;
        this.terminalVelocity = 12;
    }

    apply(entity, map, platforms = []) {
        if (!entity || !map || !map.collision) return;

        // Sanitize entity state to prevent NaN crashes
        if (isNaN(entity.x)) entity.x = 0;
        if (isNaN(entity.y)) entity.y = 0;
        if (isNaN(entity.vx)) entity.vx = 0;
        if (isNaN(entity.vy)) entity.vy = 0;

        // 1. Moving Platform Carrier Logic
        this.handlePlatforms(entity, platforms);

        // 2. Apply Gravity
        entity.vy += this.gravity;
        if (entity.vy > this.terminalVelocity) entity.vy = this.terminalVelocity;
        
        // 3. Apply Friction (Horizontal)
        entity.vx *= this.friction;
        if (Math.abs(entity.vx) < 0.1) entity.vx = 0;

        // 4. X Movement & Collision
        entity.x += entity.vx;
        this.checkCollisions(entity, map, 'x');

        // 5. Y Movement & Collision
        entity.y += entity.vy;
        entity.onGround = false; 
        this.checkCollisions(entity, map, 'y');
        
        // 6. Map Bounds & Void Protection
        const mapMaxX = (map.width || 0) * 32;
        const mapMaxY = (map.height || 0) * 32;

        if (entity.x < 0) { entity.x = 0; entity.vx = 0; }
        if (entity.x + entity.w > mapMaxX) { entity.x = mapMaxX - entity.w; entity.vx = 0; }
        
        // Prevent falling forever into the void
        if (entity.y > mapMaxY + 500) {
            if (entity.respawn) entity.respawn();
            else { entity.y = 0; entity.vy = 0; }
        }
    }

    handlePlatforms(entity, platforms) {
        let onPlatform = false;
        platforms.forEach(plat => {
            const footY = entity.y + entity.h;
            // A bit of slack for detection
            const isAbove = footY >= plat.y - 4 && footY <= plat.y + 12;
            const isWithinX = entity.x + entity.w > plat.x + 2 && entity.x < plat.x + plat.w - 2;

            if (isAbove && isWithinX && entity.vy >= 0) {
                const platVel = plat.getVelocity ? plat.getVelocity() : { x: 0, y: 0 };
                entity.x += platVel.x;
                // Don't just snap, but if we are moving down into it, snap to top
                if (entity.vy >= 0) {
                    entity.y = plat.y - entity.h; 
                    entity.vy = 0;
                    entity.onGround = true;
                    onPlatform = true;
                }
            }
        });
        return onPlatform;
    }

    checkCollisions(entity, map, axis) {
        if (!map || !map.collision) return;
        const tileSize = 32;
        
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
                    if (entity.y + entity.h - entity.vy <= tileTop + 1) {
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
            }
        }
    }

    resolveAABB(entity, tx, ty, tileSize, axis) {
        if (axis === 'x') {
            if (entity.vx > 0) entity.x = tx * tileSize - entity.w;
            else if (entity.vx < 0) entity.x = (tx + 1) * tileSize;
            entity.vx = 0;
        } else {
            if (entity.vy > 0) {
                entity.y = ty * tileSize - entity.h;
                entity.onGround = true;
            } else if (entity.vy < 0) {
                entity.y = (ty + 1) * tileSize;
            }
            entity.vy = 0;
        }
    }

    resolvePlatform(entity, tileTop) {
        entity.y = tileTop - entity.h;
        entity.vy = 0;
        entity.onGround = true;
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
}

window.PhysicsSystem = PhysicsSystem;