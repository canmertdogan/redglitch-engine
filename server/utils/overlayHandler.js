const path = require('path');

// Path-traversal-safe overlay handler factory.
//
// A request path like /dunyalar/../../etc/passwd must never escape the
// intended directory. We normalize, reject absolute / ".." escapes, then
// CONTAINMENT-check the fully-resolved path against the intended root before
// calling sendFile.
function makeOverlayHandler(projectService) {
    const PUBLIC_ROOT = path.resolve(__dirname, '..', 'public');

    return function overlay(rootSub, projectSub, rootFirst) {
        return (req, res, next) => {
            const reqPath = req.path || '/';
            const norm = path.normalize(reqPath).replace(/^[/\\]+/, '');
            // Reject absolute paths and any that still try to walk up.
            if (norm.startsWith('..') || path.isAbsolute(norm)) return next();

            const projectDir = projectService.getActiveProject();
            if (!projectDir) return next();

            const projectFilePath = path.join(projectDir, projectSub, norm);
            const rootFilePath = path.join(PUBLIC_ROOT, rootSub, norm);

            const rootAllowed = path.resolve(PUBLIC_ROOT, rootSub);
            const projAllowed = path.resolve(projectDir, projectSub);
            const resolvedRoot = path.resolve(rootFilePath);
            const resolvedProj = path.resolve(projectFilePath);
            if (!resolvedRoot.startsWith(rootAllowed + path.sep) && resolvedRoot !== rootAllowed) return next();
            if (!resolvedProj.startsWith(projAllowed + path.sep) && resolvedProj !== projAllowed) return next();

            const tryRoot = (cb) => res.sendFile(rootFilePath, (e) => {
                // Only swallow ENOENT; forward permission/IO errors instead of
                // silently falling through to the project overlay.
                if (e && e.code && e.code !== 'ENOENT' && !res.headersSent) return next(e);
                cb(e);
            });
            const tryProject = (cb) => res.sendFile(projectFilePath, (e) => {
                if (e && e.code && e.code !== 'ENOENT' && !res.headersSent) return next(e);
                cb(e);
            });

            if (rootFirst) {
                tryRoot(() => tryProject((e2) => { if (e2 && !res.headersSent) next(e2); }));
            } else {
                tryProject(() => tryRoot((e2) => { if (e2 && !res.headersSent) next(e2); }));
            }
        };
    };
}

module.exports = { makeOverlayHandler };
