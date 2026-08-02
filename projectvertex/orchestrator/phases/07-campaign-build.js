const CampaignValidator = require('../../validators/campaign');
const config = require('../../config');
const { analyzeLevel } = require('../quality');
const { findFlatCell, jumpReachableFrom, nearestInCellSet } = require('../mapUtils');

const LEVEL_ID = 'level1';
const ENGINE_TYPES_3D = ['fps-3d', 'topdown-3d', 'platformer-3d'];

// Only one music track is actually bundled with Redglitch (public/muzikler/
// menu_theme.mp3 — verified against the repo), so every mood maps to that
// real file. The mapping exists so a mood pick still produces a working
// per-level track reference instead of inventing files that don't exist;
// if the engine gains more tracks this is the single place to extend.
const MUSIC_TRACK_BY_MOOD = {
    upbeat: 'menu_theme.mp3',
    tense: 'menu_theme.mp3',
    mysterious: 'menu_theme.mp3',
    heroic: 'menu_theme.mp3',
    chill: 'menu_theme.mp3',
    ambient: 'menu_theme.mp3',
};

function sampleElevation(heightMap, width, height, gx, gz) {
    if (!Array.isArray(heightMap)) return 0;
    const ix = Math.max(0, Math.min(width - 1, Math.round(gx)));
    const iz = Math.max(0, Math.min(height - 1, Math.round(gz)));
    return Number(heightMap[iz * width + ix]) || 0;
}

function projectEntitiesTo3D(entities, width, height, level) {
    const unit = config.WORLD_UNIT_3D;
    const heightMap = level.terrain?.heightMap;
    return (entities || []).map((e) => {
        // Snap to a flat patch of terrain first — dropping an entity onto a
        // steep slope makes it float over the low side or sink into the high
        // side. findFlatCell BFSes to the nearest cell whose 4 neighbours are
        // within FLAT_ELEVATION_DELTA of its elevation.
        const { x, y } = findFlatCell(heightMap, width, height, e.x, e.y);
        return {
            type: e.type,
            position: [x * unit, sampleElevation(heightMap, width, height, x, y), y * unit],
        };
    });
}

// start -> level1 -> level2 -> ... (each level node's `next` points at the
// following one; the last level node has no `next`, which ends the campaign).
// levelIds match the dunyalar/levelN.json files zipBuilder writes, so the
// shared CampaignController's levelId -> `dunyalar/<levelId>.json` resolution
// picks up each level (see public/engines/shared/CampaignController.js).
function buildCampaign(concept, levelIds) {
    const nodes = [
        { id: 'start', type: 'start', next: levelIds[0] },
        ...levelIds.map((levelId, i) => ({
            id: levelId,
            type: 'level',
            levelId,
            engineType: concept.engineType,
            ...(i < levelIds.length - 1 ? { next: levelIds[i + 1] } : {}),
        })),
    ];
    return { name: concept.title, nodes };
}

function buildFallbackCampaign(concept, levelIds) {
    return {
        name: concept.title,
        nodes: levelIds.map((levelId, i) => ({
            id: levelId,
            type: 'level',
            levelId,
            engineType: concept.engineType,
            start: i === 0,
        })),
    };
}

// Deterministic — no LLM call, no filesystem writes. Assembles the final
// level(s) (entities merged in) and a minimal validated campaign, returned as
// plain data — the caller (server route or cli.js) is responsible for
// zipping/persisting it via zipBuilder.js.

// Maps a designed entity id to its category ('enemy' | 'npc' | 'item') so a
// placed entity (which only carries the id as its `type`) can be converted
// into the decoration/prefab shape each 2D engine actually consumes.
function buildCategoryById(entityDesign) {
    const map = {};
    (entityDesign?.entities || []).forEach((def) => {
        if (def && def.id && def.category) map[def.id] = def.category;
    });
    return map;
}

