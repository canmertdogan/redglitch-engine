// Deterministic, LLM-free map helpers used across the world-level and
// entities phases. These are the "make it actually playable" safety net:
// whatever the model outputs, this layer guarantees reachable floor, spawns
// and entities that sit on real terrain, and connected layouts — the engines
// cannot render/play a level whose walkable cells are stranded or whose
// entities are inside walls.
//
// Grid convention throughout: row-major flat arrays, index = y * width + x,
// (0,0) = top-left. Wall/solid = 1, floor/passable = 0.

const ENGINE_TYPES_3D = ['fps-3d', 'topdown-3d', 'platformer-3d'];

function clampCell(x, y, width, height) {
    return { x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y)) };
}

// The cells a given engine actually treats as placeable/standable.
// Returns { walkable: [{x,y}], width, height }.
//
//   * rpg-topdown / iso-pixel : floor tiles (0) on the walkable interior
//     (the border ring is all walls, and the engines place entities by tile).
//   * platformer-2d           : cells that are passable (collision 0) with a
//     solid cell directly beneath (collision 1) — i.e. something to stand on.
//   * 3D engines              : grid cells not covered by an obstacle's
//     footprint (level.geometry boxes are in world-space meters; each cell is
//     a unit x unit square in the same corner-based frame).
function computeWalkable(engineType, level) {
    const width = level.width || 0;
    const height = level.height || 0;
    const walkable = [];
    if (!width || !height) return { walkable, width, height };

    if (engineType === 'platformer-2d') {
        const collision = level.collision || [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (collision[y * width + x] === 1) continue;
                const below = collision[(y + 1) * width + x];
                if (below === 1) walkable.push({ x, y });
            }
        }
    } else if (ENGINE_TYPES_3D.includes(engineType)) {
        const unit = require('../config').WORLD_UNIT_3D;
        const footprints = obstacleFootprints(level);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const minX = x * unit;
                const maxX = (x + 1) * unit;
                const minZ = y * unit;
                const maxZ = (y + 1) * unit;
                const blocked = footprints.some(
                    (f) => f.minX < maxX && f.maxX > minX && f.minZ < maxZ && f.maxZ > minZ
                );
                if (!blocked) walkable.push({ x, y });
            }
        }
    } else {
        const layer = level.layers && level.layers[0];
        if (!Array.isArray(layer)) return { walkable, width, height };
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                if ((layer[y * width + x] || 0) === 0) walkable.push({ x, y });
            }
        }
    }
    return { walkable, width, height };
}

// BFS from (cx, cy) to the nearest walkable cell. Deterministic tie-break:
// BFS already visits in a fixed dir order, and we scan cells in row-major
// order when more than one candidate is at the same distance. Returns the
// closest {x, y, dist}; falls back to the clamped input if the map is
// entirely blocked.
function nearestWalkable(cx, cy, walkable, width, height) {
    const out = clampCell(cx, cy, width, height);
    const set = new Set(walkable.map((c) => c.y * width + c.x));
    if (set.size === 0) return { ...out, dist: 0 };
    if (set.has(out.y * width + out.x)) return { ...out, dist: 0 };

    const seen = new Set([out.y * width + out.x]);
    const queue = [[out.x, out.y, 0]];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (queue.length) {
        const [x, y, d] = queue.shift();
        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (seen.has(n)) continue;
            seen.add(n);
            if (set.has(n)) return { x: nx, y: ny, dist: d + 1 };
            queue.push([nx, ny, d + 1]);
        }
    }
    return { ...out, dist: 0 };
}

// BFS through ANY cell (carving through walls) from `from` to the nearest
// cell in `region` (a Set of indices). Returns the list of indices to carve
// (the path, including the region cell), or null if unreachable. The outer
// border ring is never entered — the assembly layer relies on a solid frame
// (findFloorTiles/pickSpawn assume it), so carving must stay interior.
function carvePathToRegion(from, region, width, height) {
    const isBorder = (i) => {
        const x = i % width;
        const y = Math.floor(i / width);
        return x === 0 || y === 0 || x === width - 1 || y === height - 1;
    };
    const seen = new Set([from]);
    const queue = [from];
    const prev = new Map();
    let reached = null;
    const dirs = [1, -1, width, -width];
    while (queue.length && reached === null) {
        const cur = queue.shift();
        if (region.has(cur)) {
            reached = cur;
            break;
        }
        const cx = cur % width;
        for (const d of dirs) {
            const n = cur + d;
            if (d === 1 && cx === width - 1) continue;
            if (d === -1 && cx === 0) continue;
            if (n < 0 || n >= width * height) continue;
            if (isBorder(n)) continue;
            if (seen.has(n)) continue;
            seen.add(n);
            prev.set(n, cur);
            queue.push(n);
        }
    }
    if (reached === null) return null;
    const path = [];
    for (let cur = reached; cur !== undefined; cur = prev.get(cur)) {
        path.push(cur);
        if (cur === from) break;
    }
    return path.reverse();
}

