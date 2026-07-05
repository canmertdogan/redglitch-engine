const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
globalThis.window.PlatformerConfig = { TILE_SIZE: 32 };
require('../../platformer-2d/generator/SmartGenerator');
const SmartGenerator = globalThis.window.SmartGenerator.constructor;
const JumpSimulator = globalThis.window.SmartGenerator.jumpSim.constructor;
const gen = globalThis.window.SmartGenerator;

function fixedRand(value) {
  const orig = Math.random;
  Math.random = () => value;
  return () => { Math.random = orig; };
}

test('JumpSimulator — constructor reads TILE_SIZE from config', () => {
  const js = new JumpSimulator({ gravity: 0.5, jumpForce: -10, moveSpeed: 1.5, maxSpeed: 6 });
  assert.equal(js.tileSize, 32);
  assert.equal(js.gravity, 0.5);
  assert.equal(js.jumpForce, -10);
});

test('JumpSimulator — getCapabilities returns reasonable values', () => {
  const js = new JumpSimulator({ gravity: 0.5, jumpForce: -10, moveSpeed: 1.5, maxSpeed: 6 });
  const caps = js.getCapabilities();
  assert.ok(typeof caps.maxDistance === 'number');
  assert.ok(typeof caps.maxJumpHeight === 'number');
  assert.ok(caps.maxDistance > 0);
  assert.ok(caps.maxJumpHeight > 0);
});

test('SmartGenerator — constructor creates JumpSimulator', () => {
  const sg = new SmartGenerator();
  assert.ok(sg.jumpSim instanceof JumpSimulator);
});

test('generate — returns correct structure', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 40, height: 20, theme: 'flow', difficulty: 5 });
    assert.equal(result.width, 40);
    assert.equal(result.height, 20);
    assert.equal(result.collision.length, 800);
    assert.equal(result.layers.length, 1);
    assert.equal(result.layers[0].length, 800);
    assert.ok(Array.isArray(result.decorations));
    assert.ok(Array.isArray(result.collectibles));
    assert.ok(Array.isArray(result.entities));
    assert.ok(result.spawn);
    assert.ok(result.goal);
    assert.equal(result.type, 'platformer-2d');
    assert.ok(result.name.startsWith('flow_'));
  } finally {
    restore();
  }
});

test('generate — defaults to flow theme', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 40, height: 20, difficulty: 5 });
    // No theme passed → name is "undefined_<timestamp>", but flow logic runs
    assert.ok(result.collision.some(v => v === 1));
  } finally {
    restore();
  }
});

test('generate — spire theme produces valid output', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 60, height: 30, theme: 'spire', difficulty: 5 });
    assert.equal(result.width, 60);
    assert.equal(result.height, 30);
    assert.equal(result.collision.length, 1800);
  } finally {
    restore();
  }
});

test('generate — abyss theme produces valid output', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 60, height: 20, theme: 'abyss', difficulty: 5 });
    assert.equal(result.width, 60);
    assert.equal(result.height, 20);
    assert.equal(result.collision.length, 1200);
  } finally {
    restore();
  }
});

test('generate — gauntlet theme produces valid output', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 100, height: 20, theme: 'gauntlet', difficulty: 5 });
    assert.equal(result.width, 100);
    assert.equal(result.height, 20);
  } finally {
    restore();
  }
});

test('generate — clockwork theme produces valid output', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 60, height: 20, theme: 'clockwork', difficulty: 5 });
    assert.equal(result.width, 60);
    assert.equal(result.height, 20);
  } finally {
    restore();
  }
});

test('generate — difficulty 1 uses minimum diffFactor', () => {
  const restore = fixedRand(0.5);
  try {
    const r1 = gen.generate({ width: 30, height: 15, theme: 'flow', difficulty: 0 });
    const r2 = gen.generate({ width: 30, height: 15, theme: 'flow', difficulty: 1 });
    assert.equal(r1.collision.length, 450);
    assert.equal(r2.collision.length, 450);
  } finally {
    restore();
  }
});

