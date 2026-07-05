import test from 'node:test';
import assert from 'node:assert/strict';
import ModeInterface from '../../unified-3d/ModeInterface.js';

test('constructor — sets game to null', () => {
  const m = new ModeInterface();
  assert.equal(m.game, null);
});

test('modeId — throws by default', () => {
  const m = new ModeInterface();
  assert.throws(() => m.modeId, /must be overridden/);
});

test('onInit — sets game reference', async () => {
  const m = new ModeInterface();
  const fakeGame = { name: 'test' };
  await m.onInit(fakeGame);
  assert.equal(m.game, fakeGame);
});

test('onLevelLoaded — does not throw', async () => {
  const m = new ModeInterface();
  await m.onLevelLoaded({});
});

test('onLevelUnloaded — does not throw', () => {
  const m = new ModeInterface();
  m.onLevelUnloaded();
});

test('update — does not throw', () => {
  const m = new ModeInterface();
  m.update(0.016);
});

test('fixedUpdate — does not throw', () => {
  const m = new ModeInterface();
  m.fixedUpdate(1 / 60);
});

test('getPlayerData — returns empty object', () => {
  const m = new ModeInterface();
  assert.deepEqual(m.getPlayerData(), {});
});

test('setPlayerData — does not throw', async () => {
  const m = new ModeInterface();
  await m.setPlayerData({ hp: 100 });
});

test('getLevelState — returns empty object', () => {
  const m = new ModeInterface();
  assert.deepEqual(m.getLevelState(), {});
});

test('setLevelState — does not throw', async () => {
  const m = new ModeInterface();
  await m.setLevelState({});
});

test('requestPointerLock / releasePointerLock — do not throw', () => {
  const m = new ModeInterface();
  m.requestPointerLock();
  m.releasePointerLock();
});

test('dispose — clears game reference', () => {
  const m = new ModeInterface();
  m.game = {};
  m.dispose();
  assert.equal(m.game, null);
});

test('subclass can override modeId', () => {
  class TestMode extends ModeInterface {
    get modeId() { return 'test-3d'; }
  }
  const tm = new TestMode();
  assert.equal(tm.modeId, 'test-3d');
  assert.equal(tm.game, null);
});
