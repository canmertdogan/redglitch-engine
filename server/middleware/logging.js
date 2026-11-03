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
    const allowedOrigins = ['http://localhost:3000', 'null', 'http://127.0.0.1:3000'];
    const hasAllowedOrigin = allowedOrigins.some((allowed) => {
        if (!allowed) return false;
        if (allowed === 'null') return origin === 'null' || !origin;
        return origin === allowed || origin.startsWith(allowed + '/');
    });

    if (!hasAllowedOrigin) {
        return res.status(403).json({
            error: 'Forbidden',
            details: 'State mutation is not allowed from this origin.'
        });
    }

    next();
}

module.exports = { securityHeaders, requestLogger, stateMutationGuard };
