const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const assetRegistry = require('../services/AssetRegistry');
const config = require('../config');
const { resolveUnderRoot } = require('../utils/pathGuard');
const { canAutomateMutation } = require('../utils/automationPolicy');
const ALLOWED_EXTENSIONS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.mp3','.ogg','.wav','.flac','.json','.glb','.gltf','.obj','.mtl','.vox','.pal','.blend','.frag','.vert','.atlas','.txt','.md','.html','.js','.css']);
const safeFs = require('../utils/safeFs');

// GET /api/assets - Get all assets from the centralized registry
router.get('/', async (req, res) => {
    try {
        const data = await assetRegistry.getRegistry();
        res.json(data);
    } catch (error) {
        console.error('Error fetching assets:', error);
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// POST /api/assets/rebuild - Force a refresh of the registry
router.post('/rebuild', async (req, res) => {
    try {
        const data = await assetRegistry.rebuild();
        res.json({ success: true, count: data.assets.length });
    } catch (error) {
        console.error('Error scanning assets:', error);
        res.status(500).json({ error: 'Failed to scan assets' });
    }
});

async function walkAssetFiles(dir, skipNames = new Set(['.DS_Store'])) {
    const results = [];
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') return results;
        throw err;
    }

    for (const entry of entries) {
        if (skipNames.has(entry.name) || entry.name.startsWith('.')) continue;
        if (entry.name.endsWith('.bak') || entry.name.includes('.tmp.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...(await walkAssetFiles(fullPath, skipNames)));
        } else if (entry.isFile()) {
            const stats = await fs.stat(fullPath);
            results.push({
                name: entry.name,
                path: fullPath,
                size: stats.size,
                modified: stats.mtime
            });
        }
    }
    return results;
}

async function readDefinitionsMap(dir, source, targetMap) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') return;
        throw err;
    }

    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        const stats = await fs.stat(fullPath);
        targetMap.set(entry.name, {
            name: entry.name,
            path: `dunyalar/definitions/${entry.name}`,
            size: stats.size,
            modified: stats.mtime,
            type: 'definition',
            source
        });
    }
}

// GET /api/assets/list - List all assets with metadata (legacy/utility)
router.get('/list', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const scope = typeof req.query.scope === 'string' ? req.query.scope.toLowerCase() : '';
        const include = typeof req.query.include === 'string' ? req.query.include.toLowerCase() : '';
        const assets = [];

        if (scope !== 'definitions') {
            const assetsDir = path.join(activeProject, 'assets');
            const projectAssets = await walkAssetFiles(assetsDir);
            assets.push(...projectAssets);
        }

        const includeDefinitions =
            scope === 'definitions' ||
            include === 'definitions' ||
            (scope !== 'assets' && include !== 'false' && include !== '0' && include !== 'assets');

        if (includeDefinitions) {
            const definitionsMap = new Map();
            const engineDefDir = path.join(config.PUBLIC_DIR, 'dunyalar', 'definitions');
            await readDefinitionsMap(engineDefDir, 'engine', definitionsMap);

            if (!isRoot) {
                const projectDefDir = path.join(activeProject, 'dunyalar', 'definitions');
                await readDefinitionsMap(projectDefDir, 'project', definitionsMap);
            }

            assets.push(...definitionsMap.values());
        }

        res.json(assets);
    } catch (error) {
        console.error('Error listing assets:', error);
        res.status(500).json({ error: 'Failed to list assets' });
    }
});

