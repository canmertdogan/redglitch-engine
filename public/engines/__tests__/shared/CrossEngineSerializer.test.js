const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
require('../../shared/CrossEngineSerializer');
const CES = globalThis.window.CrossEngineSerializer;

test('serializeInventory — returns empty array for null/undefined', () => {
  assert.deepEqual(CES.serializeInventory(null), []);
  assert.deepEqual(CES.serializeInventory(undefined), []);
});

test('serializeInventory — maps items correctly', () => {
  const items = [
    { id: 'potion', name: 'Health Potion', type: 'consumable', quantity: 5 },
    { id: 'sword', name: 'Iron Sword', type: 'weapon', properties: { damage: 10 } },
  ];
  const result = CES.serializeInventory(items);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'potion');
  assert.equal(result[0].quantity, 5);
  assert.equal(result[1].properties.damage, 10);
});

test('serializeInventory — filters null items', () => {
  const result = CES.serializeInventory([null, { id: 'a' }, null]);
  assert.equal(result.length, 1);
});

test('deserializeInventory — returns empty array for null', () => {
  assert.deepEqual(CES.deserializeInventory(null), []);
});

test('deserializeInventory — roundtrip', () => {
  const items = [{ id: 'a', name: 'A', type: 'misc', quantity: 3, properties: {}, icon: 'a.png', description: 'desc' }];
  const serialized = CES.serializeInventory(items);
  const deserialized = CES.deserializeInventory(serialized);
  assert.equal(deserialized[0].id, 'a');
  assert.equal(deserialized[0].quantity, 3);
});

test('serializeEquipment — empty for null', () => {
  assert.deepEqual(CES.serializeEquipment(null), {});
});

test('serializeEquipment — maps slots', () => {
  const equip = { weapon: { id: 'sword', name: 'Sword', stats: { dmg: 5 } } };
  const result = CES.serializeEquipment(equip);
  assert.equal(result.weapon.id, 'sword');
  assert.equal(result.weapon.stats.dmg, 5);
});

test('serializeEquipment — roundtrip', () => {
  const equip = { weapon: { id: 'sword', name: 'Sword', stats: { dmg: 5 } } };
  const s = CES.serializeEquipment(equip);
  const d = CES.deserializeEquipment(s);
  assert.equal(d.weapon.id, 'sword');
});

test('serializeQuests — handles null', () => {
  assert.deepEqual(CES.serializeQuests(null), {});
});

test('serializeQuests — serializes active and completed', () => {
  const qs = {
    activeQuests: [{ id: 'q1', status: 'active', progress: { kills: 3 }, completedObjectives: [], startTime: 100 }],
    completedQuests: ['q2'],
  };
  const result = CES.serializeQuests(qs);
  assert.equal(result.q1.status, 'active');
  assert.equal(result.q1.progress.kills, 3);
  assert.equal(result.q2.status, 'completed');
});

test('serializeSkills — empty array for null', () => {
  assert.deepEqual(CES.serializeSkills(null), []);
});

test('serializeSkills — strips runtime fields', () => {
  const skills = [{ id: 'jump', name: 'Jump', level: 2, experience: 50, cooldown: 10, active: true }];
  const result = CES.serializeSkills(skills);
  assert.equal(result[0].id, 'jump');
  assert.equal(result[0].level, 2);
  assert.equal(result[0].cooldown, undefined); // not persisted
  assert.equal(result[0].active, undefined); // not persisted
});

test('deserializeSkills — adds runtime defaults', () => {
  const result = CES.deserializeSkills([{ id: 'jump', name: 'Jump', level: 2, experience: 50 }]);
  assert.equal(result[0].cooldown, 0);
  assert.equal(result[0].active, false);
});

test('serializeFlags — deep copies', () => {
  const flags = { key1: true, nested: { a: 1 } };
  const result = CES.serializeFlags(flags);
  assert.equal(result.key1, true);
  assert.equal(result.nested.a, 1);
  result.nested.a = 2;
  assert.equal(flags.nested.a, 1); // original unchanged
});

test('serializePlayerState — returns null for no engine', () => {
  assert.equal(CES.serializePlayerState(null), null);
});

test('serializePlayerState — serializes player state', () => {
  const engine = {
    player: { hp: 80, maxHp: 100, x: 10, y: 20, level: 3 },
    inventory: [{ id: 'potion', name: 'Potion', type: 'consumable', quantity: 2 }],
    questSystem: null,
    achievementSystem: null,
    flags: {},
  };
  const result = CES.serializePlayerState(engine);
  assert.equal(result.hp, 80);
  assert.equal(result.x, 10);
  assert.equal(result.level, 3);
  assert.equal(result.inventory[0].id, 'potion');
});

test('serializeEntityComponents — returns [] for null entity', () => {
  assert.deepEqual(CES.serializeEntityComponents(null, 'rpg-topdown'), []);
});

test('serializeEntityComponents — serializes 2D def', () => {
  const entity = { def: { stats: { hp: 50 }, ai: { type: 'patrol' } } };
  const result = CES.serializeEntityComponents(entity, 'rpg-topdown');
  assert.equal(result.length, 2);
  assert.equal(result[0].type, 'Stats');
  assert.equal(result[0].hp, 50);
  // ai def overrides type via spread: { type: 'AI', ...def.ai }
  assert.equal(result[1].type, 'patrol');
});

test('serializeTransform3D — default fallback', () => {
  const result = CES.serializeTransform3D(null);
  assert.deepEqual(result.position, [0, 0, 0]);
  assert.deepEqual(result.rotation, [0, 0, 0, 1]);
  assert.deepEqual(result.scale, [1, 1, 1]);
});

test('serializeTransform3D — from plain object', () => {
  const obj = { position: { x: 1, y: 2, z: 3 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 2, y: 2, z: 2 } };
  const result = CES.serializeTransform3D(obj);
  assert.deepEqual(result.position, [1, 2, 3]);
  assert.deepEqual(result.rotation, [0, 0, 0, 1]);
  assert.deepEqual(result.scale, [2, 2, 2]);
});

test('serializeLevel3D — null safety', () => {
  assert.equal(CES.serializeLevel3D(null), null);
});

test('serializeLevel3D — roundtrip', () => {
  const level = { version: '1.0', engineType: 'topdown-3d', name: 'Test', geometry: [], entities: [], lights: [] };
  const s = CES.serializeLevel3D(level);
  const d = CES.deserializeLevel3D(s);
  assert.equal(d.name, 'Test');
  assert.equal(d.engineType, 'topdown-3d');
});

test('serializeEntity3D — null safety', () => {
  assert.equal(CES.serializeEntity3D(null), null);
});

test('serializeEntity3D — captures transform and velocity', () => {
  const entity = {
    id: 'e1', type: 'player',
    position: { x: 1, y: 2, z: 3 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    velocity: { x: 0.5, y: 0, z: 0 },
  };
  const result = CES.serializeEntity3D(entity);
  assert.equal(result.id, 'e1');
  assert.deepEqual(result.transform.position, [1, 2, 3]);
  assert.deepEqual(result.velocity, [0.5, 0, 0]);
});
