const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { bakeVoxToGlb } = require('./scripts/voxel-baker');

// All engine types recognized by the build system
const VALID_ENGINE_TYPES = new Set([
    'rpg-topdown', 'platformer-2d', 'iso-pixel',
    'unified-3d'
]);
const IS_3D_ENGINE = new Set(['unified-3d']);

// --- CONFIGURATION ---
const PROJECT_NAME = process.argv[2] || 'Default Project';
const PROJECT_DIR = path.join(__dirname, 'projects', PROJECT_NAME);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist', 'game');
const BUILD_TYPE = (process.argv[3] || 'all').toLowerCase();

// Target Flags
const isWin = ['win', 'windows', 'win32'].includes(BUILD_TYPE);
const isMac = ['macos', 'mac', 'darwin'].includes(BUILD_TYPE);
const isElectron = ['electron', 'desktop'].includes(BUILD_TYPE) || isWin || isMac;
const isAndroid = ['android'].includes(BUILD_TYPE);
const isIos = ['ios', 'iphone'].includes(BUILD_TYPE);
const isMobile = isAndroid || isIos;
const isWeb = ['web', 'html5'].includes(BUILD_TYPE);
const isAll = BUILD_TYPE === 'all';

let hasErrors = false;

console.log(`\x1b[36m[BUILDER] Starting build for project: ${PROJECT_NAME}\x1b[0m`);
console.log(`[BUILDER] Target: ${BUILD_TYPE.toUpperCase()}`);
console.log(`[BUILDER] Source: ${PROJECT_DIR}`);
console.log(`[BUILDER] Output: ${DIST_DIR}`);

if (!fs.existsSync(PROJECT_DIR)) {
    console.error(`\x1b[31m[ERROR] Project directory not found: ${PROJECT_DIR}\x1b[0m`);
    process.exit(1);
}

// Read and validate project metadata
const PROJECT_META_PATH = path.join(PROJECT_DIR, 'redglitch.json');
let projectMeta = {};
if (fs.existsSync(PROJECT_META_PATH)) {
    try { projectMeta = JSON.parse(fs.readFileSync(PROJECT_META_PATH, 'utf8')); }
    catch (e) { console.warn('[WARN] Could not parse redglitch.json, using defaults.'); }
}
const ENGINE_TYPE = projectMeta.engineType || 'rpg-topdown';
if (!VALID_ENGINE_TYPES.has(ENGINE_TYPE)) {
    console.error(`\x1b[31m[ERROR] Unsupported engineType "${ENGINE_TYPE}" in redglitch.json.\x1b[0m`);
    process.exit(1);
}

// --- HELPERS ---
function copyRecursiveSync(src, dest) {
    if (!fs.existsSync(src)) return;
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => copyRecursiveSync(path.join(src, child), path.join(dest, child)));
    } else {
        fs.copyFileSync(src, dest);
    }
}

function cleanDir(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
}

function findFiles(dir, ext) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findFiles(full, ext));
        else if (entry.name.endsWith(ext)) results.push(full);
    }
    return results;
}

/**
 * Phase 20: Generate dynamic manifest.
 */
function getAllowedRootFiles(engineType) {
    const manifest = [
        'launcher.html', 'splash.html', 'credits.html', 'favicon.ico',
        'slot_selection.html', 'slot_selection.js',
        'campaign_browser.html', 'campaign_browser.js',
        'campaign_launcher.html', 'campaign_runtime.html',
        'index.html', 'pixel_scrollbars.css', 'transitions.css', 'theme.js',
        'irab-enhanced.js', 'assistant.js', 'InteractiveCutsceneAPI.js'
    ];
    if (engineType === 'iso-pixel') manifest.push('iso_play.html');
    return manifest;
}

