const AI_MODE_KEY = 'kai_ai_enabled';

const AI_MODE_OFF = false;
const AI_MODE_EASY = 'easy';
const AI_MODE_FULL = true;

/**
 * AI mode states:
 *   null  -> undecided (user has not chosen yet; mode-choice dialog shows)
 *   false -> manual mode: all AI inference, Copilot, RAG workers disabled
 *   'easy'-> easy AI mode: RAG + simple chat only, no agent loop / tool execution / Copilot
 *   true  -> full AI mode: Kai assistant, agent loop, tools, Copilot, RAG
 */
export function getAIMode(storage = globalThis.localStorage) {
    const value = storage?.getItem(AI_MODE_KEY);
    if (value === 'true') return AI_MODE_FULL;
    if (value === 'false') return AI_MODE_OFF;
    if (value === 'easy') return AI_MODE_EASY;
    return null;
}

export function storeAIMode(mode, storage = globalThis.localStorage) {
    storage?.setItem(AI_MODE_KEY, String(mode));
    return mode;
}

export function isAIEnabled(storage = globalThis.localStorage) {
    const mode = getAIMode(storage);
    return mode === AI_MODE_FULL || mode === AI_MODE_EASY;
}

export function isEasyAIMode(storage = globalThis.localStorage) {
    return getAIMode(storage) === AI_MODE_EASY;
}

export function isFullAIMode(storage = globalThis.localStorage) {
    return getAIMode(storage) === AI_MODE_FULL;
}

export function isAIManual(storage = globalThis.localStorage) {
    return getAIMode(storage) === AI_MODE_OFF;
}

export { AI_MODE_OFF, AI_MODE_EASY, AI_MODE_FULL };

if (typeof window !== 'undefined') {
    window.KAIMode = {
        AI_MODE_KEY,
        AI_MODE_OFF,
        AI_MODE_EASY,
        AI_MODE_FULL,
        getAIMode,
        storeAIMode,
        isAIEnabled,
        isEasyAIMode,
        isFullAIMode,
        isAIManual,
    };
}
