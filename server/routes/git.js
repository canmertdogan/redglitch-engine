const express = require('express');
const router = express.Router();
const gitService = require('../services/gitService');

router.get('/status', async (req, res) => {
    try {
        const status = await gitService.status();
        res.json({ status });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Error getting git status' });
    }
});

router.post('/add', async (req, res) => {
    try {
        const { file } = req.body;
        const result = await gitService.add(file);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Error adding file to git' });
    }
});

router.post('/commit', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Commit message required' });
        const result = await gitService.commit(message);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Error committing to git' });
    }
});

router.get('/diff', async (req, res) => {
    try {
        const diff = await gitService.diff();
        res.json({ diff });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Error getting git diff' });
    }
});

module.exports = router;
