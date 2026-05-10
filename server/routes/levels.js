const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const PROJECTS_ROOT = path.resolve(__dirname, '..', '..', 'projects');
const { resolveUnderRoot } = require('../utils/pathGuard');
const safeFs = require('../utils/safeFs');

function sanitizeProjectName(name) {
    return (name || '').replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
}

function isSafeLevelId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

function isValidEngineType(value) {
    return ['rpg-topdown', 'iso-pixel', 'platformer-2d', 'topdown-3d', 'fps-3d', 'platformer-3d'].includes(value);
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
    return level;
}

function resolveProjectPath(project) {
    const safeName = sanitizeProjectName(project);
    if (!safeName || safeName !== project) {
        return null;
    }
    return resolveUnderRoot(PROJECTS_ROOT, safeName);
}

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {}
}

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
        
        // Ensure directory exists
        await fs.mkdir(levelDir, { recursive: true });
        
        const files = await fs.readdir(levelDir);
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
        const levelPath = path.join(projectPath, 'dunyalar', 'platformer', `${levelId}.json`);
        
        await fs.unlink(levelPath);
        
        console.log(`[DeleteLevel] Deleted ${levelId} from ${project}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[DeleteLevel] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save level (generic)
router.post('/levels/:filename', async (req, res) => {
    const { filename } = req.params;
    const safeName = path.basename(filename); 
    if (!safeName.endsWith('.json')) {
        return res.status(400).json({ error: 'Filename must end with .json' });
    }
    
    // FIX: Match the logic in /api/files/levels so saved maps are visible
    const activeProject = projectService.getActiveProject();
    const isRoot = projectService.isRootProject();
    const targetDir = isRoot
        ? path.join(__dirname, '..', '..', 'public', 'dunyalar')
        : path.join(activeProject, 'dunyalar');

    const filePath = path.join(targetDir, safeName);
    console.log(`[SERVER] Attempting to save level to (ABSOLUTE): ${filePath}`);
    
    try {
        await ensureDir(path.dirname(filePath));
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
    const safeName = path.basename(filename);
    
    if (!safeName.endsWith('.json')) {
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
        await ensureDir(targetDir);
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
                    } catch (e) {}
                }
            } catch (e) {}
        }
        
        res.json({ levels: levelsByEngine });
    } catch (err) {
        console.error('Error listing levels:', err);
        res.status(500).json({ error: 'Failed to list levels' });
    }
});

module.exports = router;
rts = router;
