const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const assetRegistry = require('../services/AssetRegistry');
const { resolveUnderRoot } = require('../utils/pathGuard');
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
    console.log('[AssetRegistry] Rebuild request received');
    try {
        const data = await assetRegistry.rebuild();
        res.json({ success: true, count: data.assets.length });
    } catch (error) {
        console.error('Error scanning assets:', error);
        res.status(500).json({ error: 'Failed to scan assets' });
    }
});

// GET /api/assets/list - List all assets with metadata (legacy/utility)
router.get('/list', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const assetsDir = path.join(activeProject, 'assets');
        
        const assets = [];
        
        try {
            const files = await fs.readdir(assetsDir, { withFileTypes: true });
            for (const file of files) {
                if (file.isFile()) {
                    const filePath = path.join(assetsDir, file.name);
                    const stats = await fs.stat(filePath);
                    assets.push({
                        name: file.name,
                        path: filePath,
                        size: stats.size,
                        modified: stats.mtime
                    });
                }
            }
        } catch (err) {
            // Assets directory might not exist yet
            if (err.code !== 'ENOENT') throw err;
        }
        
        res.json(assets);
    } catch (error) {
        console.error('Error listing assets:', error);
        res.status(500).json({ error: 'Failed to list assets' });
    }
});

// POST /api/assets/upload - Upload an asset (Binary/Base64 support)
router.post('/upload', async (req, res) => {
    const { path: assetPath, content, isBase64 } = req.body;
    if (!assetPath) return res.status(400).json({ error: 'No path provided' });

    try {
        const activeProject = projectService.getActiveProject();
        const fullPath = resolveUnderRoot(activeProject, assetPath);
        
        // Security check
        if (!fullPath) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        if (isBase64) {
            const base64Data = content.replace(/^data:image\/png;base64,/, "");
            await safeFs.safeWriteFullPath(activeProject, fullPath, base64Data, 'base64');
        } else {
            await safeFs.safeWriteFullPath(activeProject, fullPath, content, 'utf8');
        }

        console.log(`[AssetManager] Asset saved: ${assetPath}`);
        res.json({ success: true, path: assetPath });
    } catch (error) {
        console.error('[AssetManager:Upload] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/save-spritesheet', async (req, res) => {
    try {
        const dataUrl = req.body.image;
        if (!dataUrl) {
            return res.status(400).send('No image data provided.');
        }

        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        const activeProject = projectService.getActiveProject();
        const spritesheetPath = path.join(activeProject, 'assets', 'platformer_spritesheet.png');
        
        await safeFs.safeWriteFullPath(activeProject, spritesheetPath, base64Data, 'base64');
        
        console.log('[SERVER] Spritesheet saved to:', spritesheetPath);

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

        console.log('[SERVER] Atlas saved to:', atlasPath);

        res.json({ success: true, message: 'Spritesheet and atlas saved.' });
    } catch (error) {
        console.error('[SERVER] Error saving spritesheet:', error);
        res.status(500).json({ success: false, message: 'Failed to save spritesheet.' });
    }
});

module.exports = router;
