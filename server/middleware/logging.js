const config = require('../config');

function securityHeaders(req, res, next) {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
}

function requestLogger(req, res, next) {
    if (config.LOG_REQUESTS) {
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

function stateMutationGuard(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return next();
    }

    const origin = req.headers.origin || req.headers.referer || '';
    // Allow loopback origins on any port (the server binds loopback; UI may
    // be served from a different PORT). Everything else is rejected.
    let hasAllowedOrigin = false;
    if (!origin || origin === 'null') {
        hasAllowedOrigin = true; // file:// / no-origin contexts (Electron)
    } else {
        try {
            const url = new URL(origin);
            hasAllowedOrigin =
                (url.protocol === 'http:' || url.protocol === 'https:') &&
                ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        } catch {
            hasAllowedOrigin = false;
        }
    }

    if (!hasAllowedOrigin) {
        return res.status(403).json({
            error: 'Forbidden',
            details: 'State mutation is not allowed from this origin.'
        });
    }

    next();
}

module.exports = { securityHeaders, requestLogger, stateMutationGuard };
