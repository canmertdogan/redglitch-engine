const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const safeFs = require('../utils/safeFs');
const projectService = require('../services/projectService');

const PROJECTS_ROOT = path.join(__dirname, '..', '..', 'projects');
const createLocks = new Map(); // per-project mutex for atomic create (F-18)
async function withCreateLock(name, fn) {
  const prev = createLocks.get(name) || Promise.resolve();
  let release;
  const gate = new Promise(r => release = r);
  createLocks.set(name, prev.then(() => gate));
  await prev;
  try { return await fn(); } finally { release(); if (createLocks.get(name) === prev.then(()=>gate)) createLocks.delete(name); }
}
const TEMPLATES_ROOT = path.join(__dirname, '..', '..', 'templates');

const VALID_ENGINE_TYPES = new Set([
    'rpg-topdown', 'platformer-2d', 'iso-pixel',
    'topdown-3d', 'fps-3d', 'platformer-3d', 'unified-3d'
]);
const VALID_3D_ENGINE_TYPES = new Set(['topdown-3d', 'fps-3d', 'platformer-3d', 'unified-3d']);
const VALID_RENDER_QUALITY  = new Set(['low', 'medium', 'high', 'ultra']);

/**
 * Build a validated redglitch.json config from raw request body fields.
 * Returns the config object or throws if required fields are invalid.
 */
function buildProjectConfig(fields) {
    const { name, author, engineType, mode, template, renderQuality, physics3D, shadowQuality } = fields;
    const safeEngine = VALID_ENGINE_TYPES.has(engineType) ? engineType : 'rpg-topdown';
    const is3D       = VALID_3D_ENGINE_TYPES.has(safeEngine);
    const config = {
        name:          sanitizeProjectName(name),
        author:        typeof author === 'string' ? author.slice(0, 80).trim() : 'Anonymous',
        version:       '0.1.0',
        description:   `A new ${safeEngine} game project`,
        engineType:    safeEngine,
        template:      typeof template === 'string' ? template : 'blank',
        created:       new Date().toISOString(),
        engineVersion: '7.0.1',
        metadata: {
            is3D,
            renderQuality: is3D ? (VALID_RENDER_QUALITY.has(renderQuality) ? renderQuality : 'medium') : 'medium',
            physics3D: is3D ? !!physics3D : false,
            shadowQuality: is3D ? !!shadowQuality : false
        }
    };
    if (safeEngine === 'unified-3d') {
        config.mode = mode || 'fps-3d';
    }
    return config;
}

// Helper function to ensure directory exists
async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') console.error(`[Projects] Error creating directory ${dir}:`, e);
    }
}

function sanitizeProjectName(name) {
    return (name || '').replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
}

function resolveProjectPath(name) {
    const safeName = sanitizeProjectName(name);
    if (!safeName) {
        return null;
    }

    const root = path.resolve(PROJECTS_ROOT);
    const projectPath = path.resolve(root, safeName);
    if (!projectPath.startsWith(root + path.sep)) {
        return null;
    }
    return projectPath;
}

function resolveTemplatePath(templateId) {
    const sanitized = (templateId || '').replace(/[^a-zA-Z0-9-_]/g, '').trim();
    if (!sanitized) return null;

    const root = path.resolve(TEMPLATES_ROOT);
    const templatePath = path.resolve(root, sanitized);
    if (!templatePath.startsWith(root + path.sep) && templatePath !== root) {
        return null;
    }
    return templatePath;
}

function openInFileManager(targetPath) {
    return new Promise((resolve, reject) => {
        let command;
        let args;
        switch (process.platform) {
            case 'win32':
                command = 'explorer';
                args = [targetPath];
                break;
            case 'darwin':
                command = 'open';
                args = [targetPath];
                break;
            default:
                command = 'xdg-open';
                args = [targetPath];
                break;
        }

        const child = spawn(command, args, { stdio: 'ignore' });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`File manager exited with code ${code}`));
        });
    });
}

async function pathExists(p) {
    try {
        await fs.access(p);
        return true;
    } catch (e) {
        return false;
    }
}

async function copyDirIfExists(src, dest) {
    if (await pathExists(src)) {
        await fs.cp(src, dest, { recursive: true });
        return true;
    }
    return false;
}

async function copyFileIfExists(src, dest) {
    if (await pathExists(src)) {
        await fs.copyFile(src, dest);
        return true;
    }
    return false;
}

