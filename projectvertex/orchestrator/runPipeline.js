const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('../config');
const { buildZipBuffer } = require('./zipBuilder');

const { runConceptPhase } = require('./phases/01-concept');
const { runLevelPlanPhase } = require('./phases/01.5-level-plan');
const { runScaffoldPhase } = require('./phases/02-scaffold');
const { runWorldLevelPhase } = require('./phases/03-world-level');
const { runEntityDesignPhase } = require('./phases/04-entity-design');
const { runEntitiesPhase } = require('./phases/05-entities');
const { runLogicPhase } = require('./phases/06-logic');
const { runCampaignBuildPhase } = require('./phases/07-campaign-build');

// Runs all phases in sequence against whichever cloud LLM provider is
// configured (see llmClient.js) and writes the resulting project bundle as
// a .zip under runs/<runId>/output.zip. No local process, no persistent
// state — every phase is a stateless call, which is what the server's
// /api/phases/* routes reuse individually for the web UI's live progress.
//
// Multi-level: `levels` (default config.LEVEL_COUNT, clamped 1-3) > 1 adds a
// level-plan phase (01.5) whose per-level briefs are threaded into the
// world-level and entities phases; each level becomes a campaign node and a
// dunyalar/levelN.json in the exported zip.
async function runPipeline(userRequest, {
    runId: runIdOverride,
    width,
    height,
    engineOverride = 'auto',
    phases = { entities: true, logic: true },
    levels: levelCount,
    concept: conceptOptions = {},
    worldLevel: worldLevelOptions = {},
    entityDesign: entityDesignOptions = {},
    entities: entitiesOptions = {},
    clientKeys = {},
} = {}) {
    const runId = runIdOverride ?? crypto.randomUUID();
    const runDir = path.join(config.RUNS_DIR, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const count = Math.min(3, Math.max(1, Math.round(levelCount ?? config.LEVEL_COUNT)));

    const log = (msg) => console.log(`[projectvertex:${runId.slice(0, 8)}] ${msg}`);

    // Two levels sharing a theme read as copy-paste pacing — the plan prompt
    // asks for distinct themes, but models occasionally repeat them. This is a
    // warning (not a retry): the levels are still playable, just less varied.
    function warnOnDuplicateLevelThemes(levels) {
        const seen = new Map();
        for (const l of levels || []) {
            const key = String(l.theme || '').trim().toLowerCase();
            if (!key) continue;
            if (seen.has(key)) {
                console.warn(`[projectvertex:${runId.slice(0, 8)}] warning: level "${l.levelId}" reuses theme "${l.theme}" from "${seen.get(key)}" — consider re-running for more variety`);
            } else {
                seen.set(key, l.levelId);
            }
        }
    }

    function writeJson(filename, data) {
        fs.writeFileSync(path.join(runDir, filename), JSON.stringify(data, null, 2), 'utf8');
    }

    log('Phase 1: concept + engine selection');
    const concept = await runConceptPhase(userRequest, { ...conceptOptions, engineOverride, clientKeys });
    writeJson('phase1-concept.json', concept);
    log(`  -> "${concept.title}" (${concept.engineType}, LLM originally picked ${concept.engineTypeChosenByLlm})`);

    log('Phase 2: project scaffold');
    const project = await runScaffoldPhase(concept, runId);
    writeJson('phase2-project.json', project);
    log(`  -> project "${project.name}"`);

    let levelPlan = { levels: [] };
    if (count > 1) {
        log(`Phase 1.5: level plan (${count} levels)`);
        levelPlan = await runLevelPlanPhase(concept, { count, clientKeys });
        writeJson('phase1.5-level-plan.json', levelPlan);
        log(`  -> ${levelPlan.levels.map((l) => `${l.levelId}:${l.title}`).join(', ')}`);
        warnOnDuplicateLevelThemes(levelPlan.levels);
    }

    // Phase 3: one world-level pass per planned level. Each gets its own
    // brief (title/theme/difficulty/focus) so the maps are distinct.
    const levels = [];
    for (let i = 0; i < count; i++) {
        const brief = levelPlan.levels[i] || { levelId: `level${i + 1}`, title: concept.title, theme: concept.theme, difficulty: concept.difficulty, focus: '' };
        log(`Phase 3: world level ${i + 1}/${count} ("${brief.title}")`);
        const level = await runWorldLevelPhase(concept, { width, height, ...worldLevelOptions, levelBrief: brief, clientKeys });
        writeJson(`phase3-level${i + 1}.json`, level);
        log(`  -> ${level.width}x${level.height} level`);
        levels.push({ id: brief.levelId || `level${i + 1}`, data: level });
    }

    let entityDesignResult = { entities: [] };
    if (phases.entities) {
        log('Phase 4: entity design');
        entityDesignResult = await runEntityDesignPhase(concept, { ...entityDesignOptions, engineType: concept.engineType, clientKeys });
        writeJson('phase4-entity-design.json', entityDesignResult);
        log(`  -> ${entityDesignResult.entities.length} entity types designed`);
    } else {
        log('Phase 4: entity design (skipped by config)');
    }

    const entitiesResults = [];
    for (let i = 0; i < count; i++) {
        if (phases.entities) {
            log(`Phase 5: entities placement ${i + 1}/${count}`);
            const entitiesResult = await runEntitiesPhase(concept, {
                width,
                height,
                ...entitiesOptions,
                designedEntities: entityDesignResult.entities,
                levelBrief: levelPlan.levels[i] || null,
                level: levels[i].data,
                clientKeys,
            });
            writeJson(`phase5-entities-level${i + 1}.json`, entitiesResult);
            log(`  -> ${entitiesResult.entities.length} entities placed`);
            entitiesResults.push(entitiesResult);
        } else {
            entitiesResults.push({ entities: [] });
        }
    }

    let logic = { nodes: [], wires: [], variables: [], name: 'main', skipped: true };
    if (phases.logic && concept.engineType === 'rpg-topdown') {
        log('Phase 6: logic');
        logic = await runLogicPhase(concept, entityDesignResult, { clientKeys });
        log(`  -> ${logic.nodes.length} node(s), ${logic.wires.length} wire(s)`);
    } else {
        log(phases.logic ? 'Phase 6: logic (skipped — no runtime for this engine type)' : 'Phase 6: logic (skipped by config)');
    }
    writeJson('phase6-logic.json', logic);

    log(`Phase 7: campaign + build (${count} level${count > 1 ? 's' : ''})`);
    const build = await runCampaignBuildPhase({ concept, project, levels, entitiesByLevel: entitiesResults, entityDesign: entityDesignResult });
    writeJson('phase7-campaign.json', build);
    if (build.validation.hasWarnings) {
        log(`  (campaign validator warnings: ${build.validation.warnings.join('; ')})`);
    }
    const qualityWarnings = (build.quality || []).flatMap((q) => q.warnings.map((item) => `[${q.levelId}] ${item.message}`));
    if (qualityWarnings.length > 0) {
        log(`  (quality warnings: ${qualityWarnings.join('; ')})`);
    }

    const zipBuffer = await buildZipBuffer({
        redglitchJson: project.redglitchJson,
        levels: build.levels,
        campaign: build.campaign,
        entityDefinitions: build.entityDefinitions,
        musicConfig: build.musicConfig,
        logic,
    });
    const zipPath = path.join(runDir, 'output.zip');
    fs.writeFileSync(zipPath, zipBuffer);
    log(`Done. Project bundle: ${zipPath}`);

    return {
        runId, runDir, zipPath,
        concept, project,
        level: build.levels[0].data,
        levels: build.levels,
        levelPlan,
        entityDesign: entityDesignResult,
        entities: entitiesResults[0],
        logic,
        build,
    };
}

module.exports = { runPipeline };
