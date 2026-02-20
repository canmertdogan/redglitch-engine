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

// POST /api/ide/read - Read file content
router.get('/read', async (req, res) => {
    const filePath = req.query.file;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    try {
        const rootDir = path.join(__dirname, '..', '..');
        const fullPath = path.join(rootDir, filePath);
        
        // Security check: ensure path is within root
        if (!fullPath.startsWith(rootDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const content = await fs.readFile(fullPath, 'utf8');
        res.send(content);
    } catch (err) {
        console.error(`[IDE:Read] Error: ${err.message}`);
        res.status(404).json({ error: 'File not found' });
    }
});

// POST /api/ide/write - Write file content
router.post('/write', async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    try {
        const rootDir = path.join(__dirname, '..', '..');
        const fullPath = path.join(rootDir, filePath);
        
        // Security check: ensure path is within root
        if (!fullPath.startsWith(rootDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content, 'utf8');
        
        console.log(`[IDE:Write] Saved: ${filePath}`);
        res.json({ success: true });
    } catch (err) {
        console.error(`[IDE:Write] Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/ide/delete - Delete a file
router.post('/delete', async (req, res) => {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    try {
        const rootDir = path.join(__dirname, '..', '..');
        const fullPath = path.join(rootDir, filePath);
        
        if (!fullPath.startsWith(rootDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await fs.unlink(fullPath);
        console.log(`[IDE:Delete] Deleted: ${filePath}`);
        res.json({ success: true });
    } catch (err) {
        console.error(`[IDE:Delete] Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/ide/list - List files in directory
router.get('/list', async (req, res) => {
    const dirPath = req.query.dir || '';
    try {
        const rootDir = path.join(__dirname, '..', '..');
        const fullPath = path.join(rootDir, dirPath);
        
        if (!fullPath.startsWith(rootDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const files = entries.map(e => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            path: path.join(dirPath, e.name)
        }));
        
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list directory' });
    }
});

module.exports = router;
