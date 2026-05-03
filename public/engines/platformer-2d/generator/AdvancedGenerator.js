/**
 * AdvancedGenerator.js
 * Next-gen procedural level generator for Vortex Platformer Engine.
 * Features: Biomes, Segment Composition, and Layered Visuals.
 */

class AdvancedGenerator {
    constructor() {
        this.biomes = {
            'forest': {
                bg: '#2ecc71',
                ground: 1,
                hazard: 3,
                decorations: ['tree', 'bush'],
                entities: ['slime', 'enemy_flying'],
                tileset: 'WORLD_PIXEL_ART'
            },
            'cave': {
                bg: '#2c3e50',
                ground: 1,
                hazard: 3,
                decorations: ['rock', 'sign'],
                entities: ['bat', 'enemy_shooter'],
                tileset: 'WORLD_PIXEL_ART'
            },
            'castle': {
                bg: '#34495e',
                ground: 1,
                hazard: 3,
                decorations: ['lamp', 'sign'],
                entities: ['skeleton', 'knight'],
                tileset: 'WORLD_PIXEL_ART'
            }
        };

        // Predefined Segment Blueprints
        this.blueprints = {
            'pillar_jump': [
                "          ",
                "          ",
                "  #    #  ",
                "  #    #  ",
                "###    ###"
            ],
            'over_under': [
                "##########",
                "          ",
                "   ####   ",
                "          ",
                "##########"
            ],
            'hazard_leap': [
                "###      ###",
                "  #      #  ",
                "  # SSS  #  ",
                "  ########  "
            ]
        };
    }

    generate(config) {
        const { width, height, biome: biomeKey, difficulty } = config;
        const biome = this.biomes[biomeKey] || this.biomes.forest;
        const diffFactor = (difficulty || 5) / 10;

        console.log(`[AdvancedGenerator] Generating ${biomeKey} level...`);

        const map = {
            width, height,
            collision: new Array(width * height).fill(0),
            layers: [
                { name: 'background', data: new Array(width * height).fill(0) },
                { name: 'main', data: new Array(width * height).fill(0) },
                { name: 'foreground', data: new Array(width * height).fill(0) }
            ],
            decorations: [],
            entities: [],
            collectibles: [],
            spawn: { x: 2, y: height - 5 },
            background: biome.bg,
            autoTiling: true,
            type: 'platformer-2d',
            name: `${biomeKey}_${Date.now()}`
        };

        this.generateTerrain(map, biome, diffFactor);
        this.decorate(map, biome);
        this.populateEntities(map, biome, diffFactor);

        return map;
    }

    generateTerrain(map, biome, diff) {
        const { width, height, collision } = map;
        const mainLayer = map.layers.find(l => l.name === 'main').data;

        let cx = 0;
        let cy = height - 5;

        // Start platform
        this.drawRect(map, 0, cy + 1, 10, 5, 1);

        cx = 10;
        while (cx < width - 15) {
            const segmentType = Math.random();
            let segW = 10 + Math.floor(Math.random() * 10);

            if (segmentType < 0.3) {
                // Flat/Flow
                this.drawRect(map, cx, cy + 1, segW, 5, 1);
            } else if (segmentType < 0.5) {
                // Hazard Pit
                this.drawRect(map, cx, cy + 1, 3, 5, 1);
                for (let i = 0; i < segW - 6; i++) {
                    collision[(cy + 1) * width + cx + 3 + i] = 3; // Spike/Hazard
                }
                this.drawRect(map, cx + segW - 3, cy + 1, 3, 5, 1);
            } else if (segmentType < 0.7) {
                // Jump Gap
                const gap = 3 + Math.floor(Math.random() * 3);
                cx += gap;
                cy += (Math.random() - 0.5) * 6;
                cy = Math.max(8, Math.min(height - 8, cy));
                this.drawRect(map, cx, cy + 1, segW, 5, 1);
            } else if (segmentType < 0.85) {
                // Ladder Ascent
                this.drawRect(map, cx, cy + 1, 8, 5, 1);
                const ladderX = cx + 3;
                const ascentH = 6;
                for (let i = 0; i < ascentH; i++) {
                    collision[(cy - i) * width + ladderX] = 11; // Ladder
                }
                cy -= (ascentH - 1);
                this.drawRect(map, cx - 2, cy, 12, 1, 1);
                segW = 10;
            } else if (segmentType < 0.95) {
                // Blueprint Segment
                const keys = Object.keys(this.blueprints);
                const bp = this.blueprints[keys[Math.floor(Math.random() * keys.length)]];
                this.spawnSegment(map, cx, cy - 2, bp);
                segW = bp[0].length;
            } else {
                // Pillars / Steps
                for (let i = 0; i < 3; i++) {
                    const stepW = 3 + Math.floor(Math.random() * 3);
                    this.drawRect(map, cx, cy + 1, stepW, 5, 1);
                    cx += stepW + 3;
                    cy -= 2;
                }
                segW = 0;
            }

            cx += segW;
        }

        // End platform
        this.drawRect(map, width - 10, cy + 1, 10, 5, 1);
        map.exit = { x: width - 5, y: cy };

        // Sync main layer to collision for simple blocks
        for (let i = 0; i < collision.length; i++) {
            if (collision[i] === 1) mainLayer[i] = 1;
            else if (collision[i] === 3) mainLayer[i] = 3; // Visual for hazard
            else if (collision[i] === 11) mainLayer[i] = 11; // Visual for ladder
        }
    }

