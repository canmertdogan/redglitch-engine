const test = require('node:test');
const assert = require('node:assert');

const { runScaffoldPhase } = require('./phases/02-scaffold');
const { assembleTilemapLevel, assemblePlatformerLevel } = require('./phases/03-world-level');
const { runCampaignBuildPhase } = require('./phases/07-campaign-build');
const { buildZipBuffer } = require('./zipBuilder');
const { analyzeLevel } = require('./quality');
const { jumpReachableFrom } = require('./mapUtils');

// Deterministic, LLM-free end-to-end run: the entire non-LLM pipeline —
// scaffold -> world-level assembly (tilemap + platformer) -> campaign build ->
// zip export — executed against hand-built "LLM outputs". This is the test
// that would catch a phase/assembly/zip regression that unit tests on the
// helpers miss, without needing a provider or API keys.

function concept(engineType, title = 'Test Game') {
    return {
        title,
        genre: 'adventure',
        pitch: 'A deterministic dry-run concept with a clear goal and light traversal.',
        theme: 'forest',
        difficulty: 'medium',
        musicMood: 'chill',
        engineType,
    };
}

function generatedTilemap(width, height) {
    // Border frame + a couple of interior rooms; repairConnectivity only
    // acts on genuinely isolated pockets, so this stays mostly as-is.
    const layer = Array(width * height).fill(0);
    for (let x = 0; x < width; x++) layer[x] = 1;
    for (let x = 0; x < width; x++) layer[(height - 1) * width + x] = 1;
    for (let y = 0; y < height; y++) layer[y * width] = 1;
    for (let y = 0; y < height; y++) layer[y * width + width - 1] = 1;
    return { layers: [layer] };
}

function generatedPlatformer(width, height) {
    const layers = Array(width * height).fill(0);
    const collision = Array(width * height).fill(0);
    const groundY = height - 2;
    for (let x = 0; x < width; x++) {
        layers[groundY * width + x] = 1;
        collision[groundY * width + x] = 1;
    }
    return {
        layers,
        spawn: { x: 2, y: groundY - 1 },
        collision,
    };
}

function mock3DLevel(width, height) {
    const heightMap = Array(width * height).fill(0);
    const obstacles = [];
    const level = {
        name: '3D level',
        width,
        height,
        type: '3d',
        tilesetPath: 'WORLD_PIXEL_ART',
        worldW: width * 4,
        worldH: height * 4,
        spawn: { x: 1, y: 1 },
        geometry: obstacles,
        terrain: { heightMap, foliage: [], water: null },
        engineType: 'fps-3d',
    };
    return level;
}

function entityDesign() {
    return {
        entities: [
            { id: 'wolf', category: 'enemy', name: 'Wolf', stats: { hp: 5 } },
            { id: 'coin', category: 'item', name: 'Coin' },
            { id: 'elder', category: 'npc', name: 'Elder', dialogue: ['Hello.'] },
        ],
    };
}

test('scaffold produces a name and redglitch.json', async () => {
    const project = await runScaffoldPhase(concept('rpg-topdown'), 'dry-run-1');
    assert.ok(project.name);
    assert.strictEqual(project.redglitchJson.engineType, 'rpg-topdown');
    assert.strictEqual(project.redglitchJson.metadata.is3D, false);
});

test('tilemap assembly yields a connected level with spawn/exit', () => {
    const width = 10;
    const height = 8;
    const level = assembleTilemapLevel(concept('rpg-topdown'), width, height, generatedTilemap(width, height), null);
    assert.strictEqual(level.width, width);
    assert.ok(level.spawn && typeof level.spawn.x === 'number');
    assert.ok(level.exit && typeof level.exit.x === 'number');
    assert.strictEqual(level.collision.length, width * height);
    const report = analyzeLevel('rpg-topdown', level, [], entityDesign());
    assert.deepStrictEqual(report.errors, []);
});

test('platformer assembly produces a completable level (reachable goal)', () => {
    const width = 10;
    const height = 8;
    const level = assemblePlatformerLevel(concept('platformer-2d'), width, height, generatedPlatformer(width, height), null);
    assert.ok(level.spawn);
    assert.ok(level.goal);
    const report = analyzeLevel('platformer-2d', level, [], entityDesign());
    assert.deepStrictEqual(report.errors, []);
});

