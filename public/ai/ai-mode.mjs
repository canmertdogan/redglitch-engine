export const AI_MODE_KEY = 'kai_ai_enabled';

export function getAIMode(storage = globalThis.localStorage) {
    const value = storage?.getItem(AI_MODE_KEY);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
}

export function storeAIMode(enabled, storage = globalThis.localStorage) {
    storage?.setItem(AI_MODE_KEY, enabled ? 'true' : 'false');
    return enabled;
}

export function isAIEnabled(storage = globalThis.localStorage) {
    return getAIMode(storage) === true;
}

if (typeof window !== 'undefined') {
    window.KAIMode = { AI_MODE_KEY, getAIMode, storeAIMode, isAIEnabled };
}