// Guarantees every floor tile is reachable from the first floor tile by
// carving a corridor (2 cells wide where possible) from each isolated floor
// pocket to the main connected region. Pure function: returns a new layer.
function repairTilemapConnectivity(layer, width, height) {
    const total = width * height;
    if (!Array.isArray(layer) || layer.length !== total) return layer;

    const floor = new Set();
    for (let i = 0; i < total; i++) if (layer[i] === 0) floor.add(i);
    if (floor.size <= 1) return layer.slice();

    const first = [...floor][0];
    const region = new Set([first]);
    const stack = [first];
    while (stack.length) {
        const cur = stack.pop();
        const cx = cur % width;
        for (const d of [1, -1, width, -width]) {
            if (d === 1 && cx === width - 1) continue;
            if (d === -1 && cx === 0) continue;
            const n = cur + d;
            if (n < 0 || n >= total || region.has(n)) continue;
            if (floor.has(n)) {
                region.add(n);
                stack.push(n);
            }
        }
    }

    const out = layer.slice();
    // Recheck as we carve: connecting one pocket may also connect its
    // neighbours, so only carve pockets still cut off from the region.
    for (const iso of [...floor]) {
        if (region.has(iso)) continue;
        const path = carvePathToRegion(iso, region, width, height);
        if (!path) continue;
        for (let p = 0; p < path.length; p++) {
            const cell = path[p];
            if (out[cell] === 0) {
                region.add(cell);
                continue;
            }
            out[cell] = 0;
            region.add(cell);
            // Widen to a 2-wide corridor, perpendicular to the direction of
            // travel: a horizontal step gets the cell below it, a vertical
            // step gets the cell to its right. The border ring is never
            // touched (widen away from it, not into it).
            const next = path[p + 1];
            if (next === undefined) continue;
            const cx = cell % width;
            const cy = Math.floor(cell / width);
            let neighbour = -1;
            if ((next % width) === cx && cy + 1 < height - 1) {
                neighbour = cell + width;
            } else if ((next % width) !== cx && cx + 1 < width - 1) {
                neighbour = cell + 1;
            }
            if (neighbour !== -1 && out[neighbour] === 1) {
                out[neighbour] = 0;
                region.add(neighbour);
            }
        }
    }
    return out;
}

// Enforces platformer basics deterministically, mutating and returning the
// level:
//   * the spawn must rest on solid ground (collision 0 with a solid cell
//     directly beneath);
//   * the bottom row must be solid (the player can never fall into the void);
//   * a spawn platform exists when the level has no walkable cell at all.
function ensurePlatformerPlayability(level) {
    const width = level.width;
    const height = level.height;
    const collision = (level.collision || []).slice();
    const layers = Array.isArray(level.layers) ? level.layers.map((l) => l.slice()) : [];
    level.collision = collision;
    level.layers = layers;
    if (!width || !height) return level;

    // Bottom row solid — cheap insurance against "player falls into void".
    let bottomSolid = false;
    for (let x = 0; x < width; x++) {
        if (collision[(height - 1) * width + x] === 1) { bottomSolid = true; break; }
    }
    if (!bottomSolid) {
        for (let x = 0; x < width; x++) {
            collision[(height - 1) * width + x] = 1;
            if (layers[0]) layers[0][(height - 1) * width + x] = 1;
        }
    }

    const { walkable } = computeWalkable('platformer-2d', level);
    if (level.spawn && typeof level.spawn.x === 'number' && typeof level.spawn.y === 'number') {
        const snapped = nearestWalkable(level.spawn.x, level.spawn.y, walkable, width, height);
        level.spawn = { x: snapped.x, y: snapped.y };
    } else if (walkable.length > 0) {
        level.spawn = { x: walkable[0].x, y: walkable[0].y };
    }

    if (walkable.length === 0) {
        // Entirely floating geometry — lay down a starter ground strip under
        // the spawn so the level is at least beginnable.
        const sx = Math.max(1, Math.min(width - 2, Math.round((level.spawn && level.spawn.x) || 1)));
        const sy = Math.max(1, Math.min(height - 2, Math.round((level.spawn && level.spawn.y) || Math.floor(height * 0.7))));
        const row = sy + 1 < height ? sy + 1 : sy;
        for (let x = Math.max(0, sx - 2); x <= Math.min(width - 1, sx + 2); x++) {
            collision[row * width + x] = 1;
            if (layers[0]) layers[0][row * width + x] = 1;
        }
        level.spawn = { x: sx, y: row - 1 };
    }
    return level;
}