async function writeProjectConfig(projectPath, projectConfig) {
    await safeFs.safeWriteFullPath(projectPath, path.join(projectPath, 'redglitch.json'), JSON.stringify(projectConfig, null, 2), 'utf8');
}

async function ensureProjectDataDirs(projectPath) {
    await ensureDir(path.join(projectPath, 'data', 'saves'));
    await ensureDir(path.join(projectPath, 'data', 'profiles'));
    await ensureDir(path.join(projectPath, 'data', 'logic'));
    await ensureDir(path.join(projectPath, 'data', 'brains'));
    await ensureDir(path.join(projectPath, 'data', 'achievements'));
    await ensureDir(path.join(projectPath, 'data', 'algorithms'));
    await ensureDir(path.join(projectPath, 'assets'));
}

async function copyGameFromPublic(projectPath, options = {}) {
    const publicDir = path.join(__dirname, '..', '..', 'public');
    const allowedDirs = options.allowedDirs || [
        'engines',
        'base_game',
        'fonts',
        'js',
        'lib',
        'muzikler',
        'sprite-art',
        'dunyalar',
        'data'
    ];
    const allowedFiles = options.allowedFiles || [
        'index.html',
        'splash.html',
        'credits.html',
        'favicon.ico',
        'pixel_scrollbars.css',
        'theme.js'
    ];

    for (const dir of allowedDirs) {
        const src = path.join(publicDir, dir);
        const dest = path.join(projectPath, dir);
        await copyDirIfExists(src, dest);
    }
    for (const file of allowedFiles) {
        const src = path.join(publicDir, file);
        const dest = path.join(projectPath, file);
        await copyFileIfExists(src, dest);
    }
}

async function copyTemplateProject(templatePath, projectPath) {
    await fs.cp(templatePath, projectPath, { recursive: true });
    await fs.rm(path.join(projectPath, 'template.json')).catch(() => {});
    await fs.rm(path.join(projectPath, 'preview.png')).catch(() => {});
}

async function createProject({
    name,
    templateId,
    projectConfig,
    templateMode,
    extraCopy = null
}) {
    const safeName = sanitizeProjectName(name);
    if (!safeName) {
        return { error: { status: 400, body: { error: 'Invalid project name' } } };
    }

    return withCreateLock(safeName, async () => {
    const projectPath = path.join(PROJECTS_ROOT, safeName);
    if (await pathExists(projectPath)) {
        return { error: { status: 400, body: { error: 'Project already exists' } } };
    }

    const resolvedTemplateId = templateId || 'base-rpg';
    const templatePath = resolveTemplatePath(resolvedTemplateId);
    if (!templatePath) {
        return { error: { status: 400, body: { error: 'Invalid template ID' } } };
    }
    const templateExists = await pathExists(templatePath);

    if (templateMode === 'template' && resolvedTemplateId !== 'empty' && templateExists) {
        try {
            await copyTemplateProject(templatePath, projectPath);
        } catch (copyErr) {
            console.error("Template copy failed:", copyErr);
            await fs.rm(projectPath, { recursive: true, force: true }).catch(() => {});
            return { error: { status: 500, body: { error: 'Failed to copy template' } } };
        }
        await writeProjectConfig(projectPath, projectConfig);
        if (extraCopy) {
            await extraCopy(projectPath);
        }
        return { success: true, name: safeName, path: projectPath };
    }

    try { await fs.mkdir(projectPath); } catch (e) { if (e.code === 'EEXIST') return { error: { status: 400, body: { error: 'Project already exists' } } }; throw e; }
    await writeProjectConfig(projectPath, projectConfig);
    await copyGameFromPublic(projectPath);
    await ensureProjectDataDirs(projectPath);
    return { success: true, name: safeName, path: projectPath };
    });
}

// Initialize roots
ensureDir(TEMPLATES_ROOT);

// GET /api/templates - List all available templates
router.get('/templates', async (req, res) => {
    try {
        await ensureDir(TEMPLATES_ROOT).catch(()=>{});
        const entries = await fs.readdir(TEMPLATES_ROOT, { withFileTypes: true });
        const templates = [];
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const metaPath = path.join(TEMPLATES_ROOT, entry.name, 'template.json');
                try {
                    const metaData = JSON.parse(await fs.readFile(metaPath, 'utf8'));
                    templates.push(metaData);
                } catch (e) {
                    // Fallback for folders without manifest
                    templates.push({
                        id: entry.name,
                        name: entry.name,
                        description: "No description available.",
                        category: "Uncategorized"
                    });
                }
            }
        }
        res.json(templates);
    } catch (err) {
        console.error("Template list error:", err);
        res.status(500).json({ error: 'Failed to list templates' });
    }
});

