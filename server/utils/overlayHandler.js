const path = require('path');
const fs = require('fs');

// Path-traversal-safe overlay handler factory.
//
// A request path like /dunyalar/../../etc/passwd must never escape the
// intended directory. We normalize, reject absolute / ".." escapes, then
// CONTAINMENT-check the fully-resolved path against the intended root before
// calling sendFile.
function makeOverlayHandler(projectService) {
    // __dirname = <root>/server/utils — two levels up is the repository root.
    const PUBLIC_ROOT = path.resolve(__dirname, '..', '..', 'public');
    const realAllowCache = new Map();

    const getRealAllow = (dir) => {
        if (realAllowCache.has(dir)) return realAllowCache.get(dir);
        let real = dir;
        try { real = fs.realpathSync(dir); } catch {}
        if (realAllowCache.size > 64) realAllowCache.clear();
        realAllowCache.set(dir, real);
        return real;
    };

    return function overlay(rootSub, projectSub, rootFirst, options = {}) {
        const maxAgeMs = Number(options && options.maxAgeMs) || 0;
        const rootAllowed = path.resolve(PUBLIC_ROOT, rootSub);

        return (req, res, next) => {
            const reqPath = req.path || '/';
            const norm = path.normalize(reqPath).replace(/^[/\\]+/, '');
            // Reject absolute paths and any that still try to walk up.
            if (norm.startsWith('..') || path.isAbsolute(norm)) return next();

            const projectDir = projectService.getActiveProject();
            if (!projectDir) return next();

            const projectFilePath = path.join(projectDir, projectSub, norm);
            const rootFilePath = path.join(PUBLIC_ROOT, rootSub, norm);

            const projAllowed = path.resolve(projectDir, projectSub);
            const resolvedRoot = path.resolve(rootFilePath);
            const resolvedProj = path.resolve(projectFilePath);
            if (!resolvedRoot.startsWith(rootAllowed + path.sep) && resolvedRoot !== rootAllowed) return next();
            if (!resolvedProj.startsWith(projAllowed + path.sep) && resolvedProj !== projAllowed) return next();
            // FINDING-03: symlink escape check via realpath (file or parent)
            try {
                for (const [cand, allow] of [[resolvedRoot, rootAllowed], [resolvedProj, projAllowed]]) {
                    const realAllow = getRealAllow(allow);
                    let realCand = null;
                    try { realCand = fs.realpathSync(cand); } catch {}
                    if (!realCand) { try { realCand = fs.realpathSync(path.dirname(cand)); } catch {} }
                    if (realCand && realCand !== realAllow && !realCand.startsWith(realAllow + path.sep)) return next();
                }
            } catch {}

            const sendWithOpts = (filePath, cb) => {
                if (maxAgeMs > 0) return res.sendFile(filePath, { maxAge: maxAgeMs }, cb);
                return res.sendFile(filePath, cb);
            };

            const tryRoot = (cb) => sendWithOpts(rootFilePath, (e) => {
                // Only swallow ENOENT; forward permission/IO errors instead of
                // silently falling through to the project overlay.
                if (e && e.code && e.code !== 'ENOENT' && !res.headersSent) return next(e);
                cb(e);
            });
            const tryProject = (cb) => sendWithOpts(projectFilePath, (e) => {
                if (e && e.code && e.code !== 'ENOENT' && !res.headersSent) return next(e);
                cb(e);
            });

            if (rootFirst) {
                tryRoot(() => tryProject((e2) => {
                    // Nothing anywhere: hand the request to the next middleware
                    // (express.static will try public/) instead of 500-ing.
                    if (e2 && !res.headersSent) next();
                }));
            } else {
                tryProject(() => tryRoot((e2) => {
                    if (e2 && !res.headersSent) next();
                }));
            }
        };
    };
}

module.exports = { makeOverlayHandler };
