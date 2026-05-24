const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');

function isSafeName(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

// Helper to ensure directory exists
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

// Helper for consistent route creation
function createDefinitionRoutes(typeName, fileName) {
    // GET
    router.get(`/${typeName}`, async (req, res) => {
        try {
            const isRoot = projectService.isRootProject();
            const projectDir = projectService.getDunyalarPath();
            const projectFilePath = path.join(projectDir, 'definitions', fileName);
            
            let mergedData = [];
            
            // 1. Try to load engine core definitions (fallback/base)
            if (!isRoot) {
                try {
                    const engineFilePath = path.join(__dirname, '..', '..', 'public', 'dunyalar', 'definitions', fileName);
                    const engineRaw = await fs.readFile(engineFilePath, 'utf8');
                    mergedData = JSON.parse(engineRaw);
                } catch (e) {
                    // Engine core file missing or invalid, continue
                }
            }

            // 2. Load project definitions and merge
            try {
                const projectRaw = await fs.readFile(projectFilePath, 'utf8');
                const projectData = JSON.parse(projectRaw);
                
                if (Array.isArray(projectData)) {
                    // Merge arrays by ID (project items override engine items)
                    const itemMap = new Map();
                    mergedData.forEach(item => { if (item.id) itemMap.set(item.id, item); });
                    projectData.forEach(item => { if (item.id) itemMap.set(item.id, item); });
                    mergedData = Array.from(itemMap.values());
                } else {
                    // If it's an object, just merge
                    mergedData = { ...mergedData, ...projectData };
                }
            } catch (err) {
                // If project file is missing, we just use engine data or empty array
                if (isRoot) {
                    // In root mode, if we failed to read project file (which is the engine file), we should try public
                    try {
                        const engineFilePath = path.join(__dirname, '..', '..', 'public', 'dunyalar', 'definitions', fileName);
                        const engineRaw = await fs.readFile(engineFilePath, 'utf8');
                        mergedData = JSON.parse(engineRaw);
                    } catch(e) {}
                }
            }
            
            res.json(mergedData);
        } catch (err) {
            console.error(`[GameData:${typeName}] Load error:`, err.message);
            res.json([]); // Return empty array if all else fails
        }
    });

    // POST
    const saveHandler = async (req, res) => {
        try {
            const targetDir = path.join(projectService.getDunyalarPath(), 'definitions');
            const filePath = path.join(targetDir, fileName);
            const activeProject = projectService.getActiveProject();
            
            await ensureDir(targetDir);
            // Always save to the active project's directory
            await safeFs.safeWriteFullPath(activeProject, filePath, JSON.stringify(req.body, null, 2), 'utf8');
            res.json({ success: true });
        } catch (err) {
            console.error(`[GameData:${typeName}] Save error:`, err.message);
            res.status(500).json({ error: `Failed to save ${typeName}` });
        }
    };

    router.post(`/${typeName}`, saveHandler);
    router.post(`/${typeName}-defs`, saveHandler); // Legacy support
}

// Create routes for all definition types
createDefinitionRoutes('quests', 'quests.json');
createDefinitionRoutes('npcs', 'npcs.json');
createDefinitionRoutes('items', 'items.json');
createDefinitionRoutes('enemies', 'enemies.json');
createDefinitionRoutes('skills', 'skills.json');

// --- FX SYSTEM API ---
router.get('/fx/list', async (req, res) => {
    const dir = path.join(projectService.getActiveProject(), 'data', 'fx');
    try {
        await ensureDir(dir);
        const files = await fs.readdir(dir);
        const jsonFiles = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
        res.json(jsonFiles);
    } catch (e) { res.json([]); }
});

router.get('/fx/:name', async (req, res) => {
    if (!isSafeName(req.params.name)) return res.status(400).json({ error: 'Invalid FX name' });
    const filePath = path.join(projectService.getActiveProject(), 'data', 'fx', `${req.params.name}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (e) { res.status(404).json({ error: 'FX not found' }); }
});

router.post('/fx/save', async (req, res) => {
    const { name, config } = req.body;
    if (!name || !config) return res.status(400).json({ error: 'Missing name or config' });
    if (!isSafeName(name)) return res.status(400).json({ error: 'Invalid FX name' });
    const dir = path.join(projectService.getActiveProject(), 'data', 'fx');
    await ensureDir(dir);
    try {
        await safeFs.safeWriteFullPath(dir, path.join(dir, `${name}.json`), JSON.stringify(config, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Save failed' }); }
});

// GET /api/templates/:category - Scan definitions for individual files to use as templates
router.get('/templates/:category', async (req, res) => {
    const { category } = req.params; // e.g., 'npc', 'enemy', 'item'
    
    try {
        const isRoot = projectService.isRootProject();
        const projectDir = path.join(projectService.getDunyalarPath(), 'definitions');
        const engineDir = path.join(__dirname, '..', '..', 'public', 'dunyalar', 'definitions');
        
        const templates = new Map();

        const scan = async (dir, source) => {
            try {
                const files = await fs.readdir(dir);
                for (const file of files) {
                    if (file.endsWith('.json') && 
                        !['npcs.json', 'enemies.json', 'items.json', 'quests.json', 'skills.json', 'achievements.json', 'locales.json', 'variables.json', 'ui.json', 'music.json', 'campaign.json'].includes(file)) {
                        
                        try {
                            const content = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
                            // Basic heuristic to filter by category if needed, or just return all
                            // For now, return all individual JSONs as templates
                            templates.set(file.replace('.json', ''), {
                                id: file.replace('.json', ''),
                                name: content.name || file.replace('.json', ''),
                                desc: content.description || `Template from ${source}`,
                                data: content,
                                source: source
                            });
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        };

        // 1. Scan engine
        await scan(engineDir, 'engine');
        // 2. Scan project (overrides engine)
        if (!isRoot) await scan(projectDir, 'project');

        res.json(Array.from(templates.values()));
    } catch (err) {
        res.status(500).json({ error: 'Failed to list templates' });
    }
});

module.exports = router;
