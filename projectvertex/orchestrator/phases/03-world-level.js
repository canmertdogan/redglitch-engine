const fs = require('fs');
const path = require('path');
const { askForJson } = require('../llmClient');
const { validateLevel2D } = require('../../validators/level2d');
const { fillGridPlaceholders } = require('../../prompts/template');
const config = require('../../config');
const { generateTerrain, BIOME_NAMES } = require('../proceduralTerrain');
const {
    repairTilemapConnectivity,
    ensurePlatformerPlayability,
    ensurePlatformerReachability,
    sanitize3DPlacement,
    enrichmentStyleFor,
    generateMaze,
    auditTilemapStructure,
    buildTilemapForStyle,
} = require('../mapUtils');

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

// Fills {{DIFFICULTY}} in a prompt template from the level brief (per-level
// override) or the overall concept difficulty. Levels labeled "hard" must
// actually read harder than "easy" ones — the world-level prompts scale wall
// density / gap size on this placeholder.
function applyDifficultyPlaceholder(template, levelBrief, concept) {
    const difficulty = (levelBrief && levelBrief.difficulty) || (concept && concept.difficulty) || 'medium';
    return template.replace(/\{\{DIFFICULTY\}\}/g, String(difficulty).toLowerCase());
}

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
    let systemPrompt = fillGridPlaceholders(TERRAIN_3D_TEMPLATE, width, height);
    systemPrompt = applyDifficultyPlaceholder(systemPrompt, options.levelBrief, concept);
    const userPrompt = buildConceptPrompt(concept, options.levelBrief);

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
        timeoutMs: options.timeoutMs ?? 480000,
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

    const level = {
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

    // Deterministic placement sanitation: drop obstacles centered in the
    // spawn clearing and redundant duplicates, prune foliage inside obstacles
    // (see mapUtils.sanitize3DPlacement). Runs here so the entities phase
    // (which snaps onto the walkable map) sees the final, cleaned geometry.
    const { droppedClearing, droppedContained } = sanitize3DPlacement(level);
    if (droppedClearing.length || droppedContained.length) {
        console.log(`[projectvertex] 3D placement sanitized: ${droppedClearing.length} obstacle(s) removed from spawn clearing, ${droppedContained.length} redundant obstacle(s) removed`);
    }

    return level;
}

// --- 2D level assembly ------------------------------------------------
//
// The LLM only fills in the tile content (layers, and for platformers
// spawn/collision). Everything the engines actually need to be playable is
// assembled deterministically here, so a bad model pick can't produce an
// unplayable level:
//   * tilesetPath is always the engine's dynamic tileset ('WORLD_PIXEL_ART'
//     — see rpg-topdown/mapSystem.combineWorldPixelArt / platformer renderer
//     / iso main.combineWorldPixelArt). A static 'tiles/default.png' was the
//     historical bug here: no such asset exists anywhere in Redglitch, the
//     tile fetch 404'd, and the whole map rendered as an empty black screen.
//   * collision (rpg-topdown / iso-pixel) is derived 1:1 from the wall layer.
//     Without it every tile is passable (mapSystem.collisionMap is undefined
//     and getCollisionType falls back to 0), so the player walks through walls.
//   * spawn / exit are picked from actual walkable floor tiles. The engine
//     only relocates the player when spawnX/spawnY or spawn is present
//     (rpg-topdown Core.js loadLevel); absent that, the player stays at
//     (0,0) — which is a border wall. exit drives level completion
//     (mapSystem.mapExit -> Core.js levelComplete).
function findFloorTiles(layer, width, height) {
    const tiles = [];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            if ((layer[y * width + x] || 0) === 0) tiles.push({ x, y });
        }
    }
    return tiles;
}

function pickSpawn(floorTiles, width, height) {
    if (floorTiles.length === 0) return { x: 1, y: 1 };
    // Prefer a tile near the top-left playable area (away from the exit).
    return floorTiles.reduce((best, t) => (t.x + t.y < best.x + best.y ? t : best), floorTiles[0]);
}

function pickExit(floorTiles, width, height) {
    if (floorTiles.length === 0) return { x: Math.max(2, width - 2), y: Math.max(2, height - 2) };
    // Prefer a tile near the bottom-right playable area (far from spawn).
    return floorTiles.reduce((best, t) => (t.x + t.y > best.x + best.y ? t : best), floorTiles[0]);
}

