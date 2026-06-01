/**
 * RedGlitch Engine - Logger Hook
 * Integrates console logs with parent windows/editors
 */
(function() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    function sendToOpener(level, msg) {
        if (window.opener || (window.parent && window.parent !== window)) {
            try {
                // Ensure we send plain strings to avoid cloning issues
                const safeMsg = typeof msg === 'string' ? msg : JSON.stringify(msg, (key, value) => {
                    if (key === 'game' || key === 'ctx' || key === 'canvas') return '[Circular/DOM]';
                    return value;
                });
                
                const target = window.opener || window.parent;
                target.postMessage({
                    type: 'log',
                    level: level,
                    message: safeMsg
                }, window.location.origin);
            } catch (e) {
                // Fallback for circular structures
                const target = window.opener || window.parent;
                target.postMessage({
                    type: 'log',
                    level: level,
                    message: String(msg)
                }, window.location.origin);
            }
        }
    }

    console.log = function(...args) {
        sendToOpener('info', args.map(a => String(a)).join(' '));
        originalLog.apply(console, args);
    };
    console.warn = function(...args) {
        sendToOpener('warning', args.map(a => String(a)).join(' '));
        originalWarn.apply(console, args);
    };
    console.error = function(...args) {
        sendToOpener('error', args.map(a => String(a)).join(' '));
        originalError.apply(console, args);
    };
})();