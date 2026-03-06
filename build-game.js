const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

    const projectMeta = path.join(PROJECT_DIR, 'ketebe.json');
    if (fs.existsSync(projectMeta)) {
        console.log('[BUILDER] Copying project metadata...');
        fs.copyFileSync(projectMeta, path.join(GAME_PUBLIC, 'ketebe.json'));
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
