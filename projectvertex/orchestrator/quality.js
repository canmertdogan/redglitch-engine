// Post-generation quality analyzer. Runs against an ASSEMBLED level (the
// exact object the engines consume) plus the entities placed on it, and
// reports `errors` (things that break playability) and `warnings` (things
// that degrade it). The campaign-build phase runs this per level so a run
// carries a report in its result; scripts/validate-run.js runs the same
// analyzer against any previously generated run for auditing.
//
// Errors here should be rare — the deterministic passes in mapUtils already
// prevent most of them — but the analyzer is the independent check that those
// passes actually worked, and it catches the cases they intentionally leave
// alone (e.g. overlapping 3D obstacles, which are warned not auto-fixed).

const {
    computeWalkable,
    repairTilemapConnectivity,
    jumpReachableFrom,
    obstacleFootprints,
    footprintsOverlap,
} = require('./mapUtils');
const { BIOME_NAMES } = require('./proceduralTerrain');

const ENGINE_TYPES_3D = ['fps-3d', 'topdown-3d', 'platformer-3d'];

function w(severity, code, message) {
    return { severity, code, message };
}

function tileAt(level, x, y) {
    const layer = level.layers && level.layers[0];
    if (!Array.isArray(layer)) return null;
    return layer[y * level.width + x] || 0;
}

function is3DCellBlocked(level, x, y) {
    const unit = require('../config').WORLD_UNIT_3D;
    const minX = x * unit;
    const maxX = (x + 1) * unit;
    const minZ = y * unit;
    const maxZ = (y + 1) * unit;
    return obstacleFootprints(level).some(
        (f) => f.minX < maxX && f.maxX > minX && f.minZ < maxZ && f.maxZ > minZ
    );
}

// Places a placed-entity list into a category map + counts for cross-checking.
function summarizeEntities(placedEntities, entityDesign) {
    const categoryById = {};
    (entityDesign?.entities || []).forEach((def) => {
        if (def && def.id) categoryById[def.id] = def.category;
    });
    const counts = { enemy: 0, npc: 0, item: 0 };
    const byType = {};
    (placedEntities || []).forEach((e) => {
        const cat = categoryById[e.type];
        if (cat) counts[cat]++;
        byType[e.type] = (byType[e.type] || 0) + 1;
    });
    return { categoryById, counts, byType };
}

function analyzeTilemap(level, placedEntities) {
    const out = [];
    const width = level.width;
    const height = level.height;
    const layer = level.layers && level.layers[0];

    if (!Array.isArray(layer) || layer.length !== width * height) {
        out.push(w('error', 'tilemap.arity', `layers[0] length ${layer ? layer.length : 'none'} != width*height (${width * height})`));
        return out;
    }

    // Border ring must stay solid — a gap lets the player walk off the map.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
            if (isBorder && layer[y * width + x] !== 1) {
                out.push(w('error', 'tilemap.border', `border cell (${x},${y}) is not a wall`));
                return out;
            }
        }
    }

    // Connectivity — should hold because the assembly repairs it, but verify.
    const repaired = repairTilemapConnectivity(layer, width, height);
    for (let i = 0; i < layer.length; i++) {
        if (repaired[i] !== layer[i]) {
            out.push(w('error', 'tilemap.isolated', 'floor has isolated regions unreachable from the main area'));
            break;
        }
    }

    if (level.spawn && tileAt(level, level.spawn.x, level.spawn.y) !== 0) {
        out.push(w('error', 'tilemap.spawn', `spawn (${level.spawn.x},${level.spawn.y}) is on a wall`));
    }
    if (level.exit && tileAt(level, level.exit.x, level.exit.y) !== 0) {
        out.push(w('error', 'tilemap.exit', `exit (${level.exit.x},${level.exit.y}) is on a wall`));
    }

    placedEntities.forEach((e, i) => {
        if (e.x === undefined || e.y === undefined) return;
        if (tileAt(level, e.x, e.y) !== 0) {
            out.push(w('warning', 'entity.blocked', `entity ${i} (${e.type}) sits on a wall at (${e.x},${e.y})`));
        }
    });

    return out;
}

