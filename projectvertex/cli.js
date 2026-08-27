#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { runPipeline } = require('./orchestrator/runPipeline');
const { listAvailableProviders, resolveProvider, resolveModel } = require('./orchestrator/llmClient');

async function main() {
    const userRequest = process.argv.slice(2).join(' ').trim();
    if (!userRequest) {
        console.error('Usage: node cli.js "<oyun isteği, örn: bir platformer oyunu yap>"');
        process.exit(1);
    }
    if (listAvailableProviders().length === 0) {
        console.error(
            '[projectvertex] No LLM provider configured. Set one of OPENCODE_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY (and optionally LLM_PROVIDER/LLM_MODEL).'
        );
        process.exit(1);
    }

    const provider = resolveProvider();
    console.log(`[projectvertex] Using provider: ${provider} (${resolveModel(provider)})`);

    try {
        const result = await runPipeline(userRequest);
        console.log(`\nrun-id: ${result.runId}`);
        console.log(`project: ${result.project.name}`);
        console.log(`zip: ${result.zipPath}`);
    } catch (err) {
        console.error(`\n[projectvertex] Pipeline failed: ${err.message}`);
        process.exit(1);
    }
}

main();
