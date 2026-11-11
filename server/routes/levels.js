const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const PROJECTS_ROOT = path.resolve(__dirname, '..', '..', 'projects');
const { resolveUnderRoot } = require('../utils/pathGuard');
const safeFs = require('../utils/safeFs');
const fsUtils = require('../utils/fsUtils');

function sanitizeProjectName(name) {
    return (name || '').replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
}

function safeLevelFileName(filename) {
    // FINDING-18/basename: strict basename + isSafeLevelId check (blocks ..\\, hidden, .json-only)
    const base = path.basename(String(filename || ''));
    if (!base.endsWith('.json')) return null;
    const stem = base.slice(0, -5);
    if (!isSafeLevelId(stem)) return null;
    return base;
}
function isSafeLevelId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

function isValidEngineType(value) {
    return ['rpg-topdown', 'iso-pixel', 'platformer-2d', 'topdown-3d', 'fps-3d', 'platformer-3d', 'unified-3d'].includes(value);
}

function normalizeEngineType(rawType) {
    if (!rawType || typeof rawType !== 'string') return null;
    if (rawType === 'rpg-topdown' || rawType === 'topdown' || rawType === 'rpg') return 'rpg-topdown';
    if (rawType === 'iso-pixel' || rawType === 'iso' || rawType === 'isometric') return 'iso-pixel';
    if (rawType === 'platformer-2d' || rawType === 'platformer' || rawType === 'plt') return 'platformer-2d';
    return null;
}

function inferEngineTypeFromLevelData(data) {
    if (!data || typeof data !== 'object') return 'rpg-topdown';
    const normalized = normalizeEngineType(data.engineType || data.type || data.metadata?.engineType || data.metadata?.type);
    if (normalized) return normalized;

    if (data.spawn && typeof data.spawn === 'object' && Array.isArray(data.collision) && !Array.isArray(data.layers)) {
        return 'platformer-2d';
    }
    if (Array.isArray(data.grid)) {
        return 'iso-pixel';
    }
    if (Array.isArray(data.layers)) {
        return 'rpg-topdown';
    }
    return 'rpg-topdown';
}

function normalizeLevelPayload(payload, forcedEngineType = null) {
    const level = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? { ...payload } : {};
    const engineType = forcedEngineType || inferEngineTypeFromLevelData(level);
    level.engineType = engineType;
    if (!level.type) {
        level.type = engineType === 'iso-pixel' ? 'isometric' : engineType;
    }
    // Canonical level guarantees (F-LEVEL): name/id/version defaults + spawn/goal normalization
    if (!level.name && level.metadata?.name) level.name = level.metadata.name;
    if (!level.version) level.version = '1.0';
    // Normalize spawn: object {x,y} wins; pixel spawnX/spawnY -> spawn object (tile->pixel conversion handled by runtime)
    if (!level.spawn || typeof level.spawn !== 'object') {
        if (typeof level.spawnX === 'number' && typeof level.spawnY === 'number') {
            level.spawn = { x: level.spawnX, y: level.spawnY };
        } else if (level.spawn == null) {
            level.spawn = { x: 0, y: 0 };
        }
    }
    if (level.spawn && typeof level.spawn === 'object') {
        level.spawn = { x: Number(level.spawn.x) || 0, y: Number(level.spawn.y) || 0 };
        // Keep legacy spawnX/spawnY in sync (pixels)
        if (level.spawnX === undefined) level.spawnX = level.spawn.x;
        if (level.spawnY === undefined) level.spawnY = level.spawn.y;
    }
    // Normalize goal/exit: goal wins, copy to exit for compat
    const goal = level.goal || level.exit || null;
    if (goal && typeof goal === 'object' && Number.isFinite(goal.x)) {
        level.goal = { x: Number(goal.x), y: Number(goal.y) || 0 };
        if (!level.exit) level.exit = { ...level.goal };
    } else {
        // Levels without goal/exit cannot be completed — default far corner so they remain loadable but clearly incomplete
        if (!level.goal && !level.exit) level.goal = { x: 0, y: 0 };
    }
    return level;
}

function resolveProjectPath(project) {
    const safeName = sanitizeProjectName(project);
    if (!safeName || safeName !== project) {
        return null;
    }
    return resolveUnderRoot(PROJECTS_ROOT, safeName);
}

// ensureDir moved to fsUtils.js

