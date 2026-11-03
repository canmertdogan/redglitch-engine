import test from 'node:test';
import assert from 'node:assert/strict';
import { getAIMode, isAIEnabled, storeAIMode, isEasyAIMode, isFullAIMode, isAIManual, AI_MODE_OFF, AI_MODE_EASY, AI_MODE_FULL } from './ai-mode.mjs';

function memoryStorage(initial = null) {
    let value = initial;
    return { getItem: () => value, setItem: (_key, next) => { value = next; } };
}

test('AI mode is undecided until the user explicitly chooses', () => {
    const storage = memoryStorage();
    assert.equal(getAIMode(storage), null);
    assert.equal(isAIEnabled(storage), false);
    assert.equal(isEasyAIMode(storage), false);
    assert.equal(isFullAIMode(storage), false);
    assert.equal(isAIManual(storage), false);
});

test('persists explicit enabled and manual choices', () => {
    const storage = memoryStorage();
    storeAIMode(true, storage);
    assert.equal(getAIMode(storage), true);
    storeAIMode(false, storage);
    assert.equal(getAIMode(storage), false);
});

test('persists easy AI mode', () => {
    const storage = memoryStorage();
    storeAIMode('easy', storage);
    assert.equal(getAIMode(storage), 'easy');
    assert.equal(isAIEnabled(storage), true);
    assert.equal(isEasyAIMode(storage), true);
    assert.equal(isFullAIMode(storage), false);
    assert.equal(isAIManual(storage), false);
});

test('isAIEnabled is true for both full and easy modes', () => {
    const s1 = memoryStorage('true');
    assert.equal(isAIEnabled(s1), true);
    assert.equal(isFullAIMode(s1), true);
    assert.equal(isEasyAIMode(s1), false);

    const s2 = memoryStorage('easy');
    assert.equal(isAIEnabled(s2), true);
    assert.equal(isFullAIMode(s2), false);
    assert.equal(isEasyAIMode(s2), true);
});

test('mode constants are exported', () => {
    assert.equal(AI_MODE_OFF, false);
    assert.equal(AI_MODE_EASY, 'easy');
    assert.equal(AI_MODE_FULL, true);
});
