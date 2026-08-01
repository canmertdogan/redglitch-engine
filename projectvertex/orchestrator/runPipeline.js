const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('../config');
const { buildZipBuffer } = require('./zipBuilder');

const { runConceptPhase } = require('./phases/01-concept');
const { runScaffoldPhase } = require('./phases/02-scaffold');
const { runWorldLevelPhase } = require('./phases/03-world-level');
const { runEntityDesignPhase } = require('./phases/04-entity-design');
const { runEntitiesPhase } = require('./phases/05-entities');
const { runLogicPhase } = require('./phases/06-logic');
const { runCampaignBuildPhase } = require('./phases/07-campaign-build');

// Runs all 7 phases in sequence against whichever cloud LLM provider is
// configured (see llmClient.js) and writes the resulting project bundle as
// a .zip under runs/<runId>/output.zip. No local process, no persistent
// state — every phase is a stateless call, which is what the server's
// /api/phases/* routes reuse individually for the web UI's live progress.
async function runPipeline(userRequest, {
    runId: runIdOverride,
    width,
    height,
    engineOverride = 'auto',
    phases = { entities: true, logic: true },
    concept: conceptOptions = {},
    worldLevel: worldLevelOptions = {},
    entityDesign: entityDesignOptions = {},
    entities: entitiesOptions = {},
    clientKeys = {},
} = {}) {
    const runId = runIdOverride ?? crypto.randomUUID();
    const runDir = path.join(config.RUNS_DIR, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const log = (msg) => console.log(`[projectvertex:${runId.slice(0, 8)}] ${msg}`);

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

    log('Phase 3: world level');
    const level = await runWorldLevelPhase(concept, { width, height, ...worldLevelOptions, clientKeys });
    writeJson('phase3-level.json', level);
    log(`  -> ${level.width}x${level.height} level`);

    let entityDesignResult = { entities: [] };
    if (phases.entities) {
        log('Phase 4: entity design');
        entityDesignResult = await runEntityDesignPhase(concept, { ...entityDesignOptions, engineType: concept.engineType, clientKeys });
        writeJson('phase4-entity-design.json', entityDesignResult);
        log(`  -> ${entityDesignResult.entities.length} entity types designed`);
    } else {
        log('Phase 4: entity design (skipped by config)');
    }

    let entitiesResult = { entities: [] };
    if (phases.entities) {
        log('Phase 5: entities placement');
        entitiesResult = await runEntitiesPhase(concept, entityDesignResult, { width, height, ...entitiesOptions, clientKeys });
        writeJson('phase5-entities.json', entitiesResult);
        log(`  -> ${entitiesResult.entities.length} entities placed`);
    } else {
        log('Phase 5: entities placement (skipped by config)');
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

    log('Phase 7: campaign + build');
    const build = await runCampaignBuildPhase({ concept, project, level, entities: entitiesResult, entityDesign: entityDesignResult });
    writeJson('phase7-campaign.json', build);
    if (build.validation.hasWarnings) {
        log(`  (campaign validator warnings: ${build.validation.warnings.join('; ')})`);
    }

    const zipBuffer = await buildZipBuffer({
        redglitchJson: project.redglitchJson,
        level: build.level,
        campaign: build.campaign,
        entityDefinitions: build.entityDefinitions,
        logic,
    });
    const zipPath = path.join(runDir, 'output.zip');
    fs.writeFileSync(zipPath, zipBuffer);
    log(`Done. Project bundle: ${zipPath}`);

    return { runId, runDir, zipPath, concept, project, level, entityDesign: entityDesignResult, entities: entitiesResult, logic, build };
}

module.exports = { runPipeline };