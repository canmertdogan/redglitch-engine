const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
const AbilityDefinitions = require('../../shared/AbilityDefinitions.js');

test('getAbility — returns definition for known id', () => {
  const fb = AbilityDefinitions.getAbility('fireball');
  assert.notEqual(fb, null);
  assert.equal(fb.name, 'Fireball');
  assert.equal(fb.type, 'projectile');
  assert.equal(fb.mana, 10);
  assert.equal(fb.damage, 25);
});

test('getAbility — returns null for unknown id', () => {
  assert.equal(AbilityDefinitions.getAbility('nonexistent'), null);
});

test('getAll — returns all abilities', () => {
  const all = AbilityDefinitions.getAll();
  assert.ok(all.length >= 14);
  assert.ok(all.some(a => a.id === 'heal'));
  assert.ok(all.some(a => a.id === 'shield'));
});

test('getByType — filters correctly', () => {
  const projectiles = AbilityDefinitions.getByType('projectile');
  assert.ok(projectiles.length > 3);
  assert.ok(projectiles.every(a => a.type === 'projectile'));

  const heals = AbilityDefinitions.getByType('heal');
  assert.equal(heals.length, 3);
  assert.equal(heals[0].type, 'heal');
});

test('getByType — returns empty for non-existent type', () => {
  assert.deepEqual(AbilityDefinitions.getByType('magic'), []);
});

test('getAffordable — filters by mana', () => {
  const cheap = AbilityDefinitions.getAffordable(8);
  assert.ok(cheap.every(a => a.mana <= 8));
  assert.ok(cheap.some(a => a.id === 'poison_dart'));
  assert.equal(cheap.some(a => a.id === 'shadow_bolt'), false);
});

test('getAffordable — includes all when mana is high', () => {
  const all = AbilityDefinitions.getAffordable(999);
  assert.equal(all.length, AbilityDefinitions.getCount());
});

test('exists — returns true for known id', () => {
  assert.equal(AbilityDefinitions.exists('heal'), true);
  assert.equal(AbilityDefinitions.exists('unknown'), false);
});

test('register — adds a new ability', () => {
  const newAbility = { id: 'test_skill', name: 'Test', type: 'utility', mana: 5, cooldown: 1 };
  const result = AbilityDefinitions.register(newAbility);
  assert.equal(result, true);
  assert.notEqual(AbilityDefinitions.getAbility('test_skill'), null);
  assert.equal(AbilityDefinitions.getAbility('test_skill').name, 'Test');
});

test('register — rejects ability without id', () => {
  const result = AbilityDefinitions.register({ name: 'NoID' });
  assert.equal(result, false);
});

test('getStarterAbilities — returns default list', () => {
  const starters = AbilityDefinitions.getStarterAbilities();
  assert.deepEqual(starters, ['fireball', 'heal', null, null]);
});

test('getCount — returns positive number', () => {
  const count = AbilityDefinitions.getCount();
  assert.ok(count > 0);
});
