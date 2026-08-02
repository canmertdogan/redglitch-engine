const test = require('node:test');
const assert = require('node:assert');

const {
    assembleTilemapLevel,
    assemblePlatformerLevel,
    findFloorTiles,
} = require('./03-world-level');

function concept(overrides = {}) {
    return { title: 'Test Game', engineType: 'rpg-topdown', theme: 'forest', musicMood: 'ambient', ...overrides };
}

test('assembleTilemapLevel repairs isolated floor pockets before picking spawn/exit', () => {
    // 5x5, one isolated pocket at (3,1) walled off from the rest.
    const generated = {
        layers: [[
            1, 1, 1, 1, 1,
            1, 0, 0, 0, 1,
            1, 1, 1, 1, 1,
            1, 0, 0, 0, 1,
            1, 1, 1, 1, 1,
        ]],
    };
    const level = assembleTilemapLevel(concept(), 5, 5, generated, null);
    // Connectivity repaired: every floor tile reachable from any other.
    const { repairTilemapConnectivity } = require('../mapUtils');
    const repaired = repairTilemapConnectivity(level.layers[0], 5, 5);
    assert.deepStrictEqual(repaired, level.layers[0], 'level layer must already be fully connected');
    assert.deepStrictEqual(repaired, level.collision, 'collision must mirror the repaired layer');
    // Spawn/exit sit on actual floor tiles.
    assert.strictEqual(level.layers[0][level.spawn.y * 5 + level.spawn.x], 0);
    assert.strictEqual(level.layers[0][level.exit.y * 5 + level.exit.x], 0);
});

test('assembleTilemapLevel iso-pixel gets z/shapes and keeps the exit decoration', () => {
    const generated = {
        layers: [[
            1, 1, 1, 1, 1,
            1, 0, 0, 0, 1,
            1, 0, 0, 0, 1,
            1, 1, 1, 1, 1,
        ]],
    };
    const level = assembleTilemapLevel(concept({ engineType: 'iso-pixel' }), 5, 4, generated, null);
    assert.ok(Array.isArray(level.z) && level.z.length === 1);
    assert.ok(Array.isArray(level.shapes) && level.shapes.length === 1);
    assert.strictEqual(level.z[0].length, 20);
    assert.ok(level.decorations.some((d) => d.type === 'exit'), 'iso exit decoration must survive assembly');
    assert.strictEqual(level.type, 'isometric');
});

test('assemblePlatformerLevel grounds the spawn and picks a goal on solid ground', () => {
    // Level with no ground under the requested spawn and no bottom row.
    const flat = new Array(5 * 4).fill(0);
    const generated = { layers: flat.slice(), collision: flat.slice(), spawn: { x: 1, y: 0 } };
    const level = assemblePlatformerLevel(concept({ engineType: 'platformer-2d' }), 5, 4, generated, null);
    assert.strictEqual(level.collision[(level.spawn.y + 1) * 5 + level.spawn.x], 1, 'spawn must stand on solid ground');
    assert.strictEqual(level.collision[level.spawn.y * 5 + level.spawn.x], 0, 'spawn cell itself must be passable');
    assert.strictEqual(level.collision[(level.goal.y + 1) * 5 + level.goal.x], 1, 'goal must sit on solid ground');
    assert.strictEqual(level.layers.length, 1, 'layers must be wrapped in an array');
    // Bottom row solid (no void pit).
    for (let x = 0; x < 5; x++) assert.strictEqual(level.collision[3 * 5 + x], 1);
});

test('findFloorTiles ignores the border ring', () => {
    const layer = [
        1, 1, 1, 1, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1,
    ];
    const tiles = findFloorTiles(layer, 5, 3);
    assert.deepStrictEqual(tiles, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
});
