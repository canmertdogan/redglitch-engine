const { app, BrowserWindow, ipcMain, Menu, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const APP_NAME = 'RedGlitch Game Studio';

// Set the app name before Electron initializes the app menu or lock state.
app.name = APP_NAME;
app.setName(APP_NAME);

// --- AI CORTEX MANAGER ---
class CortexManager {
    constructor() {
        this.process = null;
        this.isRunning = false;
        this.heartbeatTimer = null;
        this.lastHeartbeat = Date.now();
        this.restartCount = 0;
        this.restartWindowStart = Date.now();
    }

    start() {
        if (this.isRunning) return;

        const now = Date.now();
        if (now - this.restartWindowStart > 60000) {
            this.restartCount = 0;
            this.restartWindowStart = now;
        }

        if (this.restartCount >= 5) {
            console.error('[Cortex Critical] AI Brain crash loop detected. Restart aborted.');
            return;
        }

        this.restartCount++;

        const backendDir = path.join(__dirname, 'backend');
        const scriptPath = path.join(backendDir, 'main.py');
        const venvPath = path.join(backendDir, 'venv', 'bin', 'python3');
        
        console.log('[Cortex] Starting AI Brain...');
        
        const fs = require('fs');
        const pythonCmd = fs.existsSync(venvPath) ? venvPath : 'python3';
        
        this.process = spawn(pythonCmd, [scriptPath], {
            cwd: backendDir,
            env: { 
                ...process.env, 
                PYTHONUNBUFFERED: '1',
                TOKENIZERS_PARALLELISM: 'false',
                OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES'
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
                console.error(`[Cortex Critical] Missing Python dependencies!`);
            } else {
                console.error(`[Cortex Error] ${error}`);
            }
        });

        this.process.on('close', (code) => {
            console.log(`[Cortex] Process exited with code ${code}`);
            this.isRunning = false;
            this._stopHeartbeatMonitor();
            if (code !== 0 && code !== null) {
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
            // If no heartbeat for 20 seconds, something is wrong
            if (now - this.lastHeartbeat > 20000) {
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
        if (this.process) {
            console.log('[Cortex] Stopping AI Brain for restart...');
            this._stopHeartbeatMonitor();
            this.isRunning = false;
            this.process.once('close', () => {
                this.process = null;
                setTimeout(() => this.start(), 100);
            });
            this.process.kill();
        } else {
            this.start();
        }
    }

    stop() {
        this._stopHeartbeatMonitor();
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
        copyright: 'Copyright © 2026 RedGlitch',
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
    // Just load the URL since server.js starts it automatically
    mainWindow.loadURL(`http://localhost:${PORT}/dashboard.html`);

    // Handle splash timeout
    mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
            if (splashWindow) splashWindow.close();
            mainWindow.show();
        }, SPLASH_CLOSE_DELAY_MS);
    });

    // IPC Handlers for custom title bar
    ipcMain.on('window-minimize', () => mainWindow.minimize());
    ipcMain.on('window-maximize', () => {
        console.log('[ipc] window-maximize requested. isMaximized=', mainWindow.isMaximized());
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
            console.log('[ipc] window-unmaximize executed');
        } else {
            mainWindow.maximize();
            console.log('[ipc] window-maximize executed');
        }
    });
    ipcMain.on('window-unmaximize', () => mainWindow.unmaximize());
    ipcMain.on('window-resize', (event, w, h) => {
        console.log(`[ipc] window-resize requested: ${w}x${h}`);
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
            console.log('[ipc] unmaximizing before resize');
        }
        mainWindow.setSize(w, h);
        mainWindow.center();
        console.log(`[ipc] window-resize applied: ${w}x${h}`);
    });
    ipcMain.on('window-close', () => mainWindow.close());
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
    ipcMain.on('open-devtools', () => mainWindow.webContents.openDevTools());

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
        } catch (e) {
            console.error('[ipc] Invalid URL in window open handler:', url);
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (httpServer && httpServer.close) {
            httpServer.close(); // Stop server when window closes
        }
    });
}

app.whenReady().then(() => {
    if (!gotLock) return; // Already handled above

    // Load the Express server now that we own the lock
    ({ app: expressApp, server: httpServer } = require('./server'));
    ({ PORT } = require('./server/config'));

    // Setup AI Cortex IPC handlers
    ipcMain.handle('cortex-start', () => { cortex.start(); return true; });
    ipcMain.handle('cortex-stop', () => { cortex.stop(); return true; });

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
    cortex.stop();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('quit', () => {
    cortex.stop();
});