// Get all levels (generic list)
router.get('/', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const mainDunyalarDir = isRoot
            ? path.join(__dirname, '..', '..', 'public', 'dunyalar')
            : path.join(activeProject, 'dunyalar');
        
        console.log(`[API] levels/ - checking: ${mainDunyalarDir}`);
        
        const levels = [];
        try {
            const files = await fs.readdir(mainDunyalarDir).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(mainDunyalarDir, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const data = JSON.parse(content);
                    
                    levels.push({
                        id: file.replace('.json', ''),
                        filename: file,
                        name: data.name || data.metadata?.name || file.replace('.json', ''),
                        engineType: inferEngineTypeFromLevelData(data),
                        path: file
                    });
                } catch (e) {
                    console.warn(`[API] levels/ - Failed to parse level file: ${file}`, e.message);
                }
            }
        } catch (e) {
            console.warn(`[API] levels/ - Directory not found or inaccessible: ${mainDunyalarDir}`);
        }
        
        res.json({ levels });
    } catch (err) {
        console.error('Error listing all levels:', err);
        res.status(500).json({ error: 'Failed to list levels' });
    }
});

// Save platformer level
router.post('/save-level', async (req, res) => {
    try {
        const { project, levelId, data } = req.body;
        
        if (!project || !levelId || !data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (!isSafeLevelId(levelId)) {
            return res.status(400).json({ error: 'Invalid level id' });
        }

        const projectPath = resolveProjectPath(project);
        if (!projectPath) {
            return res.status(400).json({ error: 'Invalid project name' });
        }
        const levelDir = path.join(projectPath, 'dunyalar');
        const levelPath = path.join(levelDir, `${levelId}.json`);
        
        // Ensure directory exists
        await fs.mkdir(levelDir, { recursive: true });
        
        // Save level
        const normalizedData = normalizeLevelPayload(data, 'platformer-2d');
        await safeFs.safeWriteFullPath(levelDir, levelPath, JSON.stringify(normalizedData, null, 2), 'utf8');
        
        console.log(`[SaveLevel] Saved ${levelId} to ${project}`);
        res.json({ success: true, path: levelPath });
    } catch (error) {
        console.error('[SaveLevel] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List platformer levels for a project
router.get('/platformer-levels/:project', async (req, res) => {
    try {
        const { project } = req.params;
        const projectPath = resolveProjectPath(project);
        if (!projectPath) {
            return res.status(400).json({ error: 'Invalid project name' });
        }
        const levelDir = path.join(projectPath, 'dunyalar');
        
        const files = await fs.readdir(levelDir).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        res.json(jsonFiles);
    } catch (error) {
        console.error('[PlatformerLevels] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete platformer level
router.post('/delete-level', async (req, res) => {
    try {
        const { project, levelId } = req.body;
        
        if (!project || !levelId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (!isSafeLevelId(levelId)) {
            return res.status(400).json({ error: 'Invalid level id' });
        }

        const projectPath = resolveProjectPath(project);
        if (!projectPath) {
            return res.status(400).json({ error: 'Invalid project name' });
        }
        const levelPath = path.join(projectPath, 'dunyalar', `${levelId}.json`);
        
        await fs.unlink(levelPath);
        
        console.log(`[DeleteLevel] Deleted ${levelId} from ${project}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[DeleteLevel] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all levels
router.get('/levels', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const targetDir = isRoot
            ? path.join(__dirname, '..', '..', 'public', 'dunyalar')
            : path.join(activeProject, 'dunyalar');

        const files = await fs.readdir(targetDir);
        const levels = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
        res.json({ levels });
    } catch (err) {
        res.json({ levels: [] });
    }
});

// Get a single level by filename
router.get('/levels/:filename', async (req, res) => {
    const { filename } = req.params;
    const safeName = safeLevelFileName(filename);
    if (!safeName) {
        return res.status(400).json({ error: 'Filename must end with .json' });
    }
    const activeProject = projectService.getActiveProject();
    const isRoot = projectService.isRootProject();
    const targetDir = isRoot
        ? path.join(__dirname, '..', '..', 'public', 'dunyalar')
        : path.join(activeProject, 'dunyalar');
    const filePath = path.join(targetDir, safeName);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        let _p; try { _p = JSON.parse(data); } catch { return res.status(500).json({ error: 'Level file corrupted' }); } res.json(_p);
    } catch (err) {
        res.status(404).json({ error: 'Level not found' });
    }
});
// Save level (generic)
router.post('/levels/:filename', async (req, res) => {
    const { filename } = req.params;
    const safeName = safeLevelFileName(filename);
    if (!safeName) {
        return res.status(400).json({ error: 'Filename must end with .json' });
    }
    const activeProject = projectService.getActiveProject();
    const isRoot = projectService.isRootProject();
    const targetDir = isRoot
        ? path.join(__dirname, '..', '..', 'public', 'dunyalar')
        : path.join(activeProject, 'dunyalar');

    const filePath = path.join(targetDir, safeName);
    console.log(`[SERVER] Attempting to save level to (ABSOLUTE): ${filePath}`);
    
    try {
        await fsUtils.ensureDir(path.dirname(filePath));
        console.log(`[SERVER] Directory verified: ${path.dirname(filePath)}`);
        const normalizedLevel = normalizeLevelPayload(req.body);
        await safeFs.safeWriteFullPath(targetDir, filePath, JSON.stringify(normalizedLevel, null, 2), 'utf8');
        console.log(`[SERVER] Level saved successfully: ${safeName}`);
        res.json({ success: true });
    } catch (e) {
        console.error(`[SERVER] Error saving level: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Delete level (generic)
router.delete('/levels/:filename', async (req, res) => {
    const { filename } = req.params;
    const safeName = safeLevelFileName(filename);
    if (!safeName) {
        return res.status(400).json({ error: 'Filename must end with .json' });
    }
    
    const activeProject = projectService.getActiveProject();
    const isRoot = projectService.isRootProject();
    const targetDir = isRoot
        ? path.join(__dirname, '..', '..', 'public', 'dunyalar')
        : path.join(activeProject, 'dunyalar');
    
    const filePath = path.join(targetDir, safeName);
    console.log(`[SERVER] Attempting to delete level: ${filePath}`);
    
    try {
        // Check if file exists
        await fs.access(filePath);
        
        // Delete the file
        await fs.unlink(filePath);
        console.log(`[SERVER] Level deleted successfully: ${safeName}`);
        res.json({ success: true, message: `Level '${safeName}' deleted` });
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`[SERVER] Level not found: ${safeName}`);
            res.status(404).json({ error: 'Level file not found' });
        } else {
            console.error(`[SERVER] Error deleting level: ${err.message}`);
            res.status(500).json({ error: 'Failed to delete level' });
        }
    }
});

// List files in a directory (handles 'levels' as a dir parameter)
router.get('/files/:dir', async (req, res) => {
    const { dir } = req.params;
    let targetDir = '';
    
    const activeProject = projectService.getActiveProject();
    const isRoot = projectService.isRootProject();

    if (dir === 'music') {
        targetDir = isRoot ? path.join(__dirname, '..', '..', 'public', 'muzikler') : path.join(activeProject, 'muzikler');
    } else if (dir === 'assets') {
        targetDir = isRoot ? path.join(__dirname, '..', '..', 'public', 'base_game', 'assets') : path.join(activeProject, 'assets');
    } else if (dir === 'levels') {
        targetDir = isRoot ? path.join(__dirname, '..', '..', 'public', 'dunyalar') : path.join(activeProject, 'dunyalar');
    } else return res.status(400).json({ error: 'Invalid directory key' });

    try {
        await fsUtils.ensureDir(targetDir);
        const files = await fs.readdir(targetDir);
        const fileList = [];
        for (const f of files) {
            const stat = await fs.stat(path.join(targetDir, f));
            if (stat.isFile()) fileList.push(f);
        }
        res.json(fileList);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// Get levels by engine type
router.get('/levels/by-engine/:engineType', async (req, res) => {
    try {
        if (!isValidEngineType(req.params.engineType)) {
            return res.status(400).json({ error: 'Invalid engine type' });
        }
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const mainDunyalarDir = isRoot
            ? path.join(__dirname, '..', '..', 'public', 'dunyalar')
            : path.join(activeProject, 'dunyalar');
        
        console.log(`[API] levels/by-engine/${req.params.engineType} - checking: ${mainDunyalarDir}`);
        
        const dirsToScan = [mainDunyalarDir];
        const levelsByEngine = [];
        
        for (const dir of dirsToScan) {
            try {
                const files = await fs.readdir(dir);
                const jsonFiles = files.filter(f => f.endsWith('.json'));
                
                for (const file of jsonFiles) {
                    try {
                        const filePath = path.join(dir, file);
                        const content = await fs.readFile(filePath, 'utf8');
                        const data = JSON.parse(content);
                        
                        const standardizedType = inferEngineTypeFromLevelData(data);
                        
                        if (standardizedType === req.params.engineType) {
                            levelsByEngine.push({
                                id: file.replace('.json', ''),
                                filename: file,
                                name: data.name || data.metadata?.name || file.replace('.json', ''),
                                engineType: standardizedType,
                                path: file
                            });
                        }
                    } catch (e) {
                        console.warn(`[API] levels/by-engine - Failed to parse level file: ${file}`, e.message);
                    }
                }
            } catch (e) {
                console.warn(`[API] levels/by-engine - Directory not found or inaccessible: ${dir}`, e.message);
            }
        }
        
        res.json({ levels: levelsByEngine });
    } catch (err) {
        console.error('Error listing levels:', err);
        res.status(500).json({ error: 'Failed to list levels' });
    }
});

module.exports = router;
// Additive exports for in-process reuse by headless callers (e.g.
// projectvertex) — mirrors the pattern already used in levels3d.js.
module.exports.normalizeLevelPayload = normalizeLevelPayload;
module.exports.inferEngineTypeFromLevelData = inferEngineTypeFromLevelData;
module.exports.isSafeLevelId = isSafeLevelId;
module.exports.resolveProjectPath = resolveProjectPath;
