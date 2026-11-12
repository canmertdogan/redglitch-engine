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
const { securityHeaders, requestLogger, stateMutationGuard } = require('./server/middleware/logging');

// Import routes
const savesRouter = require('./server/routes/saves');
const levelsRouter = require('./server/routes/levels');
const gamedataRouter = require('./server/routes/gamedata');
const projectsRouter = require('./server/routes/projects');
const logicRouter = require('./server/routes/logic');
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
app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'] })); // Restrict CORS origins
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
    // Guard proxy mutations (FINDING-04): enforce same Origin/Host as stateMutationGuard
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
        const { stateMutationGuard } = require('./server/middleware/logging');
        let guarded = false;
        stateMutationGuard(req, res, () => { guarded = true; });
        if (!guarded) return; // stateMutationGuard already sent 403
    }
    const url = IRAB_BACKEND + req.originalUrl;
    
    // Strip hop-by-hop headers before forwarding to the backend.
    const hopByHop = new Set([
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailers',
        'transfer-encoding',
        'upgrade'
    ]);
    const outgoingHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (!hopByHop.has(key.toLowerCase())) {
            outgoingHeaders[key] = value;
        }
    }
    
    const connector = http.request(url, {
        method: req.method,
        headers: outgoingHeaders
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        
        // Timeout the response if the backend stalls mid-stream.
        res.setTimeout(10000, () => {
            if (!res.headersSent) {
                if (isAIMetricsRequest(req)) return sendOfflineMetrics(res);
                res.status(502).json({ error: "IRAB Backend Proxy Timeout" });
            } else {
                res.destroy();
            }
            connector.destroy();
        });
        
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
// Gzip text assets (JS/CSS/HTML/JSON) — Monaco/Three/studio bundles shrink ~70%.
// Mounted after the /api/ai proxy so streamed responses are never buffered.
app.use(require('compression')({
    threshold: 1024,
    filter: (req, res) => {
        const type = String(res.getHeader('Content-Type') || '');
        if (type.includes('text/event-stream')) return false;
        return require('compression').filter(req, res);
    }
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Multer for file uploads (used by assets3d route for .blend/.obj conversion)
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB max (FINDING-06)
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

// State mutation guard for write-capable API routes
app.use(stateMutationGuard);

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

// Serve sprites.js with hybrid merging + mtime-validated memory/ETag cache
// so repeated editor iframe loads avoid redundant fs reads & vm compilation.
const _mergedSpritesCache = new Map();
const serveMergedSprites = async (req, res, next) => {
    try {
        const engineSpritesPath = path.join(__dirname, 'public', 'engines', 'rpg-topdown', 'sprites.js');
        const projectDir = projectService.getActiveProject();
        const projectSpritesPath = path.join(projectDir, 'sprites.js');
        const isRoot = projectService.isRootProject();

        const [engStat, projStat] = await Promise.all([
            fs.stat(engineSpritesPath).catch(() => null),
            isRoot ? Promise.resolve(null) : fs.stat(projectSpritesPath).catch(() => null)
        ]);
        const engMtime = engStat ? Math.round(engStat.mtimeMs) : 0;
        const projMtime = projStat ? Math.round(projStat.mtimeMs) : 0;
        const cacheKey = `${isRoot ? 'ROOT' : projectDir}`;
        const etag = `W/"sprites-${engMtime}-${projMtime}"`;

        res.set('Content-Type', 'application/javascript; charset=utf-8');
        res.set('Cache-Control', 'no-cache');
        res.set('ETag', etag);

        if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
        }

        const cached = _mergedSpritesCache.get(cacheKey);
        if (cached && cached.engMtime === engMtime && cached.projMtime === projMtime) {
            return res.send(cached.content);
        }

        let engineContent = '';
        if (engStat) {
            try {
                engineContent = await fs.readFile(engineSpritesPath, 'utf8');
            } catch (e) {
                if (e.code !== 'ENOENT') console.error('[Sprites] Error reading engine sprites:', e);
            }
        }

        if (isRoot || !projStat) {
            _mergedSpritesCache.set(cacheKey, { engMtime, projMtime, content: engineContent });
            return res.send(engineContent);
        }

        let projectContent = '';
        try {
            projectContent = await fs.readFile(projectSpritesPath, 'utf8');
        } catch (e) {
            if (e.code !== 'ENOENT') console.error('[Sprites] Error reading project sprites:', e);
        }

        if (!projectContent) {
            _mergedSpritesCache.set(cacheKey, { engMtime, projMtime, content: engineContent });
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
        _mergedSpritesCache.set(cacheKey, { engMtime, projMtime, content: mergedContent });

        res.send(mergedContent);
    } catch (err) {
        next(err);
    }
};

app.get('/engines/rpg-topdown/sprites.js', serveMergedSprites);
app.get('/base_game/sprites.js', serveMergedSprites);

// Path-traversal-safe overlay handlers. A request path like
// /dunyalar/../../etc/passwd must never escape the intended directory.
const { makeOverlayHandler } = require('./server/utils/overlayHandler');
const overlayHandler = makeOverlayHandler(projectService);

app.use('/engines', overlayHandler('engines', 'engines', true));

// Serve project-aware packed tileset atlas (replaces 600 individual tile requests)
const { getProjectAwareWorldAtlas } = require('./server/utils/worldTilesetAtlas');
app.get('/sprite-art/worldpixelart_atlas.png', (req, res, next) => {
    try {
        const entry = getProjectAwareWorldAtlas(
            path.join(__dirname, 'public'),
            projectService.getActiveProject()
        );
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('ETag', entry.etag);
        if (req.headers['if-none-match'] === entry.etag) {
            return res.status(304).end();
        }
        return res.send(entry.buffer);
    } catch (err) {
        return next(err);
    }
});

// Dynamic Asset Serving for Projects
app.use('/dunyalar', overlayHandler('dunyalar', 'dunyalar', false));
app.use('/muzikler', overlayHandler('muzikler', 'muzikler', false, { maxAgeMs: 60000 }));
app.use('/assets', overlayHandler('assets', 'assets', false));
app.use('/data', overlayHandler('data', 'data', false));
app.use('/sprite-art', overlayHandler('sprite-art', 'sprite-art', false, { maxAgeMs: 60000 }));

// Dynamic Interface File Serving (for .redui files)
app.use('/interfaces', overlayHandler('interfaces', 'interfaces', false));

// Redirect legacy 3D editors to unified editor
app.get('/fps_editor.html', (req, res) => res.redirect('/editor3d.html?mode=fps-3d&project=' + encodeURIComponent(req.query.project || '')));
app.get('/topdown3d_editor.html', (req, res) => res.redirect('/editor3d.html?mode=topdown-3d&project=' + encodeURIComponent(req.query.project || '')));
app.get('/platformer3d_editor.html', (req, res) => res.redirect('/editor3d.html?mode=platformer-3d&project=' + encodeURIComponent(req.query.project || '')));
app.get('/shader_editor.html', (req, res) => res.redirect('/shader_lab.html'));

// Static files — no caching in dev so edits are always reflected immediately
// Heavy, rarely-edited vendor/build assets get long-lived caching; everything else
// revalidates via ETag (cheap 304) so edits still show up immediately without
// re-downloading megabytes on every iframe open.
const LONG_CACHE_RE = /^\/(lib|fonts|studio-dist\/assets|sprite-art|muzikler)\//;
const staticOpts = {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        const rel = '/' + path.relative(path.join(__dirname, 'public'), filePath).split(path.sep).join('/');
        if (LONG_CACHE_RE.test(rel)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        } else {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
};
app.use(express.static(path.join(__dirname, 'public'), staticOpts));
app.use('/projects', express.static(config.PROJECTS_ROOT, staticOpts));

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

// Express Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('[Express] Global Error:', err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ error: 'Internal Server Error' });
});

// Fallback for unmatched API routes — return 404 JSON, not an HTML redirect.
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
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
server.listen(config.PORT, config.HOST, () => {
    const shown = config.HOST === '0.0.0.0' ? 'localhost (all interfaces)' : config.HOST;
    console.log(`🚀 Redglitch Engine Server running on http://${shown}:${config.PORT}`);
    console.log(`📁 Root directory: ${config.ROOT_DIR}`);
});

// Export for testing
module.exports = { app, server };
