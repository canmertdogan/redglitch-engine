import test from 'node:test';
import assert from 'node:assert/strict';
import { getAIMode, isAIEnabled, storeAIMode } from './ai-mode.mjs';

function memoryStorage(initial = null) {
    let value = initial;
    return { getItem: () => value, setItem: (_key, next) => { value = next; } };
}

test('AI mode is undecided until the user explicitly chooses', () => {
    const storage = memoryStorage();
    assert.equal(getAIMode(storage), null);
    assert.equal(isAIEnabled(storage), false);
});

test('persists explicit enabled and manual choices', () => {
    const storage = memoryStorage();
    storeAIMode(true, storage);
    assert.equal(getAIMode(storage), true);
    storeAIMode(false, storage);
    assert.equal(getAIMode(storage), false);
});
