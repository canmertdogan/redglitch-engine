const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
globalThis.window.PlatformerConfig = {
  GRAVITY: 0.5,
  FRICTION: 0.8,
  TERMINAL_VELOCITY: 12,
  TILE_SIZE: 32,
  AIR_RESISTANCE: 0.95,
};
require('../../platformer-2d/PhysicsSystem');
const PhysicsSystem = globalThis.window.PhysicsSystem;

function makeMap(w = 10, h = 10) {
  return { width: w, height: h, collision: new Uint8Array(w * h) };
}

function makePlayer(x, y) {
  return { x, y, w: 24, h: 32, vx: 0, vy: 0, onGround: false, keys: {} };
}

test('constructor — reads config from window.PlatformerConfig', () => {
  const ps = new PhysicsSystem();
  assert.equal(ps.gravity, 0.5);
  assert.equal(ps.friction, 0.8);
  assert.equal(ps.terminalVelocity, 12);
  assert.equal(ps.tileSize, 32);
});

test('apply — does nothing for null entity', () => {
  const ps = new PhysicsSystem();
  ps.apply(null, makeMap());
});

test('apply — applies gravity', () => {
  const ps = new PhysicsSystem();
  const player = makePlayer(0, 0);
  player.onGround = false;
  ps.apply(player, makeMap());
  assert.ok(player.vy > 0); // vy increased by gravity
});

test('apply — terminal velocity cap', () => {
  const ps = new PhysicsSystem();
  ps.terminalVelocity = 12;
  const player = makePlayer(0, 0);
  player.vy = 100;
  player.onGround = false;
  ps.apply(player, makeMap());
  assert.ok(player.vy <= ps.terminalVelocity);
});

test('apply — variable jump height on key release', () => {
  const ps = new PhysicsSystem();
  const player = makePlayer(0, 0);
  player.vy = -10; // moving up
  player.keys = {}; // jump key NOT held
  ps.apply(player, makeMap());
  // vy = (-10 + 0.5 gravity) * 0.5 cut = -4.75
  assert.equal(player.vy, -4.75);
});

test('apply — friction slows horizontal movement on ground', () => {
  const ps = new PhysicsSystem();
  const player = makePlayer(0, 0);
  player.vx = 5;
  player.onGround = true;
  ps.apply(player, makeMap());
  assert.ok(Math.abs(player.vx) < 5);
});

test('apply — map bounds stop entity at left edge', () => {
  const ps = new PhysicsSystem();
  const player = makePlayer(-10, 64);
  player.vx = -5;
  ps.apply(player, makeMap());
  assert.equal(player.x >= 0, true);
  assert.equal(player.vx, 0);
});

test('apply — map bounds stop entity at right edge', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(10, 10);
  const player = makePlayer(310, 64); // 10*32 - 24 = 296 is right edge
  player.vx = 5;
  ps.apply(player, map);
  assert.equal(player.vx, 0);
});

test('checkOverlap — detects overlap', () => {
  const ps = new PhysicsSystem();
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 5, y: 5, w: 10, h: 10 };
  assert.equal(ps.checkOverlap(a, b), true);
});

test('checkOverlap — misses non-overlapping', () => {
  const ps = new PhysicsSystem();
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 20, y: 20, w: 10, h: 10 };
  assert.equal(ps.checkOverlap(a, b), false);
});

test('getTile — returns null out of bounds', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(5, 5);
  assert.equal(ps.getTile(map, -1, 0), null);
  assert.equal(ps.getTile(map, 0, -1), null);
  assert.equal(ps.getTile(map, 10, 0), null);
});

test('getTile — returns collision value', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(5, 5);
  map.collision[0] = 1;
  map.collision[3 * 5 + 2] = 3;
  assert.equal(ps.getTile(map, 0, 0), 1);
  assert.equal(ps.getTile(map, 2, 3), 3);
});

test('checkCollisions — x-axis solid collision stops movement', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(5, 5);
  map.collision[1 * 5 + 1] = 1;

  const player = makePlayer(0, 0);
  player.x = 20;
  player.y = 32;
  player.vx = 20;
  player.onGround = true;
  ps.checkCollisions(player, map, 'x');
  assert.ok(player.vx === 0);
});

test('checkCollisions — y-axis ground collision sets onGround', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(5, 5);
  const tileY = 1;
  map.collision[tileY * 5 + 1] = 1;

  const player = makePlayer(32, 10);
  player.vy = 20;
  ps.checkCollisions(player, map, 'y');
  assert.equal(player.vy, 0);
});

test('checkCollisions — one-way up platform', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(5, 5);
  map.collision[2 * 5 + 1] = 4;

  const player = makePlayer(35, 33);
  player.vy = 5;
  ps.checkCollisions(player, map, 'y');
  assert.equal(player.onGround, true);
});

test('checkCollisions — ladder tile sets onLadder', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(3, 3);
  map.collision[1 * 3 + 1] = 11;

  const player = makePlayer(32, 32);
  player.vy = 0;
  ps.checkCollisions(player, map, 'y');
  assert.equal(player.onLadder, true);
});

test('handlePlatforms — snaps player to platform', () => {
  const ps = new PhysicsSystem();
  const player = makePlayer(0, 36);
  player.vy = 5;
  const platforms = [{ x: 0, y: 64, w: 64, h: 8 }];
  ps.handlePlatforms(player, platforms);
  assert.equal(player.onGround, true);
  assert.equal(player.vy, 0);
  assert.equal(player.y, 64 - player.h);
});

test('resolveAABB — x-axis right collision', () => {
  const ps = new PhysicsSystem();
  const player = makePlayer(40, 32);
  player.vx = 10;
  ps.resolveAABB(player, 1, 1, 32, 'x');
  assert.ok(player.x <= 32);
  assert.equal(player.vx, 0);
});

test('resolveAABB — y-axis landing', () => {
  const ps = new PhysicsSystem();
  const player = makePlayer(32, 40);
  player.vy = 10;
  let landed = false;
  player.onLand = () => { landed = true; };
  ps.resolveAABB(player, 1, 1, 32, 'y');
  assert.equal(player.onGround, true);
  assert.equal(player.vy, 0);
  assert.equal(player.y, 32 - player.h);
  assert.equal(landed, true);
});

test('checkWallContact — detects left wall', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(5, 5);
  map.collision[1 * 5 + 0] = 1;
  const player = makePlayer(33, 32);
  const result = ps.checkWallContact(player, map);
  assert.equal(result, 'left');
});

test('checkWallContact — detects right wall', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(5, 5);
  map.collision[1 * 5 + 3] = 1;
  const player = makePlayer(70, 32);
  const result = ps.checkWallContact(player, map);
  assert.equal(result, 'right');
});

test('checkWallContact — returns null in open space', () => {
  const ps = new PhysicsSystem();
  const map = makeMap(5, 5);
  const player = makePlayer(64, 32);
  assert.equal(ps.checkWallContact(player, map), null);
});
