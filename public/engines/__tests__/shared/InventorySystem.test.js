const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
require('../../shared/InventorySystem');
const Inventory = globalThis.window.InventorySystem;

function makeInv() { return new Inventory(); }

test('constructor — initializes with empty inventory', () => {
  const inv = makeInv();
  assert.deepEqual(inv.items, []);
  assert.equal(inv.maxSlots, 48);
});

test('addItem — adds a new item', () => {
  const inv = makeInv();
  const ok = inv.addItem({ id: 'potion', name: 'Potion', type: 'consumable' });
  assert.equal(ok, true);
  assert.equal(inv.items.length, 1);
  assert.equal(inv.items[0].quantity, 1);
  assert.equal(inv.items[0].metadata.isNew, true);
});

test('addItem — rejects invalid item', () => {
  const inv = makeInv();
  assert.equal(inv.addItem(null), false);
  assert.equal(inv.addItem({}), false);
});

test('addItem — stacks stackable items', () => {
  const inv = makeInv();
  inv.addItem({ id: 'potion', name: 'Potion', stackable: true }, 5);
  inv.addItem({ id: 'potion', name: 'Potion', stackable: true }, 3);
  assert.equal(inv.items.length, 1);
  assert.equal(inv.items[0].quantity, 8);
});

test('addItem — respects max stack size', () => {
  const inv = makeInv();
  inv.addItem({ id: 'potion', name: 'Potion', stackable: true, maxStack: 10 }, 8);
  inv.addItem({ id: 'potion', name: 'Potion', stackable: true, maxStack: 10 }, 5);
  assert.equal(inv.items.length, 2);
  assert.equal(inv.items[0].quantity, 10);
  assert.equal(inv.items[1].quantity, 3);
});

test('addItem — respects max slots', () => {
  const inv = makeInv();
  inv.maxSlots = 2;
  assert.equal(inv.addItem({ id: 'a' }), true);
  assert.equal(inv.addItem({ id: 'b' }), true);
  assert.equal(inv.addItem({ id: 'c' }), false);
  assert.equal(inv.items.length, 2);
});

test('hasItem — checks quantity', () => {
  const inv = makeInv();
  inv.addItem({ id: 'coin', stackable: true }, 5);
  assert.equal(inv.hasItem('coin', 3), true);
  assert.equal(inv.hasItem('coin', 6), false);
  assert.equal(inv.hasItem('sword'), false);
});

test('removeItem — removes non-stackable entirely', () => {
  const inv = makeInv();
  inv.addItem({ id: 'sword' });
  assert.equal(inv.removeItem('sword'), true);
  assert.equal(inv.items.length, 0);
});

test('removeItem — decrements stackable', () => {
  const inv = makeInv();
  inv.addItem({ id: 'potion', stackable: true }, 5);
  assert.equal(inv.removeItem('potion', 2), true);
  assert.equal(inv.items[0].quantity, 3);
});

test('removeItem — removes stackable when depleted', () => {
  const inv = makeInv();
  inv.addItem({ id: 'potion', stackable: true }, 2);
  assert.equal(inv.removeItem('potion', 2), true);
  assert.equal(inv.items.length, 0);
});

test('removeItem — returns false for missing item', () => {
  const inv = makeInv();
  assert.equal(inv.removeItem('ghost'), false);
});

test('getItem — returns item or null', () => {
  const inv = makeInv();
  inv.addItem({ id: 'ring' });
  assert.notEqual(inv.getItem('ring'), null);
  assert.equal(inv.getItem('ghost'), null);
});

test('getItems — filters by type', () => {
  const inv = makeInv();
  inv.addItem({ id: 'a', type: 'weapon' });
  inv.addItem({ id: 'b', type: 'consumable' });
  inv.addItem({ id: 'c', type: 'weapon' });
  assert.equal(inv.getItems('all').length, 3);
  assert.equal(inv.getItems('weapon').length, 2);
  assert.equal(inv.getItems('consumable').length, 1);
});

test('getTotalQuantity — sums all quantities', () => {
  const inv = makeInv();
  inv.addItem({ id: 'a', stackable: true }, 5);
  inv.addItem({ id: 'b', stackable: true }, 3);
  assert.equal(inv.getTotalQuantity(), 8);
});

test('sortInventory — sorts by type', () => {
  const inv = makeInv();
  inv.addItem({ id: 'b', type: 'weapon' });
  inv.addItem({ id: 'a', type: 'armor' });
  inv.sortInventory('type');
  assert.equal(inv.items[0].id, 'a'); // armor < weapon
});

