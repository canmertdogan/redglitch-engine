const path = require('path');

function resolveUnderRoot(rootDir, targetPath) {
    if (!targetPath) return null;
    if (path.isAbsolute(targetPath)) return null;

    const root = path.resolve(rootDir);
    const fullPath = path.resolve(root, targetPath);

    // Use path.relative for robust cross-platform checking. If the relative
    // path starts with '..' then fullPath is outside root. Also accept the
    // case where fullPath === root (relative === '').
    const rel = path.relative(root, fullPath);
    if (rel === '' || (!rel.startsWith('..') && !rel.startsWith('..' + path.sep))) {
        return fullPath;
    }
    return null;
}

module.exports = {
    resolveUnderRoot
};
