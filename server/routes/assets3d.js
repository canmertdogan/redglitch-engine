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
const { spawn } = require('child_process');

// Supported 3D asset extensions
const ASSET_EXTENSIONS = ['.glb', '.gltf', '.fbx', '.obj', '.mtl', '.vox', '.pal', '.json', '.blend'];

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

        const manifest = { gltf: [], fbx: [], obj: [], mtl: [], vox: [], pal: [], blend: [], other: [] };

        for (const entry of entries) {
            const ext = path.extname(entry).toLowerCase();
            if (!ASSET_EXTENSIONS.includes(ext)) continue;

            if (ext === '.glb' || ext === '.gltf') manifest.gltf.push(entry);
            else if (ext === '.fbx')               manifest.fbx.push(entry);
            else if (ext === '.obj')               manifest.obj.push(entry);
            else if (ext === '.mtl')               manifest.mtl.push(entry);
            else if (ext === '.vox')               manifest.vox.push(entry);
            else if (ext === '.pal')               manifest.pal.push(entry);
            else if (ext === '.blend')             manifest.blend.push(entry);
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
        '.glb':   'model/gltf-binary',
        '.gltf':  'model/gltf+json',
        '.fbx':   'application/octet-stream',
        '.obj':   'model/obj',
        '.mtl':   'model/mtl',
        '.vox':   'application/octet-stream',
        '.pal':   'application/json',
        '.json':  'application/json',
        '.blend': 'application/x-blender',
    };

    res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.sendFile(filePath);
});

// ── POST /api/assets3d/:project — upload & convert ────────────────────────────
//
// Supported upload types:
//   .blend → server-side Blender conversion to .glb
//   .obj   → raw upload, with optional companion .mtl file (field name: 'mtl')

router.post('/:project', async (req, res) => {
    const { project } = req.params;

    if (!isSafeName(project)) {
        return res.status(400).json({ error: 'Invalid project name' });
    }

    if (!req.files || !req.files.file || !req.files.file[0]) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.files.file[0];
    const ext = path.extname(file.name).toLowerCase();

    const dir = assetsDir(project);
    await fs.mkdir(dir, { recursive: true });

    // ── .blend → .glb conversion ──
    if (ext === '.blend') {
        const baseName = path.basename(file.name, '.blend');
        const blendPath = path.join(dir, file.name);
        const glbPath = path.join(dir, baseName + '.glb');

        try {
            await file.mv(blendPath);

            const converterScript = path.join(__dirname, '../../scripts/blender-convert.py');
            const blenderExecutable = process.env.BLENDER_PATH || 'blender';

            await new Promise((resolve, reject) => {
                const proc = spawn(blenderExecutable, [
                    '--background',
                    '--python', converterScript,
                    '--', blendPath, glbPath
                ], { timeout: 120000 });

                let stderr = '';
                proc.stderr.on('data', (d) => { stderr += d.toString(); });
                proc.on('close', (code) => {
                    code === 0 ? resolve() : reject(new Error(`Blender exited code ${code}: ${stderr}`));
                });
                proc.on('error', (err) => reject(new Error(`Failed to spawn Blender: ${err.message}`)));
            });

            await fs.unlink(blendPath).catch(() => {});
            await fs.access(glbPath);

            return res.json({
                success: true,
                message: 'Successfully converted .blend to .glb',
                asset: {
                    name: path.basename(glbPath),
                    url: `/api/assets3d/${encodeURIComponent(project)}/${encodeURIComponent(path.basename(glbPath))}`,
                    originalName: file.name,
                    converted: true,
                },
            });
        } catch (err) {
            console.error('[assets3d] blend conversion error:', err.message);
            await fs.unlink(blendPath).catch(() => {});
            await fs.unlink(glbPath).catch(() => {});
            return res.status(500).json({
                error: 'Blender conversion failed',
                details: err.message,
                hint: 'Ensure Blender is installed and in PATH, or set BLENDER_PATH env var',
            });
        }
    }

    // ── .obj (with optional .mtl) ──
    if (ext === '.obj') {
        const objPath = path.join(dir, file.name);

        try {
            await file.mv(objPath);

            // Save companion MTL file if provided
            let mtlName = null;
            if (req.files.mtl && req.files.mtl[0]) {
                const mtlFile = req.files.mtl[0];
                const mtlExt = path.extname(mtlFile.name).toLowerCase();
                if (mtlExt === '.mtl') {
                    mtlName = mtlFile.name;
                    await mtlFile.mv(path.join(dir, mtlName));
                }
            }

            return res.json({
                success: true,
                message: 'OBJ uploaded successfully' + (mtlName ? ` with MTL (${mtlName})` : ''),
                asset: {
                    name: file.name,
                    url: `/api/assets3d/${encodeURIComponent(project)}/${encodeURIComponent(file.name)}`,
                    mtlName,
                    converted: false,
                },
            });
        } catch (err) {
            console.error('[assets3d] obj upload error:', err.message);
            return res.status(500).json({ error: 'OBJ upload failed', details: err.message });
        }
    }

    // ── fallback: unrecognised extension ──
    return res.status(400).json({
        error: `Unsupported file type: ${ext}`,
        hint: 'Allowed extensions: .blend, .obj (with optional .mtl)',
    });
});

module.exports = router;
