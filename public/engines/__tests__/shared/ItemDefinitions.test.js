const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
require('../../shared/ItemDefinitions');
const ItemDefinitions = globalThis.window.ItemDefinitions.constructor;

test('constructor — initializes empty', () => {
  const defs = new ItemDefinitions();
  assert.equal(defs.loaded, false);
  assert.equal(defs.definitions.size, 0);
});

test('createDefaultItems — adds three defaults', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  assert.equal(defs.loaded, true);
  assert.equal(defs.getCount(), 3);
  assert.ok(defs.hasItem('health_potion'));
  assert.ok(defs.hasItem('mana_potion'));
  assert.ok(defs.hasItem('iron_sword'));
});

test('getItem — returns item for known id', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  const potion = defs.getItem('health_potion');
  assert.notEqual(potion, null);
  assert.equal(potion.name, 'Health Potion');
  assert.equal(potion.type, 'consumable');
  assert.equal(potion.rarity, 'common');
});

test('getItem — returns null for unknown id', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  assert.equal(defs.getItem('nonexistent'), null);
});

test('getItemsByType — filters correctly', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  const consumables = defs.getItemsByType('consumable');
  assert.equal(consumables.length, 2);
  assert.ok(consumables.every(i => i.type === 'consumable'));
  const equipment = defs.getItemsByType('equipment');
  assert.equal(equipment.length, 1);
});

test('getItemsByRarity — filters correctly', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  const common = defs.getItemsByRarity('common');
  assert.equal(common.length, 2);
  const uncommon = defs.getItemsByRarity('uncommon');
  assert.equal(uncommon.length, 1);
  const legendary = defs.getItemsByRarity('legendary');
  assert.equal(legendary.length, 0);
});

test('getAllItems — returns all definitions', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  assert.equal(defs.getAllItems().length, 3);
});

test('hasItem — returns true or false', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  assert.equal(defs.hasItem('health_potion'), true);
  assert.equal(defs.hasItem('nonexistent'), false);
});

test('getCount — returns number of definitions', () => {
  const defs = new ItemDefinitions();
  assert.equal(defs.getCount(), 0);
  defs.createDefaultItems();
  assert.equal(defs.getCount(), 3);
});

test('createInstance — creates copy with quantity and metadata', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  const inst = defs.createInstance('health_potion', 5);
  assert.notEqual(inst, null);
  assert.equal(inst.id, 'health_potion');
  assert.equal(inst.quantity, 5);
  assert.equal(inst.metadata.isNew, true);
  assert.ok(typeof inst.metadata.acquiredAt === 'number');
  assert.notEqual(inst, defs.getItem('health_potion'));
});

test('createInstance — returns null for missing item', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  assert.equal(defs.createInstance('nonexistent'), null);
});

test('createInstance — defaults quantity to 1', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  const inst = defs.createInstance('health_potion');
  assert.equal(inst.quantity, 1);
});

test('searchItems — finds by name', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  const results = defs.searchItems('potion');
  assert.equal(results.length, 2);
});

test('searchItems — finds by id', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  const results = defs.searchItems('iron_sword');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'iron_sword');
});

test('searchItems — finds by description', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  const results = defs.searchItems('blade');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'iron_sword');
});

test('searchItems — returns all for empty query', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  assert.equal(defs.searchItems('').length, 3);
  assert.equal(defs.searchItems(null).length, 3);
  assert.equal(defs.searchItems(undefined).length, 3);
});

test('searchItems — returns empty for non-matching query', () => {
  const defs = new ItemDefinitions();
  defs.createDefaultItems();
  assert.equal(defs.searchItems('zzzzz').length, 0);
});

test('normalizeItem — fills defaults for missing fields', () => {
  const defs = new ItemDefinitions();
  const result = defs.normalizeItem({ id: 'test_item', name: 'Test', type: 'material' });
  assert.equal(result.icon, 'default');
  assert.equal(result.description, '');
  assert.equal(result.rarity, 'common');
  assert.equal(result.stackable, true);
  assert.equal(result.maxStack, 99);
  assert.equal(result.sprite, 'default');
});

