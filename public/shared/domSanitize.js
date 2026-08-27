// public/shared/domSanitize.js
// Shared HTML-escaping helper for classic (non-module) editor scripts.
// Loaded as a plain script it attaches `window.escapeHtml`. The same function is
// also exported for module consumers. Use it to neutralize user/editor/project
// controlled strings before interpolating them into innerHTML (stored-XSS guard).
(function (global) {
    'use strict';
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, (ch) => {
            switch (ch) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default:  return ch;
            }
        });
    }
    global.escapeHtml = escapeHtml;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { escapeHtml };
    }
})(typeof window !== 'undefined' ? window : this);
