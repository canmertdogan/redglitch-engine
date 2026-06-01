/**
 * ai/shim.js
 * ES Module shim for global RedGlitch classes.
 * Bridges standard script tags to the AI's module system.
 */

// Use getters to ensure we always get the latest global instance
export const EventBus = {
    get instance() {
        return window.RedGlitchEventBus || null;
    },
    // For compatibility with code expecting a direct object
    on: (...args) => window.RedGlitchEventBus?.on(...args),
    emit: (...args) => window.RedGlitchEventBus?.emit(...args),
    off: (...args) => window.RedGlitchEventBus?.off(...args),
    getSource: (...args) => window.RedGlitchEventBus?.getSource(...args),
    once: (...args) => window.RedGlitchEventBus?.once(...args)
};

export const SharedProjectState = {
    get instance() {
        return window.RedGlitchProjectState || null;
    }
};

export default { EventBus, SharedProjectState };
