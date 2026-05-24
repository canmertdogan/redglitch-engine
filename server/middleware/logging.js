const config = require('../config');

function securityHeaders(req, res, next) {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
}

function requestLogger(req, res, next) {
    if (config.LOG_REQUESTS) {
        // Skip noisy heartbeat/stat endpoints
        const noisyEndpoints = [
            '/api/system/stats',
            '/api/projects/current',
            '/api/ai/metrics'
        ];
        
        if (!noisyEndpoints.includes(req.path)) {
            const now = new Date();
            const time = now.toLocaleTimeString('en-US', { hour12: false });
            console.log(`[${time}] ${req.method} ${req.path}`);
        }
    }
    next();
}

module.exports = { securityHeaders, requestLogger };
