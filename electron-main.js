const { app, BrowserWindow, ipcMain, Menu, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// --- AI CORTEX MANAGER ---
class CortexManager {
    constructor() {
        this.process = null;
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;

        const backendDir = path.join(__dirname, 'backend');
        const scriptPath = path.join(backendDir, 'main.py');
        const venvPath = path.join(backendDir, 'venv', 'bin', 'python3');
        
        console.log('[Cortex] Starting AI Brain...');
        
        // Use venv if it exists, otherwise fallback to system python3
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
            console.log(`[Cortex] ${output}`);
        });

        this.process.stderr.on('data', (data) => {
            const error = data.toString().trim();
            if (error.includes('ModuleNotFoundError')) {
                console.error(`[Cortex Critical] Missing Python dependencies! Please run: cd backend && pip install -r requirements.txt`);
            } else {
                console.error(`[Cortex Error] ${error}`);
            }
        });

        this.process.on('close', (code) => {
            console.log(`[Cortex] Process exited with code ${code}`);
            this.isRunning = false;
            // Auto-restart if it was unexpected
            if (code !== 0 && code !== null) {
                console.log('[Cortex] Unexpected exit, restarting in 3s...');
                setTimeout(() => this.start(), 3000);
            }
        });

        this.isRunning = true;
    }

    stop() {
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
    app.whenReady().then(() => {
        dialog.showMessageBoxSync({
            type: 'warning',
            buttons: ['OK'],
            title: 'Ketebe Game Studio',
            message: 'Another instance of Ketebe Studio is already running.\nThis instance will now close.'
        });
        app.quit();
    });
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

// Set app name for macOS top bar - MUST BE DONE BEFORE READY
if (process.platform === 'darwin') {
    app.name = 'Ketebe Game Studio';
    app.setName('Ketebe Game Studio');
    console.log('App Name (Initial):', app.name);
    console.log('App Name via getName():', app.getName());
    app.setAboutPanelOptions({
        applicationName: 'Ketebe Game Studio',
        applicationVersion: '1.0.0',
        copyright: 'Copyright © 2026 Ketebe',
        version: '1.0.0'
    });
}

// Start the Express server (only loaded when we have the single instance lock)
let expressApp, httpServer, PORT;

let mainWindow;
let splashWindow;

function createMenu() {
    const template = [
        ...(process.platform === 'darwin' ? [{
            label: 'Ketebe Game Studio',
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
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        icon: path.join(__dirname, 'public/icons/favicon-6.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    splashWindow.loadFile(path.join(__dirname, 'public/splash.html'));
    splashWindow.center();

    // Main Window setup
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 600,
        minWidth: 800,
        minHeight: 450,
        show: false, // Don't show until ready
        title: "Ketebe Game Studio",
        icon: path.join(__dirname, 'public/icons/favicon-6.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: false,
        backgroundColor: '#0a0a0a',
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
        }, 3500); // 3.5 seconds delay
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
    ipcMain.on('open-external', (event, url) => shell.openExternal(url));
    ipcMain.on('show-item-in-folder', (event, path) => shell.showItemInFolder(path));
    ipcMain.on('open-devtools', () => mainWindow.webContents.openDevTools());

    // Create and set the menu
    createMenu();

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('localhost') || url.includes('127.0.0.1')) {
            return { 
                action: 'allow',
                overrideBrowserWindowOptions: {
                    width: 1280,
                    height: 720,
                    autoHideMenuBar: true
                }
            };
        }
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
            return { action: 'deny' };
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

    // Start AI Cortex
    cortex.start();

    // Set dock icon for macOS as early as possible
    if (process.platform === 'darwin') {
        const iconPath = path.join(__dirname, 'public/icons/favicon-6.png');
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