// --- MAIN BUILD PROCESS ---
try {
    // 0. Mobile Adapters
    if (isAndroid || isAll) {
        const adapterScript = path.join(__dirname, 'build-adapter.js');
        if (fs.existsSync(adapterScript)) {
            console.log('[BUILDER] Updating Android adapter...');
            execSync(`node "${adapterScript}"`, { cwd: __dirname, stdio: 'inherit' });
        }
    }

    // 1. Clean Dist
    cleanDir(DIST_DIR);
    const GAME_PUBLIC = path.join(DIST_DIR, 'public');
    fs.mkdirSync(GAME_PUBLIC);

    // 2. Copy Engine Core
    console.log('[BUILDER] Copying engine core...');
    const allowedRootFiles = getAllowedRootFiles(ENGINE_TYPE);
    const allowedRootDirs = [
        'engines', 'base_game', 'fonts', 'js', 'lib', 'muzikler', 
        'sprite-art', 'dunyalar', 'data', 'profiles',
        'ai', 'shared', 'css', 'strategies', 'daw', 'icons'
    ];

    function copyFiltered(src, dest, isRoot = false) {
        if (!fs.existsSync(src)) return;
        fs.readdirSync(src).forEach(item => {
            const srcPath = path.join(src, item), destPath = path.join(dest, item);
            const stat = fs.statSync(srcPath);
            if (isRoot) {
                if (stat.isDirectory() && allowedRootDirs.includes(item)) copyRecursiveSync(srcPath, destPath);
                else if (stat.isFile() && allowedRootFiles.includes(item)) fs.copyFileSync(srcPath, destPath);
            } else copyRecursiveSync(srcPath, destPath);
        });
    }
    copyFiltered(PUBLIC_DIR, GAME_PUBLIC, true);

    // 3. Project Assets
    console.log('[BUILDER] Merging project assets...');
    ['dunyalar', 'muzikler', 'data', 'assets', 'assets3d'].forEach(dir => {
        const src = path.join(PROJECT_DIR, dir);
        if (fs.existsSync(src)) copyRecursiveSync(src, path.join(GAME_PUBLIC, dir));
    });
    
    // Palette files
    fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.pal.json')).forEach(f => {
        fs.copyFileSync(path.join(PROJECT_DIR, f), path.join(GAME_PUBLIC, f));
    });

    // 3c. Voxel Bake
    if (IS_3D_ENGINE.has(ENGINE_TYPE)) {
        const voxFiles = findFiles(path.join(GAME_PUBLIC, 'assets3d'), '.vox');
        for (const vox of voxFiles) {
            const glb = bakeVoxToGlb(vox);
            if (glb) {
                fs.writeFileSync(vox.replace(/\.vox$/, '.glb'), glb);
                fs.unlinkSync(vox);
            }
        }
    }

    // 4. Runtime Server
    const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8'); // Use project server.js as base
    // Actually, build-game.js used to generate a simplified server. 
    // Let's stick to the generated one for now but modularize it later.
    const genServer = `
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: '50mb' }));
const isElectron = process.versions.hasOwnProperty('electron');
let userDataPath = isElectron ? path.join(require('electron').app.getPath('userData'), 'SaveData') : path.join(__dirname, 'saves');
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/save/:u/:s', (req, res) => {
    const f = path.join(userDataPath, \`\${req.params.u}_\${req.params.s}.json\`);
    res.json(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : {});
});
app.post('/api/save/:u/:s', (req, res) => {
    fs.writeFileSync(path.join(userDataPath, \`\${req.params.u}_\${req.params.s}.json\`), JSON.stringify(req.body));
    res.json({ success: true });
});
app.listen(PORT, () => console.log(\`Game running on \${PORT}\`));
    `;
    fs.writeFileSync(path.join(DIST_DIR, 'server.js'), genServer);

    // 5. Electron Entry
    const electronMain = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
require('./server.js');
app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 1280, height: 720, fullscreen: true, autoHideMenuBar: true });
    win.loadURL(\`http://localhost:\${process.env.PORT || 3000}/launcher.html\`);
});
app.on('window-all-closed', () => app.quit());
    `;
    fs.writeFileSync(path.join(DIST_DIR, 'main.js'), electronMain);

    // 6. Package.json
    const pkg = { name: "redglitch-release", version: "1.0.0", main: "main.js", dependencies: { "express": "^4.18.2", "cors": "^2.8.5" } };
    fs.writeFileSync(path.join(DIST_DIR, 'package.json'), JSON.stringify(pkg, null, 2));

    console.log('\x1b[32m[DONE] Build complete.\x1b[0m');
} catch (err) {
    console.error(`\x1b[31m[FATAL] Build failed: ${err.message}\x1b[0m`);
    process.exit(1);
}
