const express = require('express');
const path = require('path');
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
        if (typeof file !== 'string' || !file.trim()) {
            return res.status(400).json({ error: 'Invalid file path' });
        }
        // Reject absolute paths and traversal attempts; git add only accepts
        // paths relative to the repository root.
        if (path.isAbsolute(file) || file.includes('..')) {
            return res.status(400).json({ error: 'File path must be relative' });
        }
        const result = await gitService.add(file);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Error adding file to git' });
    }
});

router.post('/commit', async (req, res) => {
    try {
        const { message } = req.body;
        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Commit message required' });
        }
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
