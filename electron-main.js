const { app, BrowserWindow, ipcMain, Menu, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const APP_NAME = 'Redglitch Game Studio';

// Set the app name before Electron initializes the app menu or lock state.
app.name = APP_NAME;
app.setName(APP_NAME);

// --- AI CORTEX MANAGER ---
// The Python backend is optional, so its failures must be loud in the console
// instead of silently disabling the AI features.
const CORTEX_BOOT_GRACE_MS = 120000;     // don't police heartbeats while Python imports/loads
const CORTEX_HEARTBEAT_STALE_MS = 20000; // backend prints HEARTBEAT every 5s (backend/main.py)
const CORTEX_MAX_RESTARTS = 5;           // per 60s window, then latch off until app restart

class CortexManager {
    constructor() {
        this.process = null;
        this.isRunning = false;
        this.crashed = false;
        this.heartbeatTimer = null;
        this.lastHeartbeat = Date.now();
        this.spawnedAt = 0;
        this.restartCount = 0;
        this.restartWindowStart = Date.now();
        this.restartTimer = null;
    }

    status() {
        return { running: this.isRunning, crashed: this.crashed, restarts: this.restartCount };
    }

    start() {
        if (this.isRunning) return;
        // Prevent duplicate spawns while a delayed restart is pending.
        if (this.restartTimer) {
            console.log('[Cortex] Start requested during restart delay; deferring.');
            return;
        }

        if (this.crashed) {
            console.error('[Cortex Critical] AI Brain is latched off after a crash loop. Restart the app, or run it manually: cd backend && ./venv/bin/python main.py');
            return;
        }

        const now = Date.now();
        if (now - this.restartWindowStart > 60000) {
            this.restartCount = 0;
            this.restartWindowStart = now;
        }

        if (this.restartCount >= CORTEX_MAX_RESTARTS) {
            this.crashed = true;
            console.error(`[Cortex Critical] AI Brain restarted ${this.restartCount} times in under 60s — giving up. AI features are unavailable for this session.`);
            return;
        }

        this.restartCount++;

        const backendDir = path.join(__dirname, 'backend');
        const scriptPath = path.join(backendDir, 'main.py');
        // Windows venvs put the interpreter under Scripts/, POSIX under bin/.
        const venvPython = process.platform === 'win32'
            ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
            : path.join(backendDir, 'venv', 'bin', 'python3');
        const systemPython = process.platform === 'win32' ? 'python' : 'python3';

        console.log('[Cortex] Starting AI Brain...');

        const fs = require('fs');
        // existsSync() follows symlinks, so a dangling venv symlink also lands in this branch.
        let pythonCmd = venvPython;
        if (!fs.existsSync(venvPython)) {
            pythonCmd = systemPython;
            console.warn(`[Cortex] Backend venv interpreter not usable at ${venvPython} (missing or dangling symlink) — falling back to "${systemPython}".`);
            console.warn('[Cortex] To fix: cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt');
        }

        this.spawnedAt = Date.now();
        this.process = spawn(pythonCmd, [scriptPath], {
            cwd: backendDir,
            env: { 
                ...process.env, 
                PYTHONUNBUFFERED: '1',
                TOKENIZERS_PARALLELISM: 'false',
                OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES',
                GGML_METAL: '0'
            }
        });

        this.process.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output.includes('HEARTBEAT')) {
                this.lastHeartbeat = Date.now();
            } else {
                console.log(`[Cortex] ${output}`);
            }
        });

        this.process.stderr.on('data', (data) => {
            const error = data.toString().trim();
            if (error.includes('ModuleNotFoundError')) {
                console.error(`[Cortex Critical] Missing Python dependencies! Recreate the backend venv (see the warning above) — the AI backend cannot run without it.`);
            } else {
                console.error(`[Cortex Error] ${error}`);
            }
        });

        this.process.on('close', (code) => {
            console.log(`[Cortex] Process exited with code ${code}`);
            this.process = null; // must be cleared BEFORE restart(), which checks it for liveness
            this.isRunning = false;
            this._stopHeartbeatMonitor();
            if (code !== 0) {
                console.log('[Cortex] Unexpected exit, restarting...');
                this.restart();
            }
        });

        this.isRunning = true;
        this._startHeartbeatMonitor();
    }

    _startHeartbeatMonitor() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.lastHeartbeat = Date.now();
        this.heartbeatTimer = setInterval(() => {
            if (!this.isRunning) return;
            const now = Date.now();
            // Cold-start Python imports + model load can exceed the stale window;
            // only start policing once the process has had a chance to reach its loop.
            if (now - this.spawnedAt < CORTEX_BOOT_GRACE_MS) return;
            // If no heartbeat for 20 seconds, something is wrong
            if (now - this.lastHeartbeat > CORTEX_HEARTBEAT_STALE_MS) {
                console.warn('[Cortex] AI Brain heartbeat lost. Force-restarting...');
                this.restart();
            }
        }, 5000);
    }

    _stopHeartbeatMonitor() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    restart() {
        const proc = this.process;
        // No live process to wait for (already exited, or never spawned) — the
        // old code attached once('close') to a dead process, so the automatic
        // restart silently never happened.
        if (!proc || proc.exitCode !== null || proc.signalCode !== null || proc.killed) {
            this.process = null;
            this.isRunning = false;
            this._stopHeartbeatMonitor();
            this.restartTimer = setTimeout(() => {
                this.restartTimer = null;
                this.start();
            }, 100);
            return;
        }

        console.log('[Cortex] Stopping AI Brain for restart...');
        this._stopHeartbeatMonitor();
        this.isRunning = false;
        proc.once('close', () => {
            if (this.process === proc) this.process = null;
            this.restartTimer = setTimeout(() => {
                this.restartTimer = null;
                this.start();
            }, 100);
        });
        proc.kill();
    }

    stop() {
        this._stopHeartbeatMonitor();
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        // An explicit stop is a user action: clear the crash-loop latch so a
        // manual start can try again without relaunching the app.
        this.crashed = false;
        this.restartCount = 0;
        this.restartWindowStart = Date.now();
        if (this.process) {
            console.log('[Cortex] Stopping AI Brain...');
            this.process.kill();
            this.process = null;
            this.isRunning = false;
        }
    }
}

