const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');

const ensureDir = async (dir) => {
    await fs.mkdir(dir, { recursive: true });
};

// Get abilities list (placeholder for future implementation)
router.get('/', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const abilitiesDir = path.join(activeProject, 'data', 'abilities');
        await ensureDir(abilitiesDir);
        const files = await fs.readdir(abilitiesDir);
        const abilities = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
        res.json(abilities);
    } catch (err) {
        res.json([]);
    }
});

// Save ability (placeholder for future implementation)
router.post('/', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const { name, data } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        
        const abilitiesDir = path.join(activeProject, 'data', 'abilities');
        await ensureDir(abilitiesDir);
        await fs.writeFile(path.join(abilitiesDir, `${name}.json`), JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save ability' });
    }
});

module.exports = router;