test('normalizeItem — equipment is not stackable by default', () => {
  const defs = new ItemDefinitions();
  const result = defs.normalizeItem({ id: 'sword', name: 'Sword', type: 'equipment' });
  assert.equal(result.stackable, false);
  // maxStack uses raw input — undefined stackable means 99
  assert.equal(result.maxStack, 99);
});

test('normalizeItem — uses desc as fallback for description', () => {
  const defs = new ItemDefinitions();
  const result = defs.normalizeItem({ id: 'a', name: 'A', type: 'consumable', desc: 'old desc' });
  assert.equal(result.description, 'old desc');
});

test('normalizeItem — icon falls back to sprite', () => {
  const defs = new ItemDefinitions();
  const result = defs.normalizeItem({ id: 'a', name: 'A', type: 'consumable', sprite: 'my_sprite' });
  assert.equal(result.icon, 'my_sprite');
});

test('normalizeItem — explicit icon overrides sprite', () => {
  const defs = new ItemDefinitions();
  const result = defs.normalizeItem({ id: 'a', name: 'A', type: 'consumable', icon: 'custom_icon', sprite: 'my_sprite' });
  assert.equal(result.icon, 'custom_icon');
});

test('normalizeItem — properties with value migration', () => {
  const defs = new ItemDefinitions();
  const result = defs.normalizeItem({ id: 'a', name: 'A', type: 'consumable', value: 50 });
  assert.deepEqual(result.properties, { value: 50 });
});

test('normalizeItem — preserves explicit properties', () => {
  const defs = new ItemDefinitions();
  const result = defs.normalizeItem({ id: 'a', name: 'A', type: 'consumable', properties: { healAmount: 25 } });
  assert.deepEqual(result.properties, { healAmount: 25 });
});

test('normalizeItem — explicit stackable and maxStack', () => {
  const defs = new ItemDefinitions();
  const result = defs.normalizeItem({ id: 'a', name: 'A', type: 'equipment', stackable: true, maxStack: 10 });
  assert.equal(result.stackable, true);
  assert.equal(result.maxStack, 10);
});

test('load — fetches items and merges with defaults', async () => {
  const items = [
    { id: 'custom_sword', name: 'Custom Sword', type: 'equipment', rarity: 'rare' }
  ];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => items
  });
  try {
    const defs = new ItemDefinitions();
    await defs.load();
    assert.equal(defs.loaded, true);
    assert.ok(defs.hasItem('health_potion'));
    assert.ok(defs.hasItem('custom_sword'));
    const cs = defs.getItem('custom_sword');
    assert.equal(cs.name, 'Custom Sword');
    assert.equal(cs.rarity, 'rare');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('load — handles failed fetch and uses defaults only', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try {
    const defs = new ItemDefinitions();
    await defs.load();
    assert.equal(defs.loaded, true);
    assert.equal(defs.getCount(), 3);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('load — handles fetch error gracefully', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network error'); };
  try {
    const defs = new ItemDefinitions();
    await defs.load();
    assert.equal(defs.loaded, true);
    assert.equal(defs.getCount(), 3);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('load — overrides default when IDs match', async () => {
  const items = [
    { id: 'health_potion', name: 'Super Potion', type: 'consumable', rarity: 'rare', properties: { healAmount: 200 } }
  ];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => items
  });
  try {
    const defs = new ItemDefinitions();
    await defs.load();
    const hp = defs.getItem('health_potion');
    assert.equal(hp.name, 'Super Potion');
    assert.equal(hp.rarity, 'rare');
    assert.equal(hp.properties.healAmount, 200);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('load — accepts items as object values', async () => {
  const items = { item1: { id: 'from_obj', name: 'From Object', type: 'consumable' } };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => items
  });
  try {
    const defs = new ItemDefinitions();
    await defs.load();
    assert.ok(defs.hasItem('from_obj'));
  } finally {
    globalThis.fetch = origFetch;
  }
});
