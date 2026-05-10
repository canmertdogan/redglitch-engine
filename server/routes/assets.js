const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const { resolveUnderRoot } = require('../utils/pathGuard');
const safeFs = require('../utils/safeFs');

// GET /api/assets - Get all assets
router.get('/', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        
        const registryPath = isRoot
            ? path.join(activeProject, 'public', 'data', 'assets.json')
            : path.join(activeProject, 'data', 'assets.json');
        
        let data = { assets: [] };
        try {
            const content = await fs.readFile(registryPath, 'utf8');
            data = JSON.parse(content);
        } catch (err) {
            // Registry doesn't exist yet
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching assets:', error);
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// POST /api/assets/rebuild - Scan filesystem and update registry
router.post('/rebuild', async (req, res) => {
    console.log('[AssetManager] Rebuild request received');
    try {
        const activeProject = projectService.getActiveProject();
        const isRoot = projectService.isRootProject();
        const projectBase = path.basename(activeProject);
        
        const assets = [];
        const scanDirs = [
            { dir: 'assets', type: 'image' },
            { dir: 'muzikler', type: 'audio' },
            { dir: 'dunyalar', type: 'data' }
        ];

        // If root, we scan in public/
        const baseScanPath = isRoot ? path.join(activeProject, 'public') : activeProject;

        for (const entry of scanDirs) {
            const fullPath = path.join(baseScanPath, entry.dir);
            try {
                // Recursive scan using a safe walker (fs.readdir with withFileTypes)
                async function walk(dir, rel) {
                    const found = [];
                    const entries = await fs.readdir(dir, { withFileTypes: true });
                    for (const d of entries) {
                        if (d.name === 'node_modules' || d.name === '.git' || d.name.startsWith('.')) continue;
                        const childFull = path.join(dir, d.name);
                        const childRel = path.join(rel, d.name).replace(/\\/g, '/');
                        if (d.isDirectory()) {
                            const children = await walk(childFull, path.join(rel, d.name));
                            found.push(...children);
                        } else {
                            found.push({ dirent: d, full: childFull, rel: childRel });
                        }
                    }
                    return found;
                }

                // Ensure directory exists, then walk
                let files = [];
                try {
                    await fs.access(fullPath);
                    files = await walk(fullPath, entry.dir);
                } catch (err) {
                    files = [];
                }

                for (const fileInfo of files) {
                    const dirent = fileInfo.dirent;
                    const fullFile = fileInfo.full;
                    const relativePath = fileInfo.rel;
                    const ext = path.extname(dirent.name).toLowerCase();

                    let type = entry.type;
                    if (ext === '.json' || ext === '.algorithm') type = 'json';
                    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';
                    if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio';

                    let assetPath = relativePath;
                    if (!isRoot) {
                        assetPath = `projects/${projectBase}/${assetPath}`;
                    }

                    let size = 0;
                    try { size = (await fs.stat(fullFile)).size; } catch (e) { /* ignore */ }

                    assets.push({
                        id: relativePath.replace(/\\/g, '/'),
                        name: path.basename(dirent.name),
                        path: assetPath,
                        type: type,
                        metadata: {
                            size: size,
                            ext: ext
                        },
                        dependencies: []
                    });
                }
            } catch (e) {
                // Directory might not exist or be unreadable
            }
        }

        // Save to registry
        const registryPath = isRoot 
            ? path.join(activeProject, 'public', 'data', 'assets.json')
            : path.join(activeProject, 'data', 'assets.json');
            
        await fs.mkdir(path.dirname(registryPath), { recursive: true });
        await safeFs.safeWriteFullPath(activeProject, registryPath, JSON.stringify({ assets }, null, 2), 'utf8');

        console.log(`[AssetManager] Scanned ${assets.length} assets for ${isRoot ? 'ROOT' : projectBase}`);
        res.json({ success: true, count: assets.length });
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
        const spritesheetPath = path.join(__dirname, '..', '..', 'public', 'sprite-art', 'platformer_spritesheet.png');
        
        await safeFs.safeWriteFullPath(path.resolve(__dirname, '..', '..'), spritesheetPath, base64Data, 'base64');
        
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

        const atlasPath = path.join(__dirname, '..', '..', 'public', 'sprite-art', 'platformer_atlas.json');
        await safeFs.safeWriteFullPath(path.resolve(__dirname, '..', '..'), atlasPath, JSON.stringify(atlas, null, 2), 'utf8');

        console.log('[SERVER] Atlas saved to:', atlasPath);

        res.json({ success: true, message: 'Spritesheet and atlas saved.' });
    } catch (error) {
        console.error('[SERVER] Error saving spritesheet:', error);
        res.status(500).json({ success: false, message: 'Failed to save spritesheet.' });
    }
});

module.exports = router;
