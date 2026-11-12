const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');
const config = require('../config');

function safeParseJSON(raw, label) {
    try { return JSON.parse(raw); } catch (e) { const err = new Error(`Invalid JSON in ${label}`); err.code = 'INVALID_JSON'; throw err; }
}
function isSafeCutsceneId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

// Helper to ensure directory exists
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

// Helper to save definition files
async function saveDefinition(filename, data) {
    const targetDir = projectService.isRootProject()
        ? path.join(projectService.getProjectPath(), 'public', 'dunyalar', 'definitions')
        : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions');
    
    const filePath = path.join(targetDir, filename);
    await ensureDir(path.dirname(filePath));
    await safeFs.safeWriteFullPath(targetDir, filePath, JSON.stringify(data, null, 2), 'utf8');
}

// --- CUTSCENES API ---
router.get('/cutscenes/list', async (req, res) => {
    try {
        const targetDir = projectService.isRootProject()
            ? path.join(projectService.getProjectPath(), 'public', 'dunyalar', 'definitions', 'interactive_cutscenes')
            : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions', 'interactive_cutscenes');
        
        await ensureDir(targetDir);
        const files = await fs.readdir(targetDir);
        const cutscenes = [];
        
        for (const f of files) {
            if (f.endsWith('.json')) {
                try {
                    const filePath = path.join(targetDir, f);
                    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
                    cutscenes.push({
                        id: f.replace('.json', ''),
                        name: data.name || f.replace('.json', ''),
                        description: data.description || ''
                    });
                } catch (e) {
                    cutscenes.push({ id: f.replace('.json', ''), name: f.replace('.json', '') });
                }
            }
        }
        res.json(cutscenes);
    } catch (err) {
        console.error('Error listing cutscenes:', err);
        res.json([]);
    }
});

router.get('/cutscenes/:id', async (req, res) => {
    try {
        if (!isSafeCutsceneId(req.params.id)) return res.status(400).json({ error: 'Invalid cutscene id' });
        const targetDir = projectService.isRootProject()
            ? path.join(projectService.getProjectPath(), 'public', 'dunyalar', 'definitions', 'interactive_cutscenes')
            : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions', 'interactive_cutscenes');
        
        const filePath = path.join(targetDir, `${req.params.id}.json`);
        const data = await fs.readFile(filePath, 'utf8');
        res.json(safeParseJSON(data, 'cutscene'))
    } catch (err) {
        console.error('Error reading cutscene:', err);
        res.status(404).json({ error: 'Cutscene not found' });
    }
});

router.post('/cutscenes/:id', async (req, res) => {
    try {
        if (!isSafeCutsceneId(req.params.id)) return res.status(400).json({ error: 'Invalid cutscene id' });
        const targetDir = projectService.isRootProject()
            ? path.join(projectService.getProjectPath(), 'public', 'dunyalar', 'definitions', 'interactive_cutscenes')
            : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions', 'interactive_cutscenes');
        
        await ensureDir(targetDir);
        const filePath = path.join(targetDir, `${req.params.id}.json`);
        await safeFs.safeWriteFullPath(targetDir, filePath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving cutscene:', err);
        res.status(500).json({ error: 'Failed to save cutscene' });
    }
});

router.delete('/cutscenes/:id', async (req, res) => {
    try {
        if (!isSafeCutsceneId(req.params.id)) return res.status(400).json({ error: 'Invalid cutscene id' });
        const targetDir = projectService.isRootProject()
            ? path.join(projectService.getProjectPath(), 'public', 'dunyalar', 'definitions', 'interactive_cutscenes')
            : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions', 'interactive_cutscenes');
        
        const filePath = path.join(targetDir, `${req.params.id}.json`);
        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting cutscene:', err);
        res.status(500).json({ error: 'Failed to delete cutscene' });
    }
});

// --- DIALOGUES API ---
router.get('/dialogues', async (req, res) => {
    const fallbackPath = path.join(config.PUBLIC_DIR, 'dunyalar', 'definitions', 'dialogues.json');
    const primaryPath = projectService.isRootProject()
        ? fallbackPath
        : path.join(projectService.getActiveProject(), 'dunyalar', 'definitions', 'dialogues.json');

    try {
        let data;
        try {
            data = await fs.readFile(primaryPath, 'utf8');
        } catch (err) {
            if (err.code !== 'ENOENT' || primaryPath === fallbackPath) throw err;
            data = await fs.readFile(fallbackPath, 'utf8');
        }
        res.json(safeParseJSON(data, 'dialogues'));
    } catch (err) {
        if (err.code === 'INVALID_JSON') {
            return res.status(500).json({ error: err.message });
        }
        res.json([]);
    }
});

router.post('/dialogues', async (req, res) => {
    try {
        await saveDefinition('dialogues.json', req.body);
        res.json({ success: true });
    } catch (err) {
        console.error("Dialogue save error:", err);
        res.status(500).json({ error: 'Failed to save dialogues' });
    }
});

module.exports = router;
