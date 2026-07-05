const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
globalThis.window.createPixelImage = () => null;

require('../../rpg-topdown/logicRuntime');
const LogicRuntime = globalThis.window.LogicRuntime;

function makeGame(overrides) {
  return {
    enemies: [],
    npcs: [],
    entities: [],
    player: { x: 100, y: 200, hp: 50, maxHp: 100, mana: 30, maxMana: 50, stamina: 20, maxStamina: 40 },
    inventory: [],
    logicFlags: {},
    ...overrides
  };
}

function makeRuntime(game, owner) {
  return new LogicRuntime(game, owner || { x: 300, y: 400 });
}

// ── Entity Queries ──

test('getNearbyEntities — filters by range', () => {
  const rt = makeRuntime(makeGame({
    enemies: [{ x: 310, y: 410, type: 'slime' }, { x: 500, y: 500, type: 'slime' }]
  }));
  const nearby = rt.getNearbyEntities(20);
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].x, 310);
});

test('getNearbyEntities — filters by type', () => {
  const rt = makeRuntime(makeGame({
    enemies: [{ x: 305, y: 405, type: 'slime' }, { x: 310, y: 410, type: 'bat' }]
  }));
  const nearby = rt.getNearbyEntities(50, 'slime');
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].type, 'slime');
});

test('getEntityByName — finds by name', () => {
  const rt = makeRuntime(makeGame({ npcs: [{ name: 'Gandalf', id: 'g1' }] }));
  assert.equal(rt.getEntityByName('Gandalf').id, 'g1');
  assert.equal(rt.getEntityByName('Frodo'), undefined);
});

test('getEntityById — finds by id', () => {
  const rt = makeRuntime(makeGame({ enemies: [{ id: 'e1', type: 'slime' }] }));
  assert.equal(rt.getEntityById('e1').type, 'slime');
  assert.equal(rt.getEntityById('nonexistent'), undefined);
});

test('getAllEnemies — returns enemies array', () => {
  const rt = makeRuntime(makeGame({ enemies: [{ id: 'e1' }] }));
  assert.equal(rt.getAllEnemies().length, 1);
});

test('getAllNPCs — returns npcs array', () => {
  const rt = makeRuntime(makeGame({ npcs: [{ id: 'n1' }] }));
  assert.equal(rt.getAllNPCs().length, 1);
});

test('getClosestEnemy — returns nearest enemy', () => {
  const rt = makeRuntime(makeGame({
    enemies: [{ x: 500, y: 500 }, { x: 310, y: 410 }]
  }));
  const closest = rt.getClosestEnemy();
  assert.equal(closest.x, 310);
  assert.equal(closest.y, 410);
});

test('getClosestEnemy — returns null when no enemies', () => {
  const rt = makeRuntime(makeGame());
  assert.equal(rt.getClosestEnemy(), null);
});

test('getEntitiesInRadius — filters by distance from point', () => {
  const rt = makeRuntime(makeGame({
    enemies: [{ x: 10, y: 10 }, { x: 100, y: 100 }]
  }));
  const result = rt.getEntitiesInRadius(0, 0, 15);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 10);
});

test('countEntitiesOfType — counts matching type', () => {
  const rt = makeRuntime(makeGame({
    enemies: [{ type: 'slime' }, { type: 'bat' }, { type: 'slime' }]
  }));
  assert.equal(rt.countEntitiesOfType('slime'), 2);
  assert.equal(rt.countEntitiesOfType('ghost'), 0);
});

test('entityExists — returns true or false', () => {
  const rt = makeRuntime(makeGame({ enemies: [{ id: 'e1' }] }));
  assert.equal(rt.entityExists('e1'), true);
  assert.equal(rt.entityExists('e2'), false);
});

test('getEntityProperty — returns property value', () => {
  const rt = makeRuntime(makeGame({ enemies: [{ id: 'e1', hp: 75 }] }));
  assert.equal(rt.getEntityProperty('e1', 'hp'), 75);
  assert.equal(rt.getEntityProperty('e1', 'nonexistent'), undefined);
  assert.equal(rt.getEntityProperty('nonexistent', 'hp'), undefined);
});

// ── Player & Inventory ──

test('getPlayerPosition — returns player coords', () => {
  const rt = makeRuntime(makeGame());
  assert.deepEqual(rt.getPlayerPosition(), { x: 100, y: 200 });
});