// POST /api/assets/upload - Upload an asset (Binary/Base64 support)
router.post('/upload', async (req, res) => {
    const { path: rawPath, content, isBase64 } = req.body || {};
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
        return res.status(400).json({ error: 'No path provided' });
    }
    if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Invalid content' });
    }
    if (typeof isBase64 !== 'boolean') {
        return res.status(400).json({ error: 'Invalid isBase64 flag' });
    }

    // FINDING-02: confine uploads to assets/ under project + block sensitive/automation-protected paths.
    let assetPath = rawPath.trim();
    if (!assetPath.startsWith('assets/') && !assetPath.includes('/assets/')) {
        // Force into assets/ namespace
        assetPath = 'assets/' + assetPath.replace(/^\/+/, '');
    }
    const ext = path.extname(assetPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({ error: 'Unsupported file extension: ' + ext });
    }
    if (!canAutomateMutation(assetPath).allowed) {
        return res.status(403).json({ error: 'Cannot modify protected files' });
    }
    try {
        const activeProject = projectService.getActiveProject();
        const fullPath = resolveUnderRoot(activeProject, assetPath);
        const insideAssets = assetPath.startsWith('assets/')
            ? resolveUnderRoot(path.join(activeProject, 'assets'), assetPath.slice('assets/'.length))
            : fullPath;

        // Security check
        if (!fullPath || !insideAssets) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        if (isBase64) {
            const base64Data = content.replace(/^data:[^;]*;base64,/, "");
            await safeFs.safeWriteFullPath(activeProject, fullPath, base64Data, 'base64');
        } else {
            await safeFs.safeWriteFullPath(activeProject, fullPath, content, 'utf8');
        }

        try {
            await assetRegistry.rebuild();
        } catch (rebuildErr) {
            console.error('[AssetManager:Upload] Registry rebuild failed:', rebuildErr.message);
        }

        console.log(`[AssetManager] Asset saved: ${assetPath}`);
        res.json({ success: true, path: assetPath });
    } catch (error) {
        console.error('[AssetManager:Upload] Error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// POST /api/assets/import - Import an asset from a base64 data URL (used by asset_manager.html)
router.post('/import', async (req, res) => {
    const { name, data, type } = req.body;
    if (typeof name !== 'string' || typeof data !== 'string') {
        return res.status(400).json({ error: 'Missing name or data' });
    }

    // Sanitize name: basename only + keep subdir depth sane
    const safeBase = path.basename(name);
    if (!safeBase || safeBase.includes('..')) return res.status(400).json({ error: 'Invalid name' });
    try {
        const activeProject = projectService.getActiveProject();
        const assetPath = path.join('assets', safeBase);
        const fullPath = resolveUnderRoot(activeProject, assetPath);

        if (!fullPath) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        // Strip any data URL prefix (data:<mime>;base64,...) to get raw base64
        const base64Data = String(data).replace(/^data:[^;]*;base64,/, '');
        await safeFs.safeWriteFullPath(activeProject, fullPath, base64Data, 'base64');

        // Refresh the registry so the new file is discoverable
        try { await assetRegistry.rebuild(); } catch (e) { console.error('[AssetManager:Import] Registry rebuild failed:', e.message); }

        res.json({
            success: true,
            asset: {
                id: assetPath,
                name,
                path: assetPath,
                type: type || 'other'
            }
        });
    } catch (error) {
        console.error('[AssetManager:Import] Error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// POST /api/assets/export - Export the asset registry as a downloadable JSON manifest blob
router.post('/export', async (req, res) => {
    try {
        const data = await assetRegistry.getRegistry();
        const manifest = {
            exportedAt: new Date().toISOString(),
            assets: Array.isArray(data) ? data : (data.assets || [])
        };
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="assets-export.json"');
        res.send(JSON.stringify(manifest, null, 2));
    } catch (error) {
        console.error('[AssetManager:Export] Error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// POST /api/background/upload - Save a generated background (base64 data URL) to the project
router.post('/background/upload', async (req, res) => {
    const { image } = req.body;
    if (typeof image !== 'string') {
        return res.status(400).json({ error: 'No image provided' });
    }

    try {
        const activeProject = projectService.getActiveProject();
        const assetPath = path.join('assets', 'background.gif');
        const fullPath = resolveUnderRoot(activeProject, assetPath);

        if (!fullPath) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        const base64Data = String(image).replace(/^data:[^;]*;base64,/, '');
        await safeFs.safeWriteFullPath(activeProject, fullPath, base64Data, 'base64');

        res.json({ success: true, path: assetPath });
    } catch (error) {
        console.error('[AssetManager:Background] Error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

router.post('/save-spritesheet', async (req, res) => {
    try {
        const dataUrl = req.body.image;
        if (typeof dataUrl !== 'string') {
            return res.status(400).send('No image data provided.');
        }

        const base64Data = dataUrl.replace(/^data:[^;]*;base64,/, "");
        const activeProject = projectService.getActiveProject();
        const spritesheetPath = path.join(activeProject, 'assets', 'platformer_spritesheet.png');
        
        await safeFs.safeWriteFullPath(activeProject, spritesheetPath, base64Data, 'base64');
        
        // Now, generate the atlas
        const atlas = {};
        const tSize = 16;
        const cols = 16;
        const totalTiles = 600;

        for (let i = 0; i < totalTiles; i++) {
            const x = (i % cols) * tSize;
            const y = Math.floor(i / cols) * tSize;
            atlas[i + 1] = { x, y, w: tSize, h: tSize };
        }

        const atlasPath = path.join(activeProject, 'assets', 'platformer_atlas.json');
        await safeFs.safeWriteFullPath(activeProject, atlasPath, JSON.stringify(atlas, null, 2), 'utf8');

        res.json({ success: true, message: 'Spritesheet and atlas saved.' });
    } catch (error) {
        console.error('[SERVER] Error saving spritesheet:', error);
        res.status(500).json({ success: false, message: 'Failed to save spritesheet.' });
    }
});

module.exports = router;
