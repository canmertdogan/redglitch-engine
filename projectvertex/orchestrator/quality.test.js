const test = require('node:test');
const assert = require('node:assert');

const {
    jumpReachableFrom,
    ensurePlatformerReachability,
    sanitize3DPlacement,
} = require('./mapUtils');
const { analyzeLevel } = require('./quality');

// --- platformer reachability ----------------------------------------------

function makePlatformer(width, height, collisionRows, spawn, goal) {
    const collision = collisionRows.flat();
    return { width, height, collision, layers: [collision.slice()], spawn, goal };
}

test('jumpReachableFrom reaches a goal on the same ground line', () => {
    const level = makePlatformer(
        6, 5,
        [
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1, 1],
        ],
        { x: 1, y: 3 }, { x: 4, y: 3 }
    );
    const reachable = jumpReachableFrom(level, level.spawn);
    assert.ok(reachable.has(3 * 6 + 4), 'goal on the same ground should be reachable');
});

test('jumpReachableFrom cannot cross a full-height wall', () => {
    const level = makePlatformer(
        6, 5,
        [
            [0, 0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [1, 1, 1, 1, 1, 1],
        ],
        { x: 1, y: 3 }, { x: 4, y: 3 }
    );
    const reachable = jumpReachableFrom(level, level.spawn);
    assert.ok(!reachable.has(3 * 6 + 4), 'goal across a full-height wall must not be reachable');
});

test('ensurePlatformerReachability clamps an unreachable goal back into the reachable region', () => {
    const level = makePlatformer(
        6, 5,
        [
            [0, 0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [1, 1, 1, 1, 1, 1],
        ],
        { x: 1, y: 3 }, { x: 4, y: 3 }
    );
    ensurePlatformerReachability(level);
    const reachable = jumpReachableFrom(level, level.spawn);
    assert.ok(reachable.has(level.goal.y * 6 + level.goal.x), 'clamped goal must be reachable');
    assert.ok(level.goal.x < 2, 'clamped goal must be on the spawn side of the wall');
});

test('ensurePlatformerReachability leaves a reachable goal untouched', () => {
    const level = makePlatformer(
        6, 5,
        [
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1, 1],
        ],
        { x: 1, y: 3 }, { x: 4, y: 3 }
    );
    ensurePlatformerReachability(level);
    assert.deepStrictEqual(level.goal, { x: 4, y: 3 });
});

// --- 3D placement sanitation ----------------------------------------------

function make3D(geometry = [], foliage = []) {
    return {
        width: 10,
        height: 10,
        engineType: 'fps-3d',
        geometry,
        terrain: { heightMap: [], cellSize: 4, foliage },
    };
}

test('sanitize3DPlacement clears the spawn corner but keeps boundary walls', () => {
    const level = make3D([
        { type: 'box', width: 2, height: 2, depth: 2, position: [2, 1, 2] },   // center inside clearing -> dropped
        { type: 'box', width: 0.5, height: 4, depth: 4, position: [14, 2, 2] }, // boundary wall -> kept
    ]);
    const { droppedClearing } = sanitize3DPlacement(level);
    assert.strictEqual(droppedClearing.length, 1);
    assert.strictEqual(level.geometry.length, 1);
    assert.strictEqual(level.geometry[0].position[0], 14);
});

test('sanitize3DPlacement removes obstacles fully contained in a bigger one', () => {
    const level = make3D([
        { type: 'box', width: 4, height: 2, depth: 4, position: [14, 2, 2] },
        { type: 'box', width: 2, height: 2, depth: 2, position: [14, 2, 2] },
    ]);
    const { droppedContained } = sanitize3DPlacement(level);
    assert.strictEqual(droppedContained.length, 1);
    assert.strictEqual(level.geometry.length, 1);
});

test('sanitize3DPlacement prunes foliage anchored inside an obstacle', () => {
    const level = make3D(
        [{ type: 'box', width: 4, height: 2, depth: 4, position: [14, 2, 2] }],
        [
            { kind: 'tree', position: [13, 0, 1], scale: 1 }, // inside the obstacle box
            { kind: 'rock', position: [30, 0, 30], scale: 1 }, // far away
        ]
    );
    sanitize3DPlacement(level);
    assert.deepStrictEqual(level.terrain.foliage.map((f) => f.kind), ['rock']);
});

// --- quality analyzer ------------------------------------------------------

test('analyzeLevel flags a broken tilemap border', () => {
    const level = {
        width: 4, height: 3,
        layers: [[0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]], // (0,0) is floor, not wall
        spawn: { x: 1, y: 1 }, exit: { x: 2, y: 1 },
        engineType: 'rpg-topdown',
    };
    const { errors } = analyzeLevel('rpg-topdown', level, []);
    assert.ok(errors.some((e) => e.code === 'tilemap.border'));
});

test('analyzeLevel warns about an entity on a wall tile', () => {
    const level = {
        width: 4, height: 3,
        layers: [[1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]],
        spawn: { x: 1, y: 1 }, exit: { x: 2, y: 1 },
        engineType: 'rpg-topdown',
    };
    const { warnings } = analyzeLevel('rpg-topdown', level, [{ type: 'slime', x: 0, y: 0 }]);
    assert.ok(warnings.some((e) => e.code === 'entity.blocked'));
});

test('analyzeLevel reports a platformer spawn inside a solid cell', () => {
    const level = makePlatformer(
        4, 3,
        [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1]],
        { x: 0, y: 2 }, { x: 3, y: 1 }
    );
    const { errors } = analyzeLevel('platformer-2d', level, []);
    assert.ok(errors.some((e) => e.code === 'platformer.spawn'));
});

