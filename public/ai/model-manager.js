/**
 * public/ai/model-manager.js
 * Handles model lifecycle: download -> cache -> load -> dispose.
 */

import { AI_CONFIG } from './config.js';

export class ModelManager {
    constructor() {
        this.states = new Map(); // modelId -> state
        this.idleTimer = null;
        this.backend = null;
    }

    /**
     * Detect the best available backend.
     */
    async detectBackend() {
        if (this.backend) return this.backend;

        if (AI_CONFIG.features.enableWebGPU && navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    this.backend = 'webgpu';
                    return 'webgpu';
                }
            } catch (e) {
                console.warn('[ModelManager] WebGPU detection failed:', e);
            }
        }

        this.backend = 'wasm';
        return 'wasm';
    }

    /**
     * Get state of a specific model.
     */
    getState(modelId) {
        return this.states.get(modelId) || 'idle';
    }

    /**
     * Start/Reset idle timer.
     */
    resetIdleTimer(onTimeout) {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        
        this.idleTimer = setTimeout(() => {
            console.log('[ModelManager] Idle timeout reached, disposing models...');
            if (onTimeout) onTimeout();
        }, AI_CONFIG.limits.idleDisposeMinutes * 60000);
    }

    /**
     * Get storage estimate.
     */
    async getStorageEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            return await navigator.storage.estimate();
        }
        return { used: 0, quota: 0 };
    }
}