const cortex = new CortexManager();

// --- SINGLE INSTANCE LOCK ---
// If another instance is already running, show a warning and quit this one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // A second instance tried to launch — focus the existing window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// Enable WebNN and WebGPU for hardware-accelerated AI inference
app.commandLine.appendSwitch('enable-features', 'WebMachineLearningNeuralNetwork,WebNN');
app.commandLine.appendSwitch('enable-unsafe-webgpu');

// Increase GPU memory limits to prevent tile memory errors when drawing huge maps
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '4096');
app.commandLine.appendSwitch('max-decoded-image-size-mb', '250');

// Set app name for macOS top bar - MUST BE DONE BEFORE READY
if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
        applicationName: APP_NAME,
        applicationVersion: '1.0.0',
        copyright: 'Copyright © 2026 Redglitch',
        version: '1.0.0'
    });
}

// Start the Express server (only loaded when we have the single instance lock)
let expressApp, httpServer, PORT;
const SPLASH_CLOSE_DELAY_MS = 900;

let mainWindow;
let splashWindow;

function createMenu() {
    const template = [
        ...(process.platform === 'darwin' ? [{
            label: APP_NAME,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: 'File',
            submenu: [
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forcereload' },
                { role: 'toggledevtools' },
                { type: 'separator' },
                { role: 'resetzoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { type: 'separator' },
                { role: 'front' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Global IPC handlers (registered once; safe to call even when mainWindow is null)
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    console.log('[ipc] window-maximize requested. isMaximized=', mainWindow.isMaximized());
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        console.log('[ipc] window-unmaximize executed');
    } else {
        mainWindow.maximize();
        console.log('[ipc] window-maximize executed');
    }
});
ipcMain.on('window-unmaximize', () => { if (mainWindow) mainWindow.unmaximize(); });
ipcMain.on('window-resize', (event, w, h) => {
    if (!mainWindow) return;
    console.log(`[ipc] window-resize requested: ${w}x${h}`);
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        console.log('[ipc] unmaximizing before resize');
    }
    // Clamp size to sensible bounds to prevent DoS / unusable window states.
    const width = Math.min(Math.max(Number(w) || 800, 200), 3840);
    const height = Math.min(Math.max(Number(h) || 600, 200), 2160);
    mainWindow.setSize(width, height);
    mainWindow.center();
    console.log(`[ipc] window-resize applied: ${width}x${height}`);
});
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.on('open-external', (event, url) => {
    try {
        const parsed = new URL(url);
        if (['http:', 'https:'].includes(parsed.protocol)) {
            shell.openExternal(url);
        }
    } catch (e) {
        console.error('[ipc] Invalid external URL:', url);
    }
});
ipcMain.on('show-item-in-folder', (event, filePath) => {
    if (!filePath) return;
    const absolutePath = path.resolve(__dirname, filePath);
    const projectsDir = path.join(__dirname, 'projects');
    
    // Only allow showing files within the application's root directory or user projects
    if (absolutePath.startsWith(__dirname) || absolutePath.startsWith(projectsDir)) {
        shell.showItemInFolder(absolutePath);
    } else {
        console.warn('[ipc] Blocked showItemInFolder for outside path:', absolutePath);
    }
});
ipcMain.on('open-devtools', () => {
    if (process.env.NODE_ENV === 'development' || process.env.OPEN_DEVTOOLS === '1') {
        if (mainWindow) mainWindow.webContents.openDevTools();
    } else {
        console.warn('[ipc] open-devtools blocked in production');
    }
});

function createWindow() {
    // Create Splash Window
    splashWindow = new BrowserWindow({
        width: 600,
        height: 400,
        show: false,
        transparent: true,
        backgroundColor: '#00000000',
        frame: false,
        alwaysOnTop: true,
        icon: path.join(__dirname, 'public/icons/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    splashWindow.loadFile(path.join(__dirname, 'public/splash.html'));
    splashWindow.center();
    splashWindow.once('ready-to-show', () => splashWindow.show());

    // Main Window setup
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 600,
        minWidth: 800,
        minHeight: 450,
        show: false, // Don't show until ready
        title: APP_NAME,
        icon: path.join(__dirname, 'public/icons/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: false,
        backgroundColor: '#f5f7fb',
        frame: false,
        resizable: true,
        center: true
    });

    // Start the Express server (it's already listening from server.js)
    // Just load the URL since server.js starts it automatically.
    // 127.0.0.1 (not localhost): the server binds IPv4 loopback only.
    mainWindow.loadURL(`http://127.0.0.1:${PORT}/dashboard.html`);

    // Handle splash timeout
    mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
            if (splashWindow) splashWindow.close();
            mainWindow.show();
        }, SPLASH_CLOSE_DELAY_MS);
    });

    // Create and set the menu
    createMenu();

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsedUrl = new URL(url);
            if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
                return { 
                    action: 'allow',
                    overrideBrowserWindowOptions: {
                        width: 1280,
                        height: 720,
                        autoHideMenuBar: true
                    }
                };
            }
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                shell.openExternal(url);
                return { action: 'deny' };
            }
            console.warn('[ipc] Blocked window open for unsupported protocol:', parsedUrl.protocol);
            return { action: 'deny' };
        } catch (e) {
            console.error('[ipc] Invalid URL in window open handler:', url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    if (!gotLock) return; // Already handled above

    // Load the Express server now that we own the lock
    ({ app: expressApp, server: httpServer } = require('./server'));
    ({ PORT } = require('./server/config'));

    // Setup AI Cortex IPC handlers. These return the real manager state so a UI
    // can distinguish "starting" from "latched off after a crash loop" — they
    // used to return true unconditionally, even when start() refused to run.
    ipcMain.handle('cortex-start', () => { cortex.start(); return cortex.status(); });
    ipcMain.handle('cortex-stop', () => { cortex.stop(); return cortex.status(); });
    ipcMain.handle('cortex-status', () => cortex.status());

    // Set dock icon for macOS as early as possible
    if (process.platform === 'darwin') {
        const iconPath = path.join(__dirname, 'public/icons/icon.png');
        try {
            const image = nativeImage.createFromPath(iconPath);
            if (!image.isEmpty()) {
                app.dock.setIcon(image);
            }
        } catch (err) {
            console.error('Failed to set dock icon:', err);
        }
    }
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('quit', () => {
    if (httpServer && httpServer.close) {
        httpServer.close();
    }
    cortex.stop();
});
