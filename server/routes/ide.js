const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const { resolveUnderRoot } = require('../utils/pathGuard');
const safeFs = require('../utils/safeFs');
const { canAutomateMutation } = require('../utils/automationPolicy');

function rejectProtectedAutomation(req, res, filePath) {
    // Enforce protection on EVERY write/delete, regardless of the
    // X-Redglitch-Automation header. The header is non-authoritative metadata;
    // an AI call that omits it must not bypass the protected-path guard.
    let policyPath = String(filePath);
    if (policyPath.startsWith('engine/')) policyPath = `public/${policyPath.slice('engine/'.length)}`;
    if (projectService.isRootProject() && policyPath.startsWith('projects/ROOT/')) {
        policyPath = policyPath.slice('projects/ROOT/'.length);
    }
    const policy = canAutomateMutation(policyPath);
    if (policy.allowed) return false;
    res.status(403).json({ error: 'Cannot modify protected files', code: policy.code, path: policy.path });
    return true;
}

// Helper to ensure directory exists
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

async function pathExists(p) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

// POST /api/ide/read - Read file content
router.get('/read', async (req, res) => {
    let filePath = req.query.file;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const projectName = isRoot ? 'ROOT' : path.basename(activeProject);
        
        let targetRootDir = activeProject;
        
        // Handle engine-core access
        if (filePath.startsWith('engine/')) {
            targetRootDir = path.join(__dirname, '..', '..', 'public');
            filePath = filePath.slice('engine/'.length);
        } else {
            const prefix = `projects/${projectName}/`;
            if (filePath.startsWith(prefix)) {
                filePath = filePath.slice(prefix.length);
            }
        }

        const fullPath = resolveUnderRoot(targetRootDir, filePath);
        
        // Security check: ensure path is within root
        if (!fullPath) {
            return res.status(403).json({ error: 'Access denied' });
        }

        let content;
        try {
            content = await fs.readFile(fullPath, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT' && filePath.startsWith('data/')) {
                const rootFullPath = resolveUnderRoot(path.join(__dirname, '..', '..', 'public'), filePath);
                if (rootFullPath) {
                    content = await fs.readFile(rootFullPath, 'utf8');
                } else {
                    throw err;
                }
            } else {
                throw err;
            }
        }
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.set('Content-Disposition', 'inline');
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
    if (rejectProtectedAutomation(req, res, filePath)) return;

    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const projectName = isRoot ? 'ROOT' : path.basename(activeProject);
        
        let targetRootDir = activeProject;
        
        // Handle engine-core access
        if (filePath.startsWith('engine/')) {
            targetRootDir = path.join(__dirname, '..', '..', 'public');
            filePath = filePath.slice('engine/'.length);
        } else {
            const prefix = `projects/${projectName}/`;
            if (filePath.startsWith(prefix)) {
                filePath = filePath.slice(prefix.length);
            }
        }

        const fullPath = resolveUnderRoot(targetRootDir, filePath);
        
        // Security check: ensure path is within root
        if (!fullPath) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await ensureDir(path.dirname(fullPath));
        await safeFs.safeWriteFullPath(targetRootDir, fullPath, content, 'utf8');
        
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
    if (rejectProtectedAutomation(req, res, filePath)) return;

    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const projectName = isRoot ? 'ROOT' : path.basename(activeProject);
        
        let targetRootDir = activeProject;
        
        // Handle engine-core access
        if (filePath.startsWith('engine/')) {
            return res.status(403).json({ error: 'Cannot delete engine core files' });
        } else {
            const prefix = `projects/${projectName}/`;
            if (filePath.startsWith(prefix)) {
                filePath = filePath.slice(prefix.length);
            }
        }

        const fullPath = resolveUnderRoot(targetRootDir, filePath);
        
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

router.get('/list', async (req, res) => {
    let dirPath = req.query.dir || '';
    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const projectName = isRoot ? 'ROOT' : path.basename(activeProject);
        
        let targetRootDir = activeProject;

        // Handle engine-core access
        if (dirPath.startsWith('engine/')) {
            targetRootDir = path.join(__dirname, '..', '..', 'public');
            dirPath = dirPath.slice('engine/'.length);
        } else {
            const prefix = `projects/${projectName}/`;
            if (dirPath.startsWith(prefix)) {
                dirPath = dirPath.slice(prefix.length);
            }
        }

        const FULL_PUBLIC = path.join(__dirname, '..', '..', 'public');
        // FINDING-TOOL: empty dir means project root listing — resolveUnderRoot('') is null, so handle explicitly
        let fullPath = dirPath === '' ? targetRootDir : resolveUnderRoot(targetRootDir, dirPath);
        if (!fullPath) {
            return res.status(403).json({ error: 'Access denied' });
        }

        let entries;
        try {
            entries = await fs.readdir(fullPath, { withFileTypes: true });
        } catch (err) {
            // Project overlay miss — fall back to the engine-core public tree.
            const publicPath = resolveUnderRoot(FULL_PUBLIC, dirPath);
            if (publicPath && (await pathExists(publicPath))) {
                fullPath = publicPath;
                entries = await fs.readdir(fullPath, { withFileTypes: true });
            } else if (err.code === 'ENOENT') {
                return res.status(404).json({ error: 'Directory not found' });
            } else {
                throw err;
            }
        }
        const files = entries.map(e => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            path: path.join(dirPath, e.name)
        }));
        
        res.json(files);
    } catch (err) {
        console.error(`[IDE:List] Error: ${err.message}`);
        res.status(500).json({ error: 'Failed to list directory' });
    }
});

