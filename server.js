const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');

// Import configuration
const config = require('./server/config');

// Import services
const projectService = require('./server/services/projectService');

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
const slotsRouter = require('./server/routes/slots');
const cutscenesRouter = require('./server/routes/cutscenes');
const campaignsRouter = require('./server/routes/campaigns');
const assetsRouter = require('./server/routes/assets');
const systemRouter = require('./server/routes/system');

// Import WebSocket setup
const setupWebSocket = require('./server/websocket');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// --- IRAB NATIVE PROXY ---
// MUST BE BEFORE BODY PARSERS TO ALLOW PIPING
const IRAB_BACKEND = 'http://localhost:8000';

app.use(['/api/history', '/api/ai'], (req, res) => {
    const url = IRAB_BACKEND + req.originalUrl;
    const connector = http.request(url, {
        method: req.method,
        headers: req.headers
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });
    
    req.pipe(connector, { end: true });
    
    connector.on('error', (err) => {
        if (!res.headersSent) {
            res.status(502).json({ error: "IRAB Backend Offline", details: err.message });
        }
    });
});

// Security Headers for SharedArrayBuffer / WebGPU support
app.use(securityHeaders);

// Body parser
app.use(express.json({ limit: '50mb' }));

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
app.use('/base_game', express.static(path.join(__dirname, 'public', 'engines', 'rpg-topdown')));

// Serve sprites.js from active project if it exists, otherwise fallback to engine default
app.get('/engines/rpg-topdown/sprites.js', (req, res, next) => {
    const projectSprites = path.join(projectService.getActiveProject(), 'sprites.js');
    res.sendFile(projectSprites, err => {
        if (err) next();
    });
});

app.get('/base_game/sprites.js', (req, res, next) => {
    const projectSprites = path.join(projectService.getActiveProject(), 'sprites.js');
    res.sendFile(projectSprites, err => {
        if (err) next();
    });
});

// Dynamic Asset Serving for Projects
app.use('/dunyalar', (req, res, next) => {
    const targetDir = projectService.isRootProject()
        ? path.join(__dirname, 'public', 'dunyalar')
        : path.join(projectService.getActiveProject(), 'dunyalar');
    
    const filePath = path.join(targetDir, req.path);
    res.sendFile(filePath, err => {
        if (err && !res.headersSent) next();
    });
});

app.use('/muzikler', (req, res, next) => {
    const filePath = path.join(projectService.getActiveProject(), 'muzikler', req.path);
    res.sendFile(filePath, err => {
        if (err && !res.headersSent) next();
    });
});

app.use('/assets', (req, res, next) => {
    const filePath = path.join(projectService.getActiveProject(), 'assets', req.path);
    res.sendFile(filePath, err => {
        if (err && !res.headersSent) next();
    });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/projects', express.static(path.join(__dirname, 'projects')));

// Project management middleware
app.use((req, res, next) => {
    req.projectService = projectService;
    next();
});

// Mount routers
app.use('/api/system', systemRouter);
app.use('/api', savesRouter);
app.use('/api', levelsRouter);
app.use('/api', projectsRouter);
app.use('/api', gamedataRouter);
app.use('/api/logic', logicRouter);
app.use('/api/abilities', abilitiesRouter);
app.use('/api/brains', brainsRouter);
app.use('/api/slots', slotsRouter);
app.use('/api', cutscenesRouter);
app.use('/api', campaignsRouter);
app.use('/api', assetsRouter);

// Root redirect to dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard.html');
});

// Setup WebSocket
setupWebSocket(server);

// Start server
server.listen(config.PORT, () => {
    console.log(`🚀 Ketebe Engine Server running on http://localhost:${config.PORT}`);
    console.log(`📁 Root directory: ${config.ROOT_DIR}`);
});

// Export for testing
module.exports = { app, server };