function analyzePlatformer(level, placedEntities) {
    const out = [];
    const width = level.width;
    const height = level.height;
    const collision = level.collision;
    if (!Array.isArray(collision) || collision.length !== width * height) {
        out.push(w('error', 'platformer.arity', `collision length ${collision ? collision.length : 'none'} != width*height`));
        return out;
    }

    const cell = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? collision[y * width + x] : undefined);

    if (level.spawn) {
        if (cell(level.spawn.x, level.spawn.y) !== 0) {
            out.push(w('error', 'platformer.spawn', `spawn (${level.spawn.x},${level.spawn.y}) is inside a solid cell`));
        } else if (cell(level.spawn.x, level.spawn.y + 1) !== 1) {
            out.push(w('error', 'platformer.spawn', `spawn (${level.spawn.x},${level.spawn.y}) has no ground beneath it`));
        }
    }

    let bottomSolid = false;
    for (let x = 0; x < width; x++) {
        if (cell(x, height - 1) === 1) { bottomSolid = true; break; }
    }
    if (!bottomSolid) out.push(w('warning', 'platformer.void', 'bottom row is not solid — player can fall into the void'));

    if (level.goal) {
        const reachable = jumpReachableFrom(level, level.spawn);
        if (!reachable.has(level.goal.y * width + level.goal.x)) {
            out.push(w('error', 'platformer.goal', `goal (${level.goal.x},${level.goal.y}) is not jump-reachable from the spawn`));
        }
    }

    const { walkable } = computeWalkable('platformer-2d', level);
    const standing = new Set(walkable.map((c) => c.y * width + c.x));
    placedEntities.forEach((e, i) => {
        if (e.x === undefined || e.y === undefined) return;
        if (cell(e.x, e.y) === 1) {
            out.push(w('warning', 'entity.blocked', `entity ${i} (${e.type}) is inside a solid cell at (${e.x},${e.y})`));
        } else if (!standing.has(e.y * width + e.x)) {
            out.push(w('warning', 'entity.float', `entity ${i} (${e.type}) floats without ground beneath at (${e.x},${e.y})`));
        }
    });

    return out;
}

function analyze3D(level, placedEntities) {
    const out = [];
    const unit = require('../config').WORLD_UNIT_3D;
    const clearCells = 3;
    const clearMaxX = clearCells * unit;
    const clearMaxZ = clearCells * unit;

    if (!BIOME_NAMES.includes(level.biome)) {
        out.push(w('warning', '3d.biome', `unknown biome "${level.biome}" (falling back to a default look)`));
    }

    const footprints = obstacleFootprints(level);
    let overlaps = 0;
    for (let i = 0; i < footprints.length; i++) {
        for (let j = i + 1; j < footprints.length; j++) {
            if (footprintsOverlap(footprints[i], footprints[j])) overlaps++;
        }
    }
    if (overlaps > 0) {
        out.push(w('warning', '3d.overlap', `${overlaps} overlapping obstacle pair(s) — stacked geometry may look/feel wrong`));
    }

    const inClearing = footprints.filter((f) => {
        const [ox, , oz] = f.o.position || [0, 0, 0];
        return ox >= 0 && ox < clearMaxX && oz >= 0 && oz < clearMaxZ;
    });
    if (inClearing.length > 0) {
        out.push(w('warning', '3d.spawn', `${inClearing.length} obstacle(s) sit in the spawn clearing near the top-left corner`));
    }

    const foliage = (level.terrain && level.terrain.foliage) || [];
    let foliageInside = 0;
    foliage.forEach((fol) => {
        const [fx, , fz] = fol.position || [0, 0, 0];
        if (footprints.some((f) => fx >= f.minX && fx <= f.maxX && fz >= f.minZ && fz <= f.maxZ)) foliageInside++;
    });
    if (foliageInside > 0) {
        out.push(w('warning', '3d.foliage', `${foliageInside} foliage item(s) intersect an obstacle`));
    }

    placedEntities.forEach((e, i) => {
        if (e.x === undefined || e.y === undefined) return;
        if (is3DCellBlocked(level, e.x, e.y)) {
            out.push(w('warning', 'entity.blocked', `entity ${i} (${e.type}) is inside an obstacle footprint at (${e.x},${e.y})`));
        }
    });

    return out;
}

// Analyzes one assembled level with its placed entities. Returns
// { errors: [], warnings: [] } (each item { severity, code, message }).
function analyzeLevel(engineType, level, placedEntities = [], entityDesign = null) {
    const out = [];

    if (ENGINE_TYPES_3D.includes(engineType)) {
        out.push(...analyze3D(level, placedEntities));
    } else if (engineType === 'platformer-2d') {
        out.push(...analyzePlatformer(level, placedEntities));
    } else {
        out.push(...analyzeTilemap(level, placedEntities));
    }

    // Cross-engine entity sanity: a game that designed enemies but placed
    // none is probably a broken spawn story, and 3+ of the same type crowds.
    const { counts, byType } = summarizeEntities(placedEntities, entityDesign);
    const designedEnemies = (entityDesign?.entities || []).filter((d) => d.category === 'enemy').length;
    if (designedEnemies > 0 && counts.enemy === 0) {
        out.push(w('warning', 'entity.no_enemies', 'enemies were designed but none were placed on the map'));
    }
    Object.entries(byType).forEach(([type, n]) => {
        if (n > 2) out.push(w('warning', 'entity.density', `${n} entities of type "${type}" — max 2 of the same type`));
    });

    const errors = out.filter((i) => i.severity === 'error');
    const warnings = out.filter((i) => i.severity === 'warning');
    return { errors, warnings };
}

module.exports = { analyzeLevel };
