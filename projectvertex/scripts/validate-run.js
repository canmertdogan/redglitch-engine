#!/usr/bin/env node
// Audits a previously generated run's output with the same quality analyzer
// the campaign-build phase runs live. Usage:
//   node scripts/validate-run.js <runId>     audit a specific run
//   node scripts/validate-run.js             audit the most recent run
// Exit code is 0 when there are no errors, 1 when any level has an error.
const fs = require('fs');
const path = require('path');

const config = require('../config');
const { analyzeLevel } = require('../orchestrator/quality');
const { buildZipBuffer } = require('../orchestrator/zipBuilder');

function listRuns() {
    if (!fs.existsSync(config.RUNS_DIR)) return [];
    return fs.readdirSync(config.RUNS_DIR)
        .filter((name) => fs.statSync(path.join(config.RUNS_DIR, name)).isDirectory())
        .sort((a, b) => fs.statSync(path.join(config.RUNS_DIR, b)).mtimeMs - fs.statSync(path.join(config.RUNS_DIR, a)).mtimeMs);
}

function loadJson(runDir, name) {
    const p = path.join(runDir, name);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

async function main() {    const arg = process.argv[2];
    const runs = listRuns();
    if (runs.length === 0) {
        console.error('[validate-run] no runs found under', config.RUNS_DIR);
        process.exit(1);
    }
    const runId = arg || runs[0];
    if (!runs.includes(runId)) {
        console.error(`[validate-run] run "${runId}" not found. Available: ${runs.join(', ')}`);
        process.exit(1);
    }
    const runDir = path.join(config.RUNS_DIR, runId);
    const concept = loadJson(runDir, 'phase1-concept.json');

    const levelFiles = fs.readdirSync(runDir)
        .filter((f) => /^phase3-level\d+\.json$/.test(f))
        .sort();
    if (levelFiles.length === 0) {
        console.error(`[validate-run] ${runId}: no phase3-levelN.json files found (incomplete run?)`);
        process.exit(1);
    }

    console.log(`[validate-run] auditing run ${runId} (${levelFiles.length} level${levelFiles.length > 1 ? 's' : ''})\n`);

    let anyError = false;
    levelFiles.forEach((file, i) => {
        const level = loadJson(runDir, file);
        const entitiesFile = `phase5-entities-level${i + 1}.json`;
        const entitiesResult = loadJson(runDir, entitiesFile);
        const placed = (entitiesResult && entitiesResult.entities) || [];
        const entityDesign = loadJson(runDir, 'phase4-entity-design.json') || { entities: [] };
        const engineType = (level && level.engineType) || (concept && concept.engineType) || 'unknown';

        const report = analyzeLevel(engineType, level || {}, placed, entityDesign);
        const levelId = (level && level.name) || file.replace(/\.json$/, '');
        console.log(`── ${levelId} (${engineType}, ${level ? `${level.width}x${level.height}` : 'NO LEVEL DATA'})`);

        if (report.errors.length === 0 && report.warnings.length === 0) {
            console.log('   ✔ clean — no errors, no warnings');
        }
        report.errors.forEach((item) => {
            anyError = true;
            console.log(`   ✖ ERROR   [${item.code}] ${item.message}`);
        });
        report.warnings.forEach((item) => console.log(`   ⚠ warning [${item.code}] ${item.message}`));
        console.log('');
    });

    if (anyError) {
        console.log('[validate-run] FAIL: one or more levels have errors');
        process.exit(1);
    }

    // Build-chain audit: campaign graph completeness, definition file shapes,
    // and a from-scratch zip rebuild (real PK archive, non-empty).
    const levelIds = levelFiles.map((f) => `level${f.match(/^phase3-level(\d+)\.json$/)[1]}`);
    const chainErrors = await checkBuildChain(runDir, levelIds);
    chainErrors.forEach((msg) => {
        anyError = true;
        console.log(`   ✖ ERROR   ${msg}`);
    });
    if (chainErrors.length > 0) console.log('');

    if (anyError) {
        console.log('[validate-run] FAIL: one or more levels have errors');
        process.exit(1);
    }
    console.log('[validate-run] OK: no errors');
}

// Sanity-checks the assembled campaign + export chain without trusting the
// run's own phase7 file: rebuild the zip from the raw phase files and verify
// it is a real (non-empty, PK-prefixed) archive.
async function checkBuildChain(runDir, levelIds) {
    const errors = [];
    const project = loadJson(runDir, 'phase2-project.json');
    const build = loadJson(runDir, 'phase7-campaign.json');

    if (project && build) {
        const campaignLevelIds = ((build.campaign && build.campaign.nodes) || [])
            .map((n) => n.levelId)
            .filter(Boolean);
        const missing = campaignLevelIds.filter((id) => !levelIds.includes(id));
        if (missing.length > 0) {
            errors.push(`campaign references levels not written to disk: ${missing.join(', ')}`);
        }
        const notNode = levelIds.filter((id) => !campaignLevelIds.includes(id));
        if (notNode.length > 0) {
            errors.push(`levels written to disk are missing from the campaign graph: ${notNode.join(', ')}`);
        }

        // Each definitions file must be an ARRAY (engine loadDefinitions uses
        // Array#forEach — a {id: def} map silently drops every definition).
        for (const [key, list] of Object.entries(build.entityDefinitions || {})) {
            if (!Array.isArray(list)) {
                errors.push(`entityDefinitions.${key} must be an array (got ${typeof list})`);
            }
        }

        try {
            const logic = loadJson(runDir, 'phase6-logic.json') || { nodes: [], wires: [], variables: [], name: 'main', skipped: true };
            const zipBuffer = await buildZipBuffer({
                redglitchJson: project.redglitchJson,
                levels: build.levels || [],
                campaign: build.campaign,
                entityDefinitions: build.entityDefinitions,
                musicConfig: build.musicConfig,
                logic,
            });
            if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length < 4 || zipBuffer.readUInt32LE(0) !== 0x04034b50) {
                errors.push('rebuilt zip buffer is not a valid PK archive');
            } else {
                console.log(`   ✔ zip rebuild ok (${(zipBuffer.length / 1024).toFixed(1)} KiB)`);
            }
        } catch (err) {
            errors.push(`zip rebuild failed: ${err.message}`);
        }
    } else {
        const missingFiles = [];
        if (!project) missingFiles.push('phase2-project.json');
        if (!build) missingFiles.push('phase7-campaign.json');
        errors.push(`cannot verify the build chain: missing ${missingFiles.join(', ')} (run is incomplete or predates the phase7 write)`);
    }
    return errors;
}

main().catch((err) => {
    console.error(`[validate-run] FAIL: ${err.message}`);
    process.exit(1);
});