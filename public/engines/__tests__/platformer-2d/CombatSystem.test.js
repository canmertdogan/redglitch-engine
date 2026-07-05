const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
globalThis.window.PlatformerConfig = { TILE_SIZE: 32, COMBAT_LIFETIME: 0.15 };
globalThis.PlatformerProjectile = class {
  constructor(owner, x, y, vx, vy, config) {
    this.owner = owner;
    this.x = x; this.y = y;
    this.w = config.w || 8; this.h = config.h || 8;
    this.damage = config.damage || 10;
    this.isEnemy = config.isEnemy;
    this.isDead = false;
  }
  update() {}
  draw() {}
};

require('../../platformer-2d/CombatSystem');
const CombatSystem = globalThis.window.PlatformerCombatSystem;

function makePlayer() {
  return { x: 100, y: 200, w: 32, h: 32, facingRight: true, hp: 100, isDead: false, vx: 0, vy: 0 };
}

function makeEnemy(id) {
  return { x: 300, y: 200, w: 32, h: 32, facingRight: true, hp: 50, isDead: false, type: 'enemy', vx: 0, vy: 0 };
}

function makeGame() {
  const player = makePlayer();
  const enemies = [makeEnemy(1), makeEnemy(2)];
  return {
    player,
    entities: enemies,
    freezeFrames: 0,
    fx: {
      spawnParticles() {},
      popText() {}
    },
    renderer: { shake() {} },
    map: {}
  };
}

test('Hitbox — default lifetime from config', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  sys.spawnMeleeHitbox(game.player, 10, 0, 20, 20, 10);
  const hb = sys.hitboxes[0];
  assert.equal(hb.lifetime, 0.15);
});

test('Hitbox — getRect facing right', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  sys.spawnMeleeHitbox(game.player, 5, 3, 20, 15, 10);
  const rect = sys.hitboxes[0].getRect();
  assert.equal(rect.x, 100 + 32 + 5);
  assert.equal(rect.y, 200 + 3);
  assert.equal(rect.w, 20);
  assert.equal(rect.h, 15);
});

test('Hitbox — getRect facing left', () => {
  const game = makeGame();
  game.player.facingRight = false;
  game.player.x = 200;
  const sys = new CombatSystem(game);
  sys.spawnMeleeHitbox(game.player, 5, 3, 20, 15, 10);
  const rect = sys.hitboxes[0].getRect();
  assert.equal(rect.x, 200 - 5 - 20);
  assert.equal(rect.y, 200 + 3);
});

test('Hitbox — update decrements lifetime', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  sys.spawnMeleeHitbox(game.player, 0, 0, 10, 10, 10, 1);
  const hb = sys.hitboxes[0];
  hb.update(0.3);
  assert.equal(hb.lifetime, 0.7);
  assert.equal(hb.active, true);
});

test('Hitbox — update deactivates when expired', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  sys.spawnMeleeHitbox(game.player, 0, 0, 10, 10, 10, 0.5);
  const hb = sys.hitboxes[0];
  hb.update(0.6);
  assert.equal(hb.active, false);
});

test('checkCollision — detects overlap', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  const rect = { x: 100, y: 200, w: 32, h: 32 };
  const ent = { x: 110, y: 210, w: 16, h: 16 };
  assert.equal(sys.checkCollision(rect, ent), true);
});

test('checkCollision — misses non-overlapping', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  const rect = { x: 100, y: 200, w: 32, h: 32 };
  const ent = { x: 500, y: 200, w: 16, h: 16 };
  assert.equal(sys.checkCollision(rect, ent), false);
});

test('spawnMeleeHitbox — creates and registers hitbox', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  assert.equal(sys.hitboxes.length, 0);
  const hb = sys.spawnMeleeHitbox(game.player, 0, 0, 20, 20, 10, 0.5);
  assert.equal(sys.hitboxes.length, 1);
  assert.equal(sys.hitboxes[0], hb);
});

test('spawnProjectile — creates and registers projectile', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  assert.equal(sys.projectiles.length, 0);
  const proj = sys.spawnProjectile(game.player, 50, 60, 5, 0, { damage: 15, isEnemy: false });
  assert.equal(sys.projectiles.length, 1);
  assert.equal(sys.projectiles[0], proj);
});

test('hitEntity — applies damage to entity with hp', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  const enemy = makeEnemy(1);
  const hb = sys.spawnMeleeHitbox(game.player, 0, 0, 10, 10, 15, 1);
  sys.hitEntity(hb, enemy);
  assert.equal(enemy.hp, 35);
});