// Renders a compact ASCII map of the walkable cells for the entities phase
// prompt — the model gets to *see* where it may place things instead of
// guessing blind. '.' = placeable, '#' = blocked, 'S' = player spawn,
// 'E' = level exit/goal (first found wins when several cells share a marker).
function renderWalkableMap(engineType, level, markers = {}) {
    const { walkable, width, height } = computeWalkable(engineType, level);
    if (!width || !height) return '';
    const walk = new Set(walkable.map((c) => c.y * width + c.x));
    const rows = [];
    for (let y = 0; y < height; y++) {
        let row = '';
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const isSpawn = markers.spawn && markers.spawn.x === x && markers.spawn.y === y;
            const isExit = markers.exit && markers.exit.x === x && markers.exit.y === y;
            if (isSpawn) row += 'S';
            else if (isExit) row += 'E';
            else row += walk.has(idx) ? '.' : '#';
        }
        rows.push(row);
    }
    return rows.join('\n');
}

// Deterministic entity snapping: relocates any placed entity onto the nearest
// walkable cell and dedupes to at most one entity per tile (keeping the first
// occurrence). Returns a new entities array.
function snapEntities(engineType, level, entities) {
    const { walkable, width, height } = computeWalkable(engineType, level);
    const used = new Set();
    const out = [];
    for (const e of entities || []) {
        if (e.x === undefined || e.y === undefined) continue;
        const snapped = nearestWalkable(e.x, e.y, walkable, width, height);
        const key = `${snapped.x},${snapped.y}`;
        if (used.has(key)) continue;
        used.add(key);
        out.push({ ...e, x: snapped.x, y: snapped.y });
    }
    return out;
}

// --- Platformer jump-reachability -----------------------------------------
//
// The engine's physics model is approximated by three constants (matched to
// the world-level platformer prompt): a jump climbs at most MAX_JUMP_UP
// cells, clears at most MAX_JUMP_ACROSS cells horizontally, and lands at most
// MAX_STEP_DOWN cells below the takeoff (deeper falls are possible but then
// you cannot climb back, so they're not "progress" for reachability).
const MAX_JUMP_UP = 4;
const MAX_JUMP_ACROSS = 3;
const MAX_STEP_DOWN = 2;

// Standing cells (collision 0 with a solid cell beneath) as a Set of indices.
function standingCellSet(level) {
    const { collision, width, height } = level;
    const set = new Set();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if ((collision[y * width + x] || 0) === 0 && collision[(y + 1) * width + x] === 1) {
                set.add(y * width + x);
            }
        }
    }
    return set;
}

// The set of standing cells reachable from the spawn under the jump model
// (BFS over "run across at takeoff height, then rise/fall to a landing with
// solid ground beneath"). Returns a Set of indices.
function jumpReachableFrom(level, spawn) {
    const { collision, width, height } = level;
    if (!spawn || typeof spawn.x !== 'number' || typeof spawn.y !== 'number') return new Set();
    const standing = standingCellSet(level);
    if (standing.size === 0) return new Set();

    const passable = (x, y) =>
        x >= 0 && y >= 0 && x < width && y < height && (collision[y * width + x] || 0) === 0;

    const startIdx = spawn.y * width + spawn.x;
    // If the spawn itself isn't standing, seed from the nearest standing cell.
    const start = standing.has(startIdx) ? startIdx : nearestStanding(spawn, standing, width, height);

    const reachable = new Set([start]);
    const queue = [start];
    while (queue.length) {
        const cur = queue.shift();
        const x = cur % width;
        const y = Math.floor(cur / width);
        for (let dx = -MAX_JUMP_ACROSS; dx <= MAX_JUMP_ACROSS; dx++) {
            for (let dy = -MAX_JUMP_UP; dy <= MAX_STEP_DOWN; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (!passable(nx, ny)) continue;
                const nIdx = ny * width + nx;
                if (!standing.has(nIdx) || reachable.has(nIdx)) continue;
                // Clearance: the horizontal run at takeoff height and the
                // vertical rise/fall at the landing x must both be obstacle-free.
                let clear = true;
                const xLo = Math.min(x, nx);
                const xHi = Math.max(x, nx);
                for (let i = xLo; i <= xHi && clear; i++) clear = passable(i, y);
                const yLo = Math.min(y, ny);
                const yHi = Math.max(y, ny);
                for (let j = yLo; j <= yHi && clear; j++) clear = passable(nx, j);
                if (!clear) continue;
                reachable.add(nIdx);
                queue.push(nIdx);
            }
        }
    }
    return reachable;
}

function nearestStanding(from, standing, width, height) {
    return nearestInCellSet(from, standing, width, height);
}

