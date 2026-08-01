// Source of truth for the full engine type set is
// server/routes/projects.js (VALID_ENGINE_TYPES) — kept in sync manually
// since that constant isn't exported. Update both if engines are added.
const ALL_ENGINE_TYPES = [
    'rpg-topdown', 'platformer-2d', 'iso-pixel',
    'topdown-3d', 'fps-3d', 'platformer-3d', 'unified-3d',
];

const config = require('../config');

function normalizeEngineType(engineType) {
    // 'unified-3d' isn't itself a playable mode — it's the wrapper runtime
    // behind fps-3d/topdown-3d/platformer-3d. Resolve a bare pick to a
    // concrete mode rather than falling back to a 2D engine.
    if (engineType === 'unified-3d') return 'fps-3d';
    if (config.SUPPORTED_ENGINE_TYPES.includes(engineType)) return engineType;
    // Anything else (typos, garbage) falls back deterministically rather
    // than rejecting the LLM's choice.
    return config.DEFAULT_ENGINE_TYPE;
}

module.exports = { ALL_ENGINE_TYPES, normalizeEngineType };
