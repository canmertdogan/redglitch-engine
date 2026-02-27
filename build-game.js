const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- CONFIGURATION ---
const PROJECT_NAME = process.argv[2] || 'Default Project';
const PROJECT_DIR = path.join(__dirname, 'projects', PROJECT_NAME);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist', 'game');
const BUILD_TYPE = process.argv[3] || 'all'; // web, electron, windows, macos, android, ios, all

console.log(`\x1b[36m[BUILDER] Starting build for project: ${PROJECT_NAME}\x1b[0m`);
console.log(`[BUILDER] Source: ${PROJECT_DIR}`);
console.log(`[BUILDER] Output: ${DIST_DIR}`);

if (!fs.existsSync(PROJECT_DIR)) {
    console.error(`\x1b[31m[ERROR] Project directory not found: ${PROJECT_DIR}\x1b[0m`);
    process.exit(1);
}

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

// --- MAIN BUILD PROCESS ---

try {
    // 1. Clean Dist
    console.log('[BUILDER] Cleaning output directory...');
    cleanDir(DIST_DIR);
    
    const GAME_PUBLIC = path.join(DIST_DIR, 'public');
    fs.mkdirSync(GAME_PUBLIC);

    // 2. Copy Engine Core (Public)
    console.log('[BUILDER] Copying engine core...');
    
    // Whitelist approach for root of public to avoid copying tools
    const allowedRootFiles = ['index.html', 'splash.html', 'credits.html', 'favicon.ico', 'pixel_scrollbars.css', 'theme.js']; // theme.js might be needed?
    const allowedRootDirs = ['engines', 'base_game', 'fonts', 'js', 'lib', 'muzikler', 'sprite-art', 'dunyalar', 'data', 'oyuncu_profilleri'];

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
                        fs.mkdirSync(destPath, { recursive: true });
                        copyRecursiveSync(srcPath, destPath); // Recursive copy for allowed dirs
                    }
                } else {
                    if (allowedRootFiles.includes(item)) {
                        fs.copyFileSync(srcPath, destPath);
                    }
                }
            } else {
                // Should not happen if we use copyRecursive for subdirs, 
                // but if we were recursively filtering:
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
    
    copyFiltered(PUBLIC_DIR, GAME_PUBLIC, true);

    // 3. Copy Project Assets (Overwriting/Merging)
    console.log('[BUILDER] Merging project assets...');
    
    // 3a. Copy entire project structure into public (simulating how server serves them)
    // Project/dunyalar -> public/dunyalar
    // Project/assets -> public/base_game/assets (Mapping check: server serves /base_game/assets from project/assets if it exists?)
    // Actually server.js serves /base_game/assets from public, unless /api/files/assets is called.
    // BUT, the game loads assets relative to where?
    // Let's assume standard structure.
    
    copyRecursiveSync(path.join(PROJECT_DIR, 'dunyalar'), path.join(GAME_PUBLIC, 'dunyalar'));
    copyRecursiveSync(path.join(PROJECT_DIR, 'muzikler'), path.join(GAME_PUBLIC, 'muzikler'));
    copyRecursiveSync(path.join(PROJECT_DIR, 'data'), path.join(GAME_PUBLIC, 'data')); // Logic, brains, etc.
    
    // Sprites.js special case
    const projectSprites = path.join(PROJECT_DIR, 'sprites.js');
    if (fs.existsSync(projectSprites)) {
        console.log('[BUILDER] Injecting project sprites.js...');
        fs.copyFileSync(projectSprites, path.join(GAME_PUBLIC, 'base_game', 'sprites.js'));
    }

    // Copy Project Metadata (ketebe.json)
    const projectMeta = path.join(PROJECT_DIR, 'ketebe.json');
    if (fs.existsSync(projectMeta)) {
        console.log('[BUILDER] Copying project metadata...');
        fs.copyFileSync(projectMeta, path.join(GAME_PUBLIC, 'ketebe.json'));
    }

    // 4. Create Game Server (for Web/Electron)
    console.log('[BUILDER] Generating runtime server...');
    const serverCode = `
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Determine User Data Path
const isElectron = process.versions.hasOwnProperty('electron');
let userDataPath;

if (isElectron) {
    const { app: electronApp } = require('electron');
    userDataPath = path.join(electronApp.getPath('userData'), 'SaveData');
} else {
    userDataPath = path.join(__dirname, 'saves'); // Local fallback for pure node
}

if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

app.use(express.json({ limit: '50mb' }));

// Legacy Alias for RPG Engine
app.use('/base_game', express.static(path.join(__dirname, 'public', 'engines', 'rpg-topdown')));

app.use(express.static(path.join(__dirname, 'public')));

// API: Save System (Persistent)
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
    else res.json({ hp: 100, mana: 50, stamina: 100 }); // Default
});

app.post('/api/profile/:username', (req, res) => {
    const filePath = path.join(userDataPath, \`profile_\${req.params.username}.json\`);
    fs.writeFileSync(filePath, JSON.stringify(req.body));
    res.json({ success: true });
});

// API: Static Logic/Assets (Read from bundle)
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

app.listen(PORT, () => {
    console.log(\`Game Server running on \${PORT}\`);
});

module.exports = app;
    `;
    fs.writeFileSync(path.join(DIST_DIR, 'server.js'), serverCode);

    // 5. Create Electron Main
    console.log('[BUILDER] Generating Electron entry...');
    const electronMain = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const server = require('./server.js');

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

    // Wait for server? It starts synchronously in server.js usually
    win.loadURL('http://localhost:3000');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
    `;
    fs.writeFileSync(path.join(DIST_DIR, 'main.js'), electronMain);

    // 6. Create Package.json for Build
    const buildPackage = {
        name: "ketebe-game-release",
        version: "1.0.0",
        description: "A Ketebe Engine Game",
        author: "Ketebe Game Studio",
        main: "main.js",
        scripts: {
            "start": "node server.js",
            "dist": "electron-builder"
        },
        dependencies: {
            "express": "^4.18.2"
        },
        devDependencies: {
            "electron": "^28.0.0",
            "electron-builder": "^24.9.1"
        },
        build: {
            "appId": "com.ketebe.game",
            "productName": PROJECT_NAME,
            "directories": { "output": "release" },
            "files": ["**/*"],
            "win": { 
                "target": "dir",
                "sign": null // Disable signing to avoid winCodeSign download/symlink issues
            }
        }
    };
    fs.writeFileSync(path.join(DIST_DIR, 'package.json'), JSON.stringify(buildPackage, null, 2));

    // 7. Execute Builds
    
    // --- ELECTRON BUILDS ---
    if (BUILD_TYPE === 'electron' || BUILD_TYPE === 'windows' || BUILD_TYPE === 'macos' || BUILD_TYPE === 'all') {
        console.log('\x1b[33m[BUILDER] Preparing Electron Environment...\x1b[0m');
        
        console.log('[BUILDER] Installing dependencies in dist/game...');
        // We need devDependencies (electron) for the builder to know the version
        execSync('npm install', { cwd: DIST_DIR, stdio: 'inherit' });
        
        // Windows Build
        if (BUILD_TYPE === 'electron' || BUILD_TYPE === 'windows' || BUILD_TYPE === 'all') {
            console.log('\x1b[33m[BUILDER] Building for Electron (Windows)...\x1b[0m');
            try {
                execSync(`npx electron-packager . "${PROJECT_NAME}" --platform=win32 --arch=x64 --out=release --overwrite`, { cwd: DIST_DIR, stdio: 'inherit' });
                console.log('\x1b[32m[SUCCESS] Electron (Windows) build complete in dist/game/release\x1b[0m');
            } catch (e) {
                console.error('\x1b[31m[ERROR] Electron (Windows) packaging failed.\x1b[0m');
                // Don't throw, let other builds proceed if 'all'
            }
        }

        // macOS Build
        if (BUILD_TYPE === 'electron' || BUILD_TYPE === 'macos' || BUILD_TYPE === 'all') {
            console.log('\x1b[33m[BUILDER] Building for Electron (macOS)...\x1b[0m');
            try {
                // Using x64 for broader compatibility, or consider 'universal' or 'arm64'
                execSync(`npx electron-packager . "${PROJECT_NAME}" --platform=darwin --arch=x64 --out=release --overwrite`, { cwd: DIST_DIR, stdio: 'inherit' });
                console.log('\x1b[32m[SUCCESS] Electron (macOS) build complete in dist/game/release\x1b[0m');
            } catch (e) {
                console.error('\x1b[31m[ERROR] Electron (macOS) packaging failed.\x1b[0m');
            }
        }
    }

    // --- MOBILE BUILDS (Capacitor) ---
    if (BUILD_TYPE === 'android' || BUILD_TYPE === 'ios' || BUILD_TYPE === 'all') {
        console.log('\x1b[33m[BUILDER] Preparing Mobile Sync (Android/iOS)...\x1b[0m');
        
        // Strategy: Temporary Config Swap
        const capConfigPath = path.join(__dirname, 'capacitor.config.ts');
        const capConfigBackup = fs.readFileSync(capConfigPath, 'utf8');
        
        const newConfig = capConfigBackup.replace(/webDir:\s*['"]public['"]/, `webDir: 'dist/game/public'`);
        fs.writeFileSync(capConfigPath, newConfig);
        
        try {
            if (BUILD_TYPE === 'android' || BUILD_TYPE === 'all') {
                console.log('[BUILDER] Syncing Android...');
                execSync('npx cap sync android', { cwd: __dirname, stdio: 'inherit' });
                console.log('\x1b[32m[SUCCESS] Android sync complete. Open with "npx cap open android"\x1b[0m');
            }

            if (BUILD_TYPE === 'ios' || BUILD_TYPE === 'all') {
                console.log('[BUILDER] Syncing iOS...');
                execSync('npx cap sync ios', { cwd: __dirname, stdio: 'inherit' });
                console.log('\x1b[32m[SUCCESS] iOS sync complete. Open with "npx cap open ios"\x1b[0m');
            }

        } catch (e) {
            console.error('[ERROR] Mobile sync failed:', e);
        } finally {
            // Restore Config
            fs.writeFileSync(capConfigPath, capConfigBackup);
        }
    }

    console.log('\x1b[32m[DONE] Build process finished.\x1b[0m');

} catch (err) {
    console.error(`\x1b[31m[FATAL] Build failed: ${err.message}\x1b[0m`);
    process.exit(1);
}
