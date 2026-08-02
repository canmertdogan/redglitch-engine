const fs = require('fs');
const path = require('path');
const { askForJson } = require('../llmClient');
const { fillGridPlaceholders } = require('../../prompts/template');
const { renderWalkableMap, snapEntities } = require('../mapUtils');
const config = require('../../config');

const SYSTEM_TEMPLATE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'entities.system.txt'),
    'utf8'
);

// x/y bounds and array length (1-6) used to be grammar-guaranteed by the
// local Cortex's GBNF constraint; cloud providers don't support that, so
// this validates the shape explicitly and rejects (triggering a
// correction-note retry via askForJson) anything out of bounds. Walkability
// is deliberately NOT rejected here — on a sparse platformer map the model
// often can't hit a walkable cell on the first try and retries would just
// burn budget; the deterministic snapEntities pass below is the guarantee
// that every final placement sits on legal terrain.
function validateEntities(obj, width, height, allowedTypes = []) {
    if (!obj || !Array.isArray(obj.entities)) {
        throw new Error('entities must be an array');
    }
    if (obj.entities.length < 1 || obj.entities.length > 6) {
        throw new Error('entities must contain between 1 and 6 items');
    }
    obj.entities.forEach((e, i) => {
        if (!e || typeof e.type !== 'string' || !e.type.trim()) {
            throw new Error(`entities[${i}].type must be a non-empty string`);
        }
        if (allowedTypes.length > 0 && !allowedTypes.includes(e.type)) {
            throw new Error(`entities[${i}].type "${e.type}" not in designed entity types: ${allowedTypes.join(', ')}`);
        }
        if (typeof e.x !== 'number' || e.x < 0 || e.x > width - 1) {
            throw new Error(`entities[${i}].x must be between 0 and ${width - 1}`);
        }
        if (typeof e.y !== 'number' || e.y < 0 || e.y > height - 1) {
            throw new Error(`entities[${i}].y must be between 0 and ${height - 1}`);
        }
    });
    return obj;
}

async function runEntitiesPhase(concept, options = {}) {
    const width = options.width ?? config.WORLD_WIDTH;
    const height = options.height ?? config.WORLD_HEIGHT;
    const designedEntities = options.designedEntities ?? [];
    const level = options.level || null;

    // Extract the designed entity IDs that can be placed
    const allowedTypes = designedEntities.map(e => e.id).filter(Boolean);

    let systemPrompt = fillGridPlaceholders(SYSTEM_TEMPLATE, width, height);

    // When the caller hands us the generated level (runPipeline always does;
    // the server route does too when the UI has generated one), the prompt
    // shows the actual walkable map so the model can aim at real terrain.
    // Otherwise fall back to the old blind grid behaviour.
    if (level) {
        const markers = {};
        if (concept.engineType === 'platformer-2d') {
            markers.spawn = level.spawn;
            markers.exit = level.goal;
        } else if (concept.engineType === 'iso-pixel' || concept.engineType === 'rpg-topdown') {
            markers.spawn = level.spawn;
            markers.exit = level.exit;
        }
        const map = renderWalkableMap(concept.engineType, level, markers);
        if (map) {
            systemPrompt = systemPrompt.replace('{{WALKABLE_MAP}}', map);
        }
    } else {
        systemPrompt = systemPrompt.replace('{{WALKABLE_MAP}}', '(walkable map not available — place entities anywhere in bounds, avoid the border)');
    }

    const entityList = allowedTypes.length > 0
        ? `Designed entities (use ONLY these IDs): ${allowedTypes.join(', ')}`
        : 'No pre-designed entities; invent 1-6 simple types (slime, goblin, health_potion, etc.)';
    const userPrompt = `Game concept: ${concept.title} — ${concept.pitch}\n${entityList}`;

    const generated = await askForJson({
        systemPrompt,
        userPrompt,
        maxTokens: options.maxTokens ?? 400,
        temperature: options.temperature ?? 0.5,
        maxRetries: options.maxRetries ?? config.MAX_RETRIES.entities,
        clientKeys: options.clientKeys,
        validate: (obj) => validateEntities(obj, width, height, allowedTypes),
    });

    // Deterministic safety net: relocate anything that still lands on a
    // blocked cell (e.g. the model ignored the map) to the nearest walkable
    // cell, and dedupe to one entity per tile. Guarantees the placement the
    // engines actually consume is always legal regardless of model output.
    if (level) {
        generated.entities = snapEntities(concept.engineType, level, generated.entities);
    }
    return generated;
}

module.exports = { runEntitiesPhase, validateEntities };