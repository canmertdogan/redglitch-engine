const WebSocket = require('ws');
const chokidar = require('chokidar');
const path = require('path');

/**
 * Setup WebSocket server with file watching capabilities
 * @param {http.Server} server - HTTP server instance
 * @param {Object} options - Configuration options
 * @param {string} options.rootDir - Root directory for file watching
 * @param {Function} options.getActiveProject - Function that returns current active project path
 * @param {string} options.projectsRoot - Projects root directory
 * @returns {Object} WebSocket server instance and utility functions
 */
function setupWebSocket(server, options = {}) {
    const {
        rootDir = __dirname,
        getActiveProject = () => rootDir,
        projectsRoot = path.join(rootDir, 'projects')
    } = options;

    const wss = new WebSocket.Server({ server });
    const connectedClients = new Set();
    let fileWatcher = null;

    // WebSocket connection handling
    wss.on('connection', (ws) => {
        console.log('[WebSocket] Client connected');
        connectedClients.add(ws);
        
        const activeProject = getActiveProject();
        
        // Send initial status
        ws.send(JSON.stringify({
            type: 'system:connected',
            data: {
                timestamp: Date.now(),
                activeProject: activeProject === rootDir ? 'ROOT' : path.basename(activeProject)
            }
        }));
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                
                // Broadcast to all other connected clients
                connectedClients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
                
                console.log('[WebSocket] Broadcasted event:', data.type);
            } catch (err) {
                console.error('[WebSocket] Invalid message received:', err);
            }
        });
        
        ws.on('close', () => {
            console.log('[WebSocket] Client disconnected');
            connectedClients.delete(ws);
        });
        
        ws.on('error', (error) => {
            console.error('[WebSocket] Error:', error);
            connectedClients.delete(ws);
        });
    });

    // Utility function to broadcast to all WebSocket clients
    function broadcastToClients(data) {
        const message = JSON.stringify(data);
        connectedClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    // File watching for hot reload
    function startFileWatcher() {
        if (fileWatcher) {
            fileWatcher.close();
        }
        
        const activeProject = getActiveProject();
        const watchPaths = [
            path.join(rootDir, 'public'),
            activeProject !== rootDir ? activeProject : null
        ].filter(Boolean);
        
        fileWatcher = chokidar.watch(watchPaths, {
            ignored: /node_modules|\.git|dist|builds/,
            persistent: true,
            ignoreInitial: true
        });
        
        fileWatcher
            .on('change', (filePath) => {
                const relativePath = path.relative(rootDir, filePath);
                console.log(`[FileWatcher] File changed: ${relativePath}`);
                
                broadcastToClients({
                    type: 'file:changed',
                    data: {
                        path: relativePath,
                        fullPath: filePath,
                        timestamp: Date.now()
                    }
                });
            })
            .on('add', (filePath) => {
                const relativePath = path.relative(rootDir, filePath);
                console.log(`[FileWatcher] File added: ${relativePath}`);
                
                broadcastToClients({
                    type: 'file:added',
                    data: {
                        path: relativePath,
                        fullPath: filePath,
                        timestamp: Date.now()
                    }
                });
            })
            .on('unlink', (filePath) => {
                const relativePath = path.relative(rootDir, filePath);
                console.log(`[FileWatcher] File deleted: ${relativePath}`);
                
                broadcastToClients({
                    type: 'file:deleted',
                    data: {
                        path: relativePath,
                        fullPath: filePath,
                        timestamp: Date.now()
                    }
                });
            });
        
        console.log('[FileWatcher] Started watching:', watchPaths);
    }

    // Stop file watcher
    function stopFileWatcher() {
        if (fileWatcher) {
            fileWatcher.close();
            fileWatcher = null;
            console.log('[FileWatcher] Stopped watching');
        }
    }

    return {
        wss,
        broadcastToClients,
        startFileWatcher,
        stopFileWatcher,
        getConnectedClients: () => connectedClients
    };
}

module.exports = setupWebSocket;
