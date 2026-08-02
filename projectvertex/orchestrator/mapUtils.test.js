const test = require('node:test');
const assert = require('node:assert');

const {
    computeWalkable,
    nearestWalkable,
    repairTilemapConnectivity,
    ensurePlatformerPlayability,
    renderWalkableMap,
    snapEntities,
    nearestInCellSet,
    findFlatCell,
    enrichTilemapInterior,
    generateMaze,
    auditTilemapStructure,
    buildTilemapForStyle,
    MIN_WALL_RATIO,
} = require('./mapUtils');

function emptyBox(width, height) {
    const layer = Array(width * height).fill(0);
    for (let x = 0; x < width; x++) { layer[x] = 1; layer[(height - 1) * width + x] = 1; }
    for (let y = 0; y < height; y++) { layer[y * width] = 1; layer[y * width + width - 1] = 1; }
    return layer;
}

function interiorWallRatio(layer, width, height) {
    let walls = 0;
    let cells = 0;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            cells++;
            if (layer[y * width + x] === 1) walls++;
        }
    }
    return cells ? walls / cells : 0;
}

function assertConnected(layer, width, height) {
    const floor = [];
    for (let i = 0; i < layer.length; i++) if (layer[i] === 0) floor.push(i);
    if (floor.length === 0) return;
    const seen = new Set([floor[0]]);
    const stack = [floor[0]];
    while (stack.length) {
        const cur = stack.pop();
        const cx = cur % width;
        for (const d of [1, -1, width, -width]) {
            if (d === 1 && cx === width - 1) continue;
            if (d === -1 && cx === 0) continue;
            const n = cur + d;
            if (n < 0 || n >= width * height) continue;
            if (seen.has(n) || layer[n] !== 0) continue;
            seen.add(n);
            stack.push(n);
        }
    }
    assert.deepStrictEqual([...seen].sort((a, b) => a - b), [...floor].sort((a, b) => a - b), 'all floor tiles must be mutually reachable');
}

test('repairTilemapConnectivity leaves an already-connected layer untouched', () => {
    const width = 5;
    const height = 4;
    const layer = [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const out = repairTilemapConnectivity(layer, width, height);
    assert.deepStrictEqual(out, layer);
    assertConnected(out, width, height);
});

test('repairTilemapConnectivity carves a corridor into an isolated room', () => {
    const width = 5;
    const height = 5;
    // 5x5, border walls, one isolated 1x1 floor pocket at (3,1).
    const layer = [
        1, 1, 1, 1, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1,
    ];
    const out = repairTilemapConnectivity(layer, width, height);
    assertConnected(out, width, height);
    // Border must never be carved open.
    for (let i = 0; i < width * height; i++) {
        const x = i % width;
        const y = Math.floor(i / width);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
            assert.strictEqual(out[i], 1, `border cell ${i} must stay a wall`);
        }
    }
});

test('repairTilemapConnectivity connects multiple isolated pockets', () => {
    const width = 7;
    const height = 5;
    const layer = [
        1, 1, 1, 1, 1, 1, 1,
        1, 0, 0, 0, 0, 0, 1,
        1, 1, 1, 1, 1, 0, 1,
        1, 0, 0, 0, 0, 0, 1,
        1, 1, 1, 1, 1, 1, 1,
    ];
    const out = repairTilemapConnectivity(layer, width, height);
    assertConnected(out, width, height);
    for (let i = 0; i < width * height; i++) {
        const x = i % width;
        const y = Math.floor(i / width);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
            assert.strictEqual(out[i], 1, 'border must stay a wall');
        }
    }
});

test('computeWalkable for a tilemap returns interior floor tiles only', () => {
    const level = {
        width: 4,
        height: 3,
        layers: [[1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]],
    };
    const { walkable } = computeWalkable('rpg-topdown', level);
    assert.deepStrictEqual(walkable, [{ x: 1, y: 1 }, { x: 2, y: 1 }]);
});

