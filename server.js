const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');
const cors = require('cors');
const multer = require('multer');

// Import configuration
const config = require('./server/config');

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('[Global] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Global] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Import services
const projectService = require('./server/services/projectService');
const safeFs = require('./server/utils/safeFs');

// Import middleware
const { securityHeaders, requestLogger } = require('./server/middleware/logging');

// Import routes
const savesRouter = require('./server/routes/saves');
const levelsRouter = require('./server/routes/levels');
const gamedataRouter = require('./server/routes/gamedata');
const projectsRouter = require('./server/routes/projects');
const logicRouter = require('./server/routes/logic');
const abilitiesRouter = require('./server/routes/abilities');
const brainsRouter = require('./server/routes/brains');
const audioRouter = require('./server/routes/audio');
const slotsRouter = require('./server/routes/slots');
const cutscenesRouter = require('./server/routes/cutscenes');
const campaignsRouter = require('./server/routes/campaigns');
const assetsRouter   = require('./server/routes/assets');
const assets3dRouter  = require('./server/routes/assets3d');
const levels3dRouter  = require('./server/routes/levels3d');
const systemRouter = require('./server/routes/system');
const ideRouter = require('./server/routes/ide');
const gitRouter = require('./server/routes/git');
const buildRouter = require('./server/routes/build');
const shadersRouter = require('./server/routes/shaders');
const test3dRouter = require('./server/routes/test-3d');
const debug3dRouter = require('./server/routes/debug-3d');
const uiConfigRouter = require('./server/routes/ui-config');
const openCodeZenRouter = require('./server/routes/opencode-zen');

let monitor3dRouter;
try {
    monitor3dRouter = require('./server/routes/monitor-3d');
} catch (err) {
    const missingMonitorRoute =
        err && err.code === 'MODULE_NOT_FOUND' &&
        String(err.message || '').includes('server/routes/monitor-3d');
    if (!missingMonitorRoute) throw err;

    console.warn('[Server] monitor-3d route is unavailable. /api/monitor will return 503.');
    monitor3dRouter = express.Router();
    monitor3dRouter.use((_req, res) => {
        res.status(503).json({
            error: 'monitor route unavailable',
            details: 'server/routes/monitor-3d.js is missing from this checkout',
        });
    });
}

// Import WebSocket setup
const setupWebSocket = require('./server/websocket');

// Initialize Express app and HTTP server
const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'null'] })); // Restrict CORS origins
const server = http.createServer(app);

// --- IRAB NATIVE PROXY ---
// MUST BE BEFORE BODY PARSERS TO ALLOW PIPING
const IRAB_BACKEND = process.env.IRAB_BACKEND || 'http://localhost:8000';
const isAIMetricsRequest = (req) => req.method === 'GET' && req.originalUrl.startsWith('/api/ai/metrics');
const sendOfflineMetrics = (res) => res.status(200).json({
    status: 'offline',
    offline: true,
    mem_usage_mb: 0,
    cpu_usage_percent: 0,
    model_path: null,
});

app.use(['/api/history', '/api/ai'], (req, res) => {
    const url = IRAB_BACKEND + req.originalUrl;
    const connector = http.request(url, {
        method: req.method,
        headers: req.headers
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.on('error', (err) => {
            if (!res.headersSent) {
                if (isAIMetricsRequest(req)) return sendOfflineMetrics(res);
                res.status(502).json({ error: "IRAB Backend Proxy Error", details: err.message });
            } else {
                res.end();
            }
        });
        proxyRes.pipe(res, { end: true });
    });

    connector.on('error', (err) => {
        if (!res.headersSent) {
            if (isAIMetricsRequest(req)) return sendOfflineMetrics(res);
            res.status(502).json({ error: "IRAB Backend Offline", details: err.message });
        } else {
            res.end();
        }
    });

    connector.setTimeout(10000, () => {
        connector.destroy(new Error('IRAB proxy timeout'));
    });

    req.on('aborted', () => connector.destroy());
    req.on('error', () => connector.destroy());
    req.pipe(connector, { end: true });
});

// Security Headers for SharedArrayBuffer / WebGPU support
app.use(securityHeaders);

