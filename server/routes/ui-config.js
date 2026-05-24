const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');

async function getUiConfigPath() {
    const activeProject = projectService.getActiveProject();
    return path.join(activeProject, 'dunyalar', 'definitions', 'ui.json');
}

router.get('/', async (req, res) => {
    try {
        const configPath = await getUiConfigPath();
        const content = await fs.readFile(configPath, 'utf8');
        res.json(JSON.parse(content));
    } catch (err) {
        res.json({ screens: {} });
    }
});

router.post('/', async (req, res) => {
    try {
        const configPath = await getUiConfigPath();
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/actions', (req, res) => {
    res.json([
        "START_GAME", "LOAD_LEVEL", "OPEN_MENU", "CLOSE_MENU", 
        "QUIT", "PAUSE_GAME", "RESUME_GAME"
    ]);
});

module.exports = router;
