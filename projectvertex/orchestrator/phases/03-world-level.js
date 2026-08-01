const fs = require('fs');
const path = require('path');
const { askForJson } = require('../llmClient');
const { validateLevel2D } = require('../../validators/level2d');
const { fillGridPlaceholders } = require('../../prompts/template');
const config = require('../../config');
const { generateTerrain, BIOME_NAMES } = require('../proceduralTerrain');

// Raw templates only — placeholder filling happens per-call now (options.width/height
// can override config's defaults, e.g. from the web UI).
const TILEMAP_TEMPLATE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'world-level-tilemap.system.txt'),
    'utf8'
);
const PLATFORMER_TEMPLATE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'world-level-platformer.system.txt'),
    'utf8'
);
const TERRAIN_3D_TEMPLATE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'world-level-3d.system.txt'),
    'utf8'
);

// width/height default to config.WORLD_WIDTH/HEIGHT but are NOT chosen by
// the LLM — the model only fills in tile content; the orchestrator
// assembles the final level object deterministically.
//
// Cloud providers don't support the GBNF-style grammar constraint the local
// Cortex used, so array length/shape is no longer guaranteed by the model
// call itself — validateLevel2D now runs INSIDE askForJson's validate
// callback (not after it returns), so a wrong-length array triggers a
// correction-note retry instead of silently producing a broken level.
const ENGINE_TYPES_3D = ['fps-3d', 'topdown-3d', 'platformer-3d'];
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const FOLIAGE_KINDS = new Set(['tree', 'rock', 'bush', 'grass', 'reed', 'lily']);

// Real terrain, not a flat box — Redglitch's Unified3D runtime
// (TerrainSystem3D, driven through TerrainRuntime3D.normalizeTerrainLevel)
// already supports heightmap-based hills, foliage instances and a water
// plane; we only need to hand it `level.terrain.heightMap` (a flat
// width*height array of elevations) plus `level.worldW`/`worldH`, and it
// builds/collides/renders the actual mesh — see public/engines/3d/systems/
// TerrainSystem3D.js and public/engines/unified-3d/TerrainRuntime3D.js.
//
// Terrain mesh coordinates are CORNER-based (x,z run from 0 to worldW/worldH
// — see TerrainSystem3D's water-plane builder, `x0 = ix * cellSize`), not
// centered at the origin. Everything we place (geometry, foliage, entities)
// must use that same corner-based frame so it lines up with the generated
// mesh — this replaces the earlier centered box-arena convention entirely.
function computeTerrainBounds(width, height) {
    const unit = config.WORLD_UNIT_3D;
    const worldW = (width - 1) * unit;
    const worldD = (height - 1) * unit;
    return { unit, worldW, worldD };
}

function sampleElevation(heightMap, width, height, gx, gz) {
    const ix = Math.max(0, Math.min(width - 1, Math.round(gx)));
    const iz = Math.max(0, Math.min(height - 1, Math.round(gz)));
    return Number(heightMap[iz * width + ix]) || 0;
}

