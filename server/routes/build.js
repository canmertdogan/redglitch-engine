const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const BUILDS_DIR = path.join(ROOT_DIR, 'builds');

// GET /api/build/stream?target=win&project=... — SSE live log stream
router.get('/stream', (req, res) => {
    const target = req.query.target || 'electron';
    const projectName = req.query.project || 'Default Project';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (type, payload) => {
        res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    };

    const buildScript = path.join(ROOT_DIR, 'build-game.js');
    if (!fs.existsSync(buildScript)) {
        send('error', { text: 'build-game.js not found' });
        send('done', { success: false });
        return res.end();
    }

    send('log', { text: `[WIZARD] Starting build: ${projectName} → ${target.toUpperCase()}\n` });

    const child = spawn(process.execPath, [buildScript, projectName, target], {
        cwd: ROOT_DIR,
        env: process.env
    });

    child.stdout.on('data', (d) => send('log', { text: d.toString() }));
    child.stderr.on('data', (d) => send('log', { text: d.toString() }));

    child.on('exit', (code) => {
        const releaseDir = path.join(ROOT_DIR, 'dist', 'game', 'release');
        const outputPath = fs.existsSync(releaseDir) ? releaseDir : path.join(ROOT_DIR, 'dist', 'game');
        // Small delay to let any remaining stdout/stderr data flush through
        setTimeout(() => {
            if (!res.writableEnded) {
                send('done', { success: code === 0, path: outputPath, code });
                res.end();
            }
        }, 300);
    });

    child.on('error', (err) => {
        if (!res.writableEnded) {
            send('error', { text: err.message });
            send('done', { success: false });
            res.end();
        }
    });

    req.on('close', () => {
        if (!child.killed) child.kill();
    });
});

// POST /api/build — run build-game.js for the active project
router.post('/', (req, res) => {
    const { target = 'electron' } = req.body;

    const projectService = req.projectService;
    const activeProject = projectService ? projectService.getActiveProject() : null;
    const projectName = activeProject ? path.basename(activeProject) : 'Default Project';

    const buildScript = path.join(ROOT_DIR, 'build-game.js');
    if (!fs.existsSync(buildScript)) {
        return res.status(500).json({ success: false, error: 'build-game.js not found' });
    }

    const outputPath = path.join(ROOT_DIR, 'dist', 'game');
    const logs = [];

    const child = spawn(process.execPath, [buildScript, projectName, target], {
        cwd: ROOT_DIR,
        env: process.env
    });

    child.stdout.on('data', (d) => logs.push(d.toString()));
    child.stderr.on('data', (d) => logs.push(d.toString()));

    child.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true, path: outputPath, log: logs.join('') });
        } else {
            res.status(500).json({ success: false, error: `Build exited with code ${code}`, log: logs.join('') });
        }
    });

    child.on('error', (err) => {
        res.status(500).json({ success: false, error: err.message });
    });
});

// POST /api/build/clean — wipe the builds folder
router.post('/clean', (req, res) => {
    try {
        if (fs.existsSync(BUILDS_DIR)) {
            fs.rmSync(BUILDS_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(BUILDS_DIR, { recursive: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
