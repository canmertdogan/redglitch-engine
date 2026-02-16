const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');

const ensureDir = async (dir) => {
    await fs.mkdir(dir, { recursive: true });
};

// Save logic (visual workspace + executable code)
router.post('/save', async (req, res) => {
    const { name, json, js } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    try {
        const activeProject = projectService.getActiveProject();
        const logicDir = path.join(activeProject, 'data', 'logic');
        await ensureDir(logicDir);
        
        // Save the visual workspace (JSON)
        if (json) await fs.writeFile(path.join(logicDir, `${name}.json`), json);
        
        // Save the executable code (JS)
        if (js) await fs.writeFile(path.join(logicDir, `${name}.js`), js);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save logic' });
    }
});

// List all logic scripts
router.get('/list', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const logicDir = path.join(activeProject, 'data', 'logic');
        await ensureDir(logicDir);
        const files = await fs.readdir(logicDir);
        // Only return JSON files (the visual data) and strip extension
        const scripts = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
        res.json(scripts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list scripts' });
    }
});

// Get logic JavaScript executable
router.get('/js/:name', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const js = await fs.readFile(path.join(activeProject, 'data', 'logic', `${req.params.name}.js`), 'utf8');
        res.set('Content-Type', 'application/javascript');
        res.send(js);
    } catch (err) {
        res.status(404).json({ error: 'Logic JS not found' });
    }
});

// Get logic JSON (supports .algorithm extension)
router.get('/:name', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        let name = req.params.name;
        let filePath;
        
        // Support both .json and .algorithm extensions
        if (name.endsWith('.algorithm')) {
            filePath = path.join(activeProject, 'data', 'logic', name.replace('.algorithm', '.json'));
        } else if (name.endsWith('.json')) {
            filePath = path.join(activeProject, 'data', 'logic', name);
        } else {
            filePath = path.join(activeProject, 'data', 'logic', `${name}.json`);
        }
        
        const json = await fs.readFile(filePath, 'utf8');
        
        // For .algorithm requests, return parsed JSON directly
        if (req.params.name.endsWith('.algorithm')) {
            res.json(JSON.parse(json));
        } else {
            // For regular requests, return wrapped format
            res.json({ json });
        }
    } catch (err) {
        res.status(404).json({ error: 'Logic not found' });
    }
});

// Support POST for .algorithm files (from test panel)
router.post('/:name', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        let name = req.params.name;
        let filePath;
        
        if (name.endsWith('.algorithm')) {
            filePath = path.join(activeProject, 'data', 'logic', name.replace('.algorithm', '.json'));
        } else {
            filePath = path.join(activeProject, 'data', 'logic', `${name}.json`);
        }
        
        await ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save algorithm' });
    }
});

module.exports = router;
