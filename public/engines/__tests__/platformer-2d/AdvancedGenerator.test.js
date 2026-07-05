const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
require('../../platformer-2d/generator/AdvancedGenerator');
const AdvancedGenerator = globalThis.window.AdvancedGenerator.constructor;
const gen = globalThis.window.AdvancedGenerator;

function fixedRand(value) {
  const orig = Math.random;
  Math.random = () => value;
  return () => { Math.random = orig; };
}

test('constructor — defines three biomes', () => {
  const ag = new AdvancedGenerator();
  assert.ok(ag.biomes.forest);
  assert.ok(ag.biomes.cave);
  assert.ok(ag.biomes.castle);
  assert.equal(Object.keys(ag.biomes).length, 3);
});

test('constructor — defines blueprint segments', () => {
  const ag = new AdvancedGenerator();
  assert.ok(ag.blueprints.pillar_jump);
  assert.ok(ag.blueprints.over_under);
  assert.ok(ag.blueprints.hazard_leap);
});

test('drawRect — fills rectangle with value', () => {
  const map = { width: 10, height: 10, collision: new Array(100).fill(0) };
  gen.drawRect(map, 2, 3, 4, 2, 1);
  for (let x = 2; x < 6; x++) {
    for (let y = 3; y < 5; y++) {
      assert.equal(map.collision[y * 10 + x], 1);
    }
  }
  assert.equal(map.collision[1], 0); // untouched
  assert.equal(map.collision[25], 0); // outside rect
});

test('drawRect — respects map bounds', () => {
  const map = { width: 5, height: 5, collision: new Array(25).fill(0) };
  gen.drawRect(map, -2, 3, 10, 5, 1);
  assert.equal(map.collision[0], 0); // before bounds
  assert.equal(map.collision.length, 25);
});

test('spawnSegment — places blueprint chars', () => {
  const bp = [
    '# #',
    '###'
  ];
  const map = { width: 5, height: 5, collision: new Array(25).fill(0) };
  gen.spawnSegment(map, 1, 1, bp);
  // Row 0: # at x=1, space at x=2, # at x=3
  assert.equal(map.collision[1 * 5 + 1], 1);
  assert.equal(map.collision[1 * 5 + 2], 0);
  assert.equal(map.collision[1 * 5 + 3], 1);
  // Row 1: # at x=1,2,3
  assert.equal(map.collision[2 * 5 + 1], 1);
  assert.equal(map.collision[2 * 5 + 2], 1);
  assert.equal(map.collision[2 * 5 + 3], 1);
});

test('spawnSegment — maps S to hazard (3) and L to ladder (11)', () => {
  const bp = ['SL#'];
  const map = { width: 5, height: 3, collision: new Array(15).fill(0) };
  gen.spawnSegment(map, 1, 1, bp);
  assert.equal(map.collision[1 * 5 + 1], 3);
  assert.equal(map.collision[1 * 5 + 2], 11);
  assert.equal(map.collision[1 * 5 + 3], 1);
});

test('spawnSegment — respects map bounds', () => {
  const bp = ['###', '###'];
  const map = { width: 4, height: 4, collision: new Array(16).fill(0) };
  gen.spawnSegment(map, -1, 0, bp);
  assert.equal(map.collision.length, 16);
});

test('generate — returns correct structure', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 60, height: 20, biome: 'forest', difficulty: 5 });
    assert.equal(result.width, 60);
    assert.equal(result.height, 20);
    assert.equal(result.collision.length, 1200);
    assert.equal(result.layers.length, 3);
    assert.equal(result.layers[0].name, 'background');
    assert.equal(result.layers[1].name, 'main');
    assert.equal(result.layers[2].name, 'foreground');
    assert.ok(result.spawn);
    assert.equal(result.background, '#2ecc71');
    assert.equal(result.type, 'platformer-2d');
    assert.ok(result.name.startsWith('forest_'));
  } finally {
    restore();
  }
});

test('generate — defaults to forest biome', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 50, height: 15, difficulty: 3 });
    assert.equal(result.background, '#2ecc71');
  } finally {
    restore();
  }
});

test('generate — cave biome', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 50, height: 15, biome: 'cave', difficulty: 5 });
    assert.equal(result.background, '#2c3e50');
    assert.ok(result.collision.some(v => v === 1));
  } finally {
    restore();
  }
});

test('generate — castle biome', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 50, height: 15, biome: 'castle', difficulty: 5 });
    assert.equal(result.background, '#34495e');
    assert.ok(result.collision.some(v => v === 1));
  } finally {
    restore();
  }
});

test('generate — produces exit location', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 60, height: 20, biome: 'forest', difficulty: 5 });
    assert.ok(result.exit);
    assert.ok(typeof result.exit.x === 'number');
    assert.ok(typeof result.exit.y === 'number');
  } finally {
    restore();
  }
});

test('generate — collision map has terrain blocks', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 60, height: 20, biome: 'forest', difficulty: 5 });
    assert.ok(result.collision.some(v => v === 1));
  } finally {
    restore();
  }
});

test('generate — main layer synced to collision', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 60, height: 20, biome: 'forest', difficulty: 5 });
    const mainLayer = result.layers.find(l => l.name === 'main').data;
    assert.equal(mainLayer.length, result.collision.length);
    let matched = false;
    for (let i = 0; i < mainLayer.length; i++) {
      if (result.collision[i] === 1 && mainLayer[i] === 1) matched = true;
    }
    assert.ok(matched);
  } finally {
    restore();
  }
});

test('generate — decorations array populated', () => {
  const result = gen.generate({ width: 60, height: 20, biome: 'forest', difficulty: 5 });
  assert.ok(result.decorations.length > 0);
});

test('generate — entities array populated', () => {
  const result = gen.generate({ width: 60, height: 20, biome: 'forest', difficulty: 10 });
  assert.ok(result.entities.length > 0);
});

test('generate — collectibles array populated', () => {
  const result = gen.generate({ width: 60, height: 20, biome: 'forest', difficulty: 5 });
  assert.ok(result.collectibles.length > 0);
});

test('generate — difficulty affects entity count', () => {
  const restore = fixedRand(0.3);
  try {
    const low = gen.generate({ width: 60, height: 20, biome: 'forest', difficulty: 2 });
    const high = gen.generate({ width: 60, height: 20, biome: 'forest', difficulty: 10 });
    assert.ok(high.entities.length >= low.entities.length);
  } finally {
    restore();
  }
});

test('generate — autoTiling enabled', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 50, height: 15, biome: 'forest', difficulty: 5 });
    assert.equal(result.autoTiling, true);
  } finally {
    restore();
  }
});

test('generate — all layers same size as collision', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 50, height: 15, biome: 'cave', difficulty: 5 });
    for (const layer of result.layers) {
      assert.equal(layer.data.length, 750);
    }
  } finally {
    restore();
  }
});
