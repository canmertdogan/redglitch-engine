require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const createApp = require('./app');

const PORT = process.env.PV_SERVER_PORT || 4100;

// No persistent process to manage anymore — every LLM call is a stateless
// cloud request (see orchestrator/llmClient.js), so the server itself is
// just a plain Express app. This same file also serves as the reference
// for what api/index.js exports for Vercel (see vercel.json).
const app = createApp();
const httpServer = http.createServer(app);

httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[projectvertex-server] Port ${PORT} is already in use — is another instance already running? Stop it, or set PV_SERVER_PORT to a different port.`);
        process.exit(1);
    }
    throw err;
});

httpServer.listen(PORT, () => {
    console.log(`[projectvertex-server] Listening on http://localhost:${PORT}`);
});

process.on('SIGINT', () => { httpServer.close(() => process.exit(0)); });
process.on('SIGTERM', () => { httpServer.close(() => process.exit(0)); });