// GET /api/projects - List all projects
router.get('/projects', async (req, res) => {
    try {
        await ensureDir(PROJECTS_ROOT);
        const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
        const projectDirs = entries.filter(e => e.isDirectory());
        
        const projects = await Promise.all(projectDirs.map(async (e) => {
            const projectPath = path.join(PROJECTS_ROOT, e.name);
            const configPath = path.join(projectPath, 'redglitch.json');
            let meta = { name: e.name, path: projectPath };
            
            try {
                const configData = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configData);
                const _c = { ...config }; for (const k of ['__proto__','constructor','prototype']) delete _c[k]; meta = { ...meta, ..._c };
            } catch(err) {
                // No config or error reading it
            }
            if (!meta.lastModified || Number.isNaN(Date.parse(meta.lastModified))) {
                if (meta.created && !Number.isNaN(Date.parse(meta.created))) {
                    meta.lastModified = meta.created;
                } else {
                    try {
                        const st = await fs.stat(projectPath);
                        meta.lastModified = st.mtime.toISOString();
                    } catch {
                        meta.lastModified = new Date().toISOString();
                    }
                }
            }
            return meta;
        }));

        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list projects' });
    }
});

// POST /api/projects - Create new project
router.post('/projects', async (req, res) => {
    const { name, template } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });

    // Default to base-rpg if template is 'default', 
    // but respect 'empty' or specific template IDs.
    let templateId = template || 'base-rpg';
    if (template === 'default') templateId = 'base-rpg';
    const resolvedTemplateId = resolveTemplatePath(templateId);
    if (!resolvedTemplateId) {
        return res.status(400).json({ error: 'Invalid template ID' });
    }

    try {
        const metadata = req.body.metadata || {};
        
        // Prepare redglitch.json content
        const projectConfig = {
            name: sanitizeProjectName(name), // Use sanitized name
            author: metadata.author || "Anonymous",
            version: "0.1.0",
            description: metadata.description || "A new Redglitch Engine project.",
            template: templateId,
            created: new Date().toISOString(),
            engineVersion: "0.2.0"
        };

        const result = await createProject({
            name,
            templateId,
            projectConfig,
            templateMode: 'template',
            extraCopy: async (projectPath) => {
                // Copy engine/game files from public/ (skip dirs that template already provides)
                const publicDir = path.join(__dirname, '..', '..', 'public');
                const engineDirs = ['engines', 'base_game', 'fonts', 'js', 'lib', 'sprite-art'];
                const gameFiles = ['index.html', 'splash.html', 'credits.html', 'favicon.ico', 'pixel_scrollbars.css', 'theme.js'];
                for (const dir of engineDirs) {
                    const src = path.join(publicDir, dir);
                    const dest = path.join(projectPath, dir);
                    if (await pathExists(src) && !(await pathExists(dest))) {
                        await fs.cp(src, dest, { recursive: true });
                    }
                }
                for (const file of gameFiles) {
                    const src = path.join(publicDir, file);
                    const dest = path.join(projectPath, file);
                    if (await pathExists(src) && !(await pathExists(dest))) {
                        await fs.copyFile(src, dest);
                    }
                }
                // Ensure dunyalar/ exists (copy from public if template didn't include it)
                const dunyalarDest = path.join(projectPath, 'dunyalar');
                if (!(await pathExists(dunyalarDest))) {
                    const srcD = path.join(publicDir, 'dunyalar');
                    await copyDirIfExists(srcD, dunyalarDest);
                }
                await ensureProjectDataDirs(projectPath);
            }
        });

        if (result.error) {
            return res.status(result.error.status).json(result.error.body);
        }
        res.json({ success: true, name: result.name, path: result.path });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// POST /api/projects/create - Create new project (legacy alias)
router.post('/projects/create', async (req, res) => {
    const { name, template, engineType, mode, author, renderQuality, physics3D, shadowQuality } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });

    // Default to base-rpg if template is 'default' or 'blank'
    let templateId = template || 'base-rpg';
    if (template === 'blank' || template === 'default') templateId = 'base-rpg';
    const resolvedTemplateId = resolveTemplatePath(templateId);
    if (!resolvedTemplateId) {
        return res.status(400).json({ error: 'Invalid template ID' });
    }

    try {
        // 2. Build configuration
        const projectConfig = buildProjectConfig({ name, author, engineType, mode, template: templateId, renderQuality, physics3D, shadowQuality });
        const result = await createProject({
            name,
            templateId,
            projectConfig,
            templateMode: 'scaffold'
        });
        if (result.error) {
            return res.status(result.error.status).json({ error: result.error.body.error });
        }
        res.json({ success: true, name: result.name, path: result.path });
    } catch (err) {
        console.error('Create project error:', err);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// DELETE /api/projects/:name - Delete a project (RESTful route)
router.delete('/projects/:name', async (req, res) => {
    const { name } = req.params;
    if (!name) return res.status(400).json({ error: 'Project name required' });
    
    const projectPath = resolveProjectPath(name);
    if (!projectPath) return res.status(403).json({ error: 'Access denied' });

    try {
        await fs.rm(projectPath, { recursive: true, force: true });
        const svc = req.projectService || projectService;
        if (svc && path.resolve(svc.getActiveProject()) === path.resolve(projectPath)) {
            svc.setActiveProject(null);
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Delete project error:", err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// POST /api/projects/reveal - Reveal project in file manager
router.post('/projects/reveal', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });
    
    const projectPath = resolveProjectPath(name);
    if (!projectPath) return res.status(403).json({ error: 'Access denied' });

    // Check if project exists
    try {
        await fs.access(projectPath);
    } catch (e) {
        return res.status(404).json({ error: 'Project not found' });
    }

    try {
        await openInFileManager(projectPath);
        res.json({ success: true });
    } catch (err) {
        console.error("Reveal error:", err);
        res.status(500).json({ error: 'Failed to reveal folder' });
    }
});

// POST /api/projects/delete - Delete a project (legacy route)
router.post('/projects/delete', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });
    
    const projectPath = resolveProjectPath(name);
    if (!projectPath) return res.status(403).json({ error: 'Access denied' });

    try {
        await fs.rm(projectPath, { recursive: true, force: true });
        const svc = req.projectService || projectService;
        if (svc && path.resolve(svc.getActiveProject()) === path.resolve(projectPath)) {
            svc.setActiveProject(null);
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Delete project error:", err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// POST /api/projects/explore - Open project folder in file explorer
router.post('/projects/explore', async (req, res) => {
    const { name } = req.body;
    const rootDir = path.resolve(__dirname, '..', '..');
    const svc = req.projectService || projectService;
    let targetPath = svc ? svc.getActiveProject() : rootDir;
    
    if (name) {
        const resolved = resolveProjectPath(name);
        if (!resolved) return res.status(403).json({ error: 'Access denied' });
        targetPath = resolved;
    }

    // Security check
    const projectsRootResolved = path.resolve(PROJECTS_ROOT);
    if (!targetPath.startsWith(projectsRootResolved + path.sep) && targetPath !== rootDir) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        await openInFileManager(targetPath);
        res.json({ success: true });
    } catch (err) {
        console.error("Explore error:", err);
        res.status(500).json({ error: 'Failed to open explorer' });
    }
});

// GET /api/projects/current - Get current active project
router.get('/projects/current', async (req, res) => {
    const svc = req.projectService || projectService;
    const activeProject = svc.getActiveProject();
    const isRoot = svc.isRootProject();
    const projectName = isRoot ? 'ROOT' : path.basename(activeProject);
    
    const response = {
        success: true,
        name: projectName,
        path: activeProject,
        isRoot: isRoot
    };

    if (!isRoot) {
        try {
            const raw = await fs.readFile(path.join(activeProject, 'redglitch.json'), 'utf8');
            const cfg = JSON.parse(raw);
            if (cfg && typeof cfg === 'object') {
                if (typeof cfg.author === 'string') response.author = cfg.author;
                if (typeof cfg.version === 'string') response.version = cfg.version;
                if (typeof cfg.engineType === 'string') response.engineType = cfg.engineType;
                if (typeof cfg.description === 'string') response.description = cfg.description;
            }
        } catch {
            // redglitch.json is optional (e.g. Default Project)
        }
    }

    res.json(response);
});

// POST /api/projects/switch - Switch active project
router.post('/projects/switch', async (req, res) => {
    const { name } = req.body;
    const svc = req.projectService || projectService;
    if (!name) {
        svc.setActiveProject(null);
        const websocket = req.app?.locals?.websocket;
        if (websocket && typeof websocket.startFileWatcher === 'function') {
            websocket.startFileWatcher();
        }
        return res.json({ success: true, active: 'ROOT' });
    }
    const safeName = sanitizeProjectName(name);
    svc.setActiveProject(safeName);
    const websocket = req.app?.locals?.websocket;
    if (websocket && typeof websocket.startFileWatcher === 'function') {
        websocket.startFileWatcher();
    }
    res.json({ success: true, active: safeName });
});

// POST /api/projects/project-file
router.post('/project-file', async (req, res) => {
    const { project, path: relPath, content } = req.body;
    if (!project || !relPath || typeof content !== 'string') {
        return res.status(400).json({ error: 'project, path, and content are required' });
    }
    const relPathNormalized = path.normalize(relPath);
    if (!relPathNormalized || relPathNormalized.startsWith('..') || path.isAbsolute(relPathNormalized) || relPathNormalized.includes('..')) {
        return res.status(403).json({ error: 'Access denied' });
    }
    const fullPath = resolveProjectPath(project);
    if (!fullPath) return res.status(400).json({ error: 'Invalid project' });
    const targetPath = path.join(fullPath, relPathNormalized);
    if (!targetPath.startsWith(fullPath + path.sep) && targetPath !== fullPath) return res.status(403).json({ error: 'Access denied' });
    try {
        await ensureDir(path.dirname(targetPath));
        await safeFs.safeWriteFullPath(fullPath, targetPath, content, 'utf8');
        res.json({ ok: true, path: relPath });
    } catch (err) {
        console.error('[project-file] write error:', err.message);
        res.status(500).json({ error: 'Write failed' });
    }
});

// GET /api/projects/project-file
router.get('/project-file', async (req, res) => {
    const { project, path: relPath } = req.query;
    if (!project || !relPath) {
        return res.status(400).json({ error: 'project and path are required' });
    }
    const relPathNormalized = path.normalize(relPath);
    if (!relPathNormalized || relPathNormalized.startsWith('..') || path.isAbsolute(relPathNormalized) || relPathNormalized.includes('..')) {
        return res.status(403).json({ error: 'Access denied' });
    }
    const fullPath = resolveProjectPath(project);
    if (!fullPath) return res.status(400).json({ error: 'Invalid project' });
    const targetPath = path.join(fullPath, relPathNormalized);
    if (!targetPath.startsWith(fullPath + path.sep) && targetPath !== fullPath) return res.status(403).json({ error: 'Access denied' });
    try {
        const content = await fs.readFile(targetPath, 'utf8');
        res.json({ ok: true, content });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
        res.status(500).json({ error: 'Read failed' });
    }
});

// GET /api/project/:name/state - Get project shared state
router.get('/project/:name/state', async (req, res) => {
    const { name } = req.params;
    const projectPath = resolveProjectPath(name);
    if (!projectPath) return res.status(403).json({ error: 'Access denied' });

    const statePath = path.join(projectPath, 'data', 'project_state.json');
    try {
        const data = await fs.readFile(statePath, 'utf8');
        let parsed; try { parsed = JSON.parse(data); } catch { return res.status(500).json({ error: 'Project state corrupted' }); }
        res.json(parsed);
    } catch (err) {
        // Return empty state if not found
        res.json({ state: {}, metadata: { created: Date.now(), version: 0 } });
    }
});

// POST /api/project/:name/state - Save project shared state
router.post('/project/:name/state', async (req, res) => {
    const { name } = req.params;
    const projectPath = resolveProjectPath(name);
    if (!projectPath) return res.status(403).json({ error: 'Access denied' });

    const dataDir = path.join(projectPath, 'data');
    const statePath = path.join(dataDir, 'project_state.json');
    
    try {
        await ensureDir(dataDir);
        await safeFs.safeWriteFullPath(projectPath, statePath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('[ProjectState] Save error:', err.message);
        res.status(500).json({ error: 'Failed to save project state' });
    }
});

module.exports = router;
// Additive exports for in-process reuse by headless callers (e.g.
// projectvertex) that need project scaffolding without going through the
// HTTP API — mirrors the pattern already used in levels3d.js.
module.exports.buildProjectConfig = buildProjectConfig;
module.exports.createProject = createProject;
module.exports.sanitizeProjectName = sanitizeProjectName;
module.exports.resolveProjectPath = resolveProjectPath;
module.exports.PROJECTS_ROOT = PROJECTS_ROOT;