// Body parser
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Multer for file uploads (used by assets3d route for .blend/.obj conversion)
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max
app.use('/api/assets3d', upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'mtl',  maxCount: 1 },
]));

// Set explicit MIME types for ESM and WASM
express.static.mime.define({
    'application/javascript': ['mjs'],
    'application/wasm': ['wasm']
});

// Request logging
app.use(requestLogger);

// Favicon
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'favicon.ico'));
});

// Legacy Alias: Redirect /base_game to /engines/rpg-topdown
app.use('/base_game', (req, res, next) => {
    const activeProject = projectService.getActiveProject();
    express.static(path.join(activeProject, 'engines', 'rpg-topdown'))(req, res, next);
});
app.use('/base_game', express.static(path.join(__dirname, 'public', 'engines', 'rpg-topdown')));

// Serve sprites.js with hybrid merging
const serveMergedSprites = async (req, res, next) => {
    try {
        const engineSpritesPath = path.join(__dirname, 'public', 'engines', 'rpg-topdown', 'sprites.js');
        const projectDir = projectService.getActiveProject();
        const projectSpritesPath = path.join(projectDir, 'sprites.js');
        const isRoot = projectService.isRootProject();

        let engineContent = '';
        try {
            engineContent = await fs.readFile(engineSpritesPath, 'utf8');
        } catch (e) {
            if (e.code !== 'ENOENT') console.error('[Sprites] Error reading engine sprites:', e);
        }

        if (isRoot) {
            return res.send(engineContent);
        }

        let projectContent = '';
        try {
            projectContent = await fs.readFile(projectSpritesPath, 'utf8');
        } catch (e) {
            if (e.code !== 'ENOENT') console.error('[Sprites] Error reading project sprites:', e);
        }

        if (!projectContent) {
            return res.send(engineContent);
        }

        // Merge logic: Extract the object part from both and combine
        // Expected format: window.SPRITES = { ... };
        const extractSprites = (content) => {
            const match = content.match(/window\.SPRITES\s*=\s*(\{[\s\S]*\});?\s*$/);
            if (match) {
                try {
                    // Using a safer approach than eval: wrap in a vm context
                    const vm = require('vm');
                    const sandbox = {};
                    vm.createContext(sandbox);
                    return vm.runInContext(`(${match[1]})`, sandbox);
                } catch (e) {
                    console.error('[Sprites:Merge] Parse error:', e);
                }
            }
            return {};
        };

        const engineSprites = extractSprites(engineContent);
        const projectSprites = extractSprites(projectContent);

        const mergedSprites = { ...engineSprites, ...projectSprites };
        const mergedContent = `// Merged sprites.js - Engine + Project\nwindow.SPRITES = ${JSON.stringify(mergedSprites, null, 2)};`;
        
        res.set('Content-Type', 'application/javascript');
        res.send(mergedContent);
    } catch (err) {
        next(err);
    }
};

app.get('/engines/rpg-topdown/sprites.js', serveMergedSprites);
app.get('/base_game/sprites.js', serveMergedSprites);

app.use('/engines', (req, res, next) => {
    const projectDir = projectService.getActiveProject();
    const projectFilePath = path.join(projectDir, 'engines', req.path);
    const rootFilePath = path.join(__dirname, 'public', 'engines', req.path);
    
    res.sendFile(projectFilePath, err => {
        if (!err) return;
        res.sendFile(rootFilePath, err2 => {
            if (err2 && !res.headersSent) next();
        });
    });
});

// Dynamic Asset Serving for Projects
app.use('/dunyalar', (req, res, next) => {
    const projectDir = projectService.getActiveProject();
    const projectFilePath = path.join(projectDir, 'dunyalar', req.path);
    const rootFilePath = path.join(__dirname, 'public', 'dunyalar', req.path);
    
    // Try project file first
    res.sendFile(projectFilePath, err => {
        if (!err) return;
        // If not in project, try root public
        res.sendFile(rootFilePath, err2 => {
            if (err2 && !res.headersSent) next();
        });
    });
});

