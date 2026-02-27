const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');

const ensureDir = async (dir) => {
    await fs.mkdir(dir, { recursive: true });
};

function isSafeBaseName(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

function normalizeLogicName(value, allowAlgorithm = false) {
    if (typeof value !== 'string') return null;
    if (allowAlgorithm && value.endsWith('.algorithm')) {
        const base = value.slice(0, -10);
        return isSafeBaseName(base) ? `${base}.json` : null;
    }
    if (value.endsWith('.json')) {
        const base = value.slice(0, -5);
        return isSafeBaseName(base) ? `${base}.json` : null;
    }
    return isSafeBaseName(value) ? `${value}.json` : null;
}

// Save logic (visual workspace + executable code)
router.post('/save', async (req, res) => {
    const { name, json, js } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!isSafeBaseName(name)) return res.status(400).json({ error: 'Invalid name' });
    try {
        const activeProject = projectService.getActiveProject();
        const logicDir = path.join(activeProject, 'data', 'logic');
        await ensureDir(logicDir);
        
        // Save the visual workspace (JSON)
        if (json) await safeFs.safeWriteFullPath(logicDir, path.join(logicDir, `${name}.json`), json, 'utf8');
        
        // Save the executable code (JS)
        if (js) await safeFs.safeWriteFullPath(logicDir, path.join(logicDir, `${name}.js`), js, 'utf8');
        
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
        if (!isSafeBaseName(req.params.name)) return res.status(400).json({ error: 'Invalid name' });
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
        const normalizedFile = normalizeLogicName(req.params.name, true);
        if (!normalizedFile) return res.status(400).json({ error: 'Invalid name' });
        const filePath = path.join(activeProject, 'data', 'logic', normalizedFile);
        
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
        const normalizedFile = normalizeLogicName(req.params.name, true);
        if (!normalizedFile) return res.status(400).json({ error: 'Invalid name' });
        const filePath = path.join(activeProject, 'data', 'logic', normalizedFile);
        
        await ensureDir(path.dirname(filePath));
        await safeFs.safeWriteFullPath(path.dirname(filePath), filePath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save algorithm' });
    }
});

module.exports = router;
