const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
require('../../rpg-topdown/spatialHash');
const SpatialHash = globalThis.window.SpatialHash;

function makeEntity(x, y, w, h) {
  return { x, y, width: w || 16, height: h || 16 };
}

test('constructor — sets cellSize and initializes grid', () => {
  const sh = new SpatialHash(32);
  assert.equal(sh.cellSize, 32);
  assert.ok(sh.grid instanceof Map);
  assert.equal(sh.grid.size, 0);
});

test('getKey — returns cell coordinate string', () => {
  const sh = new SpatialHash(32);
  assert.equal(sh.getKey(0, 0), '0,0');
  assert.equal(sh.getKey(31, 31), '0,0');
  assert.equal(sh.getKey(32, 0), '1,0');
  assert.equal(sh.getKey(0, 32), '0,1');
  assert.equal(sh.getKey(-1, -1), '-1,-1');
});

test('clear — empties the grid', () => {
  const sh = new SpatialHash(32);
  sh.insert(makeEntity(0, 0));
  assert.ok(sh.grid.size > 0);
  sh.clear();
  assert.equal(sh.grid.size, 0);
});

test('insert — places entity in correct cell', () => {
  const sh = new SpatialHash(32);
  const e = makeEntity(10, 10);
  sh.insert(e);
  const key = '0,0';
  assert.ok(sh.grid.has(key));
  assert.equal(sh.grid.get(key).length, 1);
  assert.equal(sh.grid.get(key)[0], e);
});

test('insert — places entity spanning multiple cells', () => {
  const sh = new SpatialHash(32);
  const e = makeEntity(20, 20, 32, 32);
  sh.insert(e);
  assert.ok(sh.grid.has('0,0'));
  assert.ok(sh.grid.has('1,0'));
  assert.ok(sh.grid.has('0,1'));
  assert.ok(sh.grid.has('1,1'));
});

test('insert — uses entity scale', () => {
  const sh = new SpatialHash(32);
  const e = { x: 30, y: 30, width: 4, height: 4, scale: 8 };
  sh.insert(e);
  // 30 + (4*8) = 62, so spans cells 0,0 and 1,0 and 0,1 and 1,1
  assert.ok(sh.grid.has('0,0'));
  assert.ok(sh.grid.has('1,0'));
  assert.ok(sh.grid.has('0,1'));
  assert.ok(sh.grid.has('1,1'));
});

test('insert — defaults width and height to 16', () => {
  const sh = new SpatialHash(32);
  const e = { x: 10, y: 10 };
  sh.insert(e);
  assert.equal(sh.grid.get('0,0').length, 1);
});

test('retrieve — returns empty array for empty grid', () => {
  const sh = new SpatialHash(32);
  const result = sh.retrieve(makeEntity(0, 0));
  assert.deepEqual(result, []);
});

test('retrieve — returns nearby entities', () => {
  const sh = new SpatialHash(32);
  const a = makeEntity(0, 0);
  const b = makeEntity(10, 10);
  sh.insert(a);
  const result = sh.retrieve(b);
  assert.equal(result.length, 1);
  assert.equal(result[0], a);
});

test('retrieve — does not return self', () => {
  const sh = new SpatialHash(32);
  const e = makeEntity(0, 0);
  sh.insert(e);
  const result = sh.retrieve(e);
  assert.equal(result.length, 0);
});

test('retrieve — deduplicates entities spanning multiple cells', () => {
  const sh = new SpatialHash(32);
  const big = makeEntity(20, 20, 32, 32);
  const small = makeEntity(25, 25);
  sh.insert(big);
  sh.insert(small);
  const result = sh.retrieve(big);
  // small is in the overlapping cells but should only appear once
  assert.equal(result.length, 1);
});

test('retrieve — multiple consecutive queries work', () => {
  const sh = new SpatialHash(32);
  const a = makeEntity(0, 0);
  const b = makeEntity(10, 10);
  const c = makeEntity(100, 100);
  sh.insert(a);
  sh.insert(b);
  sh.insert(c);
  const r1 = sh.retrieve(makeEntity(5, 5));
  assert.equal(r1.length, 2);
  const r2 = sh.retrieve(makeEntity(105, 105));
  assert.equal(r2.length, 1);
});

test('retrieve — uses existing result array', () => {
  const sh = new SpatialHash(32);
  const a = makeEntity(0, 0);
  sh.insert(a);
  const existing = ['initial'];
  const result = sh.retrieve(makeEntity(5, 5), existing);
  assert.equal(result, existing);
  assert.equal(result.length, 2);
});
