const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const { resolveUnderRoot } = require('../utils/pathGuard');
const safeFs = require('../utils/safeFs');

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
        const rootDir = path.resolve(__dirname, '..', '..');
        const fullPath = resolveUnderRoot(rootDir, filePath);
        
        // Security check: ensure path is within root
        if (!fullPath) {
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
        const rootDir = path.resolve(__dirname, '..', '..');
        const fullPath = resolveUnderRoot(rootDir, filePath);
        
        // Security check: ensure path is within root
        if (!fullPath) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await ensureDir(path.dirname(fullPath));
        await safeFs.safeWriteFullPath(rootDir, fullPath, content, 'utf8');
        
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
        const rootDir = path.resolve(__dirname, '..', '..');
        const fullPath = resolveUnderRoot(rootDir, filePath);
        
        if (!fullPath) {
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
        const rootDir = path.resolve(__dirname, '..', '..');
        const fullPath = resolveUnderRoot(rootDir, dirPath);
        
        if (!fullPath) {
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

// GET /api/ide/tree - Return nested file tree for the active project
router.get('/tree', async (req, res) => {
    try {
        const baseDir = projectService.getProjectPath('');

        async function walk(dir, rel = '') {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const nodes = [];
            for (const e of entries) {
                // Skip common large or system folders
                if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;

                const fullPath = path.join(dir, e.name);
                const nodePath = path.join(rel, e.name).replace(/\\/g, '/');

                if (e.isDirectory()) {
                    const children = await walk(fullPath, path.join(rel, e.name));
                    nodes.push({ name: e.name, type: 'dir', path: nodePath, children });
                } else {
                    nodes.push({ name: e.name, type: 'file', path: nodePath });
                }
            }
            // Directories first, then files, alphabetical
            nodes.sort((a,b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'dir' ? -1 : 1;
            });
            return nodes;
        }

        const tree = await walk(baseDir, '');
        res.json(tree);
    } catch (err) {
        console.error('[IDE:Tree] Error:', err);
        res.status(500).json({ error: 'Failed to build tree' });
    }
});

// GET /api/ide/search - Search project files for a query
router.get('/search', async (req, res) => {
    const q = (req.query.query || '').trim();
    if (!q) return res.json([]);

    try {
        const baseDir = projectService.getProjectPath('');
        const results = [];
        const maxResults = 200;

        async function search(dir, rel = '') {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                if (results.length >= maxResults) return;
                if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;

                const fullPath = path.join(dir, e.name);
                const relPath = path.join(rel, e.name).replace(/\\/g, '/');

                if (e.isDirectory()) {
                    await search(fullPath, path.join(rel, e.name));
                } else {
                    // Skip obvious binary file types
                    const ext = path.extname(e.name).toLowerCase();
                    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.wasm', '.bin', '.exe', '.dll'].includes(ext)) continue;

                    try {
                        const stat = await fs.stat(fullPath);
                        if (stat.size > 200 * 1024) continue; // skip very large files
                        const content = await fs.readFile(fullPath, 'utf8');
                        const lines = content.split(/\r?\n/);
                        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                            if (lines[i].toLowerCase().includes(q.toLowerCase())) {
                                results.push({ file: relPath, line: i + 1, text: lines[i].trim() });
                            }
                        }
                    } catch (err) {
                        // ignore unreadable files
                    }
                }
            }
        }

        await search(baseDir, '');
        res.json(results);
    } catch (err) {
        console.error('[IDE:Search] Error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// POST /api/ide/terminal - Restricted terminal-like operations (pwd, ls, cat)
router.post('/terminal', async (req, res) => {
    const cmd = (req.body && req.body.command) ? String(req.body.command) : '';
    if (!cmd) return res.status(400).json({ error: 'No command provided' });

    try {
        const activeRoot = projectService.getActiveProject() || path.resolve(__dirname, '..', '..');

        // pwd
        if (/^\s*pwd\s*$/.test(cmd)) {
            return res.json({ stdout: activeRoot, stderr: '' });
        }

        // cat <file>
        const catMatch = cmd.match(/^\s*cat\s+(.+)$/);
        if (catMatch) {
            let target = catMatch[1].trim().replace(/^['\"]|['\"]$/g, '');
            const full = resolveUnderRoot(activeRoot, target);
            if (!full) return res.status(403).json({ error: 'Access denied' });
            try {
                const content = await fs.readFile(full, 'utf8');
                return res.json({ stdout: content, stderr: '' });
            } catch (e) {
                return res.json({ stdout: '', stderr: e.message });
            }
        }

        // ls [path]
        const lsMatch = cmd.match(/^\s*ls(?:\s+(.+))?$/);
        if (lsMatch) {
            let arg = (lsMatch[1] || '.').trim().replace(/^['\"]|['\"]$/g, '');
            const full = resolveUnderRoot(activeRoot, arg);
            if (!full) return res.status(403).json({ error: 'Access denied' });
            try {
                const entries = await fs.readdir(full, { withFileTypes: true });
                const list = await Promise.all(entries.map(async e => {
                    const stats = await fs.stat(path.join(full, e.name));
                    return { name: e.name, isDirectory: e.isDirectory(), size: stats.size, modified: stats.mtime };
                }));
                return res.json({ stdout: list, stderr: '' });
            } catch (e) {
                return res.json({ stdout: [], stderr: e.message });
            }
        }

        return res.status(403).json({ error: 'Command not allowed' });
    } catch (err) {
        console.error('[IDE:Terminal] Error:', err);
        res.status(500).json({ error: 'Terminal error' });
    }
});

module.exports = router;
