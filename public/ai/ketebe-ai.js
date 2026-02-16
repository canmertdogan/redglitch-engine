/**
 * public/ai/ketebe-ai.js
 * Main orchestrator for Ketebe AI Micro Edition.
 */

import { AI_CONFIG } from './config.js';
import { ModelManager } from './model-manager.js';
import { InferenceEngine } from './inference-engine.js';
import { TokenizerUtils } from './tokenizer-utils.js';
import { RAGEngine } from './rag-engine.js';
import { ContextManager } from './context-manager.js';
import { EventBus } from '../shared/EventBus.js';

export class KetebeAI {
    constructor() {
        this.modelManager = new ModelManager();
        this.inferenceEngine = new InferenceEngine(this.modelManager);
        this.ragEngine = new RAGEngine();
        this.contextManager = new ContextManager();
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;
        
        console.log('[KetebeAI] Initializing...');
        await this.inferenceEngine.initialize();
        
        if (AI_CONFIG.features.enableRAG) {
            this.ragEngine.initialize().catch(e => console.error('[KetebeAI] RAG Init Failed:', e));
        }

        this.isInitialized = true;
        EventBus.emit('ai:status', this.getStatus());
    }

    async chat(message, options = {}) {
        await this.initialize();
        
        let ragContext = "";
        if (AI_CONFIG.features.enableRAG && this.ragEngine.isLoaded) {
            try {
                ragContext = await this.ragEngine.retrieveContext(message);
            } catch (e) {
                console.warn('[KetebeAI] RAG Retrieval Failed:', e);
            }
        }

        const prompt = this.contextManager.buildPrompt(message, ragContext);

        try {
            const response = await this.inferenceEngine.generate(prompt, options, options.onToken);
            
            // Add to history
            this.contextManager.addHistory('user', message);
            this.contextManager.addHistory('assistant', response);
            
            return { text: response };
        } catch (error) {
            console.error('[KetebeAI] Chat Error:', error);
            return this.fallbackToServer(message);
        }
    }

    async fallbackToServer(message) {
        console.log('[KetebeAI] Falling back to server API...');
        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            const data = await res.json();
            return { text: data.response };
        } catch (e) {
            throw new Error('Both local AI and server fallback failed.');
        }
    }

    getStatus() {
        return {
            modelState: this.inferenceEngine.isModelReady ? 'ready' : 'idle',
            backend: this.modelManager.backend || 'unknown',
            isGenerating: this.inferenceEngine.isGenerating,
            ragReady: this.ragEngine.isLoaded
        };
    }

    clearHistory() {
        this.contextManager.clearHistory();
    }
}

// Auto-instantiate if loaded as a script
if (typeof window !== 'undefined') {
    window.KetebeAIInstance = new KetebeAI();
}
