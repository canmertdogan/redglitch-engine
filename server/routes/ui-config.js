const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const projectService = require('../services/projectService');

const DEFAULT_INTERFACE_FILE = 'main.redui';

function getInterfaceFileName(req) {
    const requested = req.query.file || req.body?.fileName || DEFAULT_INTERFACE_FILE;
    const baseName = path.basename(String(requested)).replace(/[^a-zA-Z0-9._-]/g, '');
    if (!baseName || baseName === '.redui') return DEFAULT_INTERFACE_FILE;
    return baseName.endsWith('.redui') ? baseName : `${baseName}.redui`;
}

async function getUiConfigPath(req) {
    const activeProject = projectService.getActiveProject();
    return path.join(activeProject, 'interfaces', getInterfaceFileName(req));
}

async function getLegacyUiConfigPath() {
    const activeProject = projectService.getActiveProject();
    return path.join(activeProject, 'dunyalar', 'definitions', 'ui.json');
}

router.get('/', async (req, res) => {
    try {
        const configPath = await getUiConfigPath(req);
        const content = await fs.readFile(configPath, 'utf8');
        const document = JSON.parse(content);
        res.json({
            ...document,
            fileName: path.basename(configPath),
            path: path.join('interfaces', path.basename(configPath))
        });
    } catch (err) {
        try {
            const legacyPath = await getLegacyUiConfigPath();
            const content = await fs.readFile(legacyPath, 'utf8');
            const document = JSON.parse(content);
            res.json({
                ...document,
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
        const document = { ...req.body };
        delete document.fileName;
        delete document.path;
        delete document.migratedFrom;
        document.format = document.format || 'redglitch-ui';
        document.formatVersion = document.formatVersion || 1;
        document.updatedAt = new Date().toISOString();

        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(document, null, 2));
        res.json({
            success: true,
            fileName: path.basename(configPath),
            path: path.join('interfaces', path.basename(configPath))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