// rpg-topdown's loadLevel() (Core.js) reads level.decorations and creates
// window.Enemy/NPC per entry: { type:'enemy', x, y, data: defId }. Items are
// placed as chests (Core.js chest interaction grants the item list in
// `data`). This is the ONLY path that actually puts generated entities into
// the running game for 2D engines — the level.entities array the old code
// wrote was never read by any 2D engine.
function build2DDecorations(placedEntities, categoryById) {
    const decorations = [];
    (placedEntities || []).forEach((e) => {
        const category = categoryById[e.type];
        if (category === 'enemy') {
            decorations.push({ type: 'enemy', x: e.x, y: e.y, data: e.type });
        } else if (category === 'npc') {
            decorations.push({ type: 'npc', x: e.x, y: e.y, data: e.type });
        } else if (category === 'item') {
            decorations.push({ type: 'chest', x: e.x, y: e.y, data: e.type });
        }
    });
    return decorations;
}

// Platformer-2d consumes entities/collectibles directly (main.js _addEntity /
// _addCollectible), not decorations. Enemies need an engine-known sprite +
// behavior; items become coins (the only collectible with a guaranteed
// sprite). The platformer's Enemy ctor falls back to 'slime' when a sprite
// is unknown, so this stays playable even with exotic entity ids.
function buildPlatformerPlacements(placedEntities, categoryById, level) {
    const entities = [];
    const collectibles = [];
    // Coins must actually be collectible: an item the model placed on an
    // unreachable floating platform would taunt the player forever. Snapshot
    // the jump-reachable standing region once and pull every coin into it.
    const width = level.width;
    const height = level.height;
    const reachable = width && height ? jumpReachableFrom(level, level.spawn) : new Set();
    (placedEntities || []).forEach((e) => {
        const category = categoryById[e.type];
        if (category === 'enemy') {
            entities.push({
                type: 'enemy',
                id: `vertex_${e.type}_${e.x}_${e.y}`,
                x: e.x,
                y: e.y,
                sprite: 'slime',
                behavior: 'patrol',
                hp: 2,
                speed: 0.7,
            });
        } else if (category === 'npc') {
            entities.push({
                type: 'enemy',
                id: `vertex_npc_${e.type}_${e.x}_${e.y}`,
                x: e.x,
                y: e.y,
                sprite: 'slime',
                behavior: 'static',
                hp: 100,
                speed: 0,
            });
        } else if (category === 'item') {
            let x = e.x;
            let y = e.y;
            if (reachable.size > 0 && width && height) {
                const idx = nearestInCellSet({ x, y }, reachable, width, height);
                x = idx % width;
                y = Math.floor(idx / width);
            }
            collectibles.push({ type: 'coin', x, y });
        }
    });
    return { entities, collectibles };
}

// Merges placed entities into one level's data for its engine's format.
function buildLevelData(concept, level, placedEntities, categoryById) {
    const is3D = ENGINE_TYPES_3D.includes(concept.engineType);

    let levelData;
    if (is3D) {
        levelData = { ...level, entities: projectEntitiesTo3D(placedEntities, level.width, level.height, level) };
    } else if (concept.engineType === 'platformer-2d') {
        const { entities: platformerEntities, collectibles } = buildPlatformerPlacements(placedEntities, categoryById, level);
        levelData = { ...level, entities: platformerEntities, collectibles };
    } else {
        // rpg-topdown / iso-pixel: entities are placed as decorations, which
        // is what the engines' loadLevel/spawnEntities actually consume.
        // Merge (not replace): iso-pixel seeds a { type:'exit' } decoration
        // in phase 3 that must survive entity placement.
        const decorations = [...(level.decorations || []), ...build2DDecorations(placedEntities, categoryById)];
        levelData = { ...level, decorations };
    }

    if (concept.engineType === 'fps-3d') {
        levelData.enemies = (levelData.entities || []).map((e, i) => ({ id: `entity_${i}`, type: e.type, position: e.position }));
    }

    // rpg-topdown plays level.music via Core.js loadLevel -> playSong() (and
    // honors window.MUSIC_CONFIG.levels[levelId] overrides from
    // dunyalar/definitions/music.json). Setting the track on the level itself
    // makes the single-level path work even without the config file.
    if (concept.engineType === 'rpg-topdown') {
        levelData.music = MUSIC_TRACK_BY_MOOD[concept.musicMood] || 'menu_theme.mp3';
    }

    return levelData;
}

// Accepts either the multi-level shape
//   { concept, project, levels: [{id, data}], entitiesByLevel: [entities] }
// or the original singular shape { concept, project, level, entities } (kept
// for the server route's backward compatibility). Returns
// { project, levelId, level, levels: [{id, data}], campaign, validation, entityDefinitions }.
async function runCampaignBuildPhase({ concept, project, levels, entitiesByLevel, entityDesign, level, entities }) {
    const categoryById = buildCategoryById(entityDesign);

    // Normalize to per-level arrays.
    let levelList;
    if (Array.isArray(levels) && levels.length > 0) {
        levelList = levels.map((l, i) => ({
            id: (l && l.id) || `level${i + 1}`,
            data: l && l.data ? l.data : l,
        }));
    } else {
        levelList = [{ id: LEVEL_ID, data: level }];
    }
    let entitiesList = Array.isArray(entitiesByLevel) && entitiesByLevel.length > 0
        ? entitiesByLevel
        : [entities || { entities: [] }];
    entitiesList = levelList.map((_, i) => entitiesList[i] || { entities: [] });

    const builtLevels = levelList.map((entry, i) => ({
        id: entry.id,
        data: buildLevelData(concept, entry.data, (entitiesList[i].entities) || [], categoryById),
    }));

    const levelIds = builtLevels.map((l) => l.id);
    let campaign = buildCampaign(concept, levelIds);
    const validator = new CampaignValidator();
    let result = await validator.validate(campaign);
    if (result.errors && result.errors.length > 0) {
        campaign = buildFallbackCampaign(concept, levelIds);
        result = await validator.validate(campaign);
        if (result.errors && result.errors.length > 0) {
            throw new Error(`Campaign failed validation even with fallback: ${result.errors.join('; ')}`);
        }
    }

    // Per-level quality report — the same analyzer scripts/validate-run.js
    // uses. Errors here are rare (the deterministic passes prevent them);
    // warnings are surfaced in the run log so a genuinely weak level isn't
    // shipped silently.
    const quality = builtLevels.map((entry, i) => ({
        levelId: entry.id,
        ...analyzeLevel(concept.engineType, entry.data, (entitiesList[i].entities) || [], entityDesign),
    }));
    const qualityWarnings = quality.flatMap((q) => q.warnings.map((item) => `[${q.levelId}] ${item.message}`));
    if (qualityWarnings.length > 0) {
        console.warn(`[projectvertex] quality warnings: ${qualityWarnings.join('; ')}`);
    }

    // Build entity definitions object for the game engine. These are written
    // to /dunyalar/definitions/{enemies,npcs,items}.json in the zip.
    //
    // CRITICAL: each definition file must be an ARRAY, not a {id: def} map.
    // rpg-topdown's loadDefinitions() (Core.js) does
    // `(await res.json()).forEach(def => this.enemyDefs[def.id] = def)` —
    // Array#forEach on an object throws (caught silently), so a map-shaped
    // file silently drops every def and enemies fall back to generic stats.
    // The real Default Project enemies.json is a flat list; match it.
    const entityDefinitions = { enemies: [], npcs: [], items: [] };

    if (entityDesign && Array.isArray(entityDesign.entities)) {
        entityDesign.entities.forEach(def => {
            if (def.category === 'enemy') entityDefinitions.enemies.push(def);
            else if (def.category === 'npc') entityDefinitions.npcs.push(def);
            else if (def.category === 'item') entityDefinitions.items.push(def);
        });
    }

    const musicConfig = concept.engineType === 'rpg-topdown'
        ? {
            menu: 'menu_theme.mp3',
            levels: Object.fromEntries(builtLevels.map((l) => [l.id, MUSIC_TRACK_BY_MOOD[concept.musicMood] || 'menu_theme.mp3'])),
        }
        : null;

    return {
        project: project.name,
        levelId: builtLevels[0].id,
        level: builtLevels[0].data,
        levels: builtLevels,
        campaign,
        validation: result,
        quality,
        entityDefinitions,
        musicConfig,
    };
}

module.exports = { runCampaignBuildPhase };
