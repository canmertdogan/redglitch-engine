const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
require('../../rpg-topdown/saveSystem');
const SaveSystem = globalThis.window.SaveSystem;

function makeGameState(overrides) {
  return {
    level: 'level1',
    campaignNode: 'start',
    flags: { flag_a: true },
    player: { x: 100, y: 200, hp: 50, maxHp: 100, mana: 30, stamina: 20, direction: 'right' },
    inventory: ['potion'],
    activeSkills: ['fireball'],
    ...overrides
  };
}

test('save — returns true on success', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.match(url, /\/api\/save\/testuser\/1$/);
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers['Content-Type'], 'application/json');
    const body = JSON.parse(opts.body);
    assert.equal(body.level, 'level1');
    return { ok: true };
  };
  try {
    const sys = new SaveSystem();
    const result = await sys.save('testuser', 1, makeGameState());
    assert.equal(result, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('save — returns false on server error', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try {
    const sys = new SaveSystem();
    const result = await sys.save('testuser', 1, makeGameState());
    assert.equal(result, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('save — returns false on network error', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network'); };
  try {
    const sys = new SaveSystem();
    const result = await sys.save('testuser', 1, makeGameState());
    assert.equal(result, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('save — constructs correct payload', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.level, 'level1');
    assert.equal(body.campaignNode, 'start');
    assert.deepEqual(body.flags, { flag_a: true });
    assert.equal(body.player.x, 100);
    assert.equal(body.player.y, 200);
    assert.equal(body.player.hp, 50);
    assert.equal(body.player.maxHp, 100);
    assert.equal(body.player.mana, 30);
    assert.equal(body.player.stamina, 20);
    assert.equal(body.player.direction, 'right');
    assert.deepEqual(body.inventory, ['potion']);
    assert.deepEqual(body.activeSkills, ['fireball']);
    assert.ok(typeof body.timestamp === 'number');
    return { ok: true };
  };
  try {
    const sys = new SaveSystem();
    await sys.save('testuser', 1, makeGameState());
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('save — handles missing optional fields', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.deepEqual(body.flags, {});
    assert.deepEqual(body.inventory, []);
    assert.deepEqual(body.activeSkills, []);
    return { ok: true };
  };
  try {
    const sys = new SaveSystem();
    await sys.save('testuser', 1, {
      level: 'a',
      campaignNode: 'b',
      player: { x: 0, y: 0, hp: 10, maxHp: 10, mana: 0, stamina: 0, direction: 'up' }
    });
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('load — returns parsed data on success', async () => {
  const payload = { level: 'save1', player: { x: 50 } };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/save/user/2');
    return { ok: true, json: async () => payload };
  };
  try {
    const sys = new SaveSystem();
    const result = await sys.load('user', 2);
    assert.deepEqual(result, payload);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('load — returns null on 404', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try {
    const sys = new SaveSystem();
    const result = await sys.load('user', 2);
    assert.equal(result, null);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('load — returns null on network error', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('fail'); };
  try {
    const sys = new SaveSystem();
    const result = await sys.load('user', 2);
    assert.equal(result, null);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('hasSave — returns true when save exists', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  try {
    const sys = new SaveSystem();
    const result = await sys.hasSave('user', 1);
    assert.equal(result, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('hasSave — returns false when save does not exist', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try {
    const sys = new SaveSystem();
    const result = await sys.hasSave('user', 1);
    assert.equal(result, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});
