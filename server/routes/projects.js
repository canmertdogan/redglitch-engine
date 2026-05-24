const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const safeFs = require('../utils/safeFs');

const PROJECTS_ROOT = path.join(__dirname, '..', '..', 'projects');
const TEMPLATES_ROOT = path.join(__dirname, '..', '..', 'templates');

const VALID_ENGINE_TYPES = new Set([
    'rpg-topdown', 'platformer-2d', 'iso-pixel',
    'topdown-3d', 'fps-3d', 'platformer-3d',
]);
const VALID_3D_ENGINE_TYPES = new Set(['topdown-3d', 'fps-3d', 'platformer-3d']);
const VALID_RENDER_QUALITY  = new Set(['low', 'medium', 'high', 'ultra']);

/**
 * Build a validated ketebe.json config from raw request body fields.
 * Returns the config object or throws if required fields are invalid.
 */
function buildProjectConfig(fields) {
    const { name, author, engineType, template, renderQuality, physics3D, shadowQuality } = fields;
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
    };
    if (is3D) {
        config.renderQuality  = VALID_RENDER_QUALITY.has(renderQuality) ? renderQuality : 'medium';
        config.physics3D      = physics3D !== false;
        config.shadowQuality  = shadowQuality !== false;
    }
    return config;
}

// Helper function to ensure directory exists
async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {}
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
    await safeFs.safeWriteFullPath(projectPath, path.join(projectPath, 'ketebe.json'), JSON.stringify(projectConfig, null, 2), 'utf8');
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
        'data',
        'profiles'
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

    const projectPath = path.join(PROJECTS_ROOT, safeName);
    if (await pathExists(projectPath)) {
        return { error: { status: 400, body: { error: 'Project already exists' } } };
    }

    const resolvedTemplateId = templateId || 'base-rpg';
    const templatePath = path.join(TEMPLATES_ROOT, resolvedTemplateId);
    const templateExists = await pathExists(templatePath);

    if (templateMode === 'template' && resolvedTemplateId !== 'empty' && templateExists) {
        console.log(`Creating project "${safeName}" from template "${resolvedTemplateId}"...`);
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

    console.log(`Creating project "${safeName}" from main game data...`);
    await fs.mkdir(projectPath, { recursive: true });
    await writeProjectConfig(projectPath, projectConfig);
    await copyGameFromPublic(projectPath);
    await ensureProjectDataDirs(projectPath);
    return { success: true, name: safeName, path: projectPath };
}

// Initialize roots
ensureDir(TEMPLATES_ROOT);

// GET /api/templates - List all available templates
router.get('/templates', async (req, res) => {
    try {
        await ensureDir(TEMPLATES_ROOT);
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
            const configPath = path.join(projectPath, 'ketebe.json');
            let meta = { name: e.name, path: projectPath };
            
            try {
                const configData = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configData);
                meta = { ...meta, ...config };
            } catch(err) {
                // No config or error reading it
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

    try {
        const metadata = req.body.metadata || {};
        
        // Prepare ketebe.json content
        const projectConfig = {
            name: sanitizeProjectName(name), // Use sanitized name
            author: metadata.author || "Anonymous",
            version: "0.1.0",
            description: metadata.description || "A new Ketebe Engine project.",
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
                console.log(`[Server] Copied engine files to template project "${sanitizeProjectName(name)}"`);
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
    const { name, template, engineType, author, renderQuality, physics3D, shadowQuality } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });

    // Default to base-rpg if template is 'default' or 'blank'
    let templateId = template || 'base-rpg';
    if (template === 'blank' || template === 'default') templateId = 'base-rpg';

    try {
        const projectConfig = buildProjectConfig({ name, author, engineType, template: templateId, renderQuality, physics3D, shadowQuality });
        const result = await createProject({
            name,
            templateId,
            projectConfig,
            templateMode: 'scaffold'
        });
        if (result.error) {
            return res.status(result.error.status).send(result.error.body.error);
        }
        console.log(`[Server] Created project "${result.name}"`);
        res.json({ success: true, name: result.name, path: result.path });
    } catch (err) {
        console.error('Create project error:', err);
        res.status(500).send('Failed to create project');
    }
});

// DELETE /api/projects/:name - Delete a project (RESTful route)
router.delete('/projects/:name', async (req, res) => {
    const { name } = req.params;
    if (!name) return res.status(400).send('Project name required');
    
    const projectPath = resolveProjectPath(name);
    if (!projectPath) return res.status(403).send('Access denied');

    try {
        await fs.rm(projectPath, { recursive: true, force: true });
        console.log(`[Server] Deleted project: ${name}`);
        res.json({ success: true });
    } catch (err) {
        console.error("Delete project error:", err);
        res.status(500).send('Failed to delete project');
    }
});

// POST /api/projects/reveal - Reveal project in file manager
router.post('/projects/reveal', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).send('Project name required');
    
    const projectPath = resolveProjectPath(name);
    if (!projectPath) return res.status(403).send('Access denied');

    // Check if project exists
    try {
        await fs.access(projectPath);
    } catch (e) {
        return res.status(404).send('Project not found');
    }

    try {
        await openInFileManager(projectPath);
        console.log(`[Server] Revealed project: ${name}`);
        res.json({ success: true });
    } catch (err) {
        console.error("Reveal error:", err);
        res.status(500).send('Failed to reveal folder');
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
        if (req.projectService && req.projectService.getActiveProject() === projectPath) {
            req.projectService.setActiveProject(null);
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
    let targetPath = req.projectService ? req.projectService.getActiveProject() : rootDir;
    
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
router.get('/projects/current', (req, res) => {
    const activeProject = req.projectService.getActiveProject();
    const isRoot = req.projectService.isRootProject();
    const projectName = isRoot ? 'ROOT' : path.basename(activeProject);
    
    res.json({
        success: true,
        name: projectName,
        path: activeProject,
        isRoot: isRoot
    });
});

// POST /api/projects/switch - Switch active project
router.post('/projects/switch', async (req, res) => {
    const { name } = req.body;
    console.log(`[Server] Switch request to: ${name}`);
    if (!name) {
        req.projectService.setActiveProject(null);
        console.log(`[Server] Active project reset to ROOT`);
        const websocket = req.app?.locals?.websocket;
        if (websocket && typeof websocket.startFileWatcher === 'function') {
            websocket.startFileWatcher();
        }
        return res.json({ success: true, active: 'ROOT' });
    }
    req.projectService.setActiveProject(name);
    console.log(`[Server] Active project now: ${req.projectService.getActiveProject()}`);
    const websocket = req.app?.locals?.websocket;
    if (websocket && typeof websocket.startFileWatcher === 'function') {
        websocket.startFileWatcher();
    }
    res.json({ success: true, active: name });
});

// POST /api/projects/project-file
router.post('/project-file', async (req, res) => {
    const { project, path: relPath, content } = req.body;
    if (!project || !relPath || typeof content !== 'string') {
        return res.status(400).json({ error: 'project, path, and content are required' });
    }
    const fullPath = resolveProjectPath(project);
    if (!fullPath) return res.status(400).json({ error: 'Invalid project' });
    const targetPath = path.join(fullPath, relPath);
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
    const fullPath = resolveProjectPath(project);
    if (!fullPath) return res.status(400).json({ error: 'Invalid project' });
    const targetPath = path.join(fullPath, relPath);
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
        res.json(JSON.parse(data));
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