test('getPlayerPosition — returns zeros when no player', () => {
  const rt = makeRuntime(makeGame({ player: null }));
  assert.deepEqual(rt.getPlayerPosition(), { x: 0, y: 0 });
});

test('getPlayerStat — returns stat value', () => {
  const rt = makeRuntime(makeGame());
  assert.equal(rt.getPlayerStat('hp'), 50);
  assert.equal(rt.getPlayerStat('nonexistent'), 0);
});

test('setPlayerStat — sets value', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.setPlayerStat('hp', 80);
  assert.equal(game.player.hp, 80);
});

test('setPlayerStat — caps hp to maxHp', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.setPlayerStat('hp', 999);
  assert.equal(game.player.hp, 100);
});

test('setPlayerStat — caps mana to maxMana', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.setPlayerStat('mana', 999);
  assert.equal(game.player.mana, 50);
});

test('setPlayerStat — caps stamina to maxStamina', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.setPlayerStat('stamina', 999);
  assert.equal(game.player.stamina, 40);
});

test('setPlayerStat — no-ops when no player', () => {
  const game = makeGame({ player: null });
  const rt = makeRuntime(game);
  rt.setPlayerStat('hp', 80);
  assert.equal(game.player, null);
});

test('hasItem — returns true or false', () => {
  const game = makeGame({ inventory: [{ id: 'potion', count: 5 }] });
  const rt = makeRuntime(game);
  assert.equal(rt.hasItem('potion'), true);
  assert.equal(rt.hasItem('sword'), false);
});

test('hasItem — returns false when no inventory', () => {
  const rt = makeRuntime(makeGame({ inventory: null }));
  assert.equal(rt.hasItem('potion'), false);
});

test('getItemCount — returns count', () => {
  const game = makeGame({ inventory: [{ id: 'potion', count: 5 }] });
  const rt = makeRuntime(game);
  assert.equal(rt.getItemCount('potion'), 5);
  assert.equal(rt.getItemCount('sword'), 0);
});

test('addItem — creates new item entry', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.addItem('potion', 3);
  assert.equal(game.inventory.length, 1);
  assert.equal(game.inventory[0].id, 'potion');
  assert.equal(game.inventory[0].count, 3);
});

test('addItem — stacks with existing', () => {
  const game = makeGame({ inventory: [{ id: 'potion', count: 5 }] });
  const rt = makeRuntime(game);
  rt.addItem('potion', 2);
  assert.equal(game.inventory.length, 1);
  assert.equal(game.inventory[0].count, 7);
});

test('addItem — calls updateInventoryHUD if present', () => {
  let called = false;
  const game = makeGame({ updateInventoryHUD: () => { called = true; } });
  const rt = makeRuntime(game);
  rt.addItem('potion');
  assert.equal(called, true);
});

test('removeItem — decrements count', () => {
  const game = makeGame({ inventory: [{ id: 'potion', count: 5 }] });
  const rt = makeRuntime(game);
  const result = rt.removeItem('potion', 2);
  assert.equal(result, true);
  assert.equal(game.inventory[0].count, 3);
});

test('removeItem — removes entry when depleted', () => {
  const game = makeGame({ inventory: [{ id: 'potion', count: 2 }] });
  const rt = makeRuntime(game);
  rt.removeItem('potion', 2);
  assert.equal(game.inventory.length, 0);
});

test('removeItem — returns false for missing item', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  assert.equal(rt.removeItem('potion'), false);
});

test('getInventory — returns inventory array', () => {
  const game = makeGame({ inventory: [{ id: 'sword', count: 1 }] });
  const rt = makeRuntime(game);
  assert.deepEqual(rt.getInventory(), [{ id: 'sword', count: 1 }]);
});

test('getInventory — returns empty when no inventory', () => {
  const rt = makeRuntime(makeGame({ inventory: null }));
  assert.deepEqual(rt.getInventory(), []);
});

test('equipItem — assigns to slot', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.equipItem('fireball', 1);
  assert.deepEqual(game.activeSkills, [null, 'fireball', null, null]);
});

test('unequipItem — clears slot', () => {
  const game = makeGame({ activeSkills: ['a', 'b', 'c', 'd'] });
  const rt = makeRuntime(game);
  rt.unequipItem(1);
  assert.deepEqual(game.activeSkills, ['a', null, 'c', 'd']);
});

// ── Game State & Flags ──

