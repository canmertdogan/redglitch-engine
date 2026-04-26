/**
 * SmartGenerator.js
 * Action-Driven Procedural Level Generator for Platformer-2D
 */

class JumpSimulator {
    constructor(physicsConfig) {
        this.gravity = physicsConfig.gravity || 0.5;
        this.jumpForce = physicsConfig.jumpForce || -10;
        this.moveSpeed = physicsConfig.moveSpeed || 1.5;
        this.friction = physicsConfig.friction || 0.8;
        this.maxSpeed = physicsConfig.maxSpeed || 6;
        this.tileSize = 32;
    }

    getCapabilities() {
        let x = 0, y = 0, vx = this.maxSpeed, vy = this.jumpForce;
        let maxX = 0, maxY = 0;
        let reachedApex = false;

        for (let i = 0; i < 60; i++) {
            vy += this.gravity;
            x += vx;
            y += vy;
            if (vy > 0 && !reachedApex) reachedApex = true;
            if (y > 0) break; 
            maxX = Math.max(maxX, x);
            if (!reachedApex) maxY = Math.min(maxY, y);
        }

        return {
            maxDistance: Math.floor(maxX / this.tileSize),
            maxJumpHeight: Math.floor(Math.abs(maxY) / this.tileSize)
        };
    }
}

class SmartGenerator {
    constructor() {
        this.jumpSim = new JumpSimulator({
            gravity: 0.5,
            jumpForce: -10,
            moveSpeed: 1.5,
            maxSpeed: 6
        });
    }

    generate(config) {
        const { width, height, theme, difficulty, seed } = config;
        // Difficulty 1-10. Normalize to 0.1 - 1.0
        const diffFactor = Math.max(1, Math.min(10, difficulty || 5)) / 10;
        
        console.log(`[SmartGenerator] Generating ${theme} level (${width}x${height}) Diff: ${diffFactor}`);

        const collision = new Array(width * height).fill(0);
        const layers = [new Array(width * height).fill(0)];
        const decorations = [];
        const collectibles = [];
        const entities = [];
        const spawn = { x: 2, y: height - 5 };
        const goal = { x: width - 5, y: height - 5 };

        const caps = this.jumpSim.getCapabilities();
        
        const context = { collision, width, height, decorations, collectibles, entities, caps, diffFactor };

        switch(theme) {
            case 'flow': this.generateFlow(spawn, goal, context); break;
            case 'spire': this.generateSpire(spawn, goal, context); break;
            case 'abyss': this.generateAbyss(spawn, goal, context); break;
            case 'gauntlet': this.generateGauntlet(spawn, goal, context); break;
            case 'clockwork': this.generateClockwork(spawn, goal, context); break;
            default: this.generateFlow(spawn, goal, context); break;
        }

        this.fillTerrain(collision, width, height);

        return {
            width, height, collision, layers, decorations, collectibles, entities, spawn, goal,
            type: 'platformer-2d', name: `${theme}_${Date.now()}`
        };
    }

    // --- THEME ALGORITHMS ---

    generateFlow(spawn, goal, ctx) {
        let cx = spawn.x, cy = spawn.y;
        this.placePlatform(ctx.collision, ctx.width, cx - 2, cy + 1, 10); 

        while (cx < goal.x - 10) {
            const maxGap = Math.floor(ctx.caps.maxDistance * (0.5 + ctx.diffFactor * 0.5)); 
            const gap = 2 + Math.floor(Math.random() * (maxGap - 1));
            const dy = Math.floor(Math.random() * 3) - 1; 
            
            cx += gap;
            cy += dy;
            cy = this.clampY(cy, ctx.height);

            const baseW = 10 - (ctx.diffFactor * 5); 
            const platW = Math.floor(baseW + Math.random() * 5); 
            this.placePlatform(ctx.collision, ctx.width, cx, cy + 1, platW);
            
            // Add rewards
            if (Math.random() > 0.3) {
                ctx.collectibles.push({ x: cx + Math.floor(platW/2), y: cy - 1, type: 'coin' });
            }

            cx += platW;
        }
        this.placePlatform(ctx.collision, ctx.width, goal.x - 2, goal.y + 1, 6);
    }

    generateSpire(spawn, goal, ctx) {
        let cx = ctx.width / 2; 
        let cy = ctx.height - 5;
        spawn.x = Math.floor(cx); spawn.y = Math.floor(cy);
        this.placePlatform(ctx.collision, ctx.width, cx - 3, cy + 1, 6);

        let goingRight = true;
        
        while (cy > 10) { 
            const maxH = Math.floor(ctx.caps.maxJumpHeight * (0.6 + ctx.diffFactor * 0.4));
            const jumpH = 2 + Math.floor(Math.random() * (maxH - 1));
            const jumpDist = 3 + Math.floor(Math.random() * 4);
            
            cy -= jumpH;
            cx += goingRight ? jumpDist : -jumpDist;
            
            if (cx > ctx.width - 5) { cx = ctx.width - 8; goingRight = false; }
            if (cx < 5) { cx = 5; goingRight = true; }

            const wMod = Math.floor((1 - ctx.diffFactor) * 3);
            this.placePlatform(ctx.collision, ctx.width, cx, cy + 1, 2 + wMod + Math.floor(Math.random() * 2));
            
            if (Math.random() < 0.2) {
                ctx.entities.push({ x: cx, y: cy - 1, type: 'enemy', behavior: 'patrol' });
            }
        }
        goal.x = Math.floor(cx); goal.y = Math.floor(cy);
    }

