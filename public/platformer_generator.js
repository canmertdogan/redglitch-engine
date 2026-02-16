// public/platformer_generator.js - Specialized 2D Platformer Level Generator
(function() {
    class PlatformerGenerator {
        constructor(seed) {
            this.seed = seed || Date.now();
            this.rng = this._createRNG(this.seed);
            
            this.TILE = {
                EMPTY: null,
                BLOCK: 1, // Solid
                PLATFORM: 8, // One-way or wood
                DECOR: 0,
                SPIKES: 'spikes',
                COIN: 'coin',
                ENEMY: 'enemy',
                CHECKPOINT: 'checkpoint',
                START: 'spawn',
                EXIT: 'exit'
            };
        }

        _createRNG(seed) {
            let s = typeof seed === 'string' ? this._hash(seed) : seed;
            return {
                next: () => {
                    s = (s * 9301 + 49297) % 233280;
                    return s / 233280;
                },
                int: (min, max) => Math.floor((s = (s * 9301 + 49297) % 233280) / 233280 * (max - min + 1)) + min
            };
        }

        _hash(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return hash;
        }

        generate(width, height, options = {}) {
            const density = options.density || 5;
            const theme = options.theme || 'caves';
            
            const map = {
                width: width,
                height: height,
                type: 'platformer-2d',
                layers: [new Array(width * height).fill(null), new Array(width * height).fill(null)],
                collision: new Array(width * height).fill(0),
                decorations: [],
                spawn: { x: 2, y: 0 },
                exit: { x: width - 3, y: 0 },
                background: theme === 'caves' ? '#1a1a2e' : '#87CEEB',
                tilesetPath: 'WORLD_PIXEL_ART'
            };

            console.log(`[PlatformerGenerator] Generating ${theme} level...`);

            if (theme === 'caves') {
                this._generateCaves(map, density);
            } else {
                this._generateIslands(map, density);
            }

            this._polish(map);
            return map;
        }

        _generateCaves(map, density) {
            const { width, height } = map;
            
            // Fill with solid
            map.collision.fill(1);
            map.layers[0].fill(3); // Stone wall

            // Cellular Automata for carving
            let grid = new Array(width * height).fill(0);
            for (let i = 0; i < width * height; i++) {
                const x = i % width;
                const y = Math.floor(i / width);
                if (x < 2 || x > width - 3 || y < 2 || y > height - 3) grid[i] = 1;
                else grid[i] = this.rng.next() < 0.45 ? 1 : 0;
            }

            for (let step = 0; step < 4; step++) {
                let nextGrid = [...grid];
                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        let neighbors = 0;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (grid[(y + dy) * width + (x + dx)]) neighbors++;
                            }
                        }
                        if (neighbors > 4) nextGrid[y * width + x] = 1;
                        else if (neighbors < 4) nextGrid[y * width + x] = 0;
                    }
                }
                grid = nextGrid;
            }

            // Apply grid to map
            for (let i = 0; i < width * height; i++) {
                if (grid[i] === 0) {
                    map.layers[0][i] = null;
                    map.collision[i] = 0;
                } else {
                    map.layers[0][i] = 3; // Stone
                    map.collision[i] = 1;
                }
            }

            // Ensure connectivity (Simplified: just find largest floor)
            this._ensureSpawnAndExit(map);
        }

        _generateIslands(map, density) {
            const { width, height } = map;
            const groundY = height - 4;

            // Generate main platforms
            let curX = 2;
            while (curX < width - 5) {
                const platW = this.rng.int(4, 10);
                const platY = this.rng.int(height / 2, height - 4);
                
                this._drawRect(map, curX, platY, platW, 2, 0, 11, 1); // Brick/Stone
                
                // Add jumpable floating platforms
                if (this.rng.next() < 0.6) {
                    const fx = curX + this.rng.int(0, platW - 3);
                    const fy = platY - this.rng.int(3, 5);
                    const fw = this.rng.int(3, 5);
                    this._drawRect(map, fx, fy, fw, 1, 0, 8, 1); // Wood
                    
                    if (this.rng.next() < 0.4) map.decorations.push({ x: fx + 1, y: fy - 1, type: 'coin' });
                }

                curX += platW + this.rng.int(2, 5);
            }

            this._ensureSpawnAndExit(map);
        }

        _drawRect(map, x, y, w, h, layer, tile, coll) {
            for (let ty = y; ty < y + h; ty++) {
                for (let tx = x; tx < x + w; tx++) {
                    if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
                        const idx = ty * map.width + tx;
                        map.layers[layer][idx] = tile;
                        map.collision[idx] = coll;
                    }
                }
            }
        }

        _ensureSpawnAndExit(map) {
            // Find first available floor on left
            let spawnSet = false;
            for (let x = 2; x < map.width / 2; x++) {
                for (let y = map.height - 2; y > 2; y--) {
                    const idx = y * map.width + x;
                    const above = (y - 1) * map.width + x;
                    const farAbove = (y - 2) * map.width + x;
                    if (map.collision[idx] === 1 && map.collision[above] === 0 && map.collision[farAbove] === 0) {
                        map.spawn = { x: x, y: y - 1 };
                        spawnSet = true;
                        break;
                    }
                }
                if (spawnSet) break;
            }

            // Find last available floor on right
            let exitSet = false;
            for (let x = map.width - 3; x > map.width / 2; x--) {
                for (let y = map.height - 2; y > 2; y--) {
                    const idx = y * map.width + x;
                    const above = (y - 1) * map.width + x;
                    if (map.collision[idx] === 1 && map.collision[above] === 0) {
                        map.exit = { x: x, y: y - 1 };
                        exitSet = true;
                        break;
                    }
                }
                if (exitSet) break;
            }
        }

        _polish(map) {
            // Add spikes in pits
            for (let x = 0; x < map.width; x++) {
                const bottomIdx = (map.height - 1) * map.width + x;
                if (map.collision[bottomIdx] === 0) {
                    if (this.rng.next() < 0.3) {
                        map.decorations.push({ x, y: map.height - 1, type: 'spikes' });
                    }
                }
            }

            // Add some enemies
            const enemyCount = Math.floor(map.width / 15);
            for (let i = 0; i < enemyCount; i++) {
                const rx = this.rng.int(5, map.width - 5);
                for (let ry = map.height - 2; ry > 2; ry--) {
                    if (map.collision[ry * map.width + rx] === 1 && map.collision[(ry - 1) * map.width + rx] === 0) {
                        map.decorations.push({ x: rx, y: ry - 1, type: 'enemy' });
                        break;
                    }
                }
            }
        }
    }

    window.PlatformerGenerator = PlatformerGenerator;
    
    // Global hook for the editor
    window.generatePlatformerWorld = function(width, height, options) {
        const gen = new PlatformerGenerator(options.seed);
        return gen.generate(width, height, options);
    };
})();