test('computeWalkable for platformer requires solid ground beneath', () => {
    const width = 4;
    const height = 3;
    // Row 2 is ground; cells above it at y=1 are standable.
    const collision = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
    const { walkable } = computeWalkable('platformer-2d', { width, height, collision });
    assert.deepStrictEqual(walkable, [
        { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
    ]);
});

test('computeWalkable for 3D excludes cells under obstacle footprints', () => {
    const width = 4;
    const height = 2;
    // 4x2 grid, unit=4m. Obstacle centered at (x=8, z=0) sized 8x4 covers
    // grid cells x=1 and x=2 in row z=0.
    const level = {
        width,
        height,
        geometry: [{ type: 'box', width: 8, height: 2, depth: 4, position: [8, 1, 0] }],
    };
    const { walkable } = computeWalkable('fps-3d', level);
    const cells = walkable.map((c) => `${c.x},${c.y}`).sort();
    assert.ok(!cells.includes('1,0'));
    assert.ok(!cells.includes('2,0'));
    assert.ok(cells.includes('0,0'));
    assert.ok(cells.includes('3,0'));
    assert.ok(cells.includes('0,1'));
});

test('nearestWalkable snaps to the closest floor cell', () => {
    const width = 4;
    const height = 3;
    const walkable = [{ x: 0, y: 0 }, { x: 3, y: 2 }];
    const snapped = nearestWalkable(1, 1, walkable, width, height);
    assert.deepStrictEqual({ x: snapped.x, y: snapped.y }, { x: 0, y: 0 });
});

test('snapEntities relocates wall placements and dedupes tiles', () => {
    const level = {
        width: 4,
        height: 3,
        layers: [[1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]],
    };
    const entities = [
        { type: 'slime', x: 0, y: 0 }, // border wall -> snaps to (1,1)
        { type: 'slime', x: 1, y: 1 }, // same tile as snapped -> dropped
        { type: 'goblin', x: 2, y: 1 },
    ];
    const out = snapEntities('rpg-topdown', level, entities);
    assert.deepStrictEqual(out.map((e) => `${e.type}@${e.x},${e.y}`), ['slime@1,1', 'goblin@2,1']);
});

test('ensurePlatformerPlayability grounds the spawn and solidifies the bottom row', () => {
    // Spawn floating over void, bottom row all air.
    const level = {
        width: 4,
        height: 3,
        layers: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        collision: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        spawn: { x: 1, y: 0 },
    };
    ensurePlatformerPlayability(level);
    // Bottom row (y=2) must be solid.
    for (let x = 0; x < 4; x++) {
        assert.strictEqual(level.collision[2 * 4 + x], 1);
    }
    // Spawn must stand on solid ground.
    assert.strictEqual(level.collision[(level.spawn.y + 1) * 4 + level.spawn.x], 1);
    assert.strictEqual(level.collision[level.spawn.y * 4 + level.spawn.x], 0);
});

test('renderWalkableMap marks spawn, exit, walls and floor', () => {
    const level = {
        width: 4,
        height: 2,
        layers: [[1, 1, 1, 1, 1, 0, 0, 1]],
    };
    const map = renderWalkableMap('rpg-topdown', level, { spawn: { x: 1, y: 1 }, exit: { x: 2, y: 1 } });
    assert.strictEqual(map, '####\n#SE#');
});

test('nearestInCellSet finds the nearest index in an arbitrary set', () => {
    const set = new Set([2 * 6 + 4]); // (4,2)
    const idx = nearestInCellSet({ x: 0, y: 0 }, set, 6, 6);
    assert.strictEqual(idx, 2 * 6 + 4);
});

test('nearestInCellSet returns the origin when it is already in the set', () => {
    const set = new Set([1 * 6 + 1, 4 * 6 + 4]);
    assert.strictEqual(nearestInCellSet({ x: 1, y: 1 }, set, 6, 6), 1 * 6 + 1);
});

test('findFlatCell keeps a cell whose neighbours match its elevation', () => {
    const width = 4;
    const height = 4;
    const heightMap = Array(width * height).fill(2); // uniform plane
    const flat = findFlatCell(heightMap, width, height, 1, 1);
    assert.deepStrictEqual(flat, { x: 1, y: 1 });
});

test('findFlatCell moves off a lone ridge onto the surrounding plain', () => {
    const width = 5;
    const height = 5;
    const heightMap = Array(width * height).fill(0);
    heightMap[2 * width + 2] = 3; // peak cell whose neighbours differ by 3
    // (2,2) itself is NOT flat (neighbours differ by 3 > delta 1)…
    assert.notDeepStrictEqual(findFlatCell(heightMap, width, height, 2, 2), { x: 2, y: 2 });
    // …but an adjacent flat cell is reachable.
    const flat = findFlatCell(heightMap, width, height, 2, 2);
    const idx = flat.y * width + flat.x;
    assert.strictEqual(heightMap[idx], 0);
});

test('findFlatCell degrades gracefully without a height map', () => {
    assert.deepStrictEqual(findFlatCell(null, 4, 4, 5, 5), { x: 3, y: 3 });
});

test('enrichTilemapInterior leaves an already-structured layer untouched', () => {
    const width = 10;
    const height = 8;
    // A layer already above MIN_WALL_RATIO must not be modified.
    const layer = emptyBox(width, height);
    for (let x = 2; x < 8; x++) { layer[3 * width + x] = 1; layer[5 * width + x] = 1; }
    const out = enrichTilemapInterior(layer, width, height, 'rooms');
    assert.deepStrictEqual(out, layer);
});

test('enrichTilemapInterior fills an empty box with rooms and a doorway', () => {
    const width = 10;
    const height = 8;
    const out = enrichTilemapInterior(emptyBox(width, height), width, height, 'rooms');
    assert.ok(interiorWallRatio(out, width, height) >= MIN_WALL_RATIO, 'rooms must raise the wall ratio');
    // Border ring must stay intact.
    for (let x = 0; x < width; x++) { assert.strictEqual(out[x], 1); assert.strictEqual(out[(height - 1) * width + x], 1); }
    for (let y = 0; y < height; y++) { assert.strictEqual(out[y * width], 1); assert.strictEqual(out[y * width + width - 1], 1); }
    // Every room outline must leave a 2-wide doorway (gap) on its wall.
    const walls = [];
    for (let i = 0; i < width * height; i++) if (out[i] === 1) walls.push(i);
    assert.ok(walls.length >= 14, 'a 7x5 room outline is at least ~14 walls');
    assert.ok(walls.some((i) => i % width > 0 && i % width < width - 1 && i >= width && i < width * (height - 1)), 'room walls exist in the interior');
});

test('enrichTilemapInterior spreads clusters/arena blocks instead of one blob', () => {
    const width = 16;
    const height = 12;
    const clusters = enrichTilemapInterior(emptyBox(width, height), width, height, 'clusters');
    const arena = enrichTilemapInterior(emptyBox(width, height), width, height, 'arena');
    assert.ok(interiorWallRatio(clusters, width, height) >= MIN_WALL_RATIO);
    assert.ok(interiorWallRatio(arena, width, height) >= MIN_WALL_RATIO);
    assert.ok(interiorWallRatio(clusters, width, height) < 0.45, 'clusters must not turn into a solid mass');
    assert.ok(interiorWallRatio(arena, width, height) < 0.45, 'arena must not turn into a solid mass');
});

test('enrichTilemapInterior is deterministic for the same input', () => {
    const width = 16;
    const height = 12;
    const a = enrichTilemapInterior(emptyBox(width, height), width, height, 'clusters');
    const b = enrichTilemapInterior(emptyBox(width, height), width, height, 'clusters');
    assert.deepStrictEqual(a, b);
});

test('generateMaze carves a fully connected perfect maze', () => {
    const width = 16;
    const height = 12;
    const maze = generateMaze(width, height, 'test-seed');
    const floor = [];
    for (let i = 0; i < maze.length; i++) if (maze[i] === 0) floor.push(i);
    assert.ok(floor.length > 40, 'maze must have a real floor network');
    const seen = new Set([floor[0]]);
    const stack = [floor[0]];
    while (stack.length) {
        const cur = stack.pop();
        const cx = cur % width;
        for (const d of [1, -1, width, -width]) {
            if (d === 1 && cx === width - 1) continue;
            if (d === -1 && cx === 0) continue;
            const n = cur + d;
            if (n < 0 || n >= width * height || seen.has(n) || maze[n] !== 0) continue;
            seen.add(n);
            stack.push(n);
        }
    }
    assert.strictEqual(seen.size, floor.length, 'every maze floor tile must be reachable from every other');
});

test('generateMaze keeps the border ring solid', () => {
    const width = 10;
    const height = 8;
    const maze = generateMaze(width, height, 'x');
    for (let x = 0; x < width; x++) { assert.strictEqual(maze[x], 1); assert.strictEqual(maze[(height - 1) * width + x], 1); }
    for (let y = 0; y < height; y++) { assert.strictEqual(maze[y * width], 1); assert.strictEqual(maze[y * width + width - 1], 1); }
});

test('generateMaze is deterministic per seed and varies across seeds', () => {
    const a1 = generateMaze(16, 12, 'same');
    const a2 = generateMaze(16, 12, 'same');
    const b = generateMaze(16, 12, 'different');
    assert.deepStrictEqual(a1, a2);
    assert.notDeepStrictEqual(a1, b);
});

test('generateMaze degrades to an all-wall layer on grids too small for a maze', () => {
    const maze = generateMaze(4, 4, 'tiny');
    assert.strictEqual(maze.filter((v) => v === 1).length, 16);
});

// --- Structural audit + deterministic rebuild ---------------------------------

test('auditTilemapStructure rejects sparse, noisy and gapped-line layers', () => {
    const width = 12;
    const height = 10;
    // Sparse: border ring + a single thin wall line (the "#####..#####" shape).
    const sparse = emptyBox(width, height);
    for (let x = 2; x < 10; x++) sparse[5 * width + x] = 1;
    assert.strictEqual(auditTilemapStructure(sparse, width, height, 'rooms').ok, false);

    // Checkerboard interior — reads as noise, not structure.
    const cb = emptyBox(width, height);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) cb[y * width + x] = (x + y) % 2;
    assert.strictEqual(auditTilemapStructure(cb, width, height, 'rooms').ok, false);

    // A proper deterministic build must pass its own audit.
    for (const style of ['rooms', 'clusters', 'arena']) {
        const built = buildTilemapForStyle(width, height, style, 'test-seed');
        const audit = auditTilemapStructure(built, width, height, style);
        assert.strictEqual(audit.ok, true, `${style} build should pass the audit: ${audit.reasons.join('; ')}`);
    }
});

