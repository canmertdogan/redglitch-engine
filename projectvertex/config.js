const path = require('path');

module.exports = {
    // No local process, no local HTTP client: every LLM call is a plain
    // stateless request to a cloud provider (see orchestrator/llmClient.js),
    // which is what makes this safe to run on Vercel (no persistent
    // process, no filesystem writes outside RUNS_DIR for local/CLI use).
    MAX_RETRIES: {
        concept: 3,
        worldLevel: 3,
        // entity-design's HARD RULES (1-3 enemies, 0-2 NPCs, 1-2 items) are
        // validated after the fact, not grammar-constrained — a free model
        // regularly needs the askForJson correction-note retry to actually
        // fix a count violation. 2 wasn't enough room for that round-trip;
        // confirmed directly (FPS-arena concept: exhausted both attempts on
        // "Max 2 items" without ever getting a corrected response). Bumped
        // to 5: opencode-zen's "big-pickle" (stealth model) also shows
        // genuine intermittent flakiness independent of prompt/schema
        // issues — empty responses / no-JSON that succeed seconds later on
        // an unmodified retry (confirmed directly: identical request failed
        // then succeeded twice in a row). Calls here are cheap (~20s-1min
        // each, not worldLevel's multi-minute ones), so more retry headroom
        // is a reasonable way to ride out that flakiness.
        entities: 5,
        logic: 2,
    },

    // Runs are written under runs/ by default; PV_RUNS_DIR overrides that so
    // the audit script (scripts/validate-run.js) or a CI job can point at a
    // different directory without touching code.
    RUNS_DIR: process.env.PV_RUNS_DIR || path.join(__dirname, 'runs'),
    REPO_ROOT: path.join(__dirname, '..'),

    // MVP is restricted to these engine types; anything else gets normalized down.
    // The 3D types run on the same Unified3D runtime (public/engines/unified-3d)
    // under three different modes — see schemas/engineTypes.js for how a bare
    // 'unified-3d' pick gets resolved to a concrete mode.
    SUPPORTED_ENGINE_TYPES: ['rpg-topdown', 'platformer-2d', 'iso-pixel', 'fps-3d', 'topdown-3d', 'platformer-3d'],
    DEFAULT_ENGINE_TYPE: 'rpg-topdown',

    // Deterministic 3D arena builder (see orchestrator/phases/03-world-level.js)
    // — world-grid units are converted to world-space meters via this factor.
    WORLD_UNIT_3D: 4,

    // Fixed level grid size for the MVP — kept modest so a single LLM call
    // (concept, world-level, or entities) stays within a reasonable token
    // budget regardless of provider.
    WORLD_WIDTH: 10,
    WORLD_HEIGHT: 8,

    // Default number of levels for multi-level games (phase 01.5 level-plan
    // generates this many per-level briefs; each becomes a campaign node and
    // a dunyalar/levelN.json in the exported project). Clamped to 1-3.
    LEVEL_COUNT: 2,
};
