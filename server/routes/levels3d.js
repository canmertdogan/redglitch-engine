/**
 * levels3d.js — Server routes for 3D engine level files.
 *
 * Routes:
 *   GET  /api/levels3d/:project/:level  — read a 3D level JSON file
 *   POST /api/levels3d/:project/:level  — write (save) a 3D level JSON file
 *
 * Levels are stored at:
 *   projects/<project>/dunyalar/<level>.json
 *
 * The same dunyalar/ directory used by 2D engines is reused for 3D
 * levels to keep project structure consistent. 3D levels are
 * distinguished by their `engineType` field ('topdown-3d', 'fps-3d',
 * 'platformer-3d').
 */

const express      = require('express');
const router       = express.Router();
const path         = require('path');
const fs           = require('fs').promises;
const { resolveUnderRoot } = require('../utils/pathGuard');

const PROJECTS_ROOT = path.resolve(__dirname, '..', '..', 'projects');

const VALID_3D_ENGINE_TYPES = ['unified-3d', 'topdown-3d', 'fps-3d', 'platformer-3d'];
const LEVEL_SCHEMA_VERSION  = '1.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeProject(name) {
    return (name || '').replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
}

function isSafeLevelId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

function resolveProjectPath(projectName) {
    const safe = sanitizeProject(projectName);
    if (!safe || safe !== projectName) return null;
    return path.join(PROJECTS_ROOT, safe);
}

function levelFilePath(projectDir, levelId) {
    // Build a relative path from PROJECTS_ROOT for the guard check
    const relPath = path.relative(PROJECTS_ROOT, path.join(projectDir, 'dunyalar', `${levelId}.json`));
    if (relPath.startsWith('..')) return null; // traversal attempt
    return resolveUnderRoot(PROJECTS_ROOT, relPath);
}

/**
 * Validate a 3D level payload.
 * Returns the normalised level object or throws on hard errors.
 *
 * For 'fps-3d' maps (produced by MapExporter.js) the full payload is
 * preserved as-is; only the engineType field is validated strictly.
 * For other engine types the legacy schema normalisation is applied.
 */
function validateLevel3D(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Level data must be a JSON object');
    }
    if (raw.engineType && !VALID_3D_ENGINE_TYPES.includes(raw.engineType)) {
        throw new Error(`Invalid engineType "${raw.engineType}". Must be one of: ${VALID_3D_ENGINE_TYPES.join(', ')}`);
    }

    // fps-3d maps carry voxelGrid, palette, lights, emissiveBlocks, etc.
    // Pass through all fields and only add missing top-level identifiers.
    if (raw.engineType === 'fps-3d') {
        return {
            ...raw,
            version:    raw.version    || LEVEL_SCHEMA_VERSION,
            engineType: 'fps-3d',
            name:       typeof raw.name === 'string' ? raw.name : (raw.mapName || 'Untitled Level'),
        };
    }

    if (raw.engineType === 'unified-3d') {
        return {
            ...raw,
            version:    raw.version    || LEVEL_SCHEMA_VERSION,
            engineType: 'unified-3d',
            mode:       typeof raw.mode === 'string' ? raw.mode : 'fps-3d',
            name:       typeof raw.name === 'string' ? raw.name : (raw.mapName || 'Untitled Level'),
        };
    }

    // platformer-3d: full schema pass-through (Phase 56)
    if (raw.engineType === 'platformer-3d') {
        return {
            version:      raw.version    || LEVEL_SCHEMA_VERSION,
            engineType:   'platformer-3d',
            id:           typeof raw.id   === 'string' ? raw.id   : 'level01',
            name:         typeof raw.name === 'string' ? raw.name : 'Untitled Level',
            sky:          raw.sky          || { topColor: 87, bottomColor: 23 },
            ambientLight: raw.ambientLight || { color: 0xffffff, intensity: 0.5 },
            lights:       Array.isArray(raw.lights)       ? raw.lights       : [],
            fog:          raw.fog          || { near: 40, far: 120 },
            deathY:       typeof raw.deathY === 'number'  ? raw.deathY       : -20,
            playerSpawn:  raw.playerSpawn  || { x: 0, y: 2, z: 0 },
            levelExit:    raw.levelExit    || null,
            platforms:    Array.isArray(raw.platforms)    ? raw.platforms    : [],
            paths:        Array.isArray(raw.paths)        ? raw.paths        : [],
            hazards:      Array.isArray(raw.hazards)      ? raw.hazards      : [],
            triggers:     Array.isArray(raw.triggers)     ? raw.triggers     : [],
            collectibles: Array.isArray(raw.collectibles) ? raw.collectibles : [],
            checkpoints:  Array.isArray(raw.checkpoints)  ? raw.checkpoints  : [],
            entities:     Array.isArray(raw.entities)     ? raw.entities     : [],
        };
    }

    // Legacy schema normalisation for topdown-3d
    return {
        version:    raw.version    || LEVEL_SCHEMA_VERSION,
        engineType: raw.engineType || 'topdown-3d',
        name:       typeof raw.name === 'string' ? raw.name : 'Untitled Level',
        geometry:   Array.isArray(raw.geometry)  ? raw.geometry  : [],
        entities:   Array.isArray(raw.entities)  ? raw.entities  : [],
        lights:     Array.isArray(raw.lights)    ? raw.lights    : [],
        navmesh:    raw.navmesh    != null  ? raw.navmesh  : null,
        skybox:     raw.skybox     != null  ? raw.skybox   : null,
        physics:    (raw.physics && typeof raw.physics === 'object') ? raw.physics : {},
    };
}

