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
        'ui:click': {
            group: 'sfx',
            clips: [],
            priority: false,
            reverb: 0,
            filter: { type: 'lowpass', freq: 20000 },
            playback: { mode: 'random', volume: 0.8, volumeVar: 0.05, pitchVar: 0.05, cooldown: 0.05, fadeIn: 0, fadeOut: 0 },
            clipMeta: {}
        }
    },
    buses: {
        master:   { gain: 1.0 },
        music:    { gain: 0.7, parent: 'master', ducking: true },
        sfx:      { gain: 0.9, parent: 'master' },
        ambience: { gain: 0.6, parent: 'master', ducking: true },
        voice:    { gain: 1.0, parent: 'master' },
        ui:       { gain: 0.8, parent: 'master' }
    }
};

// Default Music Context Structure
const DEFAULT_MUSIC_CONFIG = {
    global: {
        main_menu: '',
        credits: ''
    },
    levels: {},
    events: {}
};

// ─── GET /api/audio/map ──────────────────────────────────────
router.get('/map', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const mapPath = path.join(activeProject, 'data', 'audio_map.json');
        try {
            const data = await fs.readFile(mapPath, 'utf8');
            res.json(JSON.parse(data));
        } catch (err) {
            console.log('[AudioRouter] audio_map.json not found, returning defaults');
            res.json(DEFAULT_AUDIO_MAP);
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to load audio map' });
    }
});

// ─── POST /api/audio/map ─────────────────────────────────────
router.post('/map', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const dataDir = path.join(activeProject, 'data');
        const mapPath = path.join(dataDir, 'audio_map.json');
        await ensureDir(dataDir);
        const content = JSON.stringify(req.body, null, 2);
        await safeFs.safeWriteFullPath(activeProject, mapPath, content, 'utf8');
        console.log('[AudioRouter] audio_map.json saved');
        res.json({ success: true });
    } catch (error) {
        console.error('[AudioRouter:SaveMap] Error:', error);
        res.status(500).json({ error: 'Failed to save audio map' });
    }
});

// ─── GET /api/audio/music-config ────────────────────────────
// Music context → file mapping (used by MUSIC tab in Audio Studio)
router.get('/music-config', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const configPath = path.join(activeProject, 'data', 'music.json');
        try {
            const data = await fs.readFile(configPath, 'utf8');
            res.json(JSON.parse(data));
        } catch (err) {
            // Try legacy location
            try {
                const legacyPath = path.join(activeProject, 'dunyalar', 'definitions', 'music.json');
                const data = await fs.readFile(legacyPath, 'utf8');
                res.json(JSON.parse(data));
            } catch(e) {
                res.json(DEFAULT_MUSIC_CONFIG);
            }
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to load music config' });
    }
});

// ─── POST /api/audio/music-config ───────────────────────────
router.post('/music-config', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const dataDir = path.join(activeProject, 'data');
        const configPath = path.join(dataDir, 'music.json');
        await ensureDir(dataDir);
        const content = JSON.stringify(req.body, null, 2);
        await safeFs.safeWriteFullPath(activeProject, configPath, content, 'utf8');
        console.log('[AudioRouter] music.json saved');
        res.json({ success: true });
    } catch (error) {
        console.error('[AudioRouter:SaveMusicConfig] Error:', error);
        res.status(500).json({ error: 'Failed to save music config' });
    }
});

// ─── GET /api/audio/assets ───────────────────────────────────
// Returns list of audio files from project/global muzikler directory
router.get('/assets', async (req, res) => {
    const audioExts = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac', '.opus', '.json']);

    async function scanDir(dirPath) {
        const results = [];
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const ext = path.extname(entry.name).toLowerCase();
                if (entry.isFile() && audioExts.has(ext)) {
                    let sizeMb = null;
                    try {
                        const stat = await fs.stat(fullPath);
                        sizeMb = +(stat.size / 1024 / 1024).toFixed(2);
                    } catch(e) {
                        if (e.code !== 'ENOENT') console.error('[Audio] Error stat-ing audio file:', e);
                    }
                    results.push({ name: entry.name, ext, sizeMb });
                }
            }
        } catch(e) {
            if (e.code !== 'ENOENT') console.error('[Audio] Error scanning audio dir:', e);
        }
        return results;
    }

    try {
        const activeProject = projectService.getActiveProject();
        const projectDir = path.join(activeProject, 'muzikler');
        const globalDir  = path.join(__dirname, '..', '..', 'public', 'muzikler');

        const [projectFiles, globalFiles] = await Promise.all([
            scanDir(projectDir),
            scanDir(globalDir)
        ]);

        // Merge, project files take precedence
        const seen = new Set();
        const merged = [];
        for (const f of [...projectFiles, ...globalFiles]) {
            if (!seen.has(f.name)) {
                seen.add(f.name);
                merged.push(f);
            }
        }

        merged.sort((a, b) => a.name.localeCompare(b.name));
        res.json(merged);
    } catch (error) {
        res.status(500).json({ error: 'Failed to scan audio assets' });
    }
});

// ─── GET /api/audio/discover-events ─────────────────────────
// Scan project for EventBus emit calls to auto-discover potential events
router.get('/discover-events', async (req, res) => {
    res.json([
        'player:footstep', 'player:jump', 'player:land', 'player:hurt', 'player:death',
        'player:attack', 'player:dodge', 'player:respawn',
        'enemy:spawn', 'enemy:alert', 'enemy:hurt', 'enemy:death', 'enemy:attack',
        'projectile:fire', 'projectile:hit', 'ability:cast',
        'level:start', 'level:complete', 'level:fail', 'checkpoint',
        'item:pickup', 'item:use', 'door:open', 'door:close',
        'ui:click', 'ui:hover', 'ui:open', 'ui:close', 'ui:error', 'ui:success', 'ui:tab:switch',
        'ambient:forest', 'ambient:dungeon', 'ambient:boss_area', 'ambient:underwater',
        'ai:thought', 'ai:token', 'ai:ready', 'ai:error'
    ]);
});

module.exports = router;
