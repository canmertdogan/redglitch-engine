const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const parseMagicaVoxel = require('parse-magica-voxel');

// All engine types recognized by the build system
const VALID_ENGINE_TYPES = new Set([
    'rpg-topdown', 'platformer-2d', 'iso-pixel',
    'topdown-3d', 'fps-3d', 'platformer-3d',
]);
const IS_3D_ENGINE = new Set(['topdown-3d', 'fps-3d', 'platformer-3d']);

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

// Read and validate project metadata before any build work
const PROJECT_META_PATH = path.join(PROJECT_DIR, 'ketebe.json');
let projectMeta = {};
if (fs.existsSync(PROJECT_META_PATH)) {
    try { projectMeta = JSON.parse(fs.readFileSync(PROJECT_META_PATH, 'utf8')); }
    catch (e) { console.warn('[WARN] Could not parse ketebe.json, using defaults.'); }
}
const ENGINE_TYPE = projectMeta.engineType || 'rpg-topdown';
if (!VALID_ENGINE_TYPES.has(ENGINE_TYPE)) {
    console.error(`\x1b[31m[ERROR] Unsupported engineType "${ENGINE_TYPE}" in ketebe.json.\x1b[0m`);
    console.error(`[ERROR] Valid engine types: ${[...VALID_ENGINE_TYPES].join(', ')}`);
    process.exit(1);
}
console.log(`[BUILDER] Engine type: ${ENGINE_TYPE}${IS_3D_ENGINE.has(ENGINE_TYPE) ? ' (3D)' : ''}`);


// --- HELPERS ---
function copyRecursiveSync(src, dest) {
    if (!fs.existsSync(src)) return;
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

function cleanDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
}

