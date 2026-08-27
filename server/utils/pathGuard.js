const path = require('path');
const fs = require('fs');

/**
 * Resolve the real path of the longest existing ancestor of `p`.
 * Returns the original string if no ancestor exists (best-effort).
 */
function realpathExisting(p) {
    let cur = p;
    while (cur && cur !== path.dirname(cur)) {
        try { return fs.realpathSync(cur); } catch { cur = path.dirname(cur); }
    }
    try { return fs.realpathSync(cur); } catch { return p; }
}

function resolveUnderRoot(rootDir, targetPath) {
    if (!targetPath) return null;
    if (path.isAbsolute(targetPath)) return null;

    const root = path.resolve(rootDir);
    const fullPath = path.resolve(root, targetPath);

    // Use path.relative for robust cross-platform checking. If the relative
    // path starts with '..' then fullPath is outside root. Also accept the
    // case where fullPath === root (relative === '').
    const rel = path.relative(root, fullPath);
    if (!(rel === '' || (!rel.startsWith('..') && !rel.startsWith('..' + path.sep)))) {
        return null;
    }

    // Symlink escape check: a path can be string-inside-root yet resolve
    // (via a symlink placed inside the project) to something outside it.
    // Verify the *real* path of the existing ancestor also stays under root.
    const realRoot = realpathExisting(root);
    const realTarget = realpathExisting(fullPath);
    const realRel = path.relative(realRoot, realTarget);
    if (realRel === '' || (!realRel.startsWith('..') && !realRel.startsWith('..' + path.sep))) {
        return fullPath;
    }
    return null;
}

module.exports = {
    resolveUnderRoot
};