// theme → level environment. rpg-topdown reads weather/lighting/shader at the
// top level (Core.js loadLevel -> fx.setWeather/setLighting/setShader); iso
// reads levelMetadata.fx ({ lighting, shader }). Deterministic keyword match so
// the user's/AI's theme pick drives the look without another LLM call. Shaders
// the engine doesn't know are ignored safely (postProcess.setShader warns and
// keeps the active shader).
const THEME_ENV = [
    { match: /night|neon|moon|synthwave|dusk|cyber/, env: { weather: 'none', lighting: 'night', shader: 'default', background: 'night' } },
    { match: /forest|jungle|mist|swamp|woods|garden/, env: { weather: 'fog', lighting: 'day', shader: 'default', background: 'forest' } },
    { match: /dungeon|cave|catacomb|tomb|underground|mine|ruin/, env: { weather: 'rain', lighting: 'dungeon', shader: 'default', background: 'cave' } },
    { match: /desert|sand|sun|beach|scorch|arid|dune/, env: { weather: 'none', lighting: 'day', shader: 'default', background: 'desert' } },
    { match: /snow|ice|frozen|tundra|winter|glacier/, env: { weather: 'fog', lighting: 'day', shader: 'default', background: 'snow' } },
    { match: /hell|fire|volcano|lava|magma/, env: { weather: 'rain', lighting: 'dungeon', shader: 'default', background: 'volcano' } },
    { match: /city|urban|street|town|metropolis/, env: { weather: 'none', lighting: 'day', shader: 'default', background: 'city' } },
];
function resolveEnvironment(concept, themeOverride) {
    const theme = String(themeOverride || concept.theme || concept.title || '').toLowerCase();
    for (const rule of THEME_ENV) {
        if (rule.match.test(theme)) return { ...rule.env };
    }
    return { weather: 'none', lighting: 'day', shader: 'default', background: 'field' };
}

// Builds the concept block for the LLM userPrompt. A level brief (from the
// multi-level level-plan phase) adds per-level identity so each generated map
// gets its own title/theme/focus instead of N copies of the same prompt.
function buildConceptPrompt(concept, brief) {
    const lines = [
        'Oyun konsepti:',
        `Başlık: ${concept.title}`,
        `Tür: ${concept.genre || 'belirsiz'}`,
        `Özet: ${concept.pitch}`,
    ];
    if (brief && brief.title) {
        lines.push('');
        lines.push('Bu level için:');
        lines.push(`Level adı: ${brief.title}`);
        if (brief.theme) lines.push(`Level teması: ${brief.theme}`);
        if (brief.difficulty) lines.push(`Level zorluğu: ${brief.difficulty}`);
        if (brief.focus) lines.push(`Level odağı: ${brief.focus}`);
    }
    return lines.join('\n');
}

function assembleTilemapLevel(concept, width, height, generated, brief) {
    // Deterministic connectivity repair: whatever the model produced, every
    // floor tile ends up reachable from the player's spawn region (see
    // mapUtils.repairTilemapConnectivity). Runs BEFORE spawn/exit picking so
    // those also see the final, repaired map.
    let layer = repairTilemapConnectivity(generated.layers[0], width, height);
    // Deterministic structure: the LLM layer is kept ONLY when it reads as
    // real structure (see mapUtils.auditTilemapStructure — wall ratio band,
    // no isolated pillars, style-appropriate wall blocks). A maze-themed
    // request never gets the model's layout at all (the model draws gapped
    // parallel lines, not a maze), and any other layer the audit rejects
    // (sparse, noise-scattered, fragment-only) is rebuilt deterministically
    // per style seeded from the concept — same concept -> same map, different
    // concepts -> different maps. Everything is guaranteed connected by the
    // repair passes bracketing this step.
    const style = enrichmentStyleFor(concept, brief && brief.theme);
    const seed = `${concept.title}|${brief && brief.theme ? brief.theme : ''}|${width}x${height}`;
    if (style === 'maze') {
        layer = generateMaze(width, height, seed);
    } else {
        const audit = auditTilemapStructure(layer, width, height, style);
        if (!audit.ok) {
            layer = buildTilemapForStyle(width, height, style, seed);
        }
    }
    layer = repairTilemapConnectivity(layer, width, height);
    const floorTiles = findFloorTiles(layer, width, height);
    const spawn = pickSpawn(floorTiles, width, height);
    const exit = pickExit(floorTiles, width, height);

    const level = {
        name: brief?.title || concept.title,
        width,
        height,
        type: concept.engineType === 'iso-pixel' ? 'isometric' : 'topdown',
        tilesetPath: 'WORLD_PIXEL_ART',
        layers: [layer.slice()],
        collision: layer.slice(),
        spawn,
        exit,
        decorations: [],
        engineType: concept.engineType,
    };

    if (concept.engineType === 'iso-pixel') {
        // The iso engine builds its floor from z (elevation) + shapes
        // (0 = solid block of height 1) arrays per layer, see getZAt().
        // Without them every tile is void (getZAt returns -100) and the
        // player falls forever. Walls get z=1 so their top (z+height=2)
        // sits above MAX_STEP_HEIGHT (0.6) relative to the floor's top (1),
        // which is what makes them block horizontal movement.
        const z = layer.map((v) => (v === 1 ? 1 : 0));
        const shapes = layer.map(() => 0);
        level.z = [z];
        level.shapes = [shapes];

        // The iso engine NEVER reads an `exit` key — level completion only
        // fires from a { type:'exit' } decoration (checkExits, dist < 1.0).
        // dz is player.z - exit.z, and the player stands at the floor's top
        // height (1 for a z=0 shape-0 block), so exit.z must match 1 or the
        // distance check never trips. Phase 7 merges entity decorations in
        // alongside this one (it must NOT be dropped).
        level.decorations = [{ type: 'exit', x: exit.x, y: exit.y, z: 1 }];
    }

    const env = resolveEnvironment(concept, brief?.theme);
    level.weather = env.weather;
    level.lighting = env.lighting;
    level.shader = env.shader;
    level.background = env.background;
    if (concept.engineType === 'iso-pixel') {
        // iso reads levelMetadata.fx (lighting presets: day/dusk/night/
        // dungeon/cave). Leave shader unset — the engine applies its own
        // default and unknown presets are riskier here than in rpg-topdown.
        level.fx = { lighting: ['day', 'dusk', 'night', 'dungeon', 'cave'].includes(env.lighting) ? env.lighting : 'day' };
    }

    return level;
}

