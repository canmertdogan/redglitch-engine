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
import { ToolRegistry } from './tool-registry.js';
import { WorkflowManager } from './workflow-manager.js';
import { CoPilot } from './co-pilot.js';
import { EventBus } from '../shared/EventBus.js';

export class KetebeAI {
    constructor() {
        this.modelManager = new ModelManager();
        this.inferenceEngine = new InferenceEngine(this.modelManager);
        this.toolRegistry = new ToolRegistry(EventBus);
        this.workflowManager = new WorkflowManager(this.toolRegistry, EventBus);
        this.coPilot = new CoPilot(this, EventBus);
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
        
        // --- Phase 4: Unified Router Logic ---
        
        // 1. PRIMARY: Local WebGPU (Micro Edition)
        if (this.inferenceEngine.isModelReady && !options.forceNative) {
            console.log('[KetebeAI] Using Local Inference...');
            return await this._localChat(message, options);
        }

        // 2. SECONDARY: Native Cortex (Python WebSocket)
        if (window.irab && window.irab.isConnected) {
            console.log('[KetebeAI] Routing to Native Cortex...');
            // IrabBridge handles its own UI, but we can return a promise that waits for complete response
            return new Promise((resolve) => {
                const originalOnToken = window.irab.onToken;
                let fullText = "";

                window.irab.onToken = (token) => {
                    if (token === null) { // Stream end marker
                        window.irab.onToken = originalOnToken;
                        resolve({ text: fullText, source: 'native' });
                    }
                    fullText += token;
                    if (options.onToken) options.onToken(token);
                    if (originalOnToken) originalOnToken(token);
                };

                window.irab.prompt(message, options.context || {});
            });
        }

        // 3. TERTIARY: Server Fallback
        return this.fallbackToServer(message);
    }

    async _localChat(message, options) {
        let ragContext = "";
        if (AI_CONFIG.features.enableRAG && this.ragEngine.isLoaded) {
            try {
                ragContext = await this.ragEngine.retrieveContext(message);
            } catch (e) {
                console.warn('[KetebeAI] RAG Retrieval Failed:', e);
            }
        }

        const toolsPrompt = this.toolRegistry.getToolPrompt();
        const prompt = this.contextManager.buildPrompt(message, ragContext, toolsPrompt);

        try {
            const responseText = await this.inferenceEngine.generate(prompt, options, options.onToken);
            
            this.contextManager.addHistory('user', message);
            this.contextManager.addHistory('assistant', responseText);
            
            const toolCalls = this.workflowManager.parseToolCalls(responseText);
            if (toolCalls.length > 0) {
                const workflowResult = await this.workflowManager.executeWorkflow(toolCalls);
                return { text: responseText, toolCalls, workflowResult, source: 'local' };
            }
            
            return { text: responseText, toolCalls: [], source: 'local' };
        } catch (error) {
            console.error('[KetebeAI] Local Chat Failed:', error);
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
