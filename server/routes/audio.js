const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');

// Helper to ensure directory exists
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

// Default Audio Map Structure
const DEFAULT_AUDIO_MAP = {
    events: {
        "ui:click": {
            "group": "sfx",
            "clips": ["click.mp3"],
            "playback": { "mode": "random", "volume": 0.5, "pitchVar": 0.05 }
        }
    },
    buses: {
        "master": { "gain": 1.0 },
        "music": { "gain": 0.6, "parent": "master" },
        "sfx": { "gain": 0.8, "parent": "master" },
        "ambience": { "gain": 0.5, "parent": "master" }
    }
};

// GET /api/audio/map - Load the current audio mapping
router.get('/map', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const mapPath = path.join(activeProject, 'data', 'audio_map.json');
        
        try {
            const data = await fs.readFile(mapPath, 'utf8');
            res.json(JSON.parse(data));
        } catch (err) {
            // If file doesn't exist, return default and potentially save it
            console.log('[AudioRouter] AudioMap.json not found, returning defaults');
            res.json(DEFAULT_AUDIO_MAP);
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to load audio map' });
    }
});

// POST /api/audio/map - Save the audio mapping
router.post('/map', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const dataDir = path.join(activeProject, 'data');
        const mapPath = path.join(dataDir, 'audio_map.json');
        
        await ensureDir(dataDir);
        
        const content = JSON.stringify(req.body, null, 2);
        await safeFs.safeWriteFullPath(activeProject, mapPath, content, 'utf8');
        
        console.log('[AudioRouter] AudioMap saved successfully');
        res.json({ success: true });
    } catch (error) {
        console.error('[AudioRouter:Save] Error:', error);
        res.status(500).json({ error: 'Failed to save audio map' });
    }
});

// GET /api/audio/events - Scan project files for EventBus.emit calls to discover potential audio events
router.get('/discover-events', async (req, res) => {
    // This could be a complex regex scan of the codebase to find events
    // For now, return a placeholder list of common events
    res.json([
        "player:jump", "player:land", "player:hurt", "player:death",
        "enemy:spawn", "enemy:hurt", "enemy:death", "enemy:attack",
        "ui:click", "ui:hover", "ui:open", "ui:close",
        "item:pickup", "item:use", "level:start", "level:complete"
    ]);
});

module.exports = router;
