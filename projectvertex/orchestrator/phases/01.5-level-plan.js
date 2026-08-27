const fs = require('fs');
const path = require('path');
const { askForJson } = require('../llmClient');
const config = require('../../config');

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'level-plan.system.txt'),
    'utf8'
);

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const LEVEL_ID_RE = /^level[1-3]$/;

function validateLevelPlan(obj, count) {
    if (!obj || !Array.isArray(obj.levels)) {
        throw new Error('levels must be an array');
    }
    if (obj.levels.length !== count) {
        throw new Error(`levels must contain exactly ${count} items`);
    }
    const seen = new Set();
    obj.levels.forEach((l, i) => {
        if (!l || typeof l !== 'object') throw new Error(`levels[${i}] must be an object`);
        if (!LEVEL_ID_RE.test(l.levelId || '')) throw new Error(`levels[${i}].levelId must match level1|level2|level3`);
        if (seen.has(l.levelId)) throw new Error(`levels[${i}].levelId "${l.levelId}" is not unique`);
        seen.add(l.levelId);
        if (!l.title || typeof l.title !== 'string' || l.title.length > 30) {
            throw new Error(`levels[${i}].title required, max 30 chars`);
        }
        if (!l.theme || typeof l.theme !== 'string' || l.theme.length > 40) {
            throw new Error(`levels[${i}].theme required, max 40 chars`);
        }
        if (!DIFFICULTIES.includes(l.difficulty)) {
            throw new Error(`levels[${i}].difficulty must be one of: ${DIFFICULTIES.join(', ')}`);
        }
        if (!l.focus || typeof l.focus !== 'string' || l.focus.length > 90) {
            throw new Error(`levels[${i}].focus required, max 90 chars`);
        }
    });
    return obj;
}

// Plans the per-level briefs for a multi-level game. Returns
// { levels: [{ levelId, title, theme, difficulty, focus }] }. Each brief is
// threaded into the world-level phase (03) as options.levelBrief so every map
// gets its own title/theme/difficulty instead of N identical copies.
async function runLevelPlanPhase(concept, options = {}) {
    const count = Math.min(3, Math.max(1, Math.round(options.count ?? config.LEVEL_COUNT)));
    const systemPrompt = SYSTEM_PROMPT
        .replace(/\{LEVEL_COUNT\}/g, String(count))
        .replace(/\{ENGINE_TYPE\}/g, concept.engineType);

    const userPrompt = [
        'Oyun konsepti:',
        `Başlık: ${concept.title}`,
        `Tür: ${concept.genre || 'belirsiz'}`,
        `Motor: ${concept.engineType}`,
        `Genel zorluk: ${concept.difficulty || 'medium'}`,
        `Tema: ${concept.theme || '-'}`,
        `Özet: ${concept.pitch}`,
        '',
        `Bu oyun için ${count} level planla.`,
    ].join('\n');

    return askForJson({
        systemPrompt,
        userPrompt,
        maxTokens: options.maxTokens ?? 800,
        temperature: options.temperature ?? 0.6,
        maxRetries: options.maxRetries ?? config.MAX_RETRIES.concept,
        clientKeys: options.clientKeys,
        validate: (obj) => validateLevelPlan(obj, count),
    });
}

module.exports = { runLevelPlanPhase, LEVEL_ID_RE };