// GET /api/ide/tree - Return nested file tree for the active project
router.get('/tree', async (req, res) => {
    const MAX_DEPTH = 5;
    const MAX_ENTRIES = 5000;
    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const projectName = isRoot ? 'ROOT' : path.basename(activeProject);
        const state = { count: 0, truncated: false };

        async function buildTree(dir, relativePath = '', isEngine = false, depth = 0) {
            if (state.count >= MAX_ENTRIES || depth > MAX_DEPTH) {
                state.truncated = true;
                return [];
            }
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const children = [];

            for (const entry of entries) {
                if (state.count >= MAX_ENTRIES) { state.truncated = true; break; }
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'builds') continue;
                if (entry.isSymbolicLink()) continue;
                state.count++;

                const rel = path.join(relativePath, entry.name);
                const full = path.join(dir, entry.name);
                const displayPath = isEngine ? `engine/${rel}` : `projects/${projectName}/${rel}`;

                if (entry.isDirectory()) {
                    children.push({
                        name: entry.name,
                        path: displayPath,
                        type: 'dir',
                        children: depth >= MAX_DEPTH ? [] : await buildTree(full, rel, isEngine, depth + 1)
                    });
                } else {
                    children.push({
                        name: entry.name,
                        path: displayPath,
                        type: 'file'
                    });
                }
            }
            return children.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'dir' ? -1 : 1;
            });
        }

        const tree = [];
        
        // 1. Add Project Tree
        const projectTree = await buildTree(activeProject);
        tree.push({
            name: `Project: ${projectName}`,
            path: `projects/${projectName}`,
            type: 'dir',
            children: projectTree
        });

        // 2. Add Engine Tree (if not root)
        if (!isRoot && state.count < MAX_ENTRIES) {
            const engineRoot = path.join(__dirname, '..', '..', 'public');
            const engineTree = await buildTree(engineRoot, '', true);
            tree.push({
                name: 'Engine Core',
                path: 'engine',
                type: 'dir',
                children: engineTree
            });
        }

        res.json(state.truncated ? { tree, truncated: true } : tree);
    } catch (err) {
        console.error('[IDE:Tree] Error:', err);
        res.status(500).json({ error: 'Failed to build tree' });
    }
});

