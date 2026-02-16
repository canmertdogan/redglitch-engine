class PlatformerPhysics {
    constructor() {
        this.gravity = 0.5;
        this.friction = 0.8;
        this.jumpForce = -10;
    }

    apply(entity, map) {
        // Apply Gravity
        entity.vy += this.gravity;
        
        // Apply Friction (Horizontal)
        entity.vx *= this.friction;

        // X Movement & Collision
        entity.x += entity.vx;
        this.checkCollisions(entity, map, 'x');

        // Y Movement & Collision
        entity.y += entity.vy;
        entity.onGround = false;
        this.checkCollisions(entity, map, 'y');
    }

    checkCollisions(entity, map, axis) {
        const tileSize = 32;
        // Simple bounding box logic
        const left = Math.floor(entity.x / tileSize);
        const right = Math.floor((entity.x + entity.w - 1) / tileSize);
        const top = Math.floor(entity.y / tileSize);
        const bottom = Math.floor((entity.y + entity.h - 1) / tileSize);

        for(let tx = left; tx <= right; tx++) {
            for(let ty = top; ty <= bottom; ty++) {
                const tileType = this.getTile(map, tx, ty);
                if(tileType === 1) { // 1 = Solid
                    if (axis === 'x') {
                        if (entity.vx > 0) entity.x = tx * tileSize - entity.w;
                        else if (entity.vx < 0) entity.x = (tx + 1) * tileSize;
                        entity.vx = 0;
                    } else {
                        if (entity.vy > 0) {
                            entity.y = ty * tileSize - entity.h;
                            entity.onGround = true;
                        }
                        else if (entity.vy < 0) entity.y = (ty + 1) * tileSize;
                        entity.vy = 0;
                    }
                }
            }
        }
    }

    getTile(map, x, y) {
        // map: { width, height, collision: [] }
        if(y < 0 || y >= map.height) return null;
        if(x < 0 || x >= map.width) return null;
        return map.collision[y * map.width + x];
    }
}

window.PlatformerPhysics = PlatformerPhysics;
