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
    let filePath = req.query.file;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    try {
        const rootDir = projectService.getProjectPath('');
        const projectName = projectService.getActiveProject() === rootDir ? '' : path.basename(rootDir);
        const prefix = `projects/${projectName}/`;
        if (projectName && filePath.startsWith(prefix)) {
            filePath = filePath.slice(prefix.length);
        }

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
    let filePath = req.body.file || req.body.path;
    const content = req.body.content;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    try {
        const rootDir = projectService.getProjectPath('');
        const projectName = projectService.getActiveProject() === rootDir ? '' : path.basename(rootDir);
        const prefix = `projects/${projectName}/`;
        if (projectName && filePath.startsWith(prefix)) {
            filePath = filePath.slice(prefix.length);
        }

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
    let filePath = req.body.file || req.body.path;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    try {
        const rootDir = projectService.getProjectPath('');
        const projectName = projectService.getActiveProject() === rootDir ? '' : path.basename(rootDir);
        const prefix = `projects/${projectName}/`;
        if (projectName && filePath.startsWith(prefix)) {
            filePath = filePath.slice(prefix.length);
        }

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
    let dirPath = req.query.dir || '';
    try {
        const rootDir = projectService.getProjectPath('');
        const projectName = projectService.getActiveProject() === rootDir ? '' : path.basename(rootDir);
        const prefix = `projects/${projectName}/`;
        if (projectName && dirPath.startsWith(prefix)) {
            dirPath = dirPath.slice(prefix.length);
        }

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
        const activeProject = projectService.getActiveProject();
        const rootDir = activeProject;
        const projectName = path.basename(rootDir);

        async function buildTree(dir, relativePath = '') {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const children = [];

            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

                const rel = path.join(relativePath, entry.name);
                const full = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    children.push({
                        name: entry.name,
                        path: `projects/${projectName}/${rel}`,
                        type: 'dir',
                        children: await buildTree(full, rel)
                    });
                } else {
                    children.push({
                        name: entry.name,
                        path: `projects/${projectName}/${rel}`,
                        type: 'file'
                    });
                }
            }
            return children.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });
        }

        const tree = await buildTree(rootDir);
        res.json(tree);
    } catch (err) {
        console.error('[IDE:Tree] Error:', err);
        res.status(500).json({ error: 'Failed to build tree' });
    }
});

// GET /api/ide/search - Search project files for a query
router.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.json([]);

    try {
        const activeProject = projectService.getActiveProject();
        const projectName = path.basename(activeProject);
        
        // Simple recursive search
        const results = [];
        async function search(dir, rel = '') {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                if (e.name.startsWith('.') || e.name === 'node_modules') continue;
                const full = path.join(dir, e.name);
                const rPath = path.join(rel, e.name);
                
                if (e.isDirectory()) {
                    await search(full, rPath);
                } else {
                    const content = await fs.readFile(full, 'utf8');
                    if (content.toLowerCase().includes(query.toLowerCase())) {
                        results.push({
                            name: e.name,
                            path: `projects/${projectName}/${rPath}`
                        });
                    }
                }
            }
        }
        await search(activeProject);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// POST /api/ide/terminal - Restricted terminal-like operations (pwd, ls, cat)
router.post('/terminal', async (req, res) => {
    const { command, args = [] } = req.body;
    const activeProject = projectService.getActiveProject();
    const projectName = path.basename(activeProject);

    try {
        if (command === 'pwd') {
            return res.json({ stdout: `/projects/${projectName}`, stderr: '' });
        }

        if (command === 'ls') {
            try {
                const target = args[0] ? resolveUnderRoot(activeProject, args[0]) : activeProject;
                if (!target) return res.json({ stdout: '', stderr: 'Access denied' });
                
                const entries = await fs.readdir(target, { withFileTypes: true });
                const list = await Promise.all(entries.map(async e => {
                    const stats = await fs.stat(path.join(target, e.name));
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
