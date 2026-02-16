const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');

// Helper to ensure directory exists
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

// Helper to save definition files
async function saveDefinition(filename, data) {
    const targetDir = projectService.isRootProject()
        ? path.join(projectService.getProjectPath(), 'public', 'dunyalar', 'definitions')
        : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions');
    
    const filePath = path.join(targetDir, filename);
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// --- QUESTS API ---
router.get('/quests', async (req, res) => {
    try {
        const targetDir = projectService.isRootProject()
            ? path.join(projectService.getProjectPath(), 'public', 'dunyalar', 'definitions')
            : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions');
        const filePath = path.join(targetDir, 'quests.json');
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) { res.json([]); }
});

router.post('/quests', async (req, res) => {
    try {
        await saveDefinition('quests.json', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save quests' });
    }
});

// --- NPCS API ---
router.get('/npcs', async (req, res) => {
    try {
        const targetDir = projectService.isRootProject()
            ? path.join(projectService.getProjectPath(), 'public', 'dunyalar', 'definitions')
            : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions');
        const filePath = path.join(targetDir, 'npcs.json');
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) { res.json([]); }
});

// --- ITEMS API ---
router.get('/items', async (req, res) => {
    try {
        const targetDir = projectService.isRootProject()
            ? path.join(projectService.getProjectPath(), 'public', 'dunyalar', 'definitions')
            : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions');
        const filePath = path.join(targetDir, 'items.json');
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) { res.json([]); }
});

// --- DEFINITION SAVE ENDPOINTS ---
router.post('/enemy-defs', async (req, res) => {
    try {
        await saveDefinition('enemies.json', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save enemy definitions' });
    }
});

router.post('/npc-defs', async (req, res) => {
    try {
        await saveDefinition('npcs.json', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save NPC definitions' });
    }
});

router.post('/skill-defs', async (req, res) => {
    try {
        await saveDefinition('skills.json', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save skill definitions' });
    }
});

router.post('/item-defs', async (req, res) => {
    try {
        await saveDefinition('items.json', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save item definitions' });
    }
});

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
    const filePath = path.join(projectService.getActiveProject(), 'data', 'fx', `${req.params.name}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (e) { res.status(404).json({ error: 'FX not found' }); }
});

router.post('/fx/save', async (req, res) => {
    const { name, config } = req.body;
    if (!name || !config) return res.status(400).json({ error: 'Missing name or config' });
    const dir = path.join(projectService.getActiveProject(), 'data', 'fx');
    await ensureDir(dir);
    try {
        await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify(config, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Save failed' }); }
});

module.exports = router;
