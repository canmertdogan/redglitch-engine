const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');
const { resolveUnderRoot } = require('../utils/pathGuard');

const ensureDir = async (dir) => {
    await fs.mkdir(dir, { recursive: true });
};

function isSafeName(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9._-]+$/.test(value);
}

// List all fragment shaders
router.get('/list', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const dir = path.join(activeProject, 'data', 'shaders');
        await ensureDir(dir);
        const files = await fs.readdir(dir);
        const shaders = files.filter(f => f.endsWith('.frag')).map(f => f.replace('.frag', ''));
        res.json(shaders);
    } catch (err) {
        res.json([]);
    }
});

// Save shader
router.post('/save', async (req, res) => {
    const { name, content } = req.body;
    if (typeof name !== 'string' || typeof content !== 'string') {
        return res.status(400).json({ error: 'Invalid shader name or content' });
    }
    if (!isSafeName(name)) return res.status(400).json({ error: 'Invalid shader name' });
    // Guard against unbounded payloads that exhaust server memory.
    if (content.length > 1_000_000) {
        return res.status(413).json({ error: 'Shader content exceeds 1 MB limit' });
    }
    try {
        const activeProject = projectService.getActiveProject();
        const dir = path.join(activeProject, 'data', 'shaders');
        await ensureDir(dir);
        const fileName = name.endsWith('.frag') ? name : `${name}.frag`;
        await safeFs.safeWriteFullPath(dir, path.join(dir, fileName), content, 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('[Shaders] Save error:', err);
        res.status(500).json({ error: 'Failed to save shader' });
    }
});

// Get shader content
router.get('/:name', async (req, res) => {
    try {
        const name = req.params.name;
        if (!isSafeName(name)) return res.status(400).json({ error: 'Invalid shader name' });
        const activeProject = projectService.getActiveProject();
        const fileName = name.endsWith('.frag') ? name : `${name}.frag`;
        const content = await fs.readFile(path.join(activeProject, 'data', 'shaders', fileName), 'utf8');
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(content);
    } catch (err) {
        res.status(404).send('// Shader not found');
    }
});

// Delete shader
router.delete('/:name', async (req, res) => {
    try {
        const name = req.params.name;
        if (!isSafeName(name)) return res.status(400).json({ error: 'Invalid shader name' });
        const activeProject = projectService.getActiveProject();
        const dir = path.join(activeProject, 'data', 'shaders');
        const fileName = name.endsWith('.frag') ? name : `${name}.frag`;
        const target = resolveUnderRoot(dir, path.join(dir, fileName));
        if (!target) return res.status(403).json({ error: 'Invalid shader path' });
        await fs.unlink(target);
        res.json({ success: true });
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            return res.status(404).json({ error: 'Shader not found' });
        }
        console.error('[Shaders] Delete error:', err);
        res.status(500).json({ error: 'Failed to delete shader' });
    }
});

module.exports = router;
