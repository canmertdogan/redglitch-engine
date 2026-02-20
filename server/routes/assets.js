const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');

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
                // Recursive scan
                const entries = await fs.readdir(fullPath, { recursive: true, withFileTypes: true });
                for (const dirent of entries) {
                    if (dirent.isFile()) {
                        const relativeInDir = dirent.name;
                        const relativePath = path.join(entry.dir, relativeInDir);
                        const ext = path.extname(dirent.name).toLowerCase();
                        
                        let type = entry.type;
                        if (ext === '.json' || ext === '.algorithm') type = 'json';
                        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';
                        if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio';

                        let assetPath = relativePath.replace(/\\/g, '/');
                        if (!isRoot) {
                            assetPath = `projects/${projectBase}/${assetPath}`;
                        }

                        assets.push({
                            id: relativePath.replace(/\\/g, '/'),
                            name: path.basename(dirent.name),
                            path: assetPath,
                            type: type,
                            metadata: {
                                size: (await fs.stat(path.join(fullPath, relativeInDir))).size,
                                ext: ext
                            },
                            dependencies: []
                        });
                    }
                }
            } catch (e) {
                // Directory might not exist
            }
        }

        // Save to registry
        const registryPath = isRoot 
            ? path.join(activeProject, 'public', 'data', 'assets.json')
            : path.join(activeProject, 'data', 'assets.json');
            
        await fs.mkdir(path.dirname(registryPath), { recursive: true });
        await fs.writeFile(registryPath, JSON.stringify({ assets }, null, 2));

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

module.exports = router;
