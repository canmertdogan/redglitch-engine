const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');
const config = require('../config');
const { resolveUnderRoot } = require('../utils/pathGuard');

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

function mergeDefinitionArrays(engineItems, projectItems) {
    const merged = [];
    const indexByKey = new Map();
    const pushItem = (item) => {
        if (item == null) return;
        let key = null;
        if (typeof item === 'object') {
            if (item.id !== undefined && item.id !== null) key = `id:${item.id}`;
            else if (item.name !== undefined && item.name !== null) key = `name:${item.name}`;
        } else {
            key = `prim:${typeof item}:${String(item)}`;
        }
        if (key !== null && indexByKey.has(key)) {
            merged[indexByKey.get(key)] = item;
        } else {
            if (key !== null) indexByKey.set(key, merged.length);
            merged.push(item);
        }
    };
    engineItems.forEach(pushItem);
    projectItems.forEach(pushItem);
    return merged;
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
            const engineFilePath = path.join(config.PUBLIC_DIR, 'dunyalar', 'definitions', fileName);
            
            let engineData = null;
            
            // 1. Try to load engine core definitions (fallback/base)
            if (!isRoot) {
                try {
                    const engineRaw = await fs.readFile(engineFilePath, 'utf8');
                    engineData = safeParseJSON(engineRaw, 'engine def');
                } catch (e) {
                    if (e.code !== 'ENOENT') console.error(`[GameData:${typeName}] Error reading engine core:`, e.message);
                }
            }

            // 2. Load project definitions and merge
            let mergedData = engineData !== null ? engineData : [];
            try {
                const projectRaw = await fs.readFile(projectFilePath, 'utf8');
                const projectData = safeParseJSON(projectRaw, 'project def');
                
                if (Array.isArray(projectData)) {
                    const baseArr = Array.isArray(engineData) ? engineData : [];
                    mergedData = mergeDefinitionArrays(baseArr, projectData);
                } else if (projectData && typeof projectData === 'object') {
                    if (engineData && typeof engineData === 'object' && !Array.isArray(engineData)) {
                        mergedData = { ...stripProtoKeys({ ...engineData }), ...stripProtoKeys({ ...projectData }) };
                    } else if (!Array.isArray(engineData) || engineData.length === 0) {
                        // Allow object-shaped definitions (e.g. variables.json) when engine core
                        // has no data or only an empty [] placeholder.
                        mergedData = { ...stripProtoKeys({ ...projectData }) };
                    }
                }
            } catch (err) {
                // If project file is missing, we just use engine data or empty array
                if (err.code !== 'ENOENT') console.error(`[GameData:${typeName}] Error reading project definitions:`, err.message);
                if (isRoot) {
                    try {
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

router.delete('/fx/:name', async (req, res) => {
    if (!isSafeName(req.params.name)) return res.status(400).json({ error: 'Invalid FX name' });
    const dir = path.join(projectService.getActiveProject(), 'data', 'fx');
    const filePath = resolveUnderRoot(dir, `${req.params.name}.json`);
    if (!filePath) return res.status(403).json({ error: 'Access denied' });
    try {
        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'FX not found' });
        console.error('[GameData:FX] Delete error:', err.message);
        res.status(500).json({ error: 'Delete failed' });
    }
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
