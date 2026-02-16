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
        const spawn = { x: 2, y: height - 5 };
        const goal = { x: width - 5, y: height - 5 };

        const caps = this.jumpSim.getCapabilities();
        
        switch(theme) {
            case 'flow': this.generateFlow(collision, width, height, spawn, goal, caps, diffFactor); break;
            case 'spire': this.generateSpire(collision, width, height, spawn, goal, caps, diffFactor); break;
            case 'abyss': this.generateAbyss(collision, width, height, spawn, goal, caps, diffFactor); break;
            case 'gauntlet': this.generateGauntlet(collision, width, height, spawn, goal, caps, diffFactor); break;
            case 'clockwork': this.generateClockwork(collision, width, height, spawn, goal, caps, diffFactor); break;
            default: this.generateFlow(collision, width, height, spawn, goal, caps, diffFactor); break;
        }

        this.fillTerrain(collision, width, height);

        return {
            width, height, collision, layers, decorations, spawn, goal,
            type: 'platformer-2d', name: `${theme}_${Date.now()}`
        };
    }

    // --- THEME ALGORITHMS ---

    generateFlow(col, w, h, spawn, goal, caps, diff) {
        // FLOW: Speed. Diff affects gap size vs platform length ratio.
        let cx = spawn.x, cy = spawn.y;
        this.placePlatform(col, w, cx - 2, cy + 1, 10); 

        while (cx < goal.x - 10) {
            // Easier = smaller gaps, wider platforms
            // Harder = max gaps, narrower platforms
            
            const maxGap = Math.floor(caps.maxDistance * (0.5 + diff * 0.5)); 
            const gap = 2 + Math.floor(Math.random() * (maxGap - 1));
            
            const dy = Math.floor(Math.random() * 3) - 1; 
            
            cx += gap;
            cy += dy;
            cy = this.clampY(cy, h);

            const baseW = 10 - (diff * 5); // 10 -> 5 width range
            const platW = Math.floor(baseW + Math.random() * 5); 
            this.placePlatform(col, w, cx, cy + 1, platW);
            cx += platW;
        }
        this.placePlatform(col, w, goal.x - 2, goal.y + 1, 6);
    }

    generateSpire(col, w, h, spawn, goal, caps, diff) {
        // SPIRE: Verticality. Diff affects jump height precision.
        let cx = w / 2; 
        let cy = h - 5;
        spawn.x = Math.floor(cx); spawn.y = Math.floor(cy);
        this.placePlatform(col, w, cx - 3, cy + 1, 6);

        let goingRight = true;
        
        while (cy > 10) { 
            // Harder = higher jumps
            const maxH = Math.floor(caps.maxJumpHeight * (0.6 + diff * 0.4));
            const jumpH = 2 + Math.floor(Math.random() * (maxH - 1));
            
            const jumpDist = 3 + Math.floor(Math.random() * 4);
            
            cy -= jumpH;
            cx += goingRight ? jumpDist : -jumpDist;
            
            if (cx > w - 5) { cx = w - 8; goingRight = false; }
            if (cx < 5) { cx = 5; goingRight = true; }

            const wMod = Math.floor((1 - diff) * 3); // Easier = +0-2 width
            this.placePlatform(col, w, cx, cy + 1, 2 + wMod + Math.floor(Math.random() * 2));
        }
        goal.x = Math.floor(cx); goal.y = Math.floor(cy);
    }

    generateAbyss(col, w, h, spawn, goal, caps, diff) {
        // ABYSS: Precision. Diff affects gap/platform ratio aggressively.
        let cx = spawn.x, cy = spawn.y;
        this.placePlatform(col, w, cx - 2, cy + 1, 4);

        while (cx < goal.x - 5) {
            // Hard = Max distance
            const targetGap = caps.maxDistance * (0.4 + diff * 0.6);
            const gap = Math.floor(targetGap - Math.random());
            
            const dyRange = Math.floor(caps.maxJumpHeight * diff);
            const dy = Math.floor(Math.random() * (dyRange * 2 + 1)) - dyRange;
            
            cx += gap;
            cy += dy;
            cy = this.clampY(cy, h);

            // Hard = 1 tile. Easy = 3 tiles.
            const platW = Math.max(1, Math.floor(4 - diff * 3));
            this.placePlatform(col, w, cx, cy + 1, platW);
            cx += platW; 
        }
        this.placePlatform(col, w, goal.x - 2, goal.y + 1, 4);
    }

    generateGauntlet(col, w, h, spawn, goal, caps, diff) {
        // GAUNTLET: Combat. Diff affects arena frequency and gap size.
        let cx = spawn.x, cy = spawn.y;
        this.placePlatform(col, w, cx - 2, cy + 1, 5);

        while (cx < goal.x - 10) {
            const gap = 2 + Math.floor(Math.random() * 3 * diff);
            cx += gap;
            
            // Harder = Smaller arenas, more gaps? Or bigger arenas for more enemies?
            // Let's say Harder = More fragmented arenas
            const arenaW = 10 + Math.floor(Math.random() * 6);
            
            if (diff > 0.7 && Math.random() > 0.5) {
                // Fragmented arena
                this.placePlatform(col, w, cx, cy + 1, Math.floor(arenaW/2));
                cx += Math.floor(arenaW/2) + 2;
                this.placePlatform(col, w, cx, cy + 1, Math.floor(arenaW/2));
            } else {
                this.placePlatform(col, w, cx, cy + 1, arenaW);
            }
            
            cx += arenaW;
        }
        this.placePlatform(col, w, goal.x - 2, goal.y + 1, 5);
    }

    generateClockwork(col, w, h, spawn, goal, caps, diff) {
        // CLOCKWORK: Complexity. Diff affects path length/winding.
        let cx = spawn.x, cy = spawn.y;
        
        const pathLen = 2 + Math.floor(diff * 4); // 2 to 6 segments
        
        for(let i=0; i<pathLen; i++) {
            this.placePlatform(col, w, cx, cy+1, 8);
            cx += 10;
        }
        
        cy -= 6;
        this.placePlatform(col, w, cx, cy+1, 4);
        
        // Return path
        while (cx > spawn.x) {
            cx -= (8 + Math.floor(diff * 2));
            this.placePlatform(col, w, cx, cy+1, 6);
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
