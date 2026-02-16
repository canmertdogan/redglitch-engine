const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');

const ensureDir = async (dir) => {
    await fs.mkdir(dir, { recursive: true });
};

// List all NPC brains
router.get('/list', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const dir = path.join(activeProject, 'data', 'brains');
        await ensureDir(dir);
        const files = await fs.readdir(dir);
        const scripts = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
        res.json(scripts);
    } catch (err) {
        res.json([]);
    }
});

// Save brain (visual workspace + executable code)
router.post('/save', async (req, res) => {
    const { name, json, js } = req.body;
    try {
        const activeProject = projectService.getActiveProject();
        const dir = path.join(activeProject, 'data', 'brains');
        await ensureDir(dir);
        if (json) await fs.writeFile(path.join(dir, `${name}.json`), json);
        if (js) await fs.writeFile(path.join(dir, `${name}.js`), js);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save brain' });
    }
});

// Get brain JavaScript executable
router.get('/js/:name', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const js = await fs.readFile(path.join(activeProject, 'data', 'brains', `${req.params.name}.js`), 'utf8');
        res.set('Content-Type', 'application/javascript');
        res.send(js);
    } catch (err) {
        res.status(404).send('// No JS found');
    }
});

// Get brain JSON
router.get('/:name', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const json = await fs.readFile(path.join(activeProject, 'data', 'brains', `${req.params.name}.json`), 'utf8');
        res.json({ json });
    } catch (err) {
        res.status(404).json({ error: 'Brain not found' });
    }
});

module.exports = router;
