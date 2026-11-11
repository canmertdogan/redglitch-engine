const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');
const safeFs = require('../utils/safeFs');
const { resolveUnderRoot } = require('../utils/pathGuard');

const DEFAULT_INTERFACE_FILE = 'main.redui';

function getInterfaceFileName(req) {
    const requested = req.query.file || req.body?.fileName || DEFAULT_INTERFACE_FILE;
    const baseName = path.basename(String(requested)).replace(/[^a-zA-Z0-9._-]/g, '');
    if (!baseName || baseName === '.redui' || baseName === '..' || baseName.startsWith('..')) return DEFAULT_INTERFACE_FILE;
    return baseName.endsWith('.redui') ? baseName : `${baseName}.redui`;
}
function stripProtoKeys(obj) {
    if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') delete obj[k]; }
    }
    return obj;
}
function safeParseJSON(raw, label) { try { return JSON.parse(raw); } catch { const e = new Error('Invalid JSON in '+label); e.code='INVALID_JSON'; throw e; } }

async function getUiConfigPath(req) {
    const activeProject = projectService.getActiveProject();
    const configPath = path.join(activeProject, 'interfaces', getInterfaceFileName(req));
    // Containment: never allow the resolved path to escape the active project root.
    const activeRoot = path.resolve(activeProject);
    const resolved = path.resolve(configPath);
    if (resolved !== activeRoot && !resolved.startsWith(activeRoot + path.sep)) {
        const err = new Error('Resolved ui-config path escapes active project root');
        err.status = 400;
        throw err;
    }
    return configPath;
}

async function getLegacyUiConfigPath() {
    const activeProject = projectService.getActiveProject();
    return path.join(activeProject, 'dunyalar', 'definitions', 'ui.json');
}

router.get('/', async (req, res) => {
    try {
        const configPath = await getUiConfigPath(req);
        const content = await fs.readFile(configPath, 'utf8');
        const document = safeParseJSON(content, 'ui-config');
        res.json({
            ...stripProtoKeys(document),
            fileName: path.basename(configPath),
            path: path.join('interfaces', path.basename(configPath))
        });
    } catch (err) {
        try {
            const legacyPath = await getLegacyUiConfigPath();
            const content = await fs.readFile(legacyPath, 'utf8');
            const document = safeParseJSON(content, 'ui-config legacy');
            res.json({
                ...stripProtoKeys(document),
                fileName: getInterfaceFileName(req),
                path: path.join('interfaces', getInterfaceFileName(req)),
                migratedFrom: path.join('dunyalar', 'definitions', 'ui.json')
            });
        } catch (legacyErr) {
            res.json({
                screens: {},
                fileName: getInterfaceFileName(req),
                path: path.join('interfaces', getInterfaceFileName(req))
            });
        }
    }
});

router.post('/', async (req, res) => {
    try {
        const configPath = await getUiConfigPath(req);
        const document = stripProtoKeys({ ...req.body });
        delete document.fileName;
        delete document.path;
        delete document.migratedFrom;
        document.format = document.format || 'redglitch-ui';
        document.formatVersion = document.formatVersion || 1;
        document.updatedAt = new Date().toISOString();

        // FINDING-13: atomic write via safeFs + containment via resolveUnderRoot
        const activeProject = projectService.getActiveProject();
        const rel = path.relative(activeProject, configPath);
        if (!resolveUnderRoot(activeProject, rel) || rel.includes('..')) return res.status(403).json({ error: 'Access denied' });
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await safeFs.safeWriteFullPath(activeProject, configPath, JSON.stringify(document, null, 2), 'utf8');
        res.json({
            success: true,
            fileName: path.basename(configPath),
            path: path.join('interfaces', path.basename(configPath))
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save ui-config' });
    }
});

router.get('/actions', (req, res) => {
    res.json([
        { id: 'START_GAME', label: 'Start Game', category: 'runtime' },
        { id: 'LOAD_LEVEL', label: 'Load Level', category: 'runtime' },
        { id: 'OPEN_MENU', label: 'Open Menu', category: 'ui' },
        { id: 'CLOSE_MENU', label: 'Close Menu', category: 'ui' },
        { id: 'PAUSE_GAME', label: 'Pause Game', category: 'runtime' },
        { id: 'RESUME_GAME', label: 'Resume Game', category: 'runtime' },
        { id: 'QUIT', label: 'Quit', category: 'system' }
    ]);
});

module.exports = router;
