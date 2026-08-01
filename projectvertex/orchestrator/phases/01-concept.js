const fs = require('fs');
const path = require('path');
const { askForJson } = require('../llmClient');
const { ALL_ENGINE_TYPES, normalizeEngineType } = require('../../schemas/engineTypes');
const config = require('../../config');

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'concept.system.txt'),
    'utf8'
);

function validateConcept(obj) {
    if (!obj.title || typeof obj.title !== 'string') {
        throw new Error('title is required and must be a string');
    }
    if (!obj.pitch || typeof obj.pitch !== 'string') {
        throw new Error('pitch is required and must be a string');
    }
    if (!ALL_ENGINE_TYPES.includes(obj.engineType)) {
        throw new Error(`engineType must be one of: ${ALL_ENGINE_TYPES.join(', ')}`);
    }
    return obj;
}

async function runConceptPhase(userRequest, options = {}) {
    const concept = await askForJson({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userRequest,
        // 300 was too tight for reasoning-capable free models (e.g.
        // openrouter's default nvidia/nemotron-3-ultra) — even at
        // reasoning.effort:'low' (see llmClient.chat) the chain-of-thought
        // reliably ate the whole budget before any JSON, failing all
        // maxRetries attempts identically rather than flaking randomly.
        maxTokens: options.maxTokens ?? 800,
        temperature: options.temperature ?? 0.6,
        maxRetries: options.maxRetries ?? config.MAX_RETRIES.concept,
        clientKeys: options.clientKeys,
        validate: validateConcept,
    });

    // LLM picks freely among all 7 engines; MVP normalizes unsupported (3D)
    // picks down to a supported 2D engine rather than rejecting the choice.
    // engineTypeChosenByLlm always records the LLM's real pick, even when
    // options.engineOverride below forces a different one — the UI shows
    // both ("the LLM would have picked X, you forced Y").
    const engineTypeChosenByLlm = concept.engineType;
    concept.engineType = normalizeEngineType(concept.engineType);
    concept.engineTypeChosenByLlm = engineTypeChosenByLlm;

    if (options.engineOverride && options.engineOverride !== 'auto') {
        concept.engineType = normalizeEngineType(options.engineOverride);
    }

    return concept;
}

module.exports = { runConceptPhase };
