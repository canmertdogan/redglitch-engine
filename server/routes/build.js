const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const BUILDS_DIR = path.join(ROOT_DIR, 'builds');

let buildPromise = null;
const VALID_TARGETS = new Set(['electron', 'web', 'ios', 'android', 'windows', 'macos']);

// GET /api/build/stream?target=win&project=... — SSE live log stream
router.get('/stream', async (req, res) => {
    const target = req.query.target || 'electron';
    const projectName = req.query.project || 'Default Project';

    if (!VALID_TARGETS.has(target)) {
        res.setHeader('Content-Type', 'text/plain');
        return res.status(400).end('Invalid target');
    }
    
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(projectName)) {
        res.setHeader('Content-Type', 'text/plain');
        return res.status(400).end('Invalid project name');
    }
    
    if (buildPromise) {
        res.setHeader('Content-Type', 'text/plain');
        return res.status(409).end('A build is already in progress');
    }

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

    buildPromise = (async () => {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [buildScript, projectName, target], {
                cwd: ROOT_DIR,
                env: process.env
            });

            child.stdout.on('data', (d) => send('log', { text: d.toString() }));
            child.stderr.on('data', (d) => send('log', { text: d.toString() }));

            child.on('exit', (code) => {
                const releaseDir = path.join(ROOT_DIR, 'dist', 'game', 'release');
                const outputPath = fs.existsSync(releaseDir) ? releaseDir : path.join(ROOT_DIR, 'dist', 'game');
                setTimeout(() => {
                    buildPromise = null;
                    if (!res.writableEnded) {
                        send('done', { success: code === 0, path: outputPath, code });
                        res.end();
                    }
                    resolve();
                }, 300);
            });

            child.on('error', (err) => {
                buildPromise = null;
                if (!res.writableEnded) {
                    send('error', { text: err.message });
                    send('done', { success: false });
                    res.end();
                }
                reject(err);
            });

            req.on('close', () => {
                if (!child.killed) child.kill();
            });
        });
    })();

    try {
        await buildPromise;
    } catch (err) {
        // Error already sent to client in child.on('error')
    }
});

// POST /api/build — run build-game.js for the active project
router.post('/', async (req, res) => {
    const { target = 'electron' } = req.body;

    if (!VALID_TARGETS.has(target)) {
        return res.status(400).json({ success: false, error: 'Invalid target' });
    }

    if (buildPromise) {
        return res.status(409).json({ success: false, error: 'A build is already in progress' });
    }

    const projectService = req.projectService;
    const activeProject = projectService ? projectService.getActiveProject() : null;
    const projectName = activeProject ? path.basename(activeProject) : 'Default Project';

    const buildScript = path.join(ROOT_DIR, 'build-game.js');
    if (!fs.existsSync(buildScript)) {
        return res.status(500).json({ success: false, error: 'build-game.js not found' });
    }

    const outputPath = path.join(ROOT_DIR, 'dist', 'game');
    const logs = [];

    buildPromise = (async () => {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [buildScript, projectName, target], {
                cwd: ROOT_DIR,
                env: process.env
            });

            child.stdout.on('data', (d) => logs.push(d.toString()));
            child.stderr.on('data', (d) => logs.push(d.toString()));

            child.on('close', (code) => {
                buildPromise = null;
                if (code === 0) {
                    resolve({ success: true, path: outputPath, log: logs.join('') });
                } else {
                    reject(new Error(`Build exited with code ${code}`));
                }
            });

            child.on('error', (err) => {
                buildPromise = null;
                reject(err);
            });
        });
    })();

    try {
        const result = await buildPromise;
        res.json({ ...result, success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, log: logs.join('') });
    }
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
