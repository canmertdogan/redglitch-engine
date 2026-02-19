/**
 * public/ai/inference-engine.js
 * Main-thread interface to the inference Web Worker.
 */

import { AI_CONFIG } from './config.js';
import { EventBus } from './shim.js';

export class InferenceEngine {
    constructor(modelManager) {
        this.modelManager = modelManager;
        this.worker = null;
        this.readyPromise = null;
        this.isModelReady = false;
        this.isGenerating = false;
        this.callbacks = new Map(); // id -> { onToken, resolve, reject }
    }

    async initialize() {
        if (this.worker) return;

        console.log('[InferenceEngine] Initializing Web Worker...');
        // We use the "final" worker which is already bundled and ready
        this.worker = new Worker('/ai/final/worker.js', { type: 'module' });
        
        this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
        this.worker.onerror = (e) => {
            console.error('[InferenceEngine] Worker Error:', e);
            EventBus.emit('ai:error', { message: 'Inference worker crashed', code: 'WORKER_ERROR' });
        };
    }

    async ensureModelReady() {
        if (this.isModelReady) return;
        if (this.readyPromise) return this.readyPromise;

        this.readyPromise = (async () => {
            await this.initialize();
            const backend = await this.modelManager.detectBackend();
            
            return new Promise((resolve, reject) => {
                const requestId = 'load-' + Date.now();
                this.callbacks.set(requestId, { resolve, reject });

                this.worker.postMessage({
                    type: 'load',
                    id: requestId,
                    modelId: AI_CONFIG.models.llm.modelId,
                    backend: backend
                });
            });
        })();

        try {
            await this.readyPromise;
            this.isModelReady = true;
        } finally {
            this.readyPromise = null;
        }
    }

    handleWorkerMessage(data) {
        const { type, id, ...payload } = data;
        const callback = this.callbacks.get(id);

        switch (type) {
            case 'progress':
                EventBus.emit('ai:model:progress', payload);
                break;
            
            case 'ready':
                this.isModelReady = true;
                if (callback) {
                    callback.resolve(payload);
                    this.callbacks.delete(id);
                }
                EventBus.emit('ai:model:ready', payload);
                break;

            case 'token':
                if (callback && callback.onToken) {
                    callback.onToken(payload.token);
                }
                EventBus.emit('ai:token', payload);
                break;

            case 'complete':
                this.isGenerating = false;
                if (callback) {
                    callback.resolve(payload.text);
                    this.callbacks.delete(id);
                }
                EventBus.emit('ai:response:complete', payload);
                break;

            case 'error':
                this.isGenerating = false;
                if (callback) {
                    callback.reject(new Error(payload.message));
                    this.callbacks.delete(id);
                }
                EventBus.emit('ai:error', payload);
                break;
        }
    }

    async generate(prompt, params = {}, onToken = null) {
        await this.ensureModelReady();

        if (this.isGenerating) {
            throw new Error('Already generating');
        }

        this.isGenerating = true;
        this.modelManager.resetIdleTimer(() => this.dispose());

        return new Promise((resolve, reject) => {
            const requestId = 'gen-' + Date.now();
            this.callbacks.set(requestId, { resolve, reject, onToken });

            this.worker.postMessage({
                type: 'generate',
                id: requestId,
                prompt,
                params: {
                    maxNewTokens: params.maxNewTokens || AI_CONFIG.models.llm.maxNewTokens,
                    temperature: params.temperature || AI_CONFIG.models.llm.temperature,
                    topP: params.topP || AI_CONFIG.models.llm.topP,
                    repetitionPenalty: params.repetitionPenalty || AI_CONFIG.models.llm.repetitionPenalty
                }
            });
        });
    }

    dispose() {
        if (this.worker) {
            this.worker.postMessage({ type: 'dispose' });
            this.isModelReady = false;
            EventBus.emit('ai:model:disposed');
        }
    }
}