// BFS from a cell ({x, y}) to the nearest cell in an arbitrary Set of grid
// indices. Returns the target index (0-based row-major), or the clamped origin
// index if the set is empty / unreachable (it never is on finite grids).
function nearestInCellSet(from, set, width, height) {
    const start = clampCell(from.x, from.y, width, height);
    const startIdx = start.y * width + start.x;
    if (set.size === 0) return startIdx;
    if (set.has(startIdx)) return startIdx;
    const seen = new Set([startIdx]);
    const queue = [[start.x, start.y]];
    while (queue.length) {
        const [x, y] = queue.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (seen.has(n)) continue;
            seen.add(n);
            if (set.has(n)) return n;
            queue.push([nx, ny]);
        }
    }
    return startIdx;
}

// Completability guarantee: if the goal is not jump-reachable from the spawn,
// clamp it to the nearest reachable standing cell (rightmost-first when
// distances tie) so the level can always be beaten. Mutates and returns level.
function ensurePlatformerReachability(level) {
    const width = level.width;
    const height = level.height;
    if (!width || !height || !level.collision) return level;
    const standing = standingCellSet(level);
    if (standing.size === 0 || !level.goal) return level;

    const goalIdx = level.goal.y * width + level.goal.x;
    if (!standing.has(goalIdx)) {
        const nearest = nearestStanding(level.goal, standing, width, height);
        level.goal = { x: nearest % width, y: Math.floor(nearest / width) };
    }

    const reachable = jumpReachableFrom(level, level.spawn);
    if (reachable.has(level.goal.y * width + level.goal.x)) return level;

    // Pick the reachable standing cell nearest the original goal; prefer a
    // larger x when several tie (the goal should still read as "far right").
    const gx = level.goal.x;
    const gy = level.goal.y;
    let best = null;
    let bestDist = Infinity;
    for (const idx of reachable) {
        const x = idx % width;
        const y = Math.floor(idx / width);
        const d = Math.abs(x - gx) + Math.abs(y - gy);
        if (d < bestDist || (d === bestDist && best !== null && x > best.x)) {
            bestDist = d;
            best = { x, y };
        }
    }
    if (best) level.goal = best;
    return level;
}

// --- 3D elevation sanity ---------------------------------------------------
//
// 3D entities are dropped onto the terrain height field during campaign build;
// a cell on a steep slope makes the entity float over the low side or clip
// into the high side. findFlatCell BFSes to the nearest cell whose elevation
// differs from each 4-neighbour by at most FLAT_ELEVATION_DELTA, so a placed
// entity gets a patch of ground it can actually sit on. Falls back to the
// clamped origin when no flat cell exists (a fully jagged height field).
const FLAT_ELEVATION_DELTA = 1.0;

function sampleHeightAt(heightMap, width, height, x, y) {
    const ix = Math.max(0, Math.min(width - 1, Math.round(x)));
    const iz = Math.max(0, Math.min(height - 1, Math.round(y)));
    const v = heightMap[iz * width + ix];
    return Number.isFinite(v) ? v : 0;
}

function findFlatCell(heightMap, width, height, gx, gz) {
    if (!Array.isArray(heightMap)) return clampCell(gx, gz, width, height);
    const start = clampCell(Math.round(gx), Math.round(gz), width, height);
    const isFlat = (x, y) => {
        const v = sampleHeightAt(heightMap, width, height, x, y);
        return (
            Math.abs(v - sampleHeightAt(heightMap, width, height, x - 1, y)) <= FLAT_ELEVATION_DELTA &&
            Math.abs(v - sampleHeightAt(heightMap, width, height, x + 1, y)) <= FLAT_ELEVATION_DELTA &&
            Math.abs(v - sampleHeightAt(heightMap, width, height, x, y - 1)) <= FLAT_ELEVATION_DELTA &&
            Math.abs(v - sampleHeightAt(heightMap, width, height, x, y + 1)) <= FLAT_ELEVATION_DELTA
        );
    };

    if (isFlat(start.x, start.y)) return start;
    const seen = new Set([start.y * width + start.x]);
    const queue = [[start.x, start.y]];
    while (queue.length) {
        const [x, y] = queue.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (seen.has(n)) continue;
            seen.add(n);
            if (isFlat(nx, ny)) return { x: nx, y: ny };
            queue.push([nx, ny]);
        }
    }
    return start;
}