// --- VOX → GLB GREEDY MESH BAKER ---
// Converts a MagicaVoxel .vox file to a binary GLTF (.glb) using a greedy mesh algorithm.
// Adjacent voxels of the same palette color are merged into quads, minimizing triangle count.
// Output uses POSITION + NORMAL + COLOR_0 vertex attributes (flat-shaded, palette colors).
function bakeVoxToGlb(voxPath) {
    const vox = parseMagicaVoxel(fs.readFileSync(voxPath));
    const { SIZE, XYZI, RGBA } = vox;
    const SX = SIZE.x, SY = SIZE.y, SZ = SIZE.z;

    // Build dense 3D grid (1-based palette index, 0 = empty)
    const grid = new Uint8Array(SX * SY * SZ);
    const cell = (x, y, z) => x + SX * (y + SY * z);
    for (const v of XYZI) {
        if (v.x < SX && v.y < SY && v.z < SZ) grid[cell(v.x, v.y, v.z)] = v.c;
    }

    const positions = [], normals = [], colors = [];

    // 6 face directions: [axis, direction (+1 or -1), outward normal]
    const FACE_DIRS = [
        [0, +1, [+1, 0, 0]], [0, -1, [-1, 0, 0]],
        [1, +1, [0, +1, 0]], [1, -1, [0, -1, 0]],
        [2, +1, [0, 0, +1]], [2, -1, [0, 0, -1]],
    ];

    for (const [axis, dir, normal] of FACE_DIRS) {
        const [a, b] = [0, 1, 2].filter(i => i !== axis);
        const sSlice = [SX, SY, SZ][axis];
        const sA     = [SX, SY, SZ][a];
        const sB     = [SX, SY, SZ][b];

        for (let slice = 0; slice < sSlice; slice++) {
            // Build 2D mask of exposed faces on this slice
            const mask = new Uint8Array(sA * sB);
            for (let j = 0; j < sA; j++) {
                for (let k = 0; k < sB; k++) {
                    const co = [0, 0, 0];
                    co[axis] = slice; co[a] = j; co[b] = k;
                    const c = grid[cell(...co)];
                    if (!c) continue;
                    const cn = [...co]; cn[axis] += dir;
                    const [nx, ny, nz] = cn;
                    const exposed = nx < 0 || ny < 0 || nz < 0 || nx >= SX || ny >= SY || nz >= SZ || !grid[cell(nx, ny, nz)];
                    if (exposed) mask[j + sA * k] = c;
                }
            }

            // Greedy merge rectangles of identical color
            const done = new Uint8Array(sA * sB);
            for (let k = 0; k < sB; k++) {
                for (let j = 0; j < sA; j++) {
                    const c = mask[j + sA * k];
                    if (!c || done[j + sA * k]) continue;
                    let dj = 1;
                    while (j + dj < sA && mask[(j + dj) + sA * k] === c && !done[(j + dj) + sA * k]) dj++;
                    let dk = 1;
                    outer: while (k + dk < sB) {
                        for (let jj = j; jj < j + dj; jj++) {
                            if (mask[jj + sA * (k + dk)] !== c || done[jj + sA * (k + dk)]) break outer;
                        }
                        dk++;
                    }
                    for (let kk = k; kk < k + dk; kk++)
                        for (let jj = j; jj < j + dj; jj++)
                            done[jj + sA * kk] = 1;

                    // Emit quad: 4 corners in (axis, a, b) space
                    const faceOffset = dir > 0 ? slice + 1 : slice;
                    const quad = [
                        [faceOffset, j,      k     ],
                        [faceOffset, j + dj, k     ],
                        [faceOffset, j + dj, k + dk],
                        [faceOffset, j,      k + dk],
                    ].map(co3 => { const xyz = [0,0,0]; xyz[axis] = co3[0]; xyz[a] = co3[1]; xyz[b] = co3[2]; return xyz; });

                    const rgba = RGBA[(c - 1) % RGBA.length] || { r: 255, g: 0, b: 255 };
                    const col  = [rgba.r / 255, rgba.g / 255, rgba.b / 255];
                    // Two triangles, CCW winding (flip for back-faces)
                    const tris = dir > 0
                        ? [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]
                        : [quad[0], quad[2], quad[1], quad[0], quad[3], quad[2]];
                    for (const p of tris) { positions.push(...p); normals.push(...normal); colors.push(...col); }
                }
            }
        }
    }

    if (positions.length === 0) return null;

    const vc = positions.length / 3;
    const posF32  = new Float32Array(positions);
    const normF32 = new Float32Array(normals);
    const colF32  = new Float32Array(colors);
    const posBytes  = posF32.byteLength, normBytes = normF32.byteLength, colBytes = colF32.byteLength;
    const binRaw    = Buffer.concat([
        Buffer.from(posF32.buffer),
        Buffer.from(normF32.buffer),
        Buffer.from(colF32.buffer),
    ]);
    const binPad    = (4 - (binRaw.length % 4)) % 4;
    const binBuf    = binPad ? Buffer.concat([binRaw, Buffer.alloc(binPad)]) : binRaw;

    let minP = [Infinity,Infinity,Infinity], maxP = [-Infinity,-Infinity,-Infinity];
    for (let i = 0; i < positions.length; i += 3)
        for (let c = 0; c < 3; c++) { minP[c] = Math.min(minP[c], positions[i+c]); maxP[c] = Math.max(maxP[c], positions[i+c]); }

    const gltf = {
        asset: { version: '2.0', generator: 'Ketebe Build System Phase 58' },
        scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, mode: 4 }] }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: vc, type: 'VEC3', min: minP, max: maxP },
            { bufferView: 1, componentType: 5126, count: vc, type: 'VEC3' },
            { bufferView: 2, componentType: 5126, count: vc, type: 'VEC3' },
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0,                        byteLength: posBytes  },
            { buffer: 0, byteOffset: posBytes,                 byteLength: normBytes },
            { buffer: 0, byteOffset: posBytes + normBytes,     byteLength: colBytes  },
        ],
        buffers: [{ byteLength: binBuf.length }],
    };

    const jsonStr    = JSON.stringify(gltf);
    const jsonPadLen = Math.ceil(jsonStr.length / 4) * 4;
    const jsonBuf    = Buffer.alloc(jsonPadLen, 0x20); // pad with spaces
    jsonBuf.write(jsonStr, 'utf8');

    const totalLen   = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
    const glbHeader  = Buffer.alloc(12);
    glbHeader.writeUInt32LE(0x46546C67, 0); // magic 'glTF'
    glbHeader.writeUInt32LE(2, 4);           // version
    glbHeader.writeUInt32LE(totalLen, 8);
    const jsonChunkHdr = Buffer.alloc(8);
    jsonChunkHdr.writeUInt32LE(jsonBuf.length, 0); jsonChunkHdr.writeUInt32LE(0x4E4F534A, 4);
    const binChunkHdr  = Buffer.alloc(8);
    binChunkHdr.writeUInt32LE(binBuf.length,  0); binChunkHdr.writeUInt32LE(0x004E4942,  4);

    return Buffer.concat([glbHeader, jsonChunkHdr, jsonBuf, binChunkHdr, binBuf]);
}

// Walk a directory tree and collect all files matching an extension
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

// --- MAIN BUILD PROCESS ---

