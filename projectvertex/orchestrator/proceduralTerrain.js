// Real procedural terrain generation, ported from Redglitch's own terrain
// editor (public/engines/unified-3d/editor/TerrainEditorPanel.js —
// _buildPermTable/_perlin3D/_generateElevationWithMoisture and its 8 biome
// presets). That file has no imports of its own (pure JS class methods), so
// the noise math ports 1:1 as plain functions here — no dependency leaves
// this directory.
//
// The point of porting this (rather than asking the LLM to hand-author a
// heightMap array, one number per cell) is that terrain shape is a numeric/
// procedural concern, not a creative-writing one: the LLM should pick a
// *biome* (a creative decision informed by the game concept) and the actual
// heightmap comes out of the same noise algorithm the editor's "Generate
// Terrain" button uses — deterministic, real hills/valleys instead of an
// LLM guessing plausible-looking numbers under a tight token budget.

const BIOMES = {
    temperate: { noiseType: 'perlin', heightScale: 8, waterLevel: 0.28, octaves: 4, lacunarity: 2.0, gain: 0.5, freq: 0.025 },
    desert: { noiseType: 'hills', heightScale: 5, waterLevel: 0.18, octaves: 3, lacunarity: 2.5, gain: 0.4, freq: 0.015 },
    tundra: { noiseType: 'hills', heightScale: 4, waterLevel: 0.22, octaves: 3, lacunarity: 2.0, gain: 0.45, freq: 0.02 },
    tropical: { noiseType: 'perlin', heightScale: 10, waterLevel: 0.30, octaves: 5, lacunarity: 2.0, gain: 0.5, freq: 0.03 },
    volcanic: { noiseType: 'mountains', heightScale: 14, waterLevel: 0.16, octaves: 5, lacunarity: 2.2, gain: 0.55, freq: 0.035 },
    alpine: { noiseType: 'mountains', heightScale: 18, waterLevel: 0.18, octaves: 5, lacunarity: 2.5, gain: 0.6, freq: 0.04 },
    oceanic: { noiseType: 'islands', heightScale: 6, waterLevel: 0.35, octaves: 4, lacunarity: 2.0, gain: 0.5, freq: 0.02 },
    marsh: { noiseType: 'perlin', heightScale: 4, waterLevel: 0.30, octaves: 3, lacunarity: 1.8, gain: 0.45, freq: 0.02 },
};

const BIOME_NAMES = Object.keys(BIOMES);

// How many grid cells from the border the rim-raise (see
// generateElevation01) ramps up over — wide enough to read as a gradual
// mountain range rather than a sudden cliff line.
const RIM_WIDTH = 3;

function buildPermTable(seed) {
    const p = new Uint8Array(512);
    const arr = [];
    for (let i = 0; i < 256; i++) arr.push(i);
    let s = seed || 0;
    for (let i = 255; i > 0; i--) {
        s = (s * 16807) % 2147483647;
        const j = s % (i + 1);
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    for (let i = 0; i < 512; i++) p[i] = arr[i & 255];
    return p;
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(t, a, b) { return a + t * (b - a); }
function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function perlin3D(x, y, z, perm) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const p = perm;
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    return lerp(w,
        lerp(v,
            lerp(u, grad(p[AA], xf, yf, zf), grad(p[BA], xf - 1, yf, zf)),
            lerp(u, grad(p[AB], xf, yf - 1, zf), grad(p[BB], xf - 1, yf - 1, zf))),
        lerp(v,
            lerp(u, grad(p[AA + 1], xf, yf, zf - 1), grad(p[BA + 1], xf - 1, yf, zf - 1)),
            lerp(u, grad(p[AB + 1], xf, yf - 1, zf - 1), grad(p[BB + 1], xf - 1, yf - 1, zf - 1))));
}

// Fractal Brownian motion over 3D Perlin (z=0 plane), shaped per biome
// noiseType — same octave-summing + shaping switch as the editor's
// _generateElevationWithMoisture, minus the (unused here) moisture pass.
function generateElevation01(width, height, biomeName, seed) {
    const biome = BIOMES[biomeName] || BIOMES.temperate;
    const perm = buildPermTable(seed);
    const { freq, octaves, lacunarity, gain, noiseType } = biome;
    const grid = new Float32Array(width * height);

    for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
            let amp = 1;
            let fm = freq;
            let value = 0;
            let maxAmp = 0;
            for (let o = 0; o < octaves; o++) {
                value += perlin3D(x * fm, 0, z * fm, perm) * amp;
                maxAmp += amp;
                amp *= gain;
                fm *= lacunarity;
            }
            let h = value / maxAmp;
            h = (h + 1) * 0.5;

            switch (noiseType) {
                case 'hills':
                    h = Math.pow(h, 1.3);
                    break;
                case 'mountains':
                    h = Math.pow(h, 0.6);
                    break;
                case 'islands': {
                    const dx = (x / width - 0.5) * 2;
                    const dz = (z / height - 0.5) * 2;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const falloff = 1 - Math.min(1, dist * 1.4);
                    h = Math.max(0, Math.pow(h * falloff, 1.8));
                    break;
                }
                default:
                    break;
            }

            // Natural edge rim: blend elevation toward max height near the
            // grid border so the map is bounded by rising terrain (a ridge
            // the player can see and can't easily climb) instead of an
            // artificial flat wall — matches how open-world games usually
            // bound a map (mountains/cliffs), not an invisible/visible box.
            // Skipped for 'islands', which already falls off toward the
            // edges (water forms its own natural boundary there).
            if (noiseType !== 'islands') {
                const edgeDist = Math.min(x, width - 1 - x, z, height - 1 - z);
                if (edgeDist < RIM_WIDTH) {
                    const t = 1 - edgeDist / RIM_WIDTH;
                    h = h + (1 - h) * t * t;
                }
            }

            grid[z * width + x] = Math.max(0, Math.min(1, h));
        }
    }
    return grid;
}

// Public entry point used by the world-level phase: turns a biome pick +
// seed into a flat heightMap (values 0-6, matching the range
// Engine3DAdapter/TerrainSystem3D already expect) plus the biome's default
// water level in the same units, so callers don't need to know the 0-1
// noise scale exists.
function generateTerrain({ width, height, biome, seed }) {
    const preset = BIOMES[biome] || BIOMES.temperate;
    const elevation01 = generateElevation01(width, height, biome, seed);
    const HEIGHT_CEILING = 6; // validated range used throughout the 3D pipeline
    const scale = Math.min(1, preset.heightScale / 18) * HEIGHT_CEILING; // 18 = tallest preset (alpine)
    const heightMap = Array.from(elevation01, (v) => Math.round(v * scale * 100) / 100);
    return { heightMap, waterLevel: Math.round(preset.waterLevel * scale * 100) / 100 };
}

module.exports = { generateTerrain, BIOME_NAMES };
