/**
 * ai/shim.js
 * ES Module shim for global Ketebe classes.
 * Bridges standard script tags to the AI's module system.
 */

const EventBus = window.KetebeEventBus || null;
const SharedProjectState = window.KetebeProjectState || null;

if (!EventBus) {
    console.warn("[AI-Shim] EventBus not found in global scope. AI may not communicate.");
}

export { EventBus, SharedProjectState };