// ── GET /api/levels3d/:project/:level ─────────────────────────────────────────

router.get('/levels3d/:project/:level', async (req, res) => {
    const projectDir = resolveProjectPath(req.params.project);
    if (!projectDir) {
        return res.status(400).json({ error: 'Invalid project name' });
    }

    const levelId = req.params.level.replace(/\.json$/i, '');
    if (!isSafeLevelId(levelId)) {
        return res.status(400).json({ error: 'Invalid level id' });
    }

    const filePath = levelFilePath(projectDir, levelId);
    if (!filePath) {
        return res.status(400).json({ error: 'Path traversal detected' });
    }

    try {
        const raw  = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(raw);

        // Accept only 3D levels from this endpoint
        if (data.engineType && !VALID_3D_ENGINE_TYPES.includes(data.engineType)) {
            return res.status(400).json({ error: `Level "${levelId}" is not a 3D level (engineType: ${data.engineType})` });
        }

        res.json(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({ error: `Level "${levelId}" not found in project "${req.params.project}"` });
        }
        console.error('[levels3d] GET error:', err.message);
        res.status(500).json({ error: 'Failed to read level' });
    }
});

// ── POST /api/levels3d/:project/:level ────────────────────────────────────────

router.post('/levels3d/:project/:level', async (req, res) => {
    const projectDir = resolveProjectPath(req.params.project);
    if (!projectDir) {
        return res.status(400).json({ error: 'Invalid project name' });
    }

    const levelId = req.params.level.replace(/\.json$/i, '');
    if (!isSafeLevelId(levelId)) {
        return res.status(400).json({ error: 'Invalid level id' });
    }

    const filePath = levelFilePath(projectDir, levelId);
    if (!filePath) {
        return res.status(400).json({ error: 'Path traversal detected' });
    }

    let level;
    try {
        level = validateLevel3D(req.body);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    try {
        // Ensure dunyalar/ directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await safeFs.safeWriteFullPath(projectDir, filePath, JSON.stringify(level, null, 2), 'utf8');
        res.json({ ok: true, levelId, engineType: level.engineType });
    } catch (err) {
        console.error('[levels3d] POST error:', err.message);
        res.status(500).json({ error: 'Failed to save level' });
    }
});

// ── GET /api/levels3d/:project  (list) ───────────────────────────────────────

router.get('/levels3d/:project', async (req, res) => {
    const projectDir = resolveProjectPath(req.params.project);
    if (!projectDir) {
        return res.status(400).json({ error: 'Invalid project name' });
    }

    const dunyalarDir = path.join(projectDir, 'dunyalar');
    try {
        const entries = await fs.readdir(dunyalarDir);
        const levels3d = [];

        for (const entry of entries) {
            if (!entry.endsWith('.json')) continue;
            try {
                const raw  = await fs.readFile(path.join(dunyalarDir, entry), 'utf8');
                const data = JSON.parse(raw);
                if (VALID_3D_ENGINE_TYPES.includes(data.engineType)) {
                    levels3d.push({
                        id:         path.basename(entry, '.json'),
                        name:       data.name || path.basename(entry, '.json'),
                        engineType: data.engineType,
                        version:    data.version || LEVEL_SCHEMA_VERSION,
                    });
                }
            } catch (_) { /* skip malformed */ }
        }

        res.json({ levels: levels3d });
    } catch (err) {
        if (err.code === 'ENOENT') return res.json({ levels: [] });
        console.error('[levels3d] LIST error:', err.message);
        res.status(500).json({ error: 'Failed to list levels' });
    }
});

module.exports = router;
