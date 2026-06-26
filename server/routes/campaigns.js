const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');

function isSafeId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

function normalizeCampaignFileName(rawName) {
    if (typeof rawName !== 'string') return null;
    const base = rawName.endsWith('.json') ? rawName.slice(0, -5) : rawName;
    if (!isSafeId(base)) return null;
    return `${base}.json`;
}

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') console.error(`Error creating directory ${dir}:`, e);
    }
}

async function saveDefinition(filename, data) {
    const activeProject = projectService.getActiveProject();
    const isRoot = projectService.isRootProject();
    const targetDir = isRoot
        ? path.join(__dirname, '..', '..', 'public', 'dunyalar', 'definitions')
        : path.join(activeProject, 'dunyalar', 'definitions');
    
    const filePath = path.join(targetDir, filename);
    await ensureDir(path.dirname(filePath));
    await safeFs.safeWriteFullPath(targetDir, filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Save campaign flow definition
router.post('/campaign', async (req, res) => {
    try {
        await saveDefinition('campaign.json', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save campaign flow' });
    }
});

// List all campaigns (simple list)
router.get('/campaigns/list', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const projectCampaignsDir = path.join(activeProject, 'campaigns');
        const stockCampaignsDir = path.join(__dirname, '..', '..', 'data', 'campaigns');
        
        await fs.mkdir(projectCampaignsDir, { recursive: true });
        
        let files = [];
        try {
            const projectFiles = await fs.readdir(projectCampaignsDir);
            files = files.concat(projectFiles);
        } catch (e) { /* ignore */ }
        
        try {
            const stockFiles = await fs.readdir(stockCampaignsDir);
            files = files.concat(stockFiles);
        } catch (e) { /* ignore */ }
        
        const uniqueFiles = [...new Set(files)];
        const campaigns = uniqueFiles.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
        
        res.json({ campaigns });
    } catch (err) {
        console.error('Error listing campaigns:', err);
        res.status(500).json({ error: 'Failed to list campaigns' });
    }
});

// Get specific campaign
router.get('/campaigns/:name', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const name = normalizeCampaignFileName(req.params.name);
        if (!name) return res.status(400).json({ error: 'Invalid campaign name' });
        
        // Try project first
        let campaignFile = path.join(activeProject, 'campaigns', name);
        try {
            await fs.access(campaignFile);
        } catch (e) {
            // Try stock
            campaignFile = path.join(__dirname, '..', '..', 'data', 'campaigns', name);
        }
        
        const data = await fs.readFile(campaignFile, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error('Error loading campaign:', err);
        res.status(404).json({ error: 'Campaign not found' });
    }
});

// Save campaign
router.post('/campaigns/:name', async (req, res) => {
    try {
        const campaignName = normalizeCampaignFileName(req.params.name);
        if (!campaignName) return res.status(400).json({ error: 'Invalid campaign name' });
        const activeProject = projectService.getActiveProject();
        const campaignsDir = path.join(activeProject, 'campaigns');
        await fs.mkdir(campaignsDir, { recursive: true });
        
        const campaignFile = path.join(campaignsDir, campaignName);
        await safeFs.safeWriteFullPath(campaignsDir, campaignFile, JSON.stringify(req.body, null, 2), 'utf8');
        
        console.log(`Campaign saved: ${campaignName}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving campaign:', err);
        res.status(500).json({ error: 'Failed to save campaign' });
    }
});

// Delete campaign
router.delete('/campaigns/:name', async (req, res) => {
    try {
        const campaignName = normalizeCampaignFileName(req.params.name);
        if (!campaignName) return res.status(400).json({ error: 'Invalid campaign name' });
        const activeProject = projectService.getActiveProject();
        const campaignFile = path.join(activeProject, 'campaigns', campaignName);
        await fs.unlink(campaignFile);
        
        console.log(`Campaign deleted: ${campaignName}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting campaign:', err);
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
});

// Get campaign state for user
router.get('/campaign-state/:username', async (req, res) => {
    try {
        if (!isSafeId(req.params.username)) return res.status(400).json({ error: 'Invalid username' });
        const activeProject = projectService.getActiveProject();
        const stateFile = path.join(activeProject, 'data', 'saves', `campaign_${req.params.username}.json`);
        const data = await fs.readFile(stateFile, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(404).json({ error: 'No saved campaign state' });
    }
});

// Save campaign state for user
router.post('/campaign-state/:username', async (req, res) => {
    try {
        if (!isSafeId(req.params.username)) return res.status(400).json({ error: 'Invalid username' });
        const activeProject = projectService.getActiveProject();
        const savesDir = path.join(activeProject, 'data', 'saves');
        await fs.mkdir(savesDir, { recursive: true });
        
        const stateFile = path.join(savesDir, `campaign_${req.params.username}.json`);
        await safeFs.safeWriteFullPath(savesDir, stateFile, JSON.stringify(req.body, null, 2), 'utf8');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving campaign state:', err);
        res.status(500).json({ error: 'Failed to save campaign state' });
    }
});

// Get campaigns with full metadata
router.get('/campaigns', async (req, res) => {
    try {
        const activeProject = projectService.getActiveProject();
        const projectCampaignsDir = path.join(activeProject, 'campaigns');
        const stockCampaignsDir = path.join(__dirname, '..', '..', 'data', 'campaigns');
        
        await fs.mkdir(projectCampaignsDir, { recursive: true });
        
        const campaignsMap = new Map(); // Use Map to deduplicate by filename

        const scanDir = async (dir, type) => {
             try {
                const files = await fs.readdir(dir);
                for (const file of files) {
                    if (file.endsWith('.json') && !file.includes('template')) {
                        try {
                            const filePath = path.join(dir, file);
                            const stat = await fs.stat(filePath);
                            if (stat.isDirectory()) continue;

                            const data = await fs.readFile(filePath, 'utf8');
                            const campaign = JSON.parse(data);
                            
                            // If not already added (Project overrides Stock)
                            if (!campaignsMap.has(file)) {
                                campaignsMap.set(file, {
                                    file: file,
                                    name: campaign.name || file.replace('.json', ''),
                                    description: campaign.description || '',
                                    author: campaign.author || 'Unknown',
                                    version: campaign.version || '1.0.0',
                                    nodeCount: (campaign.nodes || []).length,
                                    metadata: campaign.metadata || {},
                                    source: type
                                });
                            }
                        } catch (err) {
                            console.warn(`Failed to read campaign ${file}:`, err);
                        }
                    }
                }
             } catch (e) { /* ignore missing dir */ }
        };

        // Scan Project First (priority)
        await scanDir(projectCampaignsDir, 'project');
        // Scan Stock Second
        await scanDir(stockCampaignsDir, 'stock');
        
        res.json(Array.from(campaignsMap.values()));
    } catch (error) {
        console.error('Error getting campaigns:', error);
        res.status(500).json({ error: 'Failed to get campaigns' });
    }
});

module.exports = router;
