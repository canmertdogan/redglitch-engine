const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');

function isSafeName(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

// Helper to ensure directory exists
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

// Helper for consistent route creation
function createDefinitionRoutes(typeName, fileName) {
    // GET
    router.get(`/${typeName}`, async (req, res) => {
        try {
            const targetDir = projectService.getDunyalarPath();
            const filePath = path.join(targetDir, 'definitions', fileName);
            const data = await fs.readFile(filePath, 'utf8');
            res.json(JSON.parse(data));
        } catch (err) {
            res.json([]); // Return empty array if file not found
        }
    });

    // POST
    const saveHandler = async (req, res) => {
        try {
            const targetDir = path.join(projectService.getDunyalarPath(), 'definitions');
            const filePath = path.join(targetDir, fileName);
            await ensureDir(targetDir);
            await safeFs.safeWriteFullPath(targetDir, filePath, JSON.stringify(req.body, null, 2), 'utf8');
            res.json({ success: true });
        } catch (err) {
            console.error(`[GameData:${typeName}] Save error:`, err.message);
            res.status(500).json({ error: `Failed to save ${typeName}` });
        }
    };

    router.post(`/${typeName}`, saveHandler);
    router.post(`/${typeName}-defs`, saveHandler); // Legacy support
}

// Create routes for all definition types
createDefinitionRoutes('quests', 'quests.json');
createDefinitionRoutes('npcs', 'npcs.json');
createDefinitionRoutes('items', 'items.json');
createDefinitionRoutes('enemies', 'enemies.json');
createDefinitionRoutes('skills', 'skills.json');

// --- FX SYSTEM API ---
router.get('/fx/list', async (req, res) => {
    const dir = path.join(projectService.getActiveProject(), 'data', 'fx');
    try {
        await ensureDir(dir);
        const files = await fs.readdir(dir);
        const jsonFiles = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
        res.json(jsonFiles);
    } catch (e) { res.json([]); }
});

router.get('/fx/:name', async (req, res) => {
    if (!isSafeName(req.params.name)) return res.status(400).json({ error: 'Invalid FX name' });
    const filePath = path.join(projectService.getActiveProject(), 'data', 'fx', `${req.params.name}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (e) { res.status(404).json({ error: 'FX not found' }); }
});

router.post('/fx/save', async (req, res) => {
    const { name, config } = req.body;
    if (!name || !config) return res.status(400).json({ error: 'Missing name or config' });
    if (!isSafeName(name)) return res.status(400).json({ error: 'Invalid FX name' });
    const dir = path.join(projectService.getActiveProject(), 'data', 'fx');
    await ensureDir(dir);
    try {
        await safeFs.safeWriteFullPath(dir, path.join(dir, `${name}.json`), JSON.stringify(config, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Save failed' }); }
});

module.exports = router;