test('campaign build + zip export works end-to-end across 2D and 3D', async () => {
    const width = 10;
    const height = 8;

    // 2D path: two tilemap levels under one rpg-topdown concept.
    const levels2D = [
        { id: 'level1', data: assembleTilemapLevel(concept('rpg-topdown'), width, height, generatedTilemap(width, height), null) },
        { id: 'level2', data: assemblePlatformerLevel(concept('platformer-2d'), width, height, generatedPlatformer(width, height), null) },
    ];
    const build2D = await runCampaignBuildPhase({
        concept: concept('rpg-topdown'),
        project: { name: 'dry-run' },
        levels: levels2D,
        entitiesByLevel: [
            { entities: [{ type: 'wolf', x: 2, y: 2 }, { type: 'coin', x: 3, y: 3 }] },
            { entities: [{ type: 'wolf', x: 3, y: 4 }, { type: 'coin', x: 2, y: 2 }] },
        ],
        entityDesign: entityDesign(),
    });

    assert.strictEqual(build2D.campaign.nodes.length, 3);
    assert.deepStrictEqual(build2D.validation.errors, []);
    assert.ok(build2D.quality.every((q) => Array.isArray(q.errors)));
    assert.ok(build2D.entityDefinitions.enemies.length >= 1);
    assert.ok(build2D.entityDefinitions.items.length >= 1);
    assert.ok(build2D.entityDefinitions.npcs.length >= 1);
    assert.ok(Array.isArray(build2D.entityDefinitions.enemies));
    assert.ok(Array.isArray(build2D.entityDefinitions.npcs));
    assert.ok(Array.isArray(build2D.entityDefinitions.items));

    // 3D path: entities must be projected onto flat cells at the sampled
    // elevation (a 0-height map stays 0 — no floating/clipped drops).
    const build3D = await runCampaignBuildPhase({
        concept: concept('fps-3d'),
        project: { name: 'dry-run-3d' },
        levels: [{ id: 'level3', data: mock3DLevel(width, height) }],
        entitiesByLevel: [{ entities: [{ type: 'wolf', x: 2, y: 2 }] }],
        entityDesign: entityDesign(),
    });
    const lvl3 = build3D.levels[0].data;
    assert.ok(Array.isArray(lvl3.entities));
    assert.strictEqual(lvl3.entities[0].position[1], 0, 'entity must sit on the terrain surface');

    // Zip must be a real, non-empty PK archive containing the campaign.
    const zipBuffer = await buildZipBuffer({
        redglitchJson: { name: 'dry-run', engineType: 'rpg-topdown' },
        levels: build2D.levels,
        campaign: build2D.campaign,
        entityDefinitions: build2D.entityDefinitions,
        musicConfig: build2D.musicConfig,
        logic: null,
    });
    assert.ok(Buffer.isBuffer(zipBuffer));
    assert.ok(zipBuffer.length > 500);
    assert.strictEqual(zipBuffer.readUInt32LE(0), 0x04034b50, 'zip must start with the PK\\x03\\x04 local header');
});

test('campaign build keeps platformer coins inside the jump-reachable region', async () => {
    const width = 12;
    const height = 9;
    // Ground strip + one unreachable floating island high above, so a coin
    // placed there would be permanently out of reach.
    const layers = Array(width * height).fill(0);
    const collision = Array(width * height).fill(0);
    const groundY = height - 2;
    for (let x = 0; x < width; x++) {
        layers[groundY * width + x] = 1;
        collision[groundY * width + x] = 1;
    }
    // Floating island at y=1 (no way up from the ground).
    for (let x = 8; x <= 10; x++) {
        layers[1 * width + x] = 1;
        collision[1 * width + x] = 1;
    }
    const level = assemblePlatformerLevel(concept('platformer-2d'), width, height, {
        layers,
        spawn: { x: 2, y: groundY - 1 },
        collision,
    }, null);

    const build = await runCampaignBuildPhase({
        concept: concept('platformer-2d'),
        project: { name: 'dry-run-coin' },
        levels: [{ id: 'level1', data: level }],
        entitiesByLevel: [{ entities: [{ type: 'coin', x: 9, y: 0 }] }],
        entityDesign: entityDesign(),
    });

    const reachable = jumpReachableFrom(level, level.spawn);
    const coin = build.levels[0].data.collectibles[0];
    assert.ok(coin, 'a coin collectible must exist');
    assert.ok(
        reachable.has(coin.y * width + coin.x),
        `coin at (${coin.x},${coin.y}) must be jump-reachable from the spawn`
    );
});

test('campaign build rejects an impossible entity design shape without crashing', async () => {
    const width = 6;
    const height = 6;
    const build = await runCampaignBuildPhase({
        concept: concept('rpg-topdown'),
        project: { name: 'dry-run-2' },
        levels: [{ id: 'level1', data: assembleTilemapLevel(concept('rpg-topdown'), width, height, generatedTilemap(width, height), null) }],
        entitiesByLevel: [{ entities: [] }],
        entityDesign: { entities: [] },
    });
    assert.strictEqual(build.entityDefinitions.enemies.length, 0);
    assert.deepStrictEqual(build.validation.errors, []);
});
