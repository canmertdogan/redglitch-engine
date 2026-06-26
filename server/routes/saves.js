const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');

function isSafeKey(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

function validateSaveParams(username, slot) {
    return isSafeKey(username) && isSafeKey(slot);
}

// GET save file
router.get('/save/:username/:slot', async (req, res) => {
    const { username, slot } = req.params;
    if (!validateSaveParams(username, slot)) return res.status(400).json({ error: 'Invalid save key' });
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'saves', `${username}_${slot}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(404).json({ error: 'Save not found' });
    }
});

// POST save file
router.post('/save/:username/:slot', async (req, res) => {
    const { username, slot } = req.params;
    if (!validateSaveParams(username, slot)) return res.status(400).json({ error: 'Invalid save key' });
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'saves', `${username}_${slot}.json`);
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await safeFs.safeWriteFullPath(activeProject, filePath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save game' });
    }
});

// GET profile
router.get('/profile/:username', async (req, res) => {
    const { username } = req.params;
    if (!isSafeKey(username)) return res.status(400).json({ error: 'Invalid username' });
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'profiles', `${username}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        // Return default profile instead of 404
        res.json({ hp: 100, mana: 50, stamina: 100, speed: 250 });
    }
});

// POST profile
router.post(['/profile/:username', '/profiles/:username'], async (req, res) => {
    const { username } = req.params;
    if (!isSafeKey(username)) return res.status(400).json({ error: 'Invalid username' });
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'profiles', `${username}.json`);
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await safeFs.safeWriteFullPath(activeProject, filePath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// GET achievements
router.get('/achievements/:username', async (req, res) => {
    const { username } = req.params;
    if (!isSafeKey(username)) return res.status(400).json({ error: 'Invalid username' });
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'achievements', `${username}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.json({ unlocked: [] });
    }
});

// POST achievements
router.post('/achievements/:username', async (req, res) => {
    const { username } = req.params;
    if (!isSafeKey(username)) return res.status(400).json({ error: 'Invalid username' });
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'achievements', `${username}.json`);
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await safeFs.safeWriteFullPath(activeProject, filePath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save achievements' });
    }
});

module.exports = router;
