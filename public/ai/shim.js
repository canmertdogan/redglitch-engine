/**
 * ai/shim.js
 * ES Module shim for global Vortex classes.
 * Bridges standard script tags to the AI's module system.
 */

// Use getters to ensure we always get the latest global instance
export const EventBus = {
    get instance() {
        return window.VortexEventBus || null;
    },
    // For compatibility with code expecting a direct object
    on: (...args) => window.VortexEventBus?.on(...args),
    emit: (...args) => window.VortexEventBus?.emit(...args),
    off: (...args) => window.VortexEventBus?.off(...args),
    getSource: (...args) => window.VortexEventBus?.getSource(...args),
    once: (...args) => window.VortexEventBus?.once(...args)
};

export const SharedProjectState = {
    get instance() {
        return window.VortexProjectState || null;
    }
};

export default { EventBus, SharedProjectState };
