const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');

const ensureDir = async (dir) => {
    await fs.mkdir(dir, { recursive: true });
};

function isSafeName(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

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

router.post('/', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const { name, data } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        if (!isSafeName(name)) return res.status(400).json({ error: 'Invalid ability name' });
        
        const abilitiesDir = path.join(activeProject, 'data', 'abilities');
        await ensureDir(abilitiesDir);
        await safeFs.safeWriteFullPath(abilitiesDir, path.join(abilitiesDir, `${name}.json`), JSON.stringify(data, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save ability' });
    }
});

module.exports = router;