function validateTerrain3D(generated, width, height) {
    if (!generated || typeof generated !== 'object') throw new Error('response must be an object');

    if (!BIOME_NAMES.includes(generated.biome)) throw new Error(`biome must be one of ${BIOME_NAMES.join(', ')}`);

    const theme = generated.theme || {};
    if (!HEX_COLOR_RE.test(theme.skyTopColorHex || '')) throw new Error('theme.skyTopColorHex must be a #rrggbb color');
    if (!HEX_COLOR_RE.test(theme.skyBottomColorHex || '')) throw new Error('theme.skyBottomColorHex must be a #rrggbb color');

    if (generated.water !== null) {
        if (typeof generated.water !== 'object') throw new Error('water must be null or an object');
        if (generated.water.enabled !== true && generated.water.enabled !== false) throw new Error('water.enabled must be a boolean');
        if (generated.water.enabled && !HEX_COLOR_RE.test(generated.water.colorHex || '')) {
            throw new Error('water.colorHex must be a #rrggbb color');
        }
    }

    if (!Array.isArray(generated.foliage) || generated.foliage.length < 2 || generated.foliage.length > 8) {
        throw new Error('foliage must be an array with between 2 and 8 items');
    }
    generated.foliage.forEach((f, i) => {
        if (!FOLIAGE_KINDS.has(f.kind)) throw new Error(`foliage[${i}].kind must be one of ${[...FOLIAGE_KINDS].join(', ')}`);
        if (typeof f.x !== 'number' || f.x < 0 || f.x > width - 1) throw new Error(`foliage[${i}].x must be between 0 and ${width - 1}`);
        if (typeof f.z !== 'number' || f.z < 0 || f.z > height - 1) throw new Error(`foliage[${i}].z must be between 0 and ${height - 1}`);
        if (typeof f.scale !== 'number' || f.scale < 0.5 || f.scale > 2) throw new Error(`foliage[${i}].scale must be between 0.5 and 2`);
    });

    if (!Array.isArray(generated.obstacles)) throw new Error('obstacles must be an array (can be empty)');
    if (generated.obstacles.length > 40) throw new Error('obstacles must contain at most 40 items');
    generated.obstacles.forEach((o, i) => {
        if (typeof o.width !== 'number' || o.width < 0.5 || o.width > 12) throw new Error(`obstacles[${i}].width must be between 0.5 and 12`);
        if (typeof o.height !== 'number' || o.height < 0.5 || o.height > 4) throw new Error(`obstacles[${i}].height must be between 0.5 and 4`);
        if (typeof o.depth !== 'number' || o.depth < 0.5 || o.depth > 12) throw new Error(`obstacles[${i}].depth must be between 0.5 and 12`);
        if (typeof o.x !== 'number' || o.x < 0 || o.x > width - 1) throw new Error(`obstacles[${i}].x must be between 0 and ${width - 1}`);
        if (typeof o.z !== 'number' || o.z < 0 || o.z > height - 1) throw new Error(`obstacles[${i}].z must be between 0 and ${height - 1}`);
        if (!HEX_COLOR_RE.test(o.colorHex || '')) throw new Error(`obstacles[${i}].colorHex must be a #rrggbb color`);
    });

    return generated;
}

async function runTerrainLevel3D(concept, width, height, options) {
    const { unit, worldW, worldD } = computeTerrainBounds(width, height);
    const systemPrompt = fillGridPlaceholders(TERRAIN_3D_TEMPLATE, width, height);
    const userPrompt = `Oyun konsepti:\nBaşlık: ${concept.title}\nTür: ${concept.genre || 'belirsiz'}\nÖzet: ${concept.pitch}`;

    const generated = await askForJson({
        systemPrompt,
        userPrompt,
        // The LLM only picks biome/theme/decor now — the heightmap itself
        // comes from generateTerrain() below — but obstacles can go up to 40
        // hand-placed wall segments for maze/labyrinth-style concepts, which
        // needs real spatial planning, not a quick guess. 32000 leaves deep
        // headroom for the reasoning chain-of-thought below (still under
        // the free Nemotron variant's 65536 completion-token/1M-context
        // ceiling — see llmClient.js's DEFAULT_MODELS) plus 'high' reasoning
        // effort so the model can actually plan a connected layout before
        // emitting JSON, instead of the 'low' effort used elsewhere for
        // simple picks. Trade-off: generation now takes noticeably longer
        // (a couple of minutes rather than a few seconds).
        maxTokens: options.maxTokens ?? 32000,
        temperature: options.temperature ?? 0.6,
        maxRetries: options.maxRetries ?? config.MAX_RETRIES.worldLevel,
        reasoningEffort: options.reasoningEffort ?? 'high',
        clientKeys: options.clientKeys,
        validate: (obj) => validateTerrain3D(obj, width, height),
    });

    // Real procedural terrain (fBm Perlin noise, same algorithm as Redglitch's
    // own terrain editor) — the LLM chose the biome, this computes the actual
    // heightmap deterministically from it plus a fresh random seed per level.
    const seed = Math.floor(Math.random() * 99999);
    const { heightMap, waterLevel } = generateTerrain({ width, height, biome: generated.biome, seed });

    // No artificial boundary walls: generateElevation01's rim-raise (see
    // proceduralTerrain.js) already shapes the map edge into rising terrain
    // (a natural ridge/cliff), so an open-world level reads as open world
    // instead of a boxed arena. Maze/labyrinth concepts still get their own
    // enclosed feel from the obstacles below, just without an extra outer box.
    const geometry = [];
    generated.obstacles.forEach((o, i) => {
        const groundY = sampleElevation(heightMap, width, height, o.x, o.z);
        geometry.push({
            id: `obstacle_${i}`,
            type: 'box',
            width: o.width,
            height: o.height,
            depth: o.depth,
            position: [o.x * unit, groundY + o.height / 2, o.z * unit],
            colorHex: o.colorHex,
        });
    });

    const foliage = generated.foliage.map((f) => ({
        kind: f.kind,
        position: [f.x * unit, sampleElevation(heightMap, width, height, f.x, f.z), f.z * unit],
        scale: f.scale,
    }));

    const water = generated.water && generated.water.enabled;

    return {
        engineType: concept.engineType,
        name: concept.title,
        // Grid dimensions (same units the entities phase places on) — phase
        // 6 (campaign build) uses these plus terrain.heightMap to sample
        // ground elevation when projecting entities onto this mesh.
        width,
        height,
        worldW,
        worldH: worldD,
        biome: generated.biome,
        skybox: { type: 'gradient', topColor: generated.theme.skyTopColorHex, bottomColor: generated.theme.skyBottomColorHex, colorHex: generated.theme.skyBottomColorHex },
        terrain: {
            heightMap,
            cellSize: unit,
            foliage,
            ...(water ? { waterLevel, waterColorHex: generated.water.colorHex } : {}),
        },
        geometry,
        entities: [],
    };
}

