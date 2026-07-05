const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
require('../../rpg-topdown/stateMachine');
const StateMachine = globalThis.window.StateMachine;

function makeStates() {
  return {
    idle: {
      enter(owner) { owner.log.push('enter_idle'); },
      update(owner, dt, timer) { owner.log.push(`update_idle:${dt}:${timer}`); },
      exit(owner) { owner.log.push('exit_idle'); },
    },
    walk: {
      enter(owner, params) { owner.log.push(`enter_walk:${params?.dir}`); },
      update(owner, dt) { owner.log.push(`update_walk:${dt}`); },
      exit(owner) { owner.log.push('exit_walk'); },
    },
  };
}

function makeOwner() {
  return { log: [] };
}

test('constructor — stores owner and states', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, makeStates());
  assert.equal(fsm.owner, owner);
  assert.ok(fsm.states.idle);
  assert.equal(fsm.currentState, null);
  assert.equal(fsm.currentStateName, null);
  assert.equal(fsm.timer, 0);
});

test('change — enters first state', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, makeStates());
  fsm.change('idle');
  assert.equal(fsm.currentStateName, 'idle');
  assert.equal(fsm.timer, 0);
  assert.deepEqual(owner.log, ['enter_idle']);
});

test('change — exits old state before entering new', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, makeStates());
  fsm.change('idle');
  fsm.change('walk');
  assert.equal(fsm.currentStateName, 'walk');
  assert.deepEqual(owner.log, ['enter_idle', 'exit_idle', 'enter_walk:undefined']);
});

test('change — passes params to enter', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, makeStates());
  fsm.change('walk', { dir: 'north' });
  assert.deepEqual(owner.log, ['enter_walk:north']);
});

test('change — resets timer', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, makeStates());
  fsm.change('idle');
  fsm.update(5);
  assert.equal(fsm.timer, 5);
  fsm.change('walk');
  assert.equal(fsm.timer, 0);
});

test('update — calls current state update', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, makeStates());
  fsm.change('idle');
  owner.log = [];
  fsm.update(0.016);
  assert.deepEqual(owner.log, ['update_idle:0.016:0.016']);
});

test('update — increments timer', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, makeStates());
  fsm.change('idle');
  fsm.update(1);
  fsm.update(2);
  assert.equal(fsm.timer, 3);
});

test('update — no-op when no current state', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, makeStates());
  fsm.update(0.016);
  assert.equal(fsm.timer, 0.016);
});

test('change — handles state without enter', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, {
    empty: {},
  });
  fsm.change('empty');
  assert.equal(fsm.currentStateName, 'empty');
});

test('change — handles state without exit on previous', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, {
    a: { enter(o) { o.log.push('enter_a'); } },
    b: { enter(o) { o.log.push('enter_b'); } },
  });
  fsm.change('a');
  fsm.change('b');
  assert.deepEqual(owner.log, ['enter_a', 'enter_b']);
});

test('update — handles state without update', () => {
  const owner = makeOwner();
  const fsm = new StateMachine(owner, { silent: {} });
  fsm.change('silent');
  fsm.update(0.016);
  assert.equal(fsm.timer, 0.016);
});
