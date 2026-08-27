/**
 * ai/shim.js
 * ES Module shim for global Redglitch classes.
 * Bridges standard script tags to the AI's module system.
 */

// Use getters to ensure we always get the latest global instance
export const EventBus = {
    get instance() {
        return window.RedglitchEventBus || null;
    },
    // For compatibility with code expecting a direct object
    on: (...args) => window.RedglitchEventBus?.on(...args),
    emit: (...args) => window.RedglitchEventBus?.emit(...args),
    off: (...args) => window.RedglitchEventBus?.off(...args),
    getSource: (...args) => window.RedglitchEventBus?.getSource(...args),
    once: (...args) => window.RedglitchEventBus?.once(...args)
};

export const SharedProjectState = {
    get instance() {
        return window.RedglitchProjectState || null;
    }
};

export default { EventBus, SharedProjectState };