test('hitEntity — marks entity dead at 0 hp', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  const enemy = makeEnemy(1);
  enemy.hp = 10;
  sys.hitEntity(sys.spawnMeleeHitbox(game.player, 0, 0, 10, 10, 15, 1), enemy);
  assert.equal(enemy.hp, -5);
  assert.equal(enemy.isDead, true);
});

test('hitEntity — calls onHit if available', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  let called = false;
  const target = { onHit(dmg, owner) { called = true; }, hp: 50, x: 0, y: 0, w: 32, h: 32, facingRight: true };
  sys.hitEntity(sys.spawnMeleeHitbox(game.player, 0, 0, 10, 10, 10, 1), target);
  assert.equal(called, true);
});

test('hitEntity — applies knockback', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  const enemy = makeEnemy(1);
  enemy.hp = 100;
  sys.hitEntity(sys.spawnMeleeHitbox(game.player, 0, 0, 10, 10, 10, 1), enemy);
  assert.equal(enemy.vx, 6);
  assert.equal(enemy.vy, -4);
});

test('hitEntity — sets freezeFrames', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  sys.hitEntity(sys.spawnMeleeHitbox(game.player, 0, 0, 10, 10, 10, 1), makeEnemy(1));
  assert.equal(game.freezeFrames, 4);
});

test('update — filters expired hitboxes', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  sys.spawnMeleeHitbox(game.player, 0, 0, 10, 10, 10, 0.01);
  sys.update(0.1);
  assert.equal(sys.hitboxes.length, 0);
});

test('update — player hitbox collides with enemies', () => {
  const game = makeGame();
  const enemy = makeEnemy(1);
  enemy.x = 132; enemy.y = 200; // hitbox is at 100+32=132, so overlap
  game.entities = [enemy];
  const sys = new CombatSystem(game);
  sys.spawnMeleeHitbox(game.player, 0, 0, 32, 32, 15, 1);
  sys.update(0);
  assert.equal(enemy.hp, 35);
});

test('update — enemy hitbox collides with player', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  // Create an enemy owner that spawns a hitbox overlapping the player
  const enemy = game.entities[0];
  enemy.x = 100 - 32 - 5; // hitbox will be at 100-5-32=63, but player is at 100
  // Wait, for enemy with facingRight: true, getRect gives enemy.x + enemy.w + xOffset
  // enemy.x=68, enemy.w=32 -> enemy.x+enemy.w+5 = 68+32+5 = 105, player at 100, w=32 -> overlap
  // Actually let me just position them to overlap
  enemy.x = 80;
  sys.spawnMeleeHitbox(enemy, 5, 0, 30, 32, 20, 1);
  sys.update(0);
  assert.equal(game.player.hp, 80);
});

test('update — does not double-hit same entity', () => {
  const game = makeGame();
  const enemy = makeEnemy(1);
  enemy.x = 132; enemy.y = 200;
  game.entities = [enemy];
  const sys = new CombatSystem(game);
  sys.spawnMeleeHitbox(game.player, 0, 0, 32, 32, 10, 1);
  sys.update(0);
  sys.update(0.01);
  // hp should only be reduced once
  assert.equal(enemy.hp, 40);
});

test('update — projectile hits player', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  const enemy = game.entities[0];
  const proj = sys.spawnProjectile(enemy, 105, 210, 0, 0, { damage: 12, isEnemy: true, w: 16, h: 16 });
  assert.equal(sys.projectiles.length, 1);
  sys.update(0);
  assert.equal(game.player.hp, 88);
  assert.equal(proj.isDead, true);
});

test('update — projectile hits enemy', () => {
  const game = makeGame();
  const enemy = game.entities[0];
  enemy.x = 132; enemy.y = 200;
  const sys = new CombatSystem(game);
  const proj = sys.spawnProjectile(game.player, 128, 210, 0, 0, { damage: 8, isEnemy: false, w: 16, h: 16 });
  sys.update(0);
  assert.equal(enemy.hp, 42);
  assert.equal(proj.isDead, true);
});

test('spawnMeleeHitbox — returns hitbox with correct properties', () => {
  const game = makeGame();
  const sys = new CombatSystem(game);
  const hb = sys.spawnMeleeHitbox(game.player, 10, 5, 24, 16, 25, 0.3);
  assert.equal(hb.damage, 25);
  assert.equal(hb.w, 24);
  assert.equal(hb.h, 16);
  assert.equal(hb.lifetime, 0.3);
  assert.equal(hb.active, true);
});