function assemblePlatformerLevel(concept, width, height, generated, brief) {
    const layers = [generated.layers.slice()];
    const level = {
        name: brief?.title || concept.title,
        width,
        height,
        type: 'platformer-2d',
        tilesetPath: 'WORLD_PIXEL_ART',
        layers,
        layerProps: [{ name: 'Main' }],
        collision: generated.collision.slice(),
        spawn: generated.spawn,
        collectibles: [],
        entities: [],
        decorations: [],
        engineType: concept.engineType,
    };

    // Deterministic playability repair (spawn on solid ground, solid bottom
    // row, minimum starter ground) before the goal is picked so the goal
    // computation also sees the repaired collision map.
    ensurePlatformerPlayability(level);

    // Engine expects layers as array-of-arrays (main.js _normalizeMapData
    // maps over each element; a flat array of ints becomes `total` all-zero
    // layers and nothing renders). We build it as a wrapped array above.

    // goal drives _checkGoal() (main.js) — with no goal the level can never
    // be completed. Pick a passable cell with solid ground directly beneath
    // it, as far right as possible (the LLM already guarantees a reachable
    // path there).
    const collision = level.collision;
    let goal = { x: Math.max(2, width - 3), y: Math.max(1, height - 3) };
    for (let x = width - 2; x >= 1; x--) {
        for (let y = height - 2; y >= 1; y--) {
            const idx = y * width + x;
            if (collision[idx] === 1) continue;
            const aboveIdx = (y - 1) * width + x;
            const groundIdx = (y + 1) * width + x;
            const standOnFloor = collision[groundIdx] === 1;
            if (standOnFloor && (collision[aboveIdx] === 0 || collision[aboveIdx] === undefined)) {
                goal = { x, y };
                break;
            }
        }
        if (goal.x === x) break;
    }
    level.goal = goal;

    // Completability guarantee: if the LLM's layout left the goal unreachable,
    // clamp it to the nearest jump-reachable standing cell (see
    // mapUtils.ensurePlatformerReachability). The player must always be able
    // to reach the level's exit.
    ensurePlatformerReachability(level);

    const env = resolveEnvironment(concept, brief?.theme);
    level.weather = env.weather;
    level.lighting = env.lighting;
    level.background = env.background;
    return level;
}

async function runWorldLevelPhase(concept, options = {}) {
    const width = options.width ?? config.WORLD_WIDTH;
    const height = options.height ?? config.WORLD_HEIGHT;

    if (ENGINE_TYPES_3D.includes(concept.engineType)) {
        return runTerrainLevel3D(concept, width, height, options);
    }

    const isPlatformer = concept.engineType === 'platformer-2d';
    const systemPrompt = applyDifficultyPlaceholder(
        fillGridPlaceholders(isPlatformer ? PLATFORMER_TEMPLATE : TILEMAP_TEMPLATE, width, height),
        options.levelBrief,
        concept
    );

    const userPrompt = buildConceptPrompt(concept, options.levelBrief);

    const generated = await askForJson({
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
        timeoutMs: options.timeoutMs ?? 480000,
        validate: (raw) => {
            const level = {
                width,
                height,
                type: isPlatformer ? 'platformer-2d' : 'topdown',
                tilesetPath: 'WORLD_PIXEL_ART',
                layers: raw.layers,
            };
            if (isPlatformer) {
                level.spawn = raw.spawn;
                level.collision = raw.collision;
            }
            return validateLevel2D(concept.engineType, level);
        },
    });

    // Deterministically assemble the playable level shape for the target
    // engine (collision, spawn, exit/goal, tileset, iso z/shapes). This runs
    // AFTER validation so a correct-but-thin LLM answer still yields a level
    // the engine can actually run.
    return isPlatformer
        ? assemblePlatformerLevel(concept, width, height, generated, options.levelBrief)
        : assembleTilemapLevel(concept, width, height, generated, options.levelBrief);
}

module.exports = {
    runWorldLevelPhase,
    assembleTilemapLevel,
    assemblePlatformerLevel,
    findFloorTiles,
    pickSpawn,
    pickExit,
    resolveEnvironment,
};