    spawnSegment(map, x, y, blueprint) {
        const bh = blueprint.length;
        const bw = blueprint[0].length;

        for (let iy = 0; iy < bh; iy++) {
            for (let ix = 0; ix < bw; ix++) {
                const char = blueprint[iy][ix];
                const tx = x + ix;
                const ty = y + iy;
                if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
                    const idx = ty * map.width + tx;
                    if (char === '#') map.collision[idx] = 1;
                    else if (char === 'S') map.collision[idx] = 3;
                    else if (char === 'L') map.collision[idx] = 11;
                }
            }
        }
    }

    drawRect(map, x, y, w, h, val) {
        for (let ix = x; ix < x + w; ix++) {
            for (let iy = y; iy < y + h; iy++) {
                if (ix >= 0 && ix < map.width && iy >= 0 && iy < map.height) {
                    map.collision[iy * map.width + ix] = val;
                }
            }
        }
    }

    decorate(map, biome) {
        // Add some trees/bushes on top of ground
        for (let x = 0; x < map.width; x++) {
            for (let y = 1; y < map.height; y++) {
                const idx = y * map.width + x;
                const aboveIdx = (y - 1) * map.width + x;
                
                if (map.collision[idx] === 1 && map.collision[aboveIdx] === 0) {
                    if (Math.random() < 0.1) {
                        const type = biome.decorations[Math.floor(Math.random() * biome.decorations.length)];
                        map.decorations.push({
                            type: 'prefab',
                            data: type,
                            x: x,
                            y: y - 1,
                            isForeground: Math.random() > 0.8
                        });
                    }
                }
            }
        }
    }

    populateEntities(map, biome, diff) {
        // Add some enemies
        for (let x = 20; x < map.width - 10; x += 15) {
            for (let y = 0; y < map.height; y++) {
                if (map.collision[y * map.width + x] === 1) {
                    if (Math.random() < 0.5 * diff) {
                        const type = biome.entities[Math.floor(Math.random() * biome.entities.length)];
                        map.entities.push({
                            type: type,
                            x: x,
                            y: y - 1,
                            behavior: 'patrol'
                        });
                    }
                    break;
                }
            }
        }

        // Add collectibles
        for (let i = 0; i < 10; i++) {
            const rx = 10 + Math.floor(Math.random() * (map.width - 20));
            for (let ry = 0; ry < map.height; ry++) {
                if (map.collision[ry * map.width + rx] === 1) {
                    map.collectibles.push({
                        type: 'coin',
                        x: rx,
                        y: ry - 1
                    });
                    break;
                }
            }
        }
    }
}

window.AdvancedGenerator = new AdvancedGenerator();