// --- 3D placement sanitation ----------------------------------------------
//
// The 3D level hands obstacle/folliage coordinates to the LLM blind (it picks
// biomes and grids, not physics), so a deterministic pass keeps the player's
// spawn usable and the scene sane:
//   * any obstacle whose CENTER sits inside the spawn clearing (the ~3x3-cell
//     top-left corner the prompt tells the model to keep open) is removed —
//     boundary walls that merely touch the clearing survive, so maze start
//     rooms keep their walls;
//   * obstacles fully contained inside a bigger kept obstacle are removed as
//     redundant;
//   * foliage whose anchor point lands inside a kept obstacle is removed.
function obstacleFootprints(level) {
    return (level.geometry || []).map((o, i) => {
        const [ox, , oz] = o.position || [0, 0, 0];
        const halfW = (Number(o.width) || 1) / 2;
        const halfD = (Number(o.depth) || 1) / 2;
        return { index: i, o, minX: ox - halfW, maxX: ox + halfW, minZ: oz - halfD, maxZ: oz + halfD };
    });
}

function footprintsOverlap(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function sanitize3DPlacement(level) {
    const unit = require('../config').WORLD_UNIT_3D;
    const clearCells = 3;
    const clearMinX = 0;
    const clearMaxX = clearCells * unit;
    const clearMinZ = 0;
    const clearMaxZ = clearCells * unit;

    const footprints = obstacleFootprints(level);
    const kept = [];
    const droppedClearing = [];
    const droppedContained = [];
    for (const f of footprints) {
        const [ox, , oz] = f.o.position || [0, 0, 0];
        const inClearing = ox >= clearMinX && ox < clearMaxX && oz >= clearMinZ && oz < clearMaxZ;
        if (inClearing) {
            droppedClearing.push(f.index);
            continue;
        }
        const contained = kept.some((k) => f.minX >= k.minX && f.maxX <= k.maxX && f.minZ >= k.minZ && f.maxZ <= k.maxZ);
        if (contained) {
            droppedContained.push(f.index);
            continue;
        }
        kept.push(f);
    }
    level.geometry = kept.map((f) => f.o);

    const remaining = obstacleFootprints(level);
    if (level.terrain && Array.isArray(level.terrain.foliage)) {
        level.terrain.foliage = level.terrain.foliage.filter((fol) => {
            const [fx, , fz] = fol.position || [0, 0, 0];
            return !remaining.some((k) => fx >= k.minX && fx <= k.maxX && fz >= k.minZ && fz <= k.maxZ);
        });
    }

    return { level, droppedClearing, droppedContained };
}

// --- 2D tilemap enrichment -------------------------------------------------
//
// The model is asked for 25-45% interior walls, but a cheap/reasoning model
// sometimes hands back a near-empty room (border + all floor) — valid, fully
// connected, and utterly boring. Validation can't catch taste, so this pass
// deterministically ADDS structure to a too-empty map until it reaches a
// minimum interior wall ratio, seeded from the map contents themselves (same
// input -> same layout, no dice on save/regenerate). The LLM never sees this;
// it's pure assembly. Styles:
//   * 'rooms'    — rectangular dungeon rooms with a 2-wide doorway each;
//   * 'clusters' — small free-standing wall blobs (forest/field look);
//   * 'arena'    — centered cover blocks (2x2 / 3x1) like a brawl pit.
// Nothing here can seal a floor pocket (rooms always keep a doorway, blobs/
// blocks are wall islands), and the caller re-runs repairTilemapConnectivity
// afterwards as a belt-and-braces guarantee. Returns a new layer.
const MIN_WALL_RATIO = 0.26;
const ENRICH_TARGET_RATIO = 0.32;
const ENRICH_MAX_RATIO = 0.45;

function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Places one wall-outlined room (outer rw x rh, always a 2-wide doorway) with
// its top-left at (x,y). Returns walls added. rw/rh are caller-chosen and
// must already fit (x+rw <= width, y+rh <= height); the footprint is required
// to be open floor so a room never mangles existing structure.
function tryPlaceRoom(out, width, height, x, y, rw, rh) {
    for (let yy = y; yy < y + rh; yy++) {
        for (let xx = x; xx < x + rw; xx++) {
            if (out[yy * width + xx] === 1) return 0;
        }
    }
    let added = 0;
    for (let xx = x; xx < x + rw; xx++) {
        if (out[y * width + xx] === 0) { out[y * width + xx] = 1; added++; }
        if (out[(y + rh - 1) * width + xx] === 0) { out[(y + rh - 1) * width + xx] = 1; added++; }
    }
    for (let yy = y + 1; yy < y + rh - 1; yy++) {
        if (out[yy * width + x] === 0) { out[yy * width + x] = 1; added++; }
        if (out[yy * width + x + rw - 1] === 0) { out[yy * width + x + rw - 1] = 1; added++; }
    }
    // Doorway: a 2-wide gap in the bottom wall, mid-ish (runs LEFT from the
    // chosen tile so it stays in-bounds by construction).
    const doorStart = x + Math.max(1, Math.floor((rw - 3) / 2));
    for (let d = 0; d < 2; d++) {
        const idx = (y + rh - 1) * width + doorStart + d;
        if (out[idx] === 1) { out[idx] = 0; added--; }
    }
    return added;
}

// Places one small free-standing shape at (x,y): 'arena' = 2x2 or 3x2 cover
// block, 'clusters' = 3-4 tile blob. Returns walls added.
function tryPlaceCluster(out, width, height, x, y, style, rnd) {
    const cells = [];
    if (style === 'arena') {
        if (rnd() < 0.5) { cells.push([0, 0], [1, 0], [0, 1], [1, 1]); }
        else { cells.push([0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]); }
    } else {
        const shape = Math.floor(rnd() * 4);
        if (shape === 0) { cells.push([0, 0], [0, 1], [1, 0]); }
        else if (shape === 1) { cells.push([0, 0], [1, 0], [2, 0]); }
        else if (shape === 2) { cells.push([0, 0], [1, 0], [0, 1], [1, 1]); }
        else { cells.push([0, 0], [1, 0], [1, 1]); }
    }
    let added = 0;
    for (const [dx, dy] of cells) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 1 || yy < 1 || xx >= width - 1 || yy >= height - 1) continue;
        if (out[yy * width + xx] === 0) { out[yy * width + xx] = 1; added++; }
    }
    return added;
}

