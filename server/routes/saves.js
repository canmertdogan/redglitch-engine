const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const projectService = require('../services/projectService');

// GET save file
router.get('/save/:username/:slot', async (req, res) => {
    const { username, slot } = req.params;
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
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'saves', `${username}_${slot}.json`);
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save game' });
    }
});

// GET profile
router.get('/profile/:username', async (req, res) => {
    const { username } = req.params;
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
router.post('/profile/:username', async (req, res) => {
    const { username } = req.params;
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'profiles', `${username}.json`);
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// POST profile (alternate endpoint)
router.post('/profiles/:username', async (req, res) => {
    const { username } = req.params;
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'profiles', `${username}.json`);
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// GET achievements
router.get('/achievements/:username', async (req, res) => {
    const { username } = req.params;
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
    const activeProject = projectService.getActiveProject();
    const filePath = path.join(activeProject, 'data', 'achievements', `${username}.json`);
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save achievements' });
    }
});

module.exports = router;
