const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('../config');
const llmClient = require('../orchestrator/llmClient');
const { ALL_ENGINE_TYPES } = require('../schemas/engineTypes');
const { runConceptPhase } = require('../orchestrator/phases/01-concept');
const { runScaffoldPhase } = require('../orchestrator/phases/02-scaffold');
const { runWorldLevelPhase } = require('../orchestrator/phases/03-world-level');
const { runEntityDesignPhase } = require('../orchestrator/phases/04-entity-design');
const { runEntitiesPhase } = require('../orchestrator/phases/05-entities');
const { runLogicPhase } = require('../orchestrator/phases/06-logic');
const { runCampaignBuildPhase } = require('../orchestrator/phases/07-campaign-build');
const { pipeZipToStream } = require('../orchestrator/zipBuilder');

const ENGINE_TYPES_3D = ['fps-3d', 'topdown-3d', 'platformer-3d'];

const MIN_GRID = 4;
const MAX_GRID_2D = 16;
const MAX_GRID_3D = 128;

function maxGridFor(engineType) {
    return ENGINE_TYPES_3D.includes(engineType) ? MAX_GRID_3D : MAX_GRID_2D;
}

function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

function createApp() {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '1mb' }));

    app.get('/api/config', (req, res) => {
        const availableProviders = llmClient.listAvailableProviders();
        const defaultProvider = llmClient.resolveProvider();
        res.json({
            supportedEngineTypes: config.SUPPORTED_ENGINE_TYPES,
            allEngineTypes: ALL_ENGINE_TYPES,
            defaultWidth: config.WORLD_WIDTH,
            defaultHeight: config.WORLD_HEIGHT,
            minGrid: MIN_GRID,
            maxGrid: MAX_GRID_2D,
            maxGrid3d: MAX_GRID_3D,
            availableProviders,
            defaultProvider,
            defaultModel: llmClient.resolveModel(defaultProvider),
            defaults: {
                concept: { temperature: 0.6, maxTokens: 800, maxRetries: config.MAX_RETRIES.concept },
                worldLevel: { temperature: 0.4, maxTokens: 32000, maxRetries: config.MAX_RETRIES.worldLevel },
                entityDesign: { temperature: 0.6, maxTokens: 4000, maxRetries: config.MAX_RETRIES.entities },
                entities: { temperature: 0.5, maxTokens: 1500, maxRetries: config.MAX_RETRIES.entities },
                logic: { temperature: 0.4, maxTokens: 1200, maxRetries: config.MAX_RETRIES.logic },
            },
        });
    });

    app.post('/api/phases/concept', async (req, res) => {
        const body = req.body || {};
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        if (!prompt) return res.status(400).json({ error: 'prompt is required' });
        const engineOverride = ALL_ENGINE_TYPES.includes(body.engineOverride) ? body.engineOverride : 'auto';
        try {
            const concept = await runConceptPhase(prompt, { ...(body.params || {}), engineOverride, clientKeys: body.clientKeys });
            res.json({ concept });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    app.post('/api/phases/scaffold', async (req, res) => {
        const body = req.body || {};
        if (!body.concept) return res.status(400).json({ error: 'concept is required' });
        try {
            const project = await runScaffoldPhase(body.concept, body.runId);
            res.json({ project });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/phases/world-level', async (req, res) => {
        const body = req.body || {};
        if (!body.concept) return res.status(400).json({ error: 'concept is required' });
        const maxGrid = maxGridFor(body.concept.engineType);
        const width = clamp(body.width, MIN_GRID, maxGrid, config.WORLD_WIDTH);
        const height = clamp(body.height, MIN_GRID, maxGrid, config.WORLD_HEIGHT);
        try {
            const level = await runWorldLevelPhase(body.concept, { width, height, ...(body.params || {}), clientKeys: body.clientKeys });
            res.json({ level });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    app.post('/api/phases/entity-design', async (req, res) => {
        const body = req.body || {};
        if (!body.concept) return res.status(400).json({ error: 'concept is required' });
        try {
            const entityDesign = await runEntityDesignPhase(body.concept, { ...(body.params || {}), engineType: body.concept.engineType, clientKeys: body.clientKeys });
            res.json({ entityDesign });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    app.post('/api/phases/entities', async (req, res) => {
        const body = req.body || {};
        if (!body.concept) return res.status(400).json({ error: 'concept is required' });
        const maxGrid = maxGridFor(body.concept.engineType);
        const width = clamp(body.width, MIN_GRID, maxGrid, config.WORLD_WIDTH);
        const height = clamp(body.height, MIN_GRID, maxGrid, config.WORLD_HEIGHT);
        try {
            const entities = await runEntitiesPhase(body.concept, body.entityDesign || { entities: [] }, { width, height, ...(body.params || {}), clientKeys: body.clientKeys });
            res.json({ entities });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    app.post('/api/phases/logic', async (req, res) => {
        const body = req.body || {};
        if (!body.concept) return res.status(400).json({ error: 'concept is required' });
        if (body.concept.engineType !== 'rpg-topdown') {
            return res.json({ logic: { nodes: [], wires: [], variables: [], name: 'main', skipped: true } });
        }
        try {
            const logic = await runLogicPhase(body.concept, body.entityDesign || { entities: [] }, { ...(body.params || {}), clientKeys: body.clientKeys });
            res.json({ logic });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    app.post('/api/phases/campaign', async (req, res) => {
        const body = req.body || {};
        if (!body.concept || !body.project || !body.level) {
            return res.status(400).json({ error: 'concept, project and level are required' });
        }
        const entities = body.entities || { entities: [] };
        const entityDesign = body.entityDesign || { entities: [] };
        try {
            const build = await runCampaignBuildPhase({ concept: body.concept, project: body.project, level: body.level, entities, entityDesign });
            res.json(build);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/download-zip', (req, res) => {
        const body = req.body || {};
        if (!body.project || !body.level || !body.campaign) {
            return res.status(400).json({ error: 'project, level and campaign are required' });
        }
        const name = (body.project.name || 'projectvertex-game').replace(/[^a-zA-Z0-9_-]/g, '');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
        pipeZipToStream(
            { redglitchJson: body.project.redglitchJson, level: body.level, campaign: body.campaign, entityDefinitions: body.entityDesign, logic: body.logic },
            res
        ).catch((err) => {
            console.error(`[server] zip stream failed: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
        });
    });

    app.post('/api/chat', async (req, res) => {
        const body = req.body || {};
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        if (!message) return res.status(400).json({ error: 'message is required' });
        try {
            const response = await llmClient.chat({
                message,
                personalityText: body.personalityText || 'Sen yardımsever bir asistansın. Kısa ve net cevaplar ver.',
                maxTokens: clamp(body.maxTokens, 16, 2000, 400),
                temperature: typeof body.temperature === 'number' ? body.temperature : 0.6,
                clientKeys: body.clientKeys,
            });
            res.json({ response });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    app.use(express.static(path.join(__dirname, '..', 'webui', 'dist')));

    return app;
}

module.exports = createApp;