test('getFlag — returns false for missing flag', () => {
  const rt = makeRuntime(makeGame());
  assert.equal(rt.getFlag('nonexistent'), false);
});

test('setFlag / getFlag — roundtrip', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.setFlag('gate_open', true);
  assert.equal(rt.getFlag('gate_open'), true);
});

test('incrementFlag — increments and returns', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  assert.equal(rt.incrementFlag('kills'), 1);
  assert.equal(rt.incrementFlag('kills'), 2);
});

test('checkAllFlags — returns true when all set', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.setFlag('a', true);
  rt.setFlag('b', true);
  assert.equal(rt.checkAllFlags(['a', 'b']), true);
  assert.equal(rt.checkAllFlags(['a', 'c']), false);
});

test('startQuest — creates quest entry', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.startQuest('q_find_amulet');
  assert.equal(game.activeQuests.q_find_amulet.status, 'active');
  assert.equal(game.activeQuests.q_find_amulet.progress, 0);
});

test('startQuest — calls achievementSystem if present', () => {
  let checked = false;
  const game = makeGame({ achievementSystem: { checkQuestStart(id) { checked = true; } } });
  const rt = makeRuntime(game);
  rt.startQuest('q_test');
  assert.equal(checked, true);
});

test('completeQuest — marks quest completed', () => {
  const game = makeGame({ activeQuests: { q_test: { status: 'active' } } });
  const rt = makeRuntime(game);
  rt.completeQuest('q_test');
  assert.equal(game.activeQuests.q_test.status, 'completed');
});

test('completeQuest — calls achievementSystem if present', () => {
  let checked = false;
  const game = makeGame({
    activeQuests: { q_test: { status: 'active' } },
    achievementSystem: { checkQuestComplete(id) { checked = true; } }
  });
  const rt = makeRuntime(game);
  rt.completeQuest('q_test');
  assert.equal(checked, true);
});

test('failQuest — marks quest failed', () => {
  const game = makeGame({ activeQuests: { q_test: { status: 'active' } } });
  const rt = makeRuntime(game);
  rt.failQuest('q_test');
  assert.equal(game.activeQuests.q_test.status, 'failed');
});

test('getQuestProgress — returns quest or null', () => {
  const game = makeGame({ activeQuests: { q_test: { status: 'active' } } });
  const rt = makeRuntime(game);
  assert.deepEqual(rt.getQuestProgress('q_test'), { status: 'active' });
  assert.equal(rt.getQuestProgress('nonexistent'), null);
});

test('saveGameState / loadGameState — roundtrip', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.saveGameState('boss_defeated', true);
  assert.equal(rt.loadGameState('boss_defeated'), true);
  assert.equal(rt.loadGameState('nonexistent'), undefined);
});

// ── World ──

test('getTileAt — delegates to mapSystem', () => {
  const game = makeGame({ mapSystem: { getTile(x, y) { return { id: 1 }; } } });
  const rt = makeRuntime(game);
  assert.deepEqual(rt.getTileAt(5, 10), { id: 1 });
});

test('getTileAt — returns null without mapSystem', () => {
  const rt = makeRuntime(makeGame());
  assert.equal(rt.getTileAt(5, 10), null);
});

test('setTileAt — delegates to mapSystem', () => {
  let tileSet = null;
  const game = makeGame({ mapSystem: { setTile(x, y, id) { tileSet = { x, y, id }; } } });
  const rt = makeRuntime(game);
  rt.setTileAt(3, 7, 42);
  assert.deepEqual(tileSet, { x: 3, y: 7, id: 42 });
});

test('spawnEntity — creates and adds entity', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  const entity = rt.spawnEntity('slime', 100, 200, { hp: 10 });
  assert.equal(game.entities.length, 1);
  assert.equal(game.entities[0].type, 'slime');
  assert.equal(game.entities[0].x, 100);
  assert.equal(game.entities[0].y, 200);
  assert.equal(game.entities[0].hp, 10);
  assert.ok(entity.id.startsWith('entity_'));
});

test('destroyEntity — removes from all lists', () => {
  const game = makeGame({
    enemies: [{ id: 'e1' }],
    npcs: [{ id: 'n1' }],
    entities: [{ id: 'e1' }, { id: 'e2' }]
  });
  const rt = makeRuntime(game);
  rt.destroyEntity('e1');
  assert.equal(game.enemies.length, 0);
  assert.equal(game.npcs.length, 1);
  assert.equal(game.entities.length, 1);
  assert.equal(game.entities[0].id, 'e2');
});

