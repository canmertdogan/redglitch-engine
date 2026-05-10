/**
 * ai/shim.js
 * ES Module shim for global Ketebe classes.
 * Bridges standard script tags to the AI's module system.
 */

// Use getters to ensure we always get the latest global instance
export const EventBus = {
    get instance() {
        return window.KetebeEventBus || null;
    },
    // For compatibility with code expecting a direct object
    on: (...args) => window.KetebeEventBus?.on(...args),
    emit: (...args) => window.KetebeEventBus?.emit(...args),
    off: (...args) => window.KetebeEventBus?.off(...args),
    getSource: (...args) => window.KetebeEventBus?.getSource(...args),
    once: (...args) => window.KetebeEventBus?.once(...args)
};

export const SharedProjectState = {
    get instance() {
        return window.KetebeProjectState || null;
    }
};

export default { EventBus, SharedProjectState };
