const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
require('../../rpg-topdown/BrainRuntime');
const BrainRuntime = globalThis.window.BrainRuntime;

function* simpleBrain(npc, game, ui) {
  game.log.push('step1');
  yield;
  game.log.push('step2');
  yield;
}

function* promiseBrain(npc, game, ui) {
  game.log.push('before_promise');
  yield Promise.resolve();
  game.log.push('after_promise');
  // Prevent restart loop by yielding forever
  while (true) yield;
}

function* errorBrain(npc, game, ui) {
  game.log.push('before_error');
  throw new Error('brain_fail');
}

function makeNpc() {
  const game = { log: [], uiSystem: {} };
  return { game };
}

test('constructor — starts brain immediately', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, simpleBrain);
  assert.equal(brain.npc, npc);
  assert.ok(brain.isRunning);
  assert.equal(npc.game.log[0], 'step1');
});

test('step — advances through generator', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, simpleBrain);
  // first step already happened in constructor (step1)
  // manually step to step2
  brain.step();
  assert.equal(npc.game.log[1], 'step2');
});

test('step — restarts when generator completes', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, simpleBrain);
  npc.game.log = [];
  brain.step(); // advance to step2 (constructor already did step1)
  brain.step(); // done → restarts → step1
  assert.equal(npc.game.log[0], 'step2');
  assert.equal(npc.game.log[1], 'step1');
});

test('step — waits for promises', async () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, promiseBrain);
  assert.equal(npc.game.log[0], 'before_promise');
  assert.ok(brain.currentPromise);
  // wait for promise to resolve
  await brain.currentPromise;
  assert.equal(npc.game.log[1], 'after_promise');
});

test('stop — halts execution', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, simpleBrain);
  assert.ok(brain.isRunning);
  brain.stop();
  assert.equal(brain.isRunning, false);
  assert.equal(brain.generator, null);
});

test('restart — stops and starts again', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, simpleBrain);
  npc.game.log = [];
  brain.restart();
  assert.ok(brain.isRunning);
  assert.equal(npc.game.log[0], 'step1');
});

test('pause / resume — toggles execution', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, simpleBrain);
  npc.game.log = [];
  brain.pause();
  assert.equal(brain.isRunning, false);
  brain.resume();
  assert.equal(brain.isRunning, true);
});

test('update — does not throw when no currentPromise', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, simpleBrain);
  brain.update(0.016);
});

test('update — does not auto-step when promise is pending', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, promiseBrain);
  const oldLogLen = npc.game.log.length;
  brain.update(0.016);
  // should not have stepped further while promise pending
  assert.equal(npc.game.log.length, oldLogLen);
});

test('error — catches and stores error', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, errorBrain);
  assert.ok(brain.error);
  assert.equal(brain.isRunning, false);
});

test('step — stops on error', () => {
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, function*(n, g) {
    g.log.push('ok');
    throw new Error('boom');
  });
  assert.equal(npc.game.log[0], 'ok');
  assert.ok(brain.error);
  assert.equal(brain.isRunning, false);
});

test('multiple yields — advances through all steps', () => {
  function* manyYields(npc, game) {
    for (let i = 0; i < 5; i++) {
      game.log.push(i);
      yield;
    }
  }
  const npc = makeNpc();
  const brain = new BrainRuntime(npc, manyYields);
  npc.game.log = [];
  brain.step(); // 1 (constructor already did 0)
  brain.step(); // 2
  brain.step(); // 3
  brain.step(); // 4
  brain.step(); // done → restart → 0
  brain.step(); // 1 again
  assert.deepEqual(npc.game.log, [1, 2, 3, 4, 0, 1]);
});