test('moveEntity — moves toward target', () => {
  const entity = { x: 0, y: 0 };
  const rt = makeRuntime(makeGame());
  rt.moveEntity(entity, 100, 0, 60);
  assert.ok(entity.x > 0);
  assert.equal(entity.y, 0);
});

test('moveEntity — no-ops on null entity', () => {
  const rt = makeRuntime(makeGame());
  rt.moveEntity(null, 100, 0);
});

// ── Camera & Effects ──

test('setCameraTarget — sets cameraTarget', () => {
  const game = makeGame({ camera: {} });
  const rt = makeRuntime(game);
  const target = { id: 'npc1' };
  rt.setCameraTarget(target);
  assert.equal(game.cameraTarget, target);
});

test('setCameraTarget — no-ops without camera', () => {
  const rt = makeRuntime(makeGame());
  rt.setCameraTarget({});
});

test('shakeCamera — calls fx.shake when available', () => {
  let intensity, duration;
  const game = makeGame({ fx: { shake(i, d) { intensity = i; duration = d; } } });
  const rt = makeRuntime(game);
  rt.shakeCamera(15, 0.3);
  assert.equal(intensity, 15);
  assert.equal(duration, 300);
});

test('shakeCamera — falls back to screenShake', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.shakeCamera(8, 0.5);
  assert.equal(game.screenShake, 8);
});

test('flashScreen — delegates to fx.flash', () => {
  let color, duration;
  const game = makeGame({ fx: { flash(c, d) { color = c; duration = d; } } });
  const rt = makeRuntime(game);
  rt.flashScreen('#ff0000', 0.5);
  assert.equal(color, '#ff0000');
  assert.equal(duration, 500);
});

test('fadeScreen — delegates to fx.fade', () => {
  let color, duration;
  const game = makeGame({ fx: { fade(c, d) { color = c; duration = d; } } });
  const rt = makeRuntime(game);
  rt.fadeScreen('#000000', 1.0);
  assert.equal(color, '#000000');
  assert.equal(duration, 1000);
});

test('zoomCamera — sets camera zoom target', () => {
  const game = makeGame({ camera: {} });
  const rt = makeRuntime(game);
  rt.zoomCamera(2.0, 0.5);
  assert.equal(game.camera.targetZoom, 2.0);
  assert.equal(game.camera.zoomDuration, 0.5);
});

// ── Audio ──

test('playSound — delegates to audio.play', () => {
  let args;
  const game = makeGame({ audio: { play(name, opts) { args = { name, opts }; } } });
  const rt = makeRuntime(game);
  rt.playSound('explosion', 0.8, true);
  assert.equal(args.name, 'explosion');
  assert.equal(args.opts.volume, 0.8);
  assert.equal(args.opts.loop, true);
});

test('stopSound — delegates to audio.stop', () => {
  let stopped;
  const game = makeGame({ audio: { stop(name) { stopped = name; } } });
  const rt = makeRuntime(game);
  rt.stopSound('bgm');
  assert.equal(stopped, 'bgm');
});

test('fadeMusic — delegates to audio.fadeMusic', () => {
  let vol, dur;
  const game = makeGame({ audio: { fadeMusic(v, d) { vol = v; dur = d; } } });
  const rt = makeRuntime(game);
  rt.fadeMusic(0, 3);
  assert.equal(vol, 0);
  assert.equal(dur, 3);
});

// ── Dialogue & UI ──

test('showDialogue — delegates to dialogueSystem.startCustom', () => {
  let text, speaker;
  const game = makeGame({ dialogueSystem: { startCustom(t, s) { text = t; speaker = s; } } });
  const rt = makeRuntime(game);
  rt.showDialogue('Hello!', 'NPC');
  assert.equal(text, 'Hello!');
  assert.equal(speaker, 'NPC');
});

test('showDialogue — shows choice dialogue when choices provided', () => {
  let text, speaker, choices;
  const game = makeGame({ dialogueSystem: { startWithChoices(t, s, c) { text = t; speaker = s; choices = c; } } });
  const rt = makeRuntime(game);
  rt.showDialogue('Pick one', 'NPC', ['Yes', 'No']);
  assert.equal(text, 'Pick one');
  assert.deepEqual(choices, ['Yes', 'No']);
});