// Deterministic anchor grid — anchors are spread across the interior by
// construction (2-3 cells apart), so shapes never pile into one blob.
function shapeAnchors(width, height) {
    const anchors = [];
    const cols = Math.max(2, Math.min(4, Math.floor((width - 2) / 3)));
    const rows = Math.max(2, Math.min(3, Math.floor((height - 2) / 3)));
    const stepX = (width - 2) / cols;
    const stepY = (height - 2) / rows;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = Math.round(1 + stepX * c + stepX / 2 - 1);
            const y = Math.round(1 + stepY * r + stepY / 2 - 1);
            anchors.push([Math.max(1, Math.min(width - 2, x)), Math.max(1, Math.min(height - 2, y))]);
        }
    }
    return anchors;
}

function enrichTilemapInterior(layer, width, height, style = 'rooms', seed) {
    const total = width * height;
    if (!Array.isArray(layer) || layer.length !== total) return layer;
    let walls = 0;
    let cells = 0;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            cells++;
            if (layer[y * width + x] === 1) walls++;
        }
    }
    if (cells === 0 || walls / cells >= MIN_WALL_RATIO) return layer.slice();

    const out = layer.slice();
    const rnd = mulberry32(hashSeed(seed || `${width}x${height}:${out.join('')}`));
    const target = Math.min(Math.floor(cells * ENRICH_TARGET_RATIO), Math.floor(cells * ENRICH_MAX_RATIO));

    if (style === 'rooms') {
        // Clean dungeon rooms on a 1-2 x 1-2 slot grid. Each room fills its
        // slot minus a 1-wide corridor gap on the right/bottom, so rooms can
        // never overlap by construction. Every room keeps a 2-wide doorway
        // (tryPlaceRoom) so floor stays connected; the repair pass afterwards
        // guarantees it. Grids too small for 2x2 slots get a single large
        // room instead, and a truly empty interior that couldn't fit any room
        // (tiny grid) gets arena cover blocks so it never ships empty — but a
        // layer that already has structure is never cluster-filled.
        const interiorW = width - 2;
        const interiorH = height - 2;
        const cols = interiorW >= 10 ? 2 : 1;
        const rows = interiorH >= 8 ? 2 : 1;
        const slotW = Math.floor(interiorW / cols);
        const slotH = Math.floor(interiorH / rows);
        // Room sizes vary slightly by seed (a 2x2 grid still fits: shrinking a
        // room just widens its corridor). Randomizing the *position* would be
        // fine too but fixed slot anchors keep rooms symmetric.
        const rw = Math.max(3, slotW - 1 - (rnd() < 0.5 ? 1 : 0));
        const rh = Math.max(2, slotH - 1 - (rnd() < 0.5 ? 1 : 0));
        const skipDoor = rnd() < 0.2; // rarely, drop one room for variety
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (walls >= target) break;
                if (skipDoor && r === 0 && c === 0) continue;
                const ax = 1 + c * slotW;
                const ay = 1 + r * slotH;
                if (ax + rw > width - 1 || ay + rh > height - 1) continue;
                walls += tryPlaceRoom(out, width, height, ax, ay, rw, rh);
            }
        }
        if (walls === 0 && walls < target) {
            const anchors = shapeAnchors(width, height);
            for (const [ax, ay] of anchors) {
                if (walls >= target) break;
                walls += tryPlaceCluster(out, width, height, ax, ay, 'arena', rnd);
            }
        }
        return out;
    }

    // clusters / arena: spread anchors, one small shape each, jittered by the
    // seed so different concepts scatter their structure differently. Runs
    // multiple rounds (each round re-jitters) so small grids can still reach
    // the target wall ratio.
    const anchors = shapeAnchors(width, height);
    for (let round = 0; round < 3 && walls < target; round++) {
        for (const [ax, ay] of anchors) {
            if (walls >= target) break;
            const jx = Math.max(1, Math.min(width - 2, ax + Math.floor(rnd() * 5) - 2));
            const jy = Math.max(1, Math.min(height - 2, ay + Math.floor(rnd() * 5) - 2));
            walls += tryPlaceCluster(out, width, height, jx, jy, style, rnd);
        }
    }
    return out;
}

