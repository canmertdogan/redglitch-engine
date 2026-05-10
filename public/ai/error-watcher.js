/**
 * public/ai/error-watcher.js
 * Listens for global runtime errors and broadcasts them to KAI.
 */

(function() {
    const eventBus = window.KetebeEventBus || (window.parent && window.parent.KetebeEventBus);
    
    if (!eventBus) {
        console.warn('[ErrorWatcher] EventBus not found, waiting...');
    }

    // Capture Global Errors
    window.addEventListener('error', (event) => {
        const errorData = {
            message: event.message,
            source: event.filename,
            line: event.lineno,
            column: event.colno,
            stack: event.error ? event.error.stack : null,
            type: 'runtime_error'
        };

        broadcastError(errorData);
    });

    // Capture Unhandled Promise Rejections
    window.addEventListener('unhandledrejection', (event) => {
        const errorData = {
            message: event.reason ? event.reason.message : 'Unhandled Promise Rejection',
            source: 'promise',
            stack: event.reason ? event.reason.stack : null,
            type: 'promise_rejection'
        };

        broadcastError(errorData);
    });

    function broadcastError(data) {
        const eb = window.KetebeEventBus || (window.parent && window.parent.KetebeEventBus);
        if (eb) {
            eb.emit('system:error', data);
        }
        console.error('[Ketebe-ErrorWatcher]', data);
    }

    console.log('[ErrorWatcher] KAI Sentinel is active.');
})();
