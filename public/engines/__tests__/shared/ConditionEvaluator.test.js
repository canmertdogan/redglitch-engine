const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.window) globalThis.window = {};
const ConditionEvaluator = require('../../shared/ConditionEvaluator');

test('evaluate — returns true for null condition', () => {
  assert.equal(ConditionEvaluator.evaluate(null, {}), true);
});

test('evaluate — variable equality', () => {
  const ctx = { variables: { score: 100 } };
  assert.equal(ConditionEvaluator.evaluate({ type: 'variable', key: 'score', operator: '==', value: 100 }, ctx), true);
  assert.equal(ConditionEvaluator.evaluate({ type: 'variable', key: 'score', operator: '==', value: 99 }, ctx), false);
});

test('evaluate — variable inequality', () => {
  const ctx = { variables: { score: 100 } };
  assert.equal(ConditionEvaluator.evaluate({ key: 'score', operator: '!=', value: 99 }, ctx), true);
  assert.equal(ConditionEvaluator.evaluate({ key: 'score', operator: '!=', value: 100 }, ctx), false);
});

test('evaluate — comparison operators', () => {
  const ctx = { variables: { hp: 50 } };
  assert.equal(ConditionEvaluator.evaluate({ key: 'hp', operator: '>', value: 40 }, ctx), true);
  assert.equal(ConditionEvaluator.evaluate({ key: 'hp', operator: '>', value: 60 }, ctx), false);
  assert.equal(ConditionEvaluator.evaluate({ key: 'hp', operator: '>=', value: 50 }, ctx), true);
  assert.equal(ConditionEvaluator.evaluate({ key: 'hp', operator: '<', value: 60 }, ctx), true);
  assert.equal(ConditionEvaluator.evaluate({ key: 'hp', operator: '<=', value: 50 }, ctx), true);
  assert.equal(ConditionEvaluator.evaluate({ key: 'hp', operator: '<=', value: 40 }, ctx), false);
});

test('evaluate — flag check', () => {
  const ctx = { flags: { has_key: true, door_open: false } };
  assert.equal(ConditionEvaluator.evaluate({ type: 'flag', key: 'has_key', value: true }, ctx), true);
  assert.equal(ConditionEvaluator.evaluate({ type: 'flag', key: 'door_open', value: true }, ctx), false);
});

test('evaluate — item check via context.hasItem', () => {
  let called = false;
  const ctx = { hasItem: (id, count) => { called = true; return id === 'potion' && count === 1; } };
  assert.equal(ConditionEvaluator.evaluate({ type: 'item', key: 'potion', count: 1 }, ctx), true);
  assert.equal(called, true);
});

test('evaluate — AND group', () => {
  const ctx = { variables: { a: 1, b: 2 } };
  const condition = {
    type: 'AND',
    conditions: [
      { key: 'a', operator: '==', value: 1 },
      { key: 'b', operator: '==', value: 2 },
    ],
  };
  assert.equal(ConditionEvaluator.evaluate(condition, ctx), true);
});

test('evaluate — AND group fails when one condition fails', () => {
  const ctx = { variables: { a: 1, b: 99 } };
  const condition = {
    type: 'AND',
    conditions: [
      { key: 'a', operator: '==', value: 1 },
      { key: 'b', operator: '==', value: 2 },
    ],
  };
  assert.equal(ConditionEvaluator.evaluate(condition, ctx), false);
});

test('evaluate — OR group', () => {
  const ctx = { variables: { a: 1, b: 99 } };
  const condition = {
    type: 'OR',
    conditions: [
      { key: 'a', operator: '==', value: 1 },
      { key: 'b', operator: '==', value: 2 },
    ],
  };
  assert.equal(ConditionEvaluator.evaluate(condition, ctx), true);
});

test('evaluate — returns false for unknown condition type', () => {
  assert.equal(ConditionEvaluator.evaluate({ type: 'unknown', key: 'x' }, {}), false);
});

test('evaluate — defaults to variable type when type is missing', () => {
  const ctx = { variables: { x: 5 } };
  assert.equal(ConditionEvaluator.evaluate({ key: 'x', operator: '==', value: 5 }, ctx), true);
});
