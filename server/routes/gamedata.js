const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');

function stripProtoKeys(o){ if(o && typeof o==='object'){ for(const k of Object.keys(o)) if(k==='__proto__'||k==='constructor'||k==='prototype') delete o[k]; } return o; }
function safeParseJSON(raw, label) { try { return JSON.parse(raw); } catch { const e=new Error('Invalid JSON in '+label); e.code='INVALID_JSON'; throw e; } }
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
    const singularAliases = {
        quests: 'quest',
        npcs: 'npc',
        items: 'item',
        enemies: 'enemy',
        skills: 'skill',
    };
    const singularType = singularAliases[typeName];
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
                    mergedData = safeParseJSON(engineRaw, 'engine def');
                } catch (e) {
                    if (e.code !== 'ENOENT') console.error(`[GameData:${typeName}] Error reading engine core:`, e.message);
                }
            }

            // 2. Load project definitions and merge
            try {
                const projectRaw = await fs.readFile(projectFilePath, 'utf8');
                const projectData = safeParseJSON(projectRaw, 'project def');
                
                if (Array.isArray(projectData)) {
                    // Merge arrays by ID (project items override engine items)
                    if (!Array.isArray(mergedData)) mergedData = [];
                    const itemMap = new Map();
                    mergedData.forEach(item => { if (item.id) itemMap.set(item.id, item); });
                    projectData.forEach(item => { if (item.id) itemMap.set(item.id, item); });
                    mergedData = Array.from(itemMap.values());
                } else if (projectData && typeof projectData === 'object' && !Array.isArray(mergedData)) {
                    // Only merge object-on-object. If the engine core produced an
                    // array but the project file is an object, keep the array form
                    // rather than spreading the array into an object (corrupts shape).
                    mergedData = { ...mergedData, ...stripProtoKeys(projectData) };
                }
            } catch (err) {
                // If project file is missing, we just use engine data or empty array
                if (err.code !== 'ENOENT') console.error(`[GameData:${typeName}] Error reading project definitions:`, err.message);
                if (isRoot) {
                    // In root mode, if we failed to read project file (which is the engine file), we should try public
                    try {
                        const engineFilePath = path.join(__dirname, '..', '..', 'public', 'dunyalar', 'definitions', fileName);
                        const engineRaw = await fs.readFile(engineFilePath, 'utf8');
                        mergedData = safeParseJSON(engineRaw, 'engine def');
                    } catch(e) {
                        if (e.code !== 'ENOENT') console.error(`[GameData:${typeName}] Error reading engine fallback:`, e.message);
                    }
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
            if (req.body == null || typeof req.body !== 'object') {
                return res.status(400).json({ error: 'Invalid request body' });
            }
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

    const postRoutes = [`/${typeName}`, `/${typeName}-defs`];
    if (singularType) postRoutes.push(`/${singularType}-defs`);
    router.post(postRoutes, saveHandler);
}

// Create routes for all definition types
createDefinitionRoutes('quests', 'quests.json');
createDefinitionRoutes('npcs', 'npcs.json');
createDefinitionRoutes('items', 'items.json');
createDefinitionRoutes('enemies', 'enemies.json');
createDefinitionRoutes('skills', 'skills.json');
createDefinitionRoutes('variables', 'variables.json');

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
        res.json(safeParseJSON(data, 'fx'));
    } catch (e) { res.status(404).json({ error: 'FX not found' }); }
});

router.post('/fx/save', async (req, res) => {
    const { name, config } = req.body;
    if (typeof name !== 'string' || typeof config !== 'object' || config === null) {
        return res.status(400).json({ error: 'Missing name or config' });
    }
    if (!isSafeName(name)) return res.status(400).json({ error: 'Invalid FX name' });
    const dir = path.join(projectService.getActiveProject(), 'data', 'fx');
    try { await ensureDir(dir); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    try {
        await safeFs.safeWriteFullPath(dir, path.join(dir, `${name}.json`), JSON.stringify(config, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Save failed' }); }
});

// GET /api/templates/:category - Scan definitions for individual files to use as templates
const ALLOWED_TEMPLATE_CATEGORIES = new Set(['npc','enemy','item','skill','quest','variable','variables','npcs','enemies','items','skills','quests','fx','ui']);
router.get('/templates/:category', async (req, res) => {
    const { category } = req.params; // e.g., 'npc', 'enemy', 'item'
    if (typeof category !== 'string' || !category.trim() || !ALLOWED_TEMPLATE_CATEGORIES.has(category)) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
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
                            const content = safeParseJSON(await fs.readFile(path.join(dir, file), 'utf8'), 'template');
                            // Basic heuristic to filter by category if needed, or just return all
                            // For now, return all individual JSONs as templates
                            templates.set(file.replace('.json', ''), {
                                id: file.replace('.json', ''),
                                name: content.name || file.replace('.json', ''),
                                desc: content.description || `Template from ${source}`,
                                data: content,
                                source: source
                            });
                        } catch (e) {
                            if (e.code !== 'ENOENT') console.error(`[Templates:${category}] Error parsing template file:`, e);
                        }
                    }
                }
            } catch (e) {
                if (e.code !== 'ENOENT') console.error(`[Templates:${category}] Error scanning ${source} dir:`, e);
            }
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
