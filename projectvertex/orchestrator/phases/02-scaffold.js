const crypto = require('crypto');

// Deterministic — no LLM call, no filesystem writes. Builds the same
// redglitch.json shape server/routes/projects.js's buildProjectConfig()
// would (that function isn't exported and pulls in filesystem-coupled
// code we don't want in this path, so it's replicated minimally here).
const ENGINE_TYPES_3D = new Set(['topdown-3d', 'fps-3d', 'platformer-3d', 'unified-3d']);

function sanitizeProjectName(name) {
    return (name || '').replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
}

function slugify(title) {
    return (title || 'vertex-game')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40) || 'vertex-game';
}

async function runScaffoldPhase(concept, runId = crypto.randomUUID()) {
    const name = sanitizeProjectName(`${slugify(concept.title)}-${runId.slice(0, 8)}`);
    const is3D = ENGINE_TYPES_3D.has(concept.engineType);
    const redglitchJson = {
        name,
        author: 'projectvertex-llm',
        version: '0.1.0',
        description: `A new ${concept.engineType} game project`,
        engineType: concept.engineType,
        template: 'blank',
        created: new Date().toISOString(),
        engineVersion: '7.0.1',
        poweredBy: 'Redglitch Engine (https://github.com/canmertdogan/redglitch-engine)',
        metadata: { is3D, renderQuality: 'medium', physics3D: is3D, shadowQuality: is3D },
    };
    return { name, redglitchJson };
}

module.exports = { runScaffoldPhase, slugify };
