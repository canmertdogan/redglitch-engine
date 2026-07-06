const path = require('path');

const PROTECTED_PATTERNS = [
    /^server\.js$/,
    /^electron-main\.js$/,
    /^build-(game|adapter)\.js$/,
    /^package(-lock)?\.json$/,
    /^server\/(routes|middleware|utils)\/.*\.js$/,
    /^public\/ai\/permission-gate\.js$/,
    /^public\/engines\/.*\/(main\.js|strategies\/)/,
    /^public\/shared\/SharedProjectState\.js$/
];

function normalizeAutomationPath(filePath) {
    return path.posix.normalize(String(filePath || '').replace(/\\/g, '/')).replace(/^\.\.\/(?:\.\.\/)*|^\//g, '');
}

function canAutomateMutation(filePath) {
    const normalized = normalizeAutomationPath(filePath);
    const protectedPath = PROTECTED_PATTERNS.some((pattern) => pattern.test(normalized));
    return protectedPath
        ? { allowed: false, code: 'PROTECTED_PATH', path: normalized }
        : { allowed: true, path: normalized };
}

module.exports = { canAutomateMutation };