// GET /api/ide/search - Search project files for a query
router.get('/search', async (req, res) => {
    if (String(req.query.query || '').length > 200) return res.status(400).json({ error: 'Query too long' });
    const { query } = req.query;
    if (!query) return res.json([]);

    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const projectName = isRoot ? 'ROOT' : path.basename(activeProject);
        
        const results = [];
        const MAX_FILES_SCANNED = 2000;
        const MAX_DEPTH = 6;
        const state = { scanned: 0, stopped: false };
        async function search(dir, rel = '', isEngine = false, depth = 0) {
            if (state.stopped || depth > MAX_DEPTH) return;
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                if (state.stopped) break;
                if (state.scanned >= MAX_FILES_SCANNED) { state.stopped = true; break; }
                if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'builds') continue;
                if (e.isSymbolicLink()) continue;
                const full = path.join(dir, e.name);
                const rPath = path.join(rel, e.name);
                const displayPath = isEngine ? `engine/${rPath}` : `projects/${projectName}/${rPath}`;
                
                if (e.isDirectory()) {
                    await search(full, rPath, isEngine, depth + 1);
                } else {
                    // fs.search include glob (LOW fix): *.js, **/*.txt, path pattern
                    const include = (req.query.include || '').trim();
                    if (include) {
                        const pattern = include.replace(/\./g, '\\.').replace(/\*\*/g, '__GLOB2__').replace(/\*/g, '[^/]*').replace(/__GLOB2__/g, '.*').replace(/\?/g, '.');
                        const re = new RegExp('^' + pattern + '$', 'i');
                        if (!re.test(rPath) && !re.test(e.name)) continue;
                    }
                    state.scanned++;
                    let content;
                    try {
                        const st = await fs.stat(full);
                        if (st.size > 1024 * 1024) continue; // 1MB cap
                        content = await fs.readFile(full, 'utf8');
                    } catch { continue; }
                    const lines = content.split('\n');
                    for (let index = 0; index < lines.length && results.length < 100; index++) {
                        const line = lines[index];
                        if (line.toLowerCase().includes(query.toLowerCase())) {
                            results.push({
                                file: displayPath,
                                path: displayPath,
                                line: index + 1,
                                text: line.trim()
                            });
                        }
                    }
                    if (results.length >= 100) state.stopped = true;
                }
            }
        }

        // Search project
        await search(activeProject);

        // Search engine (if not root)
        if (!isRoot && results.length < 100) {
            const engineRoot = path.join(__dirname, '..', '..', 'public');
            await search(engineRoot, '', true);
        }

        res.json(results);
    } catch (err) {
        console.error('[IDE:Search] Error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// POST /api/ide/terminal - Restricted terminal-like operations (pwd, ls, cat)
router.post('/terminal', async (req, res) => {
    const { command, args = [] } = req.body;
    const activeProject = projectService.getActiveProject();
    const isRoot = projectService.isRootProject();
    const projectName = isRoot ? 'ROOT' : path.basename(activeProject);

    try {
        if (command === 'pwd') {
            return res.json({ stdout: `/projects/${projectName}`, stderr: '' });
        }

        if (command === 'ls') {
            try {
                let targetPath = args[0] || '';
                const prefix = `projects/${projectName}/`;
                if (targetPath.startsWith(prefix)) {
                    targetPath = targetPath.slice(prefix.length);
                }

                const target = targetPath ? resolveUnderRoot(activeProject, targetPath) : activeProject;
                if (!target) return res.json({ stdout: '', stderr: 'Access denied' });
                
                const entries = await fs.readdir(target, { withFileTypes: true });
                const list = await Promise.all(entries.map(async e => {
                    try {
                        const stats = await fs.stat(path.join(target, e.name));
                        return { name: e.name, isDirectory: e.isDirectory(), size: stats.size, modified: stats.mtime };
                    } catch (e) {
                        return { name: e.name, isDirectory: e.isDirectory(), size: 0, modified: new Date() };
                    }
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