try {
    // 0. Update Adapters if Mobile
    if (isAndroid || isAll) {
        const adapterScript = path.join(__dirname, 'build-adapter.js');
        if (fs.existsSync(adapterScript)) {
            console.log('[BUILDER] Updating Android adapter...');
            try {
                execSync(`node "${adapterScript}"`, { cwd: __dirname, stdio: 'inherit' });
            } catch (e) {
                console.warn('[WARN] Failed to update Android adapter, using existing bundle.');
            }
        }
    }

    // 1. Clean Dist
    console.log('[BUILDER] Cleaning output directory...');
    cleanDir(DIST_DIR);
    
    const GAME_PUBLIC = path.join(DIST_DIR, 'public');
    fs.mkdirSync(GAME_PUBLIC);

    // 2. Copy Engine Core (Public)
    console.log('[BUILDER] Copying engine core...');
    
    // Whitelist approach for root of public to avoid copying tools
    // Editor HTML/JS files (e.g. *_editor.html, *_editor.js, dashboard.html, launcher.html)
    // are excluded unless explicitly listed — they are launcher-only and never shipped in game builds.
    // 3D engines (topdown-3d, fps-3d, platformer-3d) and vendors (lib/three, lib/cannon-es,
    // lib/vox-loader) are included automatically via the 'engines' and 'lib' directory entries.
    const allowedRootFiles = [
        'launcher.html', 'splash.html', 'credits.html', 'favicon.ico',
        'slot_selection.html', 'slot_selection.js',
        'campaign_browser.html', 'campaign_browser.js',
        'campaign_launcher.html', 'campaign_runtime.html',
        'index.html', 'pixel_scrollbars.css', 'transitions.css', 'theme.js',
        'irab-enhanced.js', 'assistant.js', 'InteractiveCutsceneAPI.js'
    ];
    const allowedRootDirs = [
        'engines', 'base_game', 'fonts', 'js', 'lib', 'muzikler', 
        'sprite-art', 'dunyalar', 'data', 'oyuncu_profilleri',
        'ai', 'shared', 'css', 'strategies', 'daw', 'icons'
    ];

    function copyFiltered(src, dest, isRoot = false) {
        if (!fs.existsSync(src)) return;
        const items = fs.readdirSync(src);
        for (const item of items) {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            const stat = fs.statSync(srcPath);

            if (isRoot) {
                if (stat.isDirectory()) {
                    if (allowedRootDirs.includes(item)) {
                        copyRecursiveSync(srcPath, destPath);
                    }
                } else {
                    if (allowedRootFiles.includes(item)) {
                        fs.copyFileSync(srcPath, destPath);
                    }
                }
            } else {
                copyRecursiveSync(srcPath, destPath);
            }
        }
    }
    
    copyFiltered(PUBLIC_DIR, GAME_PUBLIC, true);

    // 3. Copy Project Assets (Overwriting/Merging)
    console.log('[BUILDER] Merging project assets...');
    
    copyRecursiveSync(path.join(PROJECT_DIR, 'dunyalar'), path.join(GAME_PUBLIC, 'dunyalar'));
    copyRecursiveSync(path.join(PROJECT_DIR, 'muzikler'), path.join(GAME_PUBLIC, 'muzikler'));
    copyRecursiveSync(path.join(PROJECT_DIR, 'data'), path.join(GAME_PUBLIC, 'data'));
    copyRecursiveSync(path.join(PROJECT_DIR, 'assets'), path.join(GAME_PUBLIC, 'assets'));
    
    const projectBaseAssets = path.join(PROJECT_DIR, 'base_game', 'assets');
    if (fs.existsSync(projectBaseAssets)) {
        console.log('[BUILDER] Merging project base_game/assets...');
        copyRecursiveSync(projectBaseAssets, path.join(GAME_PUBLIC, 'base_game', 'assets'));
    }

    const projectSprites = path.join(PROJECT_DIR, 'sprites.js');
    if (fs.existsSync(projectSprites)) {
        console.log('[BUILDER] Injecting project sprites.js...');
        const baseGameDir = path.join(GAME_PUBLIC, 'base_game');
        if (!fs.existsSync(baseGameDir)) fs.mkdirSync(baseGameDir, { recursive: true });
        fs.copyFileSync(projectSprites, path.join(baseGameDir, 'sprites.js'));
    }

    ['sprites.json', 'assets.json'].forEach(file => {
        const src = path.join(PROJECT_DIR, file);
        if (fs.existsSync(src)) {
            console.log(`[BUILDER] Copying project ${file}...`);
            const dataDir = path.join(GAME_PUBLIC, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.copyFileSync(src, path.join(dataDir, file));
        }
    });

    const projectMeta2 = path.join(PROJECT_DIR, 'ketebe.json');
    if (fs.existsSync(projectMeta2)) {
        console.log('[BUILDER] Copying project metadata...');
        fs.copyFileSync(projectMeta2, path.join(GAME_PUBLIC, 'ketebe.json'));
    }

    // 3D-specific project assets
    if (IS_3D_ENGINE.has(ENGINE_TYPE)) {
        // 3a. Copy assets3d directory (GLTF/GLB models, palette files, etc.)
        const assets3dSrc = path.join(PROJECT_DIR, 'assets3d');
        if (fs.existsSync(assets3dSrc)) {
            console.log('[BUILDER] Copying 3D assets (assets3d/)...');
            copyRecursiveSync(assets3dSrc, path.join(GAME_PUBLIC, 'assets3d'));
        }

        // 3b. Copy palette files from project root (*.pal.json)
        for (const palFile of fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.pal.json'))) {
            const src = path.join(PROJECT_DIR, palFile);
            console.log(`[BUILDER] Copying palette: ${palFile}`);
            fs.copyFileSync(src, path.join(GAME_PUBLIC, palFile));
        }

        // 3c. Bake any remaining .vox files in the dist assets3d/ into .glb
        const bakeDir = path.join(GAME_PUBLIC, 'assets3d');
        const voxFiles = findFiles(bakeDir, '.vox');
        if (voxFiles.length > 0) {
            console.log(`[BUILDER] Baking ${voxFiles.length} .vox file(s) to .glb...`);
            let baked = 0, skipped = 0;
            for (const voxFile of voxFiles) {
                const glbFile = voxFile.replace(/\.vox$/, '.glb');
                try {
                    const glb = bakeVoxToGlb(voxFile);
                    if (glb) {
                        fs.writeFileSync(glbFile, glb);
                        fs.unlinkSync(voxFile); // remove raw .vox from shipped build
                        baked++;
                        console.log(`  [BAKE] ${path.basename(voxFile)} → ${path.basename(glbFile)} (${(glb.length / 1024).toFixed(1)} KB)`);
                    } else {
                        console.warn(`  [BAKE] Skipped empty vox: ${path.basename(voxFile)}`);
                        skipped++;
                    }
                } catch (e) {
                    console.warn(`  [BAKE] Failed to bake ${path.basename(voxFile)}: ${e.message}`);
                    skipped++;
                }
            }
            console.log(`[BUILDER] VOX bake complete: ${baked} baked, ${skipped} skipped.`);
        }
    }

    // 4. Create Game Server (for Web/Electron)
    console.log('[BUILDER] Generating runtime server...');
    const serverCode = `
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Determine User Data Path
const isElectron = process.versions.hasOwnProperty('electron');
let userDataPath;

if (isElectron) {
    const { app: electronApp } = require('electron');
    userDataPath = path.join(electronApp.getPath('userData'), 'SaveData');
} else {
    userDataPath = path.join(__dirname, 'saves');
}

if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

// Legacy Alias for RPG Engine
app.use('/base_game', express.static(path.join(__dirname, 'public', 'engines', 'rpg-topdown')));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes (Saves, Profiles, Logic, Brains...)
app.get('/api/save/:username/:slot', (req, res) => {
    const filePath = path.join(userDataPath, \`\${req.params.username}_\${req.params.slot}.json\`);
    if (fs.existsSync(filePath)) res.json(JSON.parse(fs.readFileSync(filePath)));
    else res.status(404).json({});
});

app.post('/api/save/:username/:slot', (req, res) => {
    const filePath = path.join(userDataPath, \`\${req.params.username}_\${req.params.slot}.json\`);
    fs.writeFileSync(filePath, JSON.stringify(req.body));
    res.json({ success: true });
});

app.get('/api/profile/:username', (req, res) => {
    const filePath = path.join(userDataPath, \`profile_\${req.params.username}.json\`);
    if (fs.existsSync(filePath)) res.json(JSON.parse(fs.readFileSync(filePath)));
    else res.json({ hp: 100, mana: 50, stamina: 100 });
});

app.post('/api/profile/:username', (req, res) => {
    const filePath = path.join(userDataPath, \`profile_\${req.params.username}.json\`);
    fs.writeFileSync(filePath, JSON.stringify(req.body));
    res.json({ success: true });
});

app.get('/api/logic/js/:name', (req, res) => {
    const f = path.join(__dirname, 'public', 'data', 'logic', \`\${req.params.name}.js\`);
    if(fs.existsSync(f)) res.sendFile(f);
    else res.status(404).send('// Not found');
});
app.get('/api/logic/:name', (req, res) => {
    const f = path.join(__dirname, 'public', 'data', 'logic', \`\${req.params.name}.json\`);
    if(fs.existsSync(f)) res.json(JSON.parse(fs.readFileSync(f)));
    else res.status(404).json({});
});
app.get('/api/brains/list', (req, res) => {
    const dir = path.join(__dirname, 'public', 'data', 'brains');
    if(fs.existsSync(dir)) res.json(fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>f.replace('.json','')));
    else res.json([]);
});

module.exports = new Promise((resolve) => {
    app.listen(PORT, () => {
        console.log(\`Game Server running on \${PORT}\`);
        resolve();
    });
});
    `;
    fs.writeFileSync(path.join(DIST_DIR, 'server.js'), serverCode);

    // 5. Create Electron Main
    console.log('[BUILDER] Generating Electron entry...');
    const electronMain = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const serverReady = require('./server.js');

function createWindow () {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    serverReady.then(() => {
        win.loadURL('http://localhost:3000/launcher.html');
    });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
    `;
    fs.writeFileSync(path.join(DIST_DIR, 'main.js'), electronMain);

    const icnsSource = path.join(PUBLIC_DIR, 'icons', 'ketebe.icns');
    const icnsDest = path.join(DIST_DIR, 'ketebe.icns');
    if (fs.existsSync(icnsSource)) fs.copyFileSync(icnsSource, icnsDest);

    // 6. Create Package.json for Build
    const buildPackage = {
        name: "ketebe-game-release",
        version: "1.0.0",
        main: "main.js",
        scripts: {
            "start": "node server.js",
            "dist": "electron-builder"
        },
        dependencies: {
            "express": "^4.18.2",
            "cors": "^2.8.5"
        },
        devDependencies: {
            "electron": "^28.0.0",
            "electron-builder": "^24.9.1",
            "electron-packager": "^17.1.2"
        },
        build: {
            "appId": "com.ketebe.game",
            "productName": PROJECT_NAME,
            "directories": { "output": "release" },
            "files": ["**/*"],
            "win": { "target": "dir", "sign": null }
        }
    };
    fs.writeFileSync(path.join(DIST_DIR, 'package.json'), JSON.stringify(buildPackage, null, 2));

    // 7. Execute Builds
    if (isElectron || isAll) {
        console.log('\x1b[33m[BUILDER] Preparing Electron Environment...\x1b[0m');
        execSync('npm install', { cwd: DIST_DIR, stdio: 'inherit' });
        
        if (isWin || isAll) {
            console.log('\x1b[33m[BUILDER] Building for Electron (Windows)...\x1b[0m');
            try {
                execSync(`npx electron-packager . "${PROJECT_NAME}" --platform=win32 --arch=x64 --out=release --overwrite`, { cwd: DIST_DIR, stdio: 'inherit' });
            } catch (e) { 
                console.error('[ERROR] Windows build failed.');
                hasErrors = true;
            }
        }

        if (isMac || isAll) {
            console.log('\x1b[33m[BUILDER] Building for Electron (macOS)...\x1b[0m');
            try {
                execSync(`npx electron-packager . "${PROJECT_NAME}" --platform=darwin --arch=x64 --out=release --overwrite --icon=ketebe.icns`, { cwd: DIST_DIR, stdio: 'inherit' });
            } catch (e) { 
                console.error('[ERROR] macOS build failed.');
                hasErrors = true;
            }
        }
    }

    if (isMobile || isAll) {
        console.log('\x1b[33m[BUILDER] Preparing Mobile Sync...\x1b[0m');
        const capConfigPath = path.join(__dirname, 'capacitor.config.ts');
        const capConfigBackup = fs.readFileSync(capConfigPath, 'utf8');
        const newConfig = capConfigBackup.replace(/webDir:\s*['"]public['"]/, `webDir: 'dist/game/public'`);
        fs.writeFileSync(capConfigPath, newConfig);
        
        try {
            if (isAndroid || isAll) {
                execSync('npx cap sync android', { cwd: __dirname, stdio: 'inherit' });
            }
            if (isIos || isAll) {
                execSync('npx cap sync ios', { cwd: __dirname, stdio: 'inherit' });
            }
        } catch (e) { 
            console.error('[ERROR] Mobile sync failed.');
            hasErrors = true;
        }
        finally { fs.writeFileSync(capConfigPath, capConfigBackup); }
    }

    if (hasErrors) {
        console.log('\x1b[31m[DONE] Build process finished with errors.\x1b[0m');
        process.exit(1);
    } else {
        console.log('\x1b[32m[DONE] Build process finished successfully.\x1b[0m');
        process.exit(0);
    }

} catch (err) {
    console.error(`\x1b[31m[FATAL] Build failed: ${err.message}\x1b[0m`);
    process.exit(1);
}
