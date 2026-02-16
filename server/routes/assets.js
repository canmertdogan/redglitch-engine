const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');

// GET /api/assets - Get all assets
router.get('/assets', async (req, res) => {
    try {
        const data = { assets: [] };
        res.json(data);
    } catch (error) {
        console.error('Error fetching assets:', error);
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// GET /api/assets/list - List all assets with metadata
router.get('/assets/list', async (req, res) => {
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
