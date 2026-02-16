const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');

const PROJECTS_ROOT = path.join(__dirname, '..', '..', 'projects');
const TEMPLATES_ROOT = path.join(__dirname, '..', '..', 'templates');

// Helper function to ensure directory exists
async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {}
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
    
    // Sanitize Project Name (Allow alphanumeric, spaces, hyphens, underscores)
    const safeName = name.replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
    if (!safeName) return res.status(400).json({ error: 'Invalid project name' });

    const projectPath = path.join(PROJECTS_ROOT, safeName);
    
    // Check if exists
    try {
        await fs.access(projectPath);
        return res.status(400).json({ error: 'Project already exists' });
    } catch(e) {} // Path does not exist, safe to proceed

    // Default to base-rpg if template is 'default', 
    // but respect 'empty' or specific template IDs.
    let templateId = template || 'base-rpg';
    if (template === 'default') templateId = 'base-rpg';

    try {
        // Check if template exists in templates folder
        const templatePath = path.join(TEMPLATES_ROOT, templateId);
        const metadata = req.body.metadata || {};
        
        // Prepare ketebe.json content
        const projectConfig = {
            name: safeName, // Use sanitized name
            author: metadata.author || "Anonymous",
            version: "0.1.0",
            description: metadata.description || "A new Ongonluk Engine project.",
            template: templateId,
            created: new Date().toISOString(),
            engineVersion: "0.2.0"
        };

        // If template exists and is not 'empty', perform copy
        if (templateId !== 'empty' && require('fs').existsSync(templatePath)) {
            console.log(`Creating project "${safeName}" from template "${templateId}"...`);
            
            try {
                await fs.cp(templatePath, projectPath, { recursive: true });
            } catch (copyErr) {
                // Rollback
                console.error("Template copy failed:", copyErr);
                try { await fs.rm(projectPath, { recursive: true, force: true }); } catch(e){}
                return res.status(500).json({ error: 'Failed to copy template' });
            }
            
            // Clean up metadata from the project instance
            try { await fs.rm(path.join(projectPath, 'template.json')); } catch(e) {}
            try { await fs.rm(path.join(projectPath, 'preview.png')); } catch(e) {}
            
            // Write ketebe.json
            await fs.writeFile(path.join(projectPath, 'ketebe.json'), JSON.stringify(projectConfig, null, 2));

            // Copy engine/game files from public/ (skip dirs that template already provides)
            const publicDir = path.join(__dirname, '..', '..', 'public');
            const engineDirs = ['engines', 'base_game', 'fonts', 'js', 'lib', 'sprite-art'];
            const gameFiles = ['index.html', 'splash.html', 'credits.html', 'favicon.ico', 'pixel_scrollbars.css', 'theme.js'];
            for (const dir of engineDirs) {
                const src = path.join(publicDir, dir);
                const dest = path.join(projectPath, dir);
                if (require('fs').existsSync(src) && !require('fs').existsSync(dest)) {
                    await fs.cp(src, dest, { recursive: true });
                }
            }
            for (const file of gameFiles) {
                const src = path.join(publicDir, file);
                const dest = path.join(projectPath, file);
                if (require('fs').existsSync(src) && !require('fs').existsSync(dest)) {
                    await fs.copyFile(src, dest);
                }
            }
            // Ensure dunyalar/ exists (copy from public if template didn't include it)
            if (!require('fs').existsSync(path.join(projectPath, 'dunyalar'))) {
                const srcD = path.join(publicDir, 'dunyalar');
                if (require('fs').existsSync(srcD)) {
                    await fs.cp(srcD, path.join(projectPath, 'dunyalar'), { recursive: true });
                }
            }
            console.log(`[Server] Copied engine files to template project "${safeName}"`);
            
            res.json({ success: true, name: safeName, path: projectPath });
            return;
        }

        // Fallback: Scaffold from main game (for 'empty' or missing template)
        console.log(`Creating project "${safeName}" from main game data...`);
        await fs.mkdir(projectPath, { recursive: true });
        
        // Write ketebe.json
        await fs.writeFile(path.join(projectPath, 'ketebe.json'), JSON.stringify(projectConfig, null, 2));

        // Copy full game files from public/ using same whitelist as build-game.js
        const publicDir = path.join(__dirname, '..', '..', 'public');
        const allowedDirs = ['engines', 'base_game', 'fonts', 'js', 'lib', 'muzikler', 'sprite-art', 'dunyalar', 'data', 'oyuncu_profilleri'];
        const allowedFiles = ['index.html', 'splash.html', 'credits.html', 'favicon.ico', 'pixel_scrollbars.css', 'theme.js'];

        for (const dir of allowedDirs) {
            const src = path.join(publicDir, dir);
            if (require('fs').existsSync(src)) {
                await fs.cp(src, path.join(projectPath, dir), { recursive: true });
            }
        }
        for (const file of allowedFiles) {
            const src = path.join(publicDir, file);
            if (require('fs').existsSync(src)) {
                await fs.copyFile(src, path.join(projectPath, file));
            }
        }
        console.log(`[Server] Copied full game files to project "${safeName}"`);

        // Ensure data subdirectories exist
        await ensureDir(path.join(projectPath, 'data', 'saves'));
        await ensureDir(path.join(projectPath, 'data', 'profiles'));
        await ensureDir(path.join(projectPath, 'data', 'logic'));
        await ensureDir(path.join(projectPath, 'data', 'brains'));
        await ensureDir(path.join(projectPath, 'data', 'achievements'));
        await ensureDir(path.join(projectPath, 'data', 'algorithms'));
        await ensureDir(path.join(projectPath, 'assets'));

        res.json({ success: true, name, path: projectPath });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// POST /api/projects/create - Create new project (legacy alias)
router.post('/projects/create', async (req, res) => {
    const { name, template, engineType, author } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });
    
    // Sanitize Project Name
    const safeName = name.replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
    if (!safeName) return res.status(400).json({ error: 'Invalid project name' });

    const projectPath = path.join(PROJECTS_ROOT, safeName);
    
    // Check if exists
    try {
        await fs.access(projectPath);
        return res.status(400).send('Project already exists');
    } catch(e) {} // Path does not exist, safe to proceed

    // Default to base-rpg if template is 'default' or 'blank'
    let templateId = template || 'base-rpg';
    if (template === 'blank' || template === 'default') templateId = 'base-rpg';

    try {
        const templatePath = path.join(TEMPLATES_ROOT, templateId);
        
        // Prepare ketebe.json content
        const projectConfig = {
            name: safeName,
            author: author || "Anonymous",
            version: "0.1.0",
            description: `A new ${engineType || 'rpg-topdown'} game project`,
            engineType: engineType || 'rpg-topdown',
            template: templateId,
            created: new Date().toISOString(),
            engineVersion: "7.0.1"
        };

        // Create empty project from scratch
        console.log(`Creating project "${safeName}" with engine type "${engineType}"...`);
        await fs.mkdir(projectPath, { recursive: true });
        
        // Write ketebe.json
        await fs.writeFile(path.join(projectPath, 'ketebe.json'), JSON.stringify(projectConfig, null, 2));

        // Copy game files from public/
        const publicDir = path.join(__dirname, '..', '..', 'public');
        const allowedDirs = ['engines', 'base_game', 'fonts', 'js', 'lib', 'muzikler', 'sprite-art', 'dunyalar', 'data', 'oyuncu_profilleri'];
        const allowedFiles = ['index.html', 'splash.html', 'credits.html', 'favicon.ico', 'pixel_scrollbars.css', 'theme.js'];

        for (const dir of allowedDirs) {
            const src = path.join(publicDir, dir);
            if (require('fs').existsSync(src)) {
                await fs.cp(src, path.join(projectPath, dir), { recursive: true });
            }
        }
        for (const file of allowedFiles) {
            const src = path.join(publicDir, file);
            if (require('fs').existsSync(src)) {
                await fs.copyFile(src, path.join(projectPath, file));
            }
        }
        console.log(`[Server] Created project "${safeName}"`);

        // Ensure data subdirectories exist
        await ensureDir(path.join(projectPath, 'data', 'saves'));
        await ensureDir(path.join(projectPath, 'data', 'profiles'));
        await ensureDir(path.join(projectPath, 'data', 'logic'));
        await ensureDir(path.join(projectPath, 'data', 'brains'));
        await ensureDir(path.join(projectPath, 'data', 'achievements'));
        await ensureDir(path.join(projectPath, 'data', 'algorithms'));
        await ensureDir(path.join(projectPath, 'assets'));

        res.json({ success: true, name: safeName, path: projectPath });
    } catch (err) {
        console.error('Create project error:', err);
        res.status(500).send('Failed to create project');
    }
});

