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

// List all NPC brains (Hybrid)
router.get('/list', async (req, res) => {
    try {
        const isRoot = projectService.isRootProject();
        const activeProject = projectService.getActiveProject();
        const projectDir = path.join(activeProject, 'data', 'brains');
        const engineDir = path.join(__dirname, '..', '..', 'public', 'data', 'brains');
        
        const brainFiles = new Set();
        
        // 1. Scan engine core brains
        try {
            const files = await fs.readdir(engineDir);
            files.filter(f => f.endsWith('.json')).forEach(f => brainFiles.add(f.replace('.json', '')));
        } catch (e) {
            if (e.code !== 'ENOENT') console.error('[Brains] Error scanning engine brains:', e);
        }

        // 2. Scan project brains
        if (!isRoot) {
            try {
                await ensureDir(projectDir);
                const files = await fs.readdir(projectDir);
                files.filter(f => f.endsWith('.json')).forEach(f => brainFiles.add(f.replace('.json', '')));
            } catch (e) {
                if (e.code !== 'ENOENT') console.error('[Brains] Error scanning project brains:', e);
            }
        }
        
        res.json(Array.from(brainFiles));
    } catch (err) {
        res.json([]);
    }
});

// Save brain (visual workspace + executable code + AST)
router.post('/save', async (req, res) => {
    const { name, json, js, ast } = req.body;
    if (!isSafeName(name)) return res.status(400).json({ error: 'Invalid brain name' });
    try {
        const activeProject = projectService.getActiveProject();
        const dir = path.join(activeProject, 'data', 'brains');
        await ensureDir(dir);
        if (json) await safeFs.safeWriteFullPath(dir, path.join(dir, `${name}.json`), json, 'utf8');
        if (js) await safeFs.safeWriteFullPath(dir, path.join(dir, `${name}.js`), js, 'utf8');
        if (ast) await safeFs.safeWriteFullPath(dir, path.join(dir, `${name}.ast.json`), typeof ast === 'string' ? ast : JSON.stringify(ast, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save brain' });
    }
});

// Get brain JavaScript executable
router.get('/js/:name', async (req, res) => {
    try {
        if (!isSafeName(req.params.name)) return res.status(400).json({ error: 'Invalid brain name' });
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
        if (!isSafeName(req.params.name)) return res.status(400).json({ error: 'Invalid brain name' });
        const activeProject = projectService.getActiveProject();
        const json = await fs.readFile(path.join(activeProject, 'data', 'brains', `${req.params.name}.json`), 'utf8');
        res.json({ json });
    } catch (err) {
        res.status(404).json({ error: 'Brain not found' });
    }
});

// Get brain AST
router.get('/ast/:name', async (req, res) => {
    try {
        if (!isSafeName(req.params.name)) return res.status(400).json({ error: 'Invalid brain name' });
        const activeProject = projectService.getActiveProject();
        const ast = await fs.readFile(path.join(activeProject, 'data', 'brains', `${req.params.name}.ast.json`), 'utf8');
        res.json(JSON.parse(ast));
    } catch (err) {
        res.status(404).json({ error: 'AST not found' });
    }
});

module.exports = router;
