// iso_generator.js - Procedural Voxel Terrain Generator

class IsoGenerator {
    constructor() {
        this.seed = Math.random();
        this.permutation = [];
        this.p = [];
        this.initNoise();
    }

    // --- PERLIN NOISE IMPLEMENTATION ---
    initNoise() {
        this.permutation = new Array(256).fill(0).map((_, i) => i);
        // Shuffle
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
        }
        // Double it
        this.p = new Array(512);
        for (let i = 0; i < 256; i++) this.p[256 + i] = this.p[i] = this.permutation[i];
    }

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);
        const A = this.p[X] + Y, AA = this.p[A] + Z, AB = this.p[A + 1] + Z;
        const B = this.p[X + 1] + Y, BA = this.p[B] + Z, BB = this.p[B + 1] + Z;

        return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.p[AA], x, y, z),
            this.grad(this.p[BA], x - 1, y, z)),
            this.lerp(u, this.grad(this.p[AB], x, y - 1, z),
                this.grad(this.p[BB], x - 1, y - 1, z))),
            this.lerp(v, this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1),
                this.grad(this.p[BA + 1], x - 1, y, z - 1)),
                this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1),
                    this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))));
    }

    // --- TERRAIN GENERATION ---
    generate(width, height, config) {
        console.log("[IsoGen] Generating Terrain Volume...", config);
        
        const mode = config.mode || 'terrain';
        
        switch(mode) {
            case 'flat': return this.generateFlat(width, height, config);
            case 'islands': return this.generateIslands(width, height, config);
            case 'maze': return this.generateMaze(width, height, config);
            default: return this.generateTerrain(width, height, config);
        }
    }

    generateFlat(width, height, config) {
        const floorZ = config.offset || 0;
        const type = 1; // Grass
        
        // Single layer
        const layers = [new Array(width * height).fill(type)];
        const z = [new Array(width * height).fill(floorZ)];
        const shapes = [new Array(width * height).fill(0)];
        
        return { layers, z, shapes };
    }

    generateIslands(width, height, config) {
        const scale = config.scale || 0.1;
        const offset = config.offset || 0;
        const threshold = 0.2; // Value above which islands exist
        const layers = [], z = [], shapes = [];
        
        // Initialize one layer
        layers[0] = new Array(width * height).fill(null);
        z[0] = new Array(width * height).fill(0);
        shapes[0] = new Array(width * height).fill(0);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const n = this.noise(x * scale, y * scale, this.seed);
                
                if (n > threshold) {
                    layers[0][idx] = 1; // Grass
                    z[0][idx] = Math.floor(n * 5) + offset; // Apply offset
                }
            }
        }
        return { layers, z, shapes };
    }

    generateMaze(width, height, config) {
        const offset = config.offset || 0;
        // recursive backtracker or simple noise threshold
        // Lets do simple noise walls for now, or true maze later
        // Simple Maze: Walls at integer grid coords
        const layers = [], z = [], shapes = [];
        const floorL = new Array(width * height).fill(2); // Dirt floor
        const floorZ = new Array(width * height).fill(offset); // Apply offset
        const floorS = new Array(width * height).fill(0);
        
        const wallL = new Array(width * height).fill(null);
        const wallZ = new Array(width * height).fill(offset + 1); // Walls on top
        const wallS = new Array(width * height).fill(0);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                
                // Noise based maze
                const n = this.noise(x * 0.3, y * 0.3, this.seed);
                if (n > 0.3) {
                    wallL[idx] = 15; // Stone
                    wallZ[idx] = offset + 1; // Explicit Z for wall
                }
            }
        }
        
        return { 
            layers: [floorL, wallL], 
            z: [floorZ, wallZ], 
            shapes: [floorS, wallS] 
        };
    }

    generateTerrain(width, height, config) {
        // Config defaults
        const scale = config.scale || 0.1;
        const amplitude = config.amplitude || 10;
        const seaLevel = config.seaLevel || 0;
        const offset = config.offset || 0; 
        const bottomZ = config.bottomZ !== undefined ? config.bottomZ : -32;

        const BLOCKS = {
            GRASS: 287,
            DIRT: 112,
            STONE: 15,
            WATER: 142, 
            SAND: 104,
            SNOW: 375
        };

        const columnData = new Array(width * height);
        let maxDepth = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                
                // 2D Noise
                const n = this.noise(x * scale, y * scale, this.seed);
                let surfaceH = Math.floor(n * amplitude) + offset;
                
                let col = [];

                // Surface Type
                let surfaceType = BLOCKS.GRASS;
                if (surfaceH < seaLevel) {
                    surfaceType = BLOCKS.WATER;
                    // For water, we might want to flatten it?
                    // But noise gives uneven surface. Let's keep it for now.
                } else if (surfaceH === seaLevel) {
                    surfaceType = BLOCKS.SAND;
                } else if (surfaceH > seaLevel + amplitude * 0.8) {
                    surfaceType = BLOCKS.SNOW;
                } else if (surfaceH > seaLevel + amplitude * 0.6) {
                    surfaceType = BLOCKS.STONE;
                }

                // Fill Column Downwards
                for (let cz = surfaceH; cz >= bottomZ; cz--) {
                    let type = surfaceType;
                    const depth = surfaceH - cz;

                    if (depth > 0) {
                        if (depth <= 3) type = BLOCKS.DIRT;
                        else type = BLOCKS.STONE;
                    }
                    
                    // Simple logic: Water is only top layer for now in this biome logic
                    // If surface was water, underneath is dirt/stone?
                    if (surfaceType === BLOCKS.WATER && depth > 0) {
                         if (depth <= 3) type = BLOCKS.SAND; // Sand under water?
                         else type = BLOCKS.STONE;
                    }

                    col.push({ z: cz, type: type, shape: 0 });
                }
                
                columnData[idx] = col;
                if (col.length > maxDepth) maxDepth = col.length;
            }
        }

        // Convert to Arrays
        const layers = [];
        const z = [];
        const shapes = [];

        for (let i = 0; i < maxDepth; i++) {
            const lArr = new Array(width * height).fill(null);
            const zArr = new Array(width * height).fill(0);
            const sArr = new Array(width * height).fill(0);
            
            for (let idx = 0; idx < width * height; idx++) {
                const col = columnData[idx];
                if (col && i < col.length) {
                    lArr[idx] = col[i].type;
                    zArr[idx] = col[i].z;
                    sArr[idx] = col[i].shape;
                }
            }
            layers.push(lArr);
            z.push(zArr);
            shapes.push(sArr);
        }

        return { layers, z, shapes };
    }

    // --- VEGETATION GENERATOR ---
    generateVegetation(width, height, currentLayers, currentZ, config) {
        console.log("[IsoGen] Generating Vegetation...", config);
        
        const density = config.density || 0.5; // 0.0 to 1.0
        const type = config.type || 'forest'; // forest, jungle, plains
        
        // Clone arrays to avoid direct mutation issues during generation
        const layers = currentLayers.map(l => [...l]);
        const z = currentZ.map(l => [...l]);
        // We assume shapes don't change for veg, but we might need new layers for height
        // Actually trees need height.
        
        // Block IDs (Approximate based on pixel art)
        const BLOCKS = {
            LOG: 20, // Example ID
            LEAVES: 21,
            GRASS_PLANT: 287, // Just reusing grass for now, ideally specific ID
            FLOWER: 288
        };
        
        // Helper to get surface at x,y
        const getSurface = (x, y) => {
            let maxZ = -100;
            let layerIdx = -1;
            
            for(let l=0; l<layers.length; l++) {
                const idx = y * width + x;
                if (layers[l][idx] !== null && z[l][idx] > maxZ) {
                    maxZ = z[l][idx];
                    layerIdx = l;
                }
            }
            return { z: maxZ, layer: layerIdx, type: layerIdx >= 0 ? layers[layerIdx][y*width+x] : null };
        };

        // Helper to place block at x,y,z
        const placeBlock = (x, y, h, blockType) => {
            const idx = y * width + x;
            
            // Check if space exists in any layer
            let placed = false;
            for(let l=0; l<layers.length; l++) {
                if (layers[l][idx] === null) {
                    layers[l][idx] = blockType;
                    z[l][idx] = h;
                    placed = true;
                    break;
                }
            }
            
            // If no space, we might need a new layer (not handled here for simplicity, 
            // editor should ensure enough layers or we overwrite empty space)
            // For now, if we can't place, we skip.
        };

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Noise for density clustering
                const n = this.noise(x * 0.2, y * 0.2, this.seed + 100);
                
                // Probability check
                if (n < (1.0 - density)) continue;
                
                // Random jitter
                if (Math.random() > density) continue;

                const surface = getSurface(x, y);
                if (surface.layer === -1) continue; // Empty void
                
                // Only grow on Grass/Dirt/Snow
                // Assuming IDs: Grass=287, Dirt=112, Snow=375
                const validSoil = [287, 112, 375].includes(surface.type);
                if (!validSoil) continue;

                const baseZ = surface.z + 1;

                // Tree vs Plant
                if (Math.random() < 0.3) {
                    // TREE
                    const treeHeight = Math.floor(Math.random() * 3) + 3; // 3-5 blocks
                    
                    // Trunk
                    for(let h=0; h<treeHeight; h++) {
                        placeBlock(x, y, baseZ + h, BLOCKS.LOG);
                    }
                    
                    // Leaves (Simple Cross or Blob)
                    const canopyZ = baseZ + treeHeight - 1;
                    placeBlock(x, y, canopyZ + 1, BLOCKS.LEAVES); // Top
                    placeBlock(x+1, y, canopyZ, BLOCKS.LEAVES);
                    placeBlock(x-1, y, canopyZ, BLOCKS.LEAVES);
                    placeBlock(x, y+1, canopyZ, BLOCKS.LEAVES);
                    placeBlock(x, y-1, canopyZ, BLOCKS.LEAVES);
                    
                } else {
                    // PLANT
                    // For now just placing a block, ideally this is a decoration prop
                    // placeBlock(x, y, baseZ, BLOCKS.FLOWER);
                }
            }
        }
        
        return { layers, z };
    }
}

// Works in both browser (window) and Web Worker (self) contexts
(typeof window !== 'undefined' ? window : self).IsoGenerator = IsoGenerator;
