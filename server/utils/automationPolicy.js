const path = require('path');

const PROTECTED_PATTERNS = [
    /^server\.js$/,
    /^electron-main\.js$/,
    /^preload\.js$/,
    /^build-(game|adapter)\.js$/,
    /^package(-lock)?\.json$/,
    /^server\/.*\.js$/,
    /^public\/ai\/permission-gate\.js$/,
    /^public\/engines\/.*\/(main\.js|strategies\/)/,
    /^public\/shared\/SharedProjectState\.js$/,
    /^backend\/.*\.py$/,
    /^scripts\/.*\.(js|mjs|py)$/,
    /^\.git\//,
    /^redglitch\.json$/,
];

function normalizeAutomationPath(filePath) {
    let p = String(filePath || '').replace(/\\/g, '/');
    // Strip ADS (:stream) and trailing dots/spaces (Windows)
    p = p.split(':')[0].replace(/[. ]+$/, '');
    p = path.posix.normalize(p).replace(/^\.\/(?:\.\.\/)*|^\//g, '');
    // Case-insensitive compare (macOS/Windows)
    return p.toLowerCase();
}

function canAutomateMutation(filePath) {
    const normalized = normalizeAutomationPath(filePath);
    const protectedPath = PROTECTED_PATTERNS.some((pattern) => pattern.test(normalized));
    return protectedPath
        ? { allowed: false, code: 'PROTECTED_PATH', path: normalized }
        : { allowed: true, path: normalized };
}

module.exports = { canAutomateMutation };