async function runWorldLevelPhase(concept, options = {}) {
    const width = options.width ?? config.WORLD_WIDTH;
    const height = options.height ?? config.WORLD_HEIGHT;

    if (ENGINE_TYPES_3D.includes(concept.engineType)) {
        return runTerrainLevel3D(concept, width, height, options);
    }

    const isPlatformer = concept.engineType === 'platformer-2d';
    const systemPrompt = fillGridPlaceholders(isPlatformer ? PLATFORMER_TEMPLATE : TILEMAP_TEMPLATE, width, height);

    const userPrompt = `Oyun konsepti:\nBaşlık: ${concept.title}\nTür: ${concept.genre || 'belirsiz'}\nÖzet: ${concept.pitch}`;

    return askForJson({
        systemPrompt,
        userPrompt,
        // Reasoning-capable models (e.g. free OpenRouter Nemotron models)
        // spend part of this budget on an internal chain-of-thought before
        // ever writing the JSON. Confirmed directly: at reasoning.effort
        // 'low' (askForJson's default), the free Nemotron route burned the
        // *entire* budget on reasoning and returned no JSON at all across
        // every retry — reproduced identically at both 1400 and 4000
        // tokens, so this isn't a budget shortfall, the model just doesn't
        // reliably wind down its chain-of-thought at 'low' effort for a
        // layout-planning task like this one. runTerrainLevel3D above hit
        // the exact same failure mode and fixed it by forcing 'high' effort
        // with a large budget so the model actually finishes reasoning
        // instead of running out mid-thought — same fix applied here. 8000
        // at 'high' effort *still* failed identically (confirmed directly:
        // 8.5 minutes, 3/3 attempts, no JSON) — matching the terrain path's
        // exact 32000 budget instead of guessing further.
        maxTokens: options.maxTokens ?? 32000,
        temperature: options.temperature ?? 0.4,
        maxRetries: options.maxRetries ?? config.MAX_RETRIES.worldLevel,
        reasoningEffort: options.reasoningEffort ?? 'high',
        clientKeys: options.clientKeys,
        validate: (generated) => {
            const level = {
                width,
                height,
                type: isPlatformer ? 'platformer-2d' : 'topdown',
                tilesetPath: 'tiles/default.png',
                layers: generated.layers,
            };
            if (isPlatformer) {
                level.spawn = generated.spawn;
                level.collision = generated.collision;
            }
            return validateLevel2D(concept.engineType, level);
        },
    });
}

module.exports = { runWorldLevelPhase };