// --- Structural audit -------------------------------------------------------
//
// enrichTilemapInterior used to be the only structural safety net, and it had
// two holes: it only fired when the map was BELOW MIN_WALL_RATIO (a model that
// drew 30% walls of pure noise sailed through untouched), and it silently did
// nothing when every room footprint collided with a model-drawn wall (the
// "#####..#####" gapped-line failure seen in the wild). The audit is the
// general gate: a model layer is KEPT only when it reads as real structure.
// Otherwise the caller rebuilds deterministically (buildTilemapForStyle).
//
// Rules (interior cells only, border ring excluded):
//   * wall ratio must sit in [0.20, 0.50] — too empty is boring, too dense is
//     a solid mass / maze noise;
//   * at most one isolated single-tile pillar (checkerboard / scattered dots
//     produce many);
//   * style-specific coherence: 'rooms' needs a real wall component (a room
//     outline), 'arena' needs solid cover blocks, 'clusters' tolerates blobs
//     but not a wall-line scribble.
function auditTilemapStructure(layer, width, height, style = 'rooms') {
    const total = width * height;
    if (!Array.isArray(layer) || layer.length !== total) {
        return { ok: false, reasons: ['bad arity'], ratio: 0, pillars: 0, comps: 0, maxComp: 0 };
    }
    const interior = [];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) interior.push(y * width + x);
    }
    let walls = 0;
    let pillars = 0;
    const isWall = (x, y) => layer[y * width + x] === 1;
    for (const i of interior) {
        if (layer[i] !== 1) continue;
        walls++;
        const x = i % width;
        const y = (i / width) | 0;
        const n = isWall(x, y - 1), s = isWall(x, y + 1), e = isWall(x + 1, y), w = isWall(x - 1, y);
        if (!n && !s && !e && !w) pillars++;
    }
    const ratio = interior.length ? walls / interior.length : 0;

    const intSet = new Set(interior);
    const seen = new Set();
    let comps = 0, maxComp = 0;
    for (const i of interior) {
        if (layer[i] !== 1 || seen.has(i)) continue;
        comps++;
        const st = [i];
        seen.add(i);
        let sz = 0;
        while (st.length) {
            const c = st.pop();
            sz++;
            const cx = c % width;
            for (const d of [1, -1, width, -width]) {
                if (d === 1 && cx === width - 1) continue;
                if (d === -1 && cx === 0) continue;
                const n = c + d;
                if (intSet.has(n) && layer[n] === 1 && !seen.has(n)) { seen.add(n); st.push(n); }
            }
        }
        if (sz > maxComp) maxComp = sz;
    }

    const reasons = [];
    if (ratio < 0.20) reasons.push(`too sparse (${(ratio * 100).toFixed(0)}% interior walls)`);
    if (ratio > 0.50) reasons.push(`too dense (${(ratio * 100).toFixed(0)}% interior walls)`);
    // Isolated single-tile walls are fine as an accent (a lone tree), but a
    // map whose structure is mostly isolated dots reads as noise. Proportional
    // to the wall count so a few accents never trigger it.
    if (walls > 0 && pillars / walls > 0.25) reasons.push(`${pillars}/${walls} walls are isolated single tiles — reads as noise`);
    if (style === 'rooms' && maxComp < 6) reasons.push(`no coherent room structure (largest wall block is ${maxComp} tiles)`);
    if (style === 'arena' && (maxComp < 4 || comps > 8)) reasons.push(`no solid arena cover structure (${comps} fragments, largest ${maxComp})`);
    if (style === 'clusters' && comps > 14) reasons.push(`${comps} wall fragments — too fragmented`);
    return { ok: reasons.length === 0, reasons, ratio, pillars, comps, maxComp };
}

