const fs = require('fs');
const path = require('path');
const { askForJson } = require('../llmClient');
const { fillGridPlaceholders } = require('../../prompts/template');
const config = require('../../config');

const SYSTEM_TEMPLATE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'entities.system.txt'),
    'utf8'
);

// x/y bounds and array length (1-6) used to be grammar-guaranteed by the
// local Cortex's GBNF constraint; cloud providers don't support that, so
// this validates the shape explicitly and rejects (triggering a
// correction-note retry via askForJson) anything out of bounds.
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

    // Extract the designed entity IDs that can be placed
    const allowedTypes = designedEntities.map(e => e.id).filter(Boolean);

    const systemPrompt = fillGridPlaceholders(SYSTEM_TEMPLATE, width, height);
    const entityList = allowedTypes.length > 0
        ? `Designed entities (use ONLY these IDs): ${allowedTypes.join(', ')}`
        : 'No pre-designed entities; invent 1-6 simple types (slime, goblin, health_potion, etc.)';
    const userPrompt = `Game concept: ${concept.title} — ${concept.pitch}\n${entityList}`;

    return askForJson({
        systemPrompt,
        userPrompt,
        maxTokens: options.maxTokens ?? 400,
        temperature: options.temperature ?? 0.5,
        maxRetries: options.maxRetries ?? config.MAX_RETRIES.entities,
        clientKeys: options.clientKeys,
        validate: (obj) => validateEntities(obj, width, height, allowedTypes),
    });
}

module.exports = { runEntitiesPhase };