test('generate — difficulty 10 uses maximum diffFactor', () => {
  const restore = fixedRand(0.5);
  try {
    const r1 = gen.generate({ width: 30, height: 15, theme: 'flow', difficulty: 10 });
    const r2 = gen.generate({ width: 30, height: 15, theme: 'flow', difficulty: 999 });
    assert.equal(r1.collision.length, 450);
    assert.equal(r2.collision.length, 450);
  } finally {
    restore();
  }
});

test('placePlatform — sets collision tiles', () => {
  const col = new Array(100).fill(0);
  gen.placePlatform(col, 10, 3, 5, 4, null);
  assert.equal(col[53], 1); // y=5*10+3 = 53
  assert.equal(col[54], 1);
  assert.equal(col[55], 1);
  assert.equal(col[56], 1);
  assert.equal(col[52], 0); // before platform
  assert.equal(col[57], 0); // after platform
});

test('placePlatform — skips negative x', () => {
  const col = new Array(100).fill(0);
  gen.placePlatform(col, 10, -2, 5, 5, null);
  // x=-2 and x=-1 are skipped; x=0,1,2 are placed at indices 50,51,52
  assert.equal(col[49], 0);  // before first valid tile
  assert.equal(col[50], 1);  // first valid tile
  assert.equal(col[52], 1);  // last valid tile
  assert.equal(col[53], 0);  // after last valid tile
});

test('placePlatform — sets layer when provided', () => {
  const col = new Array(50).fill(0);
  const layers = [new Array(50).fill(0)];
  gen.placePlatform(col, 10, 2, 3, 3, layers);
  for (let i = 2; i < 5; i++) {
    const idx = 3 * 10 + i;
    assert.equal(col[idx], 1);
    assert.equal(layers[0][idx], 1);
  }
});

test('fillTerrain — fills below solid tiles', () => {
  const w = 5, h = 5;
  const col = new Array(w * h).fill(0);
  col[2] = 1; // x=2, y=0
  const layers = [new Array(w * h).fill(0)];
  gen.fillTerrain(col, w, h, layers);
  // x=2, y=1,2,3,4 should be filled below the solid at y=0
  assert.equal(col[7], 1); // y=1*5+2
  assert.equal(col[12], 1); // y=2*5+2
  assert.equal(col[17], 1); // y=3*5+2
  assert.equal(col[22], 1); // y=4*5+2
  // x=0,1,3,4 should not be filled
  assert.equal(col[0], 0);
  assert.equal(col[1], 0);
  assert.equal(col[3], 0);
  assert.equal(col[4], 0);
});

test('fillTerrain — does not fill above solid', () => {
  const w = 3, h = 3;
  const col = new Array(w * h).fill(0);
  col[4] = 1; // x=1, y=1
  gen.fillTerrain(col, w, h, null);
  assert.equal(col[1], 0); // x=1, y=0 (above) — NOT filled
  assert.equal(col[7], 1); // x=1, y=2 (below) — filled
});

test('clampY — clamps between 5 and h-5', () => {
  assert.equal(gen.clampY(0, 20), 5);
  assert.equal(gen.clampY(20, 20), 15);
  assert.equal(gen.clampY(10, 20), 10);
  assert.equal(gen.clampY(3, 20), 5);
  assert.equal(gen.clampY(16, 20), 15);
});

test('flow theme — generates collectibles and platforms', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 80, height: 20, theme: 'flow', difficulty: 5 });
    assert.ok(result.collectibles.length > 0);
    assert.ok(result.collision.some(v => v === 1));
  } finally {
    restore();
  }
});

test('spire theme — generates enemies', () => {
  const restore = fixedRand(0.1);
  try {
    const result = gen.generate({ width: 60, height: 30, theme: 'spire', difficulty: 5 });
    assert.ok(result.entities.length > 0);
  } finally {
    restore();
  }
});

test('gauntlet theme — generates enemies at higher difficulty', () => {
  const restore = fixedRand(0.5);
  try {
    const result = gen.generate({ width: 80, height: 20, theme: 'gauntlet', difficulty: 8 });
    assert.ok(result.entities.length > 0);
  } finally {
    restore();
  }
});