// DELETE /api/projects/:name - Delete a project (RESTful route)
router.delete('/projects/:name', async (req, res) => {
    const { name } = req.params;
    if (!name) return res.status(400).send('Project name required');
    
    const projectPath = path.join(PROJECTS_ROOT, name);
    // Security check
    if (!projectPath.startsWith(PROJECTS_ROOT)) return res.status(403).send('Access denied');

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
    
    const projectPath = path.join(PROJECTS_ROOT, name);
    
    // Security check
    if (!projectPath.startsWith(PROJECTS_ROOT)) {
        return res.status(403).send('Access denied');
    }

    // Check if project exists
    try {
        await fs.access(projectPath);
    } catch (e) {
        return res.status(404).send('Project not found');
    }

    let command;
    switch (process.platform) {
        case 'win32': 
            command = `explorer "${projectPath}"`; 
            break;
        case 'darwin': 
            command = `open "${projectPath}"`; 
            break;
        default: 
            command = `xdg-open "${projectPath}"`; 
            break;
    }

    exec(command, (err) => {
        if (err) {
            console.error("Reveal error:", err);
            return res.status(500).send('Failed to reveal folder');
        }
        console.log(`[Server] Revealed project: ${name}`);
        res.json({ success: true });
    });
});

// POST /api/projects/delete - Delete a project (legacy route)
router.post('/projects/delete', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });
    
    const projectPath = path.join(PROJECTS_ROOT, name);
    // Security check to ensure we are deleting inside PROJECTS_ROOT
    if (!projectPath.startsWith(PROJECTS_ROOT)) return res.status(403).json({ error: 'Access denied' });

    try {
        await fs.rm(projectPath, { recursive: true, force: true });
        if (req.activeProject === projectPath) {
            req.setActiveProject(path.join(__dirname, '..', '..'));
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
    let targetPath = req.activeProject;
    
    if (name) {
        targetPath = path.join(PROJECTS_ROOT, name);
    }

    const rootDir = path.join(__dirname, '..', '..');
    // Security check
    if (!targetPath.startsWith(PROJECTS_ROOT) && targetPath !== rootDir) {
        return res.status(403).json({ error: 'Access denied' });
    }

    let command;
    switch (process.platform) {
        case 'win32': command = `explorer "${targetPath}"`; break;
        case 'darwin': command = `open "${targetPath}"`; break;
        default: command = `xdg-open "${targetPath}"`; break;
    }

    exec(command, (err) => {
        if (err) {
            console.error("Explore error:", err);
            return res.status(500).json({ error: 'Failed to open explorer' });
        }
        res.json({ success: true });
    });
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
        return res.json({ success: true, active: 'ROOT' });
    }
    req.projectService.setActiveProject(name);
    console.log(`[Server] Active project now: ${req.projectService.getActiveProject()}`);
    res.json({ success: true, active: name });
});

module.exports = router;