test('showNotification — delegates to fx.showNotification', () => {
  let text, duration;
  const game = makeGame({ fx: { showNotification(t, d) { text = t; duration = d; } } });
  const rt = makeRuntime(game);
  rt.showNotification('Quest complete!', 2.0);
  assert.equal(text, 'Quest complete!');
  assert.equal(duration, 2000);
});

// ── Time ──

test('getGameTime — returns game time', () => {
  const rt = makeRuntime(makeGame({ gameTime: 1234 }));
  assert.equal(rt.getGameTime(), 1234);
});

test('getGameTime — returns 0 when not set', () => {
  const rt = makeRuntime(makeGame());
  assert.equal(rt.getGameTime(), 0);
});

// ── Combat ──

test('shootProjectile — calls game.spawnFireball', () => {
  let args;
  const game = makeGame({ spawnFireball(x, y, dx, dy, sprite) { args = { x, y, dx, dy }; return {}; } });
  const rt = makeRuntime(game);
  rt.shootProjectile(100, 200, 1, 0, 'fire_1');
  assert.equal(args.x, 100);
  assert.equal(args.y, 200);
  assert.equal(args.dx, 1);
  assert.equal(args.dy, 0);
});

test('spawnFX — delegates to game.spawnCustomFX', () => {
  let name, x, y;
  const game = makeGame({ spawnCustomFX(n, tx, ty) { name = n; x = tx; y = ty; } });
  const rt = makeRuntime(game);
  rt.spawnFX('explosion', 50, 60);
  assert.equal(name, 'explosion');
  assert.equal(x, 50);
  assert.equal(y, 60);
});

test('spawnFX — uses owner position when no coords given', () => {
  let name, x, y;
  const game = makeGame({ spawnCustomFX(n, tx, ty) { name = n; x = tx; y = ty; } });
  const rt = makeRuntime(game, { x: 500, y: 600 });
  rt.spawnFX('spark');
  assert.equal(x, 500);
  assert.equal(y, 600);
});

test('spawnFX — falls back to fx.spawnEffect', () => {
  let name, x, y;
  const game = makeGame({ fx: { spawnEffect(n, tx, ty) { name = n; x = tx; y = ty; } } });
  const rt = makeRuntime(game);
  rt.spawnFX('poof', 10, 20);
  assert.equal(name, 'poof');
  assert.equal(x, 10);
  assert.equal(y, 20);
});

// ── Player Movement ──

test('playerMove — moves player LEFT', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  const x0 = game.player.x;
  rt.playerMove('LEFT', 60);
  assert.ok(game.player.x < x0);
});

test('playerMove — moves player RIGHT', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  const x0 = game.player.x;
  rt.playerMove('RIGHT', 60);
  assert.ok(game.player.x > x0);
});

test('playerMove — moves player UP', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  const y0 = game.player.y;
  rt.playerMove('UP', 60);
  assert.ok(game.player.y < y0);
});

test('playerMove — moves player DOWN', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  const y0 = game.player.y;
  rt.playerMove('DOWN', 60);
  assert.ok(game.player.y > y0);
});

test('playerMove — no-ops without player', () => {
  const game = makeGame({ player: null });
  const rt = makeRuntime(game);
  rt.playerMove('RIGHT', 60);
});

// ── Flags via game.logicFlags ──

test('flags — stored in game.logicFlags', () => {
  const game = makeGame();
  const rt = makeRuntime(game);
  rt.setFlag('door_unlocked', true);
  assert.equal(game.logicFlags.door_unlocked, true);
});

test('flags — reads existing game.logicFlags', () => {
  const game = makeGame({ logicFlags: { already_set: true } });
  const rt = makeRuntime(game);
  assert.equal(rt.getFlag('already_set'), true);
});

// ── waitForChoice (async) ──

test('waitForChoice — returns null without dialogueSystem', async () => {
  const rt = makeRuntime(makeGame());
  const result = await rt.waitForChoice();
  assert.equal(result, null);
});

test('waitForChoice — resolves when onChoice is called', async () => {
  let onChoiceCb;
  const game = makeGame({ dialogueSystem: { set onChoice(cb) { onChoiceCb = cb; } } });
  Object.defineProperty(game.dialogueSystem, 'onChoice', {
    set(cb) { onChoiceCb = cb; },
    configurable: true
  });
  const rt = makeRuntime(game);
  const promise = rt.waitForChoice();
  onChoiceCb('Yes');
  const result = await promise;
  assert.equal(result, 'Yes');
});
