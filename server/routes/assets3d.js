/**
 * assets3d.js — Server routes for 3D engine assets (GLTF, .vox, .pal files).
 *
 * Routes:
 *   GET /api/assets3d/:project            — asset manifest (lists available files)
 *   GET /api/assets3d/:project/:assetName — serve a specific 3D asset file
 */

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs').promises;
const config  = require('../config');

// Supported 3D asset extensions
const ASSET_EXTENSIONS = ['.glb', '.gltf', '.vox', '.pal', '.json'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve the assets3d directory for a project.
 * Stores files at: projects/<ProjectName>/assets3d/
 */
function assetsDir(projectName) {
    return path.join(config.PROJECTS_ROOT, projectName, 'assets3d');
}

/**
 * Ensure the path stays within the project assets3d dir (path traversal guard).
 */
function safeAssetPath(projectName, assetName) {
    const dir      = assetsDir(projectName);
    const resolved = path.resolve(dir, assetName);
    if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
        return null;
    }
    return resolved;
}

function isSafeName(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_\-. ]+$/.test(value);
}

// ── GET /api/assets3d/:project — manifest ─────────────────────────────────────

router.get('/:project', async (req, res) => {
    const { project } = req.params;

    if (!isSafeName(project)) {
        return res.status(400).json({ error: 'Invalid project name' });
    }

    const dir = assetsDir(project);

    try {
        await fs.mkdir(dir, { recursive: true });
        const entries = await fs.readdir(dir);

        const manifest = { gltf: [], vox: [], pal: [], other: [] };

        for (const entry of entries) {
            const ext = path.extname(entry).toLowerCase();
            if (!ASSET_EXTENSIONS.includes(ext)) continue;

            if (ext === '.glb' || ext === '.gltf') manifest.gltf.push(entry);
            else if (ext === '.vox')               manifest.vox.push(entry);
            else if (ext === '.pal')               manifest.pal.push(entry);
            else                                   manifest.other.push(entry);
        }

        res.json(manifest);
    } catch (err) {
        console.error('[assets3d] manifest error:', err.message);
        res.status(500).json({ error: 'Failed to read assets directory' });
    }
});

// ── GET /api/assets3d/:project/:assetName — serve file ───────────────────────

router.get('/:project/:assetName', async (req, res) => {
    const { project, assetName } = req.params;

    if (!isSafeName(project) || !isSafeName(assetName)) {
        return res.status(400).json({ error: 'Invalid name' });
    }

    const ext = path.extname(assetName).toLowerCase();
    if (!ASSET_EXTENSIONS.includes(ext)) {
        return res.status(400).json({ error: `Unsupported asset type: ${ext}` });
    }

    const filePath = safeAssetPath(project, assetName);
    if (!filePath) {
        return res.status(400).json({ error: 'Path traversal detected' });
    }

    try {
        await fs.access(filePath);
    } catch {
        return res.status(404).json({ error: `Asset not found: ${assetName}` });
    }

    // Set appropriate MIME types for 3D assets
    const mimeMap = {
        '.glb':  'model/gltf-binary',
        '.gltf': 'model/gltf+json',
        '.vox':  'application/octet-stream',
        '.pal':  'application/json',
        '.json': 'application/json',
    };

    res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.sendFile(filePath);
});

module.exports = router;