// A bare border ring with an empty interior — the neutral base every
// deterministic builder carves structure into.
function emptyInterior(width, height) {
    const layer = Array(width * height).fill(0);
    for (let x = 0; x < width; x++) { layer[x] = 1; layer[(height - 1) * width + x] = 1; }
    for (let y = 0; y < height; y++) { layer[y * width] = 1; layer[y * width + width - 1] = 1; }
    return layer;
}

// Deterministic full-structure builder for a style. Used when the audit
// rejects the model layer (or the theme demands a maze): the code, not the
// LLM, owns the structure. Same seed -> same map; different seeds ->
// different maps, so distinct concepts never look like copies. Ends with a
// connectivity pass so a deterministic build can never ship a sealed floor
// pocket (arena cover blocks can still enclose one on a tight grid).
function buildTilemapForStyle(width, height, style, seed) {
    const layer = emptyInterior(width, height);
    if (style === 'maze') return generateMaze(width, height, seed);
    return repairTilemapConnectivity(enrichTilemapInterior(layer, width, height, style, seed), width, height);
}

// Maps a concept/theme to the enrichment style that best matches it.
function enrichmentStyleFor(concept, themeOverride) {
    const theme = String(themeOverride || (concept && concept.theme) || (concept && concept.title) || '').toLowerCase();
    if (/maze|labyrinth|labirent|corridor|tunnel|warren/.test(theme)) return 'maze';
    if (/arena|brawl|pit|colosseum|wave|survival/.test(theme)) return 'arena';
    if (/forest|field|meadow|garden|park|jungle|wild/.test(theme)) return 'clusters';
    return 'rooms';
}

// --- Deterministic maze generation -----------------------------------------
//
// A maze is the one layout an LLM reliably botches: it "draws" parallel
// wall lines with gaps instead of an actual connected maze. So when the
// theme asks for one, we don't trust the model's layer at all — we carve a
// real perfect maze (unique path between any two cells, every floor tile
// reachable) with a seeded recursive backtracker. Same input -> same maze,
// different concept/brief seed -> different maze.
//
// Layout: the interior is a grid of "cells" on odd row/col positions; walls
// fill everything else. Each cell is carved to floor, then passages are
// carved between adjacent visited cells. The outer border ring stays solid.
// Requires a minimum interior of ~3x3 cells; smaller grids fall back to the
// rooms enrichment (a 1-2 cell maze is meaningless).
function generateMaze(width, height, seed) {
    const total = width * height;
    const layer = Array(total).fill(1);
    const cols = Math.floor((width - 1) / 2);
    const rows = Math.floor((height - 1) / 2);
    if (cols < 2 || rows < 2) return layer;

    const rnd = mulberry32(hashSeed(seed || `${width}x${height}`));
    const visited = Array(rows * cols).fill(false);

    const cellIdx = (cy, cx) => cy * cols + cx;
    const carveCell = (cy, cx) => {
        layer[(1 + 2 * cy) * width + (1 + 2 * cx)] = 0;
    };
    const carveBetween = (cy1, cx1, cy2, cx2) => {
        // Tile between two adjacent cells: rows 1+2*cy1 and 1+2*cy2 share the
        // middle row 1+cy1+cy2 (same for columns).
        layer[(1 + cy1 + cy2) * width + (1 + cx1 + cx2)] = 0;
    };

    carveCell(0, 0);
    visited[0] = true;
    const stack = [[0, 0]];
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    while (stack.length) {
        const [cy, cx] = stack[stack.length - 1];
        const options = [];
        for (const [dy, dx] of dirs) {
            const ny = cy + dy;
            const nx = cx + dx;
            if (ny < 0 || nx < 0 || ny >= rows || nx >= cols) continue;
            if (visited[ny * cols + nx]) continue;
            options.push([ny, nx]);
        }
        if (options.length === 0) {
            stack.pop();
            continue;
        }
        const [ny, nx] = options[Math.floor(rnd() * options.length)];
        carveBetween(cy, cx, ny, nx);
        visited[ny * cols + nx] = true;
        carveCell(ny, nx);
        stack.push([ny, nx]);
    }
    return layer;
}

module.exports = {
    computeWalkable,
    nearestWalkable,
    repairTilemapConnectivity,
    ensurePlatformerPlayability,
    ensurePlatformerReachability,
    jumpReachableFrom,
    nearestInCellSet,
    findFlatCell,
    FLAT_ELEVATION_DELTA,
    enrichTilemapInterior,
    enrichmentStyleFor,
    generateMaze,
    auditTilemapStructure,
    buildTilemapForStyle,
    MIN_WALL_RATIO,
    obstacleFootprints,
    footprintsOverlap,
    sanitize3DPlacement,
    renderWalkableMap,
    snapEntities,
    MAX_JUMP_UP,
    MAX_JUMP_ACROSS,
    MAX_STEP_DOWN,
    ENGINE_TYPES_3D,
};
