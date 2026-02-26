const express = require('express');
const router = express.Router();
const gitService = require('../services/gitService');

router.get('/status', async (req, res) => {
    const status = await gitService.status();
    res.json({ status });
});

router.post('/add', async (req, res) => {
    const { file } = req.body;
    const result = await gitService.add(file);
    res.json(result);
});

router.post('/commit', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Commit message required' });
    const result = await gitService.commit(message);
    res.json(result);
});

router.get('/diff', async (req, res) => {
    const diff = await gitService.diff();
    res.json({ diff });
});

module.exports = router;
