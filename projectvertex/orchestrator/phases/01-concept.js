const fs = require('fs');
const path = require('path');
const { askForJson } = require('../llmClient');
const { ALL_ENGINE_TYPES, normalizeEngineType } = require('../../schemas/engineTypes');
const config = require('../../config');

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'concept.system.txt'),
    'utf8'
);

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MUSIC_MOODS = ['upbeat', 'tense', 'mysterious', 'heroic', 'chill', 'ambient'];

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
    // Thematically optional fields — tolerated if absent so a thin answer
    // doesn't burn retries; defaults are applied below.
    if (obj.difficulty !== undefined && !DIFFICULTIES.includes(obj.difficulty)) {
        throw new Error(`difficulty must be one of: ${DIFFICULTIES.join(', ')}`);
    }
    if (obj.musicMood !== undefined && !MUSIC_MOODS.includes(obj.musicMood)) {
        throw new Error(`musicMood must be one of: ${MUSIC_MOODS.join(', ')}`);
    }
    if (obj.theme !== undefined && (typeof obj.theme !== 'string' || obj.theme.length > 40)) {
        throw new Error('theme must be a string of at most 40 chars');
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
        // 800 proved just as fragile with opencode-zen's "big-pickle"
        // (deepseek variant), which writes reasoning_content before content
        // and exhausted 800 tokens on chain-of-thought alone, returning
        // finish_reason:"length" with an empty answer (reproduced directly).
        // 4000 is cheap (~30-60s, per the entity-design budget) but STILL
        // flakes: an "ancient forest with ruins" request burned all 4000 on
        // reasoning and returned nothing (observed 2026-08-02). The concept
        // is a small JSON object; the cost of headroom is one more second of
        // wait, so give it the same generous budget the world-level phase
        // uses rather than re-diagnosing token exhaustion mid-run.
        maxTokens: options.maxTokens ?? 8000,
        temperature: options.temperature ?? 0.6,
        maxRetries: options.maxRetries ?? config.MAX_RETRIES.concept,
        reasoningEffort: options.reasoningEffort ?? 'high',
        clientKeys: options.clientKeys,
        validate: validateConcept,
    });

    // Defaults for the optional fields (a free model sometimes omits them;
    // the assembly layer only needs sane values, not perfect ones).
    concept.difficulty = concept.difficulty || 'medium';
    concept.theme = concept.theme || concept.title;
    concept.musicMood = concept.musicMood || 'ambient';

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