    generateAbyss(spawn, goal, ctx) {
        let cx = spawn.x, cy = spawn.y;
        this.placePlatform(ctx.collision, ctx.width, cx - 2, cy + 1, 4);

        while (cx < goal.x - 5) {
            const targetGap = ctx.caps.maxDistance * (0.4 + ctx.diffFactor * 0.6);
            const gap = Math.floor(targetGap - Math.random());
            const dyRange = Math.floor(ctx.caps.maxJumpHeight * ctx.diffFactor);
            const dy = Math.floor(Math.random() * (dyRange * 2 + 1)) - dyRange;
            
            cx += gap;
            cy += dy;
            cy = this.clampY(cy, ctx.height);

            const platW = Math.max(1, Math.floor(4 - ctx.diffFactor * 3));
            this.placePlatform(ctx.collision, ctx.width, cx, cy + 1, platW);
            
            // Hazards on hard
            if (ctx.diffFactor > 0.6 && Math.random() > 0.7) {
                ctx.collision[Math.floor(cy + 1) * ctx.width + cx] = 3; // Hazard tile
            }

            cx += platW; 
        }
        this.placePlatform(ctx.collision, ctx.width, goal.x - 2, goal.y + 1, 4);
    }

    generateGauntlet(spawn, goal, ctx) {
        let cx = spawn.x, cy = spawn.y;
        this.placePlatform(ctx.collision, ctx.width, cx - 2, cy + 1, 5);

        while (cx < goal.x - 10) {
            const gap = 2 + Math.floor(Math.random() * 3 * ctx.diffFactor);
            cx += gap;
            
            const arenaW = 10 + Math.floor(Math.random() * 6);
            this.placePlatform(ctx.collision, ctx.width, cx, cy + 1, arenaW);
            
            // Combat spawns
            const enemyCount = 1 + Math.floor(ctx.diffFactor * 3);
            for(let i=0; i<enemyCount; i++) {
                ctx.entities.push({ 
                    x: cx + 2 + Math.floor(Math.random() * (arenaW - 4)), 
                    y: cy - 1, 
                    type: 'enemy', 
                    behavior: 'patrol' 
                });
            }
            
            // Hazards
            if (ctx.diffFactor > 0.5) {
                ctx.collision[Math.floor(cy + 1) * ctx.width + cx + Math.floor(arenaW/2)] = 3;
            }
            
            cx += arenaW;
        }
        this.placePlatform(ctx.collision, ctx.width, goal.x - 2, goal.y + 1, 5);
    }

    generateClockwork(spawn, goal, ctx) {
        let cx = spawn.x, cy = spawn.y;
        const pathLen = 2 + Math.floor(ctx.diffFactor * 4);
        
        for(let i=0; i<pathLen; i++) {
            this.placePlatform(ctx.collision, ctx.width, cx, cy+1, 8);
            if (i % 2 === 0) ctx.collectibles.push({ x: cx + 4, y: cy - 1, type: 'coin' });
            cx += 10;
        }
        
        cy -= 6;
        this.placePlatform(ctx.collision, ctx.width, cx, cy+1, 4);
        
        while (cx > spawn.x) {
            cx -= (8 + Math.floor(ctx.diffFactor * 2));
            this.placePlatform(ctx.collision, ctx.width, cx, cy+1, 6);
            if (Math.random() > 0.5) ctx.entities.push({ x: cx + 2, y: cy - 1, type: 'enemy' });
        }
        
        goal.x = Math.floor(cx); goal.y = Math.floor(cy);
    }

    // --- UTILS ---

    placePlatform(col, w, x, y, width) {
        for (let i = 0; i < width; i++) {
            const tx = Math.floor(x + i);
            const ty = Math.floor(y);
            if (tx >= 0 && tx < w && ty >= 0 && ty < col.length / w) {
                col[ty * w + tx] = 1;
            }
        }
    }

    fillTerrain(col, w, h) {
        for (let x = 0; x < w; x++) {
            let foundSolid = false;
            for (let y = 0; y < h; y++) {
                if (col[y * w + x] === 1) foundSolid = true;
                else if (foundSolid) col[y * w + x] = 1;
            }
        }
    }

    clampY(y, h) {
        return Math.max(5, Math.min(h - 5, y));
    }
}

window.SmartGenerator = new SmartGenerator();