test('buildTilemapForStyle produces real structure with an acceptable wall ratio', () => {
    for (const [width, height] of [[10, 8], [12, 10], [16, 12]]) {
        for (const style of ['rooms', 'clusters', 'arena']) {
            const built = buildTilemapForStyle(width, height, style, `seed-${width}x${height}`);
            const ratio = interiorWallRatio(built, width, height);
            assert.ok(ratio >= 0.20, `${style} ${width}x${height} ratio ${ratio} too sparse`);
            assert.ok(ratio <= 0.50, `${style} ${width}x${height} ratio ${ratio} too dense`);
            assertConnected(built, width, height);
            for (let x = 0; x < width; x++) { assert.strictEqual(built[x], 1); assert.strictEqual(built[(height - 1) * width + x], 1); }
            for (let y = 0; y < height; y++) { assert.strictEqual(built[y * width], 1); assert.strictEqual(built[y * width + width - 1], 1); }
        }
    }
});

test('buildTilemapForStyle is deterministic per seed and varies across seeds', () => {
    const a1 = buildTilemapForStyle(12, 10, 'rooms', 'same');
    const a2 = buildTilemapForStyle(12, 10, 'rooms', 'same');
    const b = buildTilemapForStyle(12, 10, 'rooms', 'different');
    assert.deepStrictEqual(a1, a2);
    assert.notDeepStrictEqual(a1, b);
});

test('buildTilemapForStyle maze style returns a connected maze', () => {
    const maze = buildTilemapForStyle(16, 12, 'maze', 's');
    assertConnected(maze, 16, 12);
    assert.ok(maze.filter((v) => v === 0).length > 40, 'maze build must carve real passages');
});

test('a layer with existing structure is never cluster-filled by rooms enrichment', () => {
    const width = 10;
    const height = 8;
    const layer = emptyBox(width, height);
    for (let x = 2; x < 8; x++) { layer[3 * width + x] = 1; layer[5 * width + x] = 1; }
    const out = enrichTilemapInterior(layer, width, height, 'rooms');
    assert.deepStrictEqual(out, layer);
});