app.use('/muzikler', (req, res, next) => {
    const projectDir = projectService.getActiveProject();
    const projectFilePath = path.join(projectDir, 'muzikler', req.path);
    const rootFilePath = path.join(__dirname, 'public', 'muzikler', req.path);
    
    res.sendFile(projectFilePath, err => {
        if (!err) return;
        res.sendFile(rootFilePath, err2 => {
            if (err2 && !res.headersSent) next();
        });
    });
});

app.use('/assets', (req, res, next) => {
    const projectDir = projectService.getActiveProject();
    const projectFilePath = path.join(projectDir, 'assets', req.path);
    const rootFilePath = path.join(__dirname, 'public', 'assets', req.path);
    
    res.sendFile(projectFilePath, err => {
        if (!err) return;
        res.sendFile(rootFilePath, err2 => {
            if (err2 && !res.headersSent) next();
        });
    });
});

app.use('/data', (req, res, next) => {
    const projectDir = projectService.getActiveProject();
    const projectFilePath = path.join(projectDir, 'data', req.path);
    const rootFilePath = path.join(__dirname, 'public', 'data', req.path);
    
    res.sendFile(projectFilePath, err => {
        if (!err) return;
        res.sendFile(rootFilePath, err2 => {
            if (err2 && !res.headersSent) next();
        });
    });
});

app.use('/sprite-art', (req, res, next) => {
    const projectDir = projectService.getActiveProject();
    const projectFilePath = path.join(projectDir, 'sprite-art', req.path);
    const rootFilePath = path.join(__dirname, 'public', 'sprite-art', req.path);
    
    res.sendFile(projectFilePath, err => {
        if (!err) return;
        res.sendFile(rootFilePath, err2 => {
            if (err2 && !res.headersSent) next();
        });
    });
});

// Redirect legacy 3D editors to unified editor
app.get('/fps_editor.html', (req, res) => res.redirect('/editor3d.html?mode=fps-3d&project=' + (req.query.project || '')));
app.get('/topdown3d_editor.html', (req, res) => res.redirect('/editor3d.html?mode=topdown-3d&project=' + (req.query.project || '')));
app.get('/platformer3d_editor.html', (req, res) => res.redirect('/editor3d.html?mode=platformer-3d&project=' + (req.query.project || '')));
app.get('/shader_editor.html', (req, res) => res.redirect('/shader_lab.html'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Project management middleware
app.use((req, res, next) => {
    req.projectService = projectService;
    next();
});

// Mount routers
app.use('/api/system',   systemRouter);
app.use('/api/assets',   assetsRouter);
app.use('/api/assets3d', assets3dRouter);
app.use('/api', levels3dRouter);
app.use('/api', savesRouter);
app.use('/api', levelsRouter);
app.use('/api', projectsRouter);
app.use('/api', gamedataRouter);
app.use('/api/logic', logicRouter);
app.use('/api/abilities', abilitiesRouter);
app.use('/api/brains', brainsRouter);
app.use('/api/audio', audioRouter);
app.use('/api/slots', slotsRouter);
app.use('/api', cutscenesRouter);
app.use('/api', campaignsRouter);
app.use('/api/ide', ideRouter);
app.use('/api/git', gitRouter);
app.use('/api/build', buildRouter);
app.use('/api/shaders', shadersRouter);
app.use('/api/test', test3dRouter);
app.use('/api/debug', debug3dRouter);
app.use('/api/monitor', monitor3dRouter);
app.use('/api/ui-config', uiConfigRouter);
app.use('/api/opencode-zen', openCodeZenRouter);

// Express Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('[Express] Global Error:', err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ error: 'Internal Server Error' });
});

// Fallback for API
app.use('/api/*', (req, res) => {
    res.redirect('/dashboard.html');
});

// Root redirect to dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard.html');
});

// Setup WebSocket
const websocket = setupWebSocket(server, {
    rootDir: config.ROOT_DIR,
    getActiveProject: () => projectService.getActiveProject(),
    projectsRoot: config.PROJECTS_ROOT
});
websocket.startFileWatcher();
app.locals.websocket = websocket;

// Start server
server.listen(config.PORT, () => {
    console.log(`🚀 RedGlitch Engine Server running on http://localhost:${config.PORT}`);
    console.log(`📁 Root directory: ${config.ROOT_DIR}`);
});

// Export for testing
module.exports = { app, server };
