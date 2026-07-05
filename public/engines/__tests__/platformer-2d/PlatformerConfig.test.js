const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
require('../../platformer-2d/PlatformerConfig');
const cfg = globalThis.window.PlatformerConfig;

test('constants — physics values', () => {
  assert.equal(cfg.GRAVITY, 0.5);
  assert.equal(cfg.FRICTION, 0.8);
  assert.equal(cfg.MAX_WALK_SPEED, 4);
  assert.equal(cfg.MAX_RUN_SPEED, 6);
  assert.equal(cfg.JUMP_FORCE, -10);
  assert.equal(cfg.AIR_RESISTANCE, 0.95);
});

test('constants — mechanics values', () => {
  assert.equal(cfg.COYOTE_TIME, 0.15);
  assert.equal(cfg.JUMP_BUFFER, 0.1);
  assert.equal(cfg.WALL_SLIDE_SPEED, 2);
  assert.equal(cfg.WALL_JUMP_FORCE_X, 5);
  assert.equal(cfg.WALL_JUMP_FORCE_Y, -8);
  assert.equal(cfg.DASH_FORCE, 12);
  assert.equal(cfg.DASH_DURATION, 0.2);
  assert.equal(cfg.DASH_COOLDOWN, 0.5);
});

test('constants — world values', () => {
  assert.equal(cfg.TILE_SIZE, 32);
  assert.equal(cfg.CHUNK_SIZE, 16);
  assert.equal(cfg.MAX_RENDER_CHUNKS, 512);
});

test('constants — graphics values', () => {
  assert.equal(cfg.DEFAULT_BG, '#000');
  assert.equal(cfg.ACCENT_COLOR, '#ff1e27');
});

test('constants — UI values', () => {
  assert.equal(cfg.HUD_FONT, '24px VT323, monospace');
  assert.equal(cfg.HUD_COLOR, '#fff');
});