test('analyzeLevel reports an unreachable platformer goal as an error', () => {
    const level = makePlatformer(
        6, 5,
        [
            [0, 0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [1, 1, 1, 1, 1, 1],
        ],
        { x: 1, y: 3 }, { x: 4, y: 3 }
    );
    const { errors } = analyzeLevel('platformer-2d', level, []);
    assert.ok(errors.some((e) => e.code === 'platformer.goal'));
});

test('analyzeLevel warns on overlapping 3D obstacles and spawn-corner obstacles', () => {
    const level = make3D([
        { type: 'box', width: 6, height: 2, depth: 6, position: [16, 2, 16] },
        { type: 'box', width: 6, height: 2, depth: 6, position: [18, 2, 18] }, // overlaps the first
        { type: 'box', width: 2, height: 2, depth: 2, position: [2, 2, 2] },  // in spawn clearing
    ]);
    const { warnings } = analyzeLevel('fps-3d', level, []);
    assert.ok(warnings.some((e) => e.code === '3d.overlap'));
    assert.ok(warnings.some((e) => e.code === '3d.spawn'));
});

test('analyzeLevel warns when enemies were designed but none placed', () => {
    const level = {
        width: 4, height: 3,
        layers: [[1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]],
        spawn: { x: 1, y: 1 }, exit: { x: 2, y: 1 },
        engineType: 'rpg-topdown',
    };
    const entityDesign = { entities: [{ id: 'slime', category: 'enemy' }] };
    const { warnings } = analyzeLevel('rpg-topdown', level, [], entityDesign);
    assert.ok(warnings.some((e) => e.code === 'entity.no_enemies'));
});

test('analyzeLevel is clean on a well-formed tilemap level', () => {
    const level = {
        width: 4, height: 3,
        layers: [[1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]],
        collision: [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1],
        spawn: { x: 1, y: 1 }, exit: { x: 2, y: 1 },
        engineType: 'rpg-topdown',
    };
    const { errors, warnings } = analyzeLevel('rpg-topdown', level, [{ type: 'slime', x: 1, y: 1 }]);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(warnings.length, 0);
});
