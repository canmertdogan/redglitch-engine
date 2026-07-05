import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSave3D, isSave2D, serialize3DPlayerState, deserialize3DPlayerState,
  serializeSavePayload3D, deserializeSavePayload3D, migrateSavePayload,
  SAVE_3D_SCHEMA,
} from '../../shared/Save3D.js';

test('isSave3D — detects schema guard', () => {
  assert.equal(isSave3D({ _schema: SAVE_3D_SCHEMA }), true);
  assert.equal(isSave3D({ _schema: 'other' }), false);
  assert.equal(isSave3D({}), false);
  assert.equal(isSave3D(null), false);
});

test('isSave2D — true for data without schema', () => {
  assert.equal(isSave2D({ hp: 100 }), true);
  assert.equal(isSave2D(null), false);
});

test('serialize3DPlayerState — fallback defaults', () => {
  const result = serialize3DPlayerState(null, {});
  assert.deepEqual(result.position, [0, 0, 0]);
  assert.deepEqual(result.rotation, [0, 0, 0, 1]);
  assert.equal(result.hp, 100);
  assert.equal(result.lives, 3);
});

test('serialize3DPlayerState — captures vitals', () => {
  const obj = { position: { x: 10, y: 5, z: 0 }, quaternion: { x: 0, y: 1, z: 0, w: 0 } };
  const result = serialize3DPlayerState(obj, { hp: 75, maxHp: 100, coins: 50 });
  assert.deepEqual(result.position, [10, 5, 0]);
  assert.deepEqual(result.rotation, [0, 1, 0, 0]);
  assert.equal(result.hp, 75);
  assert.equal(result.coins, 50);
});

test('serialize3DPlayerState — reads velocity from body', () => {
  const obj = { position: { x: 0, y: 0, z: 0 }, body: { velocity: { x: 2, y: -5, z: 0 } } };
  const result = serialize3DPlayerState(obj, {});
  assert.deepEqual(result.velocity, [2, -5, 0]);
});

test('deserialize3DPlayerState — null safety', () => {
  assert.equal(deserialize3DPlayerState(null), null);
});

test('deserialize3DPlayerState — roundtrip', () => {
  const vitals = { hp: 80, maxHp: 100, mana: 30, coins: 99, score: 5000, lives: 2 };
  const obj = { position: { x: 1, y: 2, z: 3 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, velocity: { x: 0, y: 0, z: 0 } };
  const s = serialize3DPlayerState(obj, vitals);
  const d = deserialize3DPlayerState(s);
  assert.deepEqual(d.position, [1, 2, 3]);
  assert.equal(d.hp, 80);
  assert.equal(d.coins, 99);
  assert.equal(d.score, 5000);
});

test('serializeSavePayload3D — wraps with schema', () => {
  const result = serializeSavePayload3D('fps-3d', { player: { hp: 100 }, level: 'test' });
  assert.equal(result._schema, SAVE_3D_SCHEMA);
  assert.equal(result.engineType, 'fps-3d');
  assert.equal(result.player.hp, 100);
  assert.ok(result.savedAt);
});

test('deserializeSavePayload3D — rejects null', () => {
  assert.equal(deserializeSavePayload3D(null), null);
});

test('deserializeSavePayload3D — rejects 2D saves', () => {
  assert.equal(deserializeSavePayload3D({ hp: 100 }), null);
});

test('deserializeSavePayload3D — rejects wrong schema', () => {
  assert.equal(deserializeSavePayload3D({ _schema: 'v2' }), null);
});

test('deserializeSavePayload3D — passes with correct schema', () => {
  const payload = serializeSavePayload3D('fps-3d', { player: { hp: 100 } });
  const result = deserializeSavePayload3D(payload);
  assert.notEqual(result, null);
  assert.equal(result.player.hp, 100);
});

test('deserializeSavePayload3D — rejects engine type mismatch', () => {
  const payload = serializeSavePayload3D('topdown-3d', {});
  assert.equal(deserializeSavePayload3D(payload, 'fps-3d'), null);
});

test('deserializeSavePayload3D — accepts matching engine type', () => {
  const payload = serializeSavePayload3D('platformer-3d', { score: 500 });
  const result = deserializeSavePayload3D(payload, 'platformer-3d');
  assert.notEqual(result, null);
  assert.equal(result.score, 500);
});

test('migrateSavePayload — normalizes missing fields', () => {
  const result = migrateSavePayload({});
  assert.deepEqual(result.collectedItems, []);
  assert.equal(result.lastCheckpoint, null);
  assert.deepEqual(result.levelState, {});
});
