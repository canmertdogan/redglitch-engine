const config = require('../config');

function securityHeaders(req, res, next) {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:");
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

    // Defence-in-depth against DNS rebinding: Host header must be loopback.
    const rawHost = req.headers.host || '';
    const host = rawHost.startsWith('[') ? rawHost.split(']')[0] + ']' : rawHost.split(':')[0];
    if (host && !['localhost', '127.0.0.1', '[::1]'].includes(host)) {
        return res.status(403).json({
            error: 'Forbidden',
            details: 'State mutation is only allowed to a loopback host.'
        });
    }

    const origin = req.headers.origin || req.headers.referer || '';
    // Allow loopback origins on any port (the server binds loopback; UI may
    // be served from a different PORT). Everything else is rejected.
    let hasAllowedOrigin = false;
    if (!origin) {
        hasAllowedOrigin = true; // no-origin contexts (Electron debug)
    } else if (origin === 'null') {
        // file:// or sandboxed iframe — do NOT trust for mutations (FINDING-05)
        hasAllowedOrigin = false;
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