test('sortInventory — sorts by quantity', () => {
  const inv = makeInv();
  inv.addItem({ id: 'a', stackable: true }, 3);
  inv.addItem({ id: 'b', stackable: true }, 5);
  inv.sortInventory('quantity');
  assert.equal(inv.items[0].id, 'b'); // higher qty first
});

test('useItem — returns false for non-consumable', () => {
  const inv = makeInv();
  inv.addItem({ id: 'sword', type: 'weapon' });
  assert.equal(inv.useItem('sword', () => {}), false);
});

test('useItem — uses consumable and removes one', () => {
  const inv = makeInv();
  inv.addItem({ id: 'potion', type: 'consumable', stackable: true }, 3);
  let used = false;
  assert.equal(inv.useItem('potion', (item) => { used = true; }), true);
  assert.equal(used, true);
  assert.equal(inv.items[0].quantity, 2);
});

test('dropItem — prevents dropping key items', () => {
  const inv = makeInv();
  inv.addItem({ id: 'boss_key', type: 'key' });
  assert.equal(inv.dropItem('boss_key'), false);
});

test('dropItem — drops regular items', () => {
  const inv = makeInv();
  inv.addItem({ id: 'rock', type: 'misc' });
  assert.equal(inv.dropItem('rock'), true);
  assert.equal(inv.items.length, 0);
});

test('clearInventory — empties all items', () => {
  const inv = makeInv();
  inv.addItem({ id: 'a' });
  inv.addItem({ id: 'b' });
  inv.clearInventory();
  assert.equal(inv.items.length, 0);
  assert.equal(inv.selectedSlot, null);
});

test('serialize — returns save-safe format', () => {
  const inv = makeInv();
  inv.addItem({ id: 'potion', stackable: true }, 5);
  const saved = inv.serialize();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'potion');
  assert.equal(saved[0].quantity, 5);
  assert.ok(saved[0].metadata);
});

test('assignToHotbar — rejects out-of-range slots', () => {
  const inv = makeInv();
  assert.equal(inv.assignToHotbar(-1, 'x'), false);
  assert.equal(inv.assignToHotbar(4, 'x'), false);
});

test('assignToHotbar — only accepts consumable', () => {
  const inv = makeInv();
  inv.addItem({ id: 'sword', type: 'weapon' });
  assert.equal(inv.assignToHotbar(0, 'sword'), false);
});

test('assignToHotbar — assigns consumable', () => {
  const inv = makeInv();
  inv.addItem({ id: 'potion', type: 'consumable' });
  assert.equal(inv.assignToHotbar(0, 'potion'), true);
  assert.equal(inv.hotbarSlots[0], 'potion');
});

test('getHotbarItem — returns item or null', () => {
  const inv = makeInv();
  inv.addItem({ id: 'potion', type: 'consumable' });
  inv.assignToHotbar(1, 'potion');
  assert.notEqual(inv.getHotbarItem(1), null);
  assert.equal(inv.getHotbarItem(0), null);
  assert.equal(inv.getHotbarItem(5), null);
});

test('useHotbarItem — uses and clears depleted slot', () => {
  const inv = makeInv();
  inv.addItem({ id: 'potion', type: 'consumable', stackable: true }, 1);
  inv.assignToHotbar(0, 'potion');
  let used = false;
  assert.equal(inv.useHotbarItem(0, () => { used = true; }), true);
  assert.equal(used, true);
  assert.equal(inv.getItem('potion'), null);
  assert.equal(inv.hotbarSlots[0], null);
});

test('searchItems — filters by name', () => {
  const inv = makeInv();
  inv.addItem({ id: 'health_potion', name: 'Health Potion', type: 'consumable' });
  inv.addItem({ id: 'sword', name: 'Iron Sword', type: 'weapon' });
  const results = inv.searchItems('potion');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'health_potion');
});

test('searchItems — returns all when no query', () => {
  const inv = makeInv();
  inv.addItem({ id: 'a' });
  inv.addItem({ id: 'b' });
  assert.equal(inv.searchItems('').length, 2);
});

test('clearNewFlags — marks all as not new', () => {
  const inv = makeInv();
  inv.addItem({ id: 'a' });
  inv.addItem({ id: 'b' });
  inv.clearNewFlags();
  assert.equal(inv.items.every(i => i.metadata.isNew === false), true);
});

test('getRarityColor — returns correct colors', () => {
  assert.equal(Inventory.getRarityColor('common'), '#fff');
  assert.equal(Inventory.getRarityColor('rare'), '#3498db');
  assert.equal(Inventory.getRarityColor('legendary'), '#ffd700');
  assert.equal(Inventory.getRarityColor('unknown'), '#fff');
});
