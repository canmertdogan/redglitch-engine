/**
 * public/ai/ketebe-ai.js
 * Main orchestrator for Ketebe AI Micro Edition.
 */

import { AI_CONFIG } from './config.js?v=8';
import { ModelManager } from './model-manager.js?v=8';
import { InferenceEngine } from './inference-engine.js?v=8';
import { TokenizerUtils } from './tokenizer-utils.js?v=8';
import { RAGEngine } from './rag-engine.js?v=8';
import { ContextManager } from './context-manager.js?v=8';
import { ToolRegistry } from './tool-registry.js?v=8';
import { WorkflowManager } from './workflow-manager.js?v=8';
import { CoPilot } from './co-pilot.js?v=8';
import { EventBus } from './shim.js?v=8';

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
        // Only initialize inference engine if WebGPU is enabled and we don't have a native bridge
        if (AI_CONFIG.features.enableWebGPU) {
            await this.inferenceEngine.initialize().catch(e => console.warn('[KetebeAI] WebGPU Init Failed:', e));
        }
        
        if (AI_CONFIG.features.enableRAG) {
            this.ragEngine.initialize().catch(e => console.error('[KetebeAI] RAG Init Failed:', e));
        }

        this.isInitialized = true;
        if (EventBus.instance) EventBus.emit('ai:status', this.getStatus());
    }

    async chat(message, options = {}) {
        await this.initialize();
        
        // --- Phase 4: Unified Router Logic (FIXED: Prioritize Native Cortex) ---
        
        // 1. PRIMARY: Native Cortex (Python WebSocket)
        const irabBridge = window.irab || (window.parent && window.parent.irab);
        if (irabBridge && irabBridge.isConnected) {
            console.log('[KetebeAI] Routing to Native Cortex...');
            return new Promise((resolve) => {
                const originalOnToken = irabBridge.onToken;
                let fullText = "";

                irabBridge.onToken = (token) => {
                    if (token === null) { // Stream end marker
                        irabBridge.onToken = originalOnToken;
                        resolve({ text: fullText, source: 'native' });
                        return;
                    }
                    fullText += token;
                    if (options.onToken) options.onToken(token);
                    if (originalOnToken) originalOnToken(token);
                };

                irabBridge.prompt(message, options.context || {});
            });
        }

        // 2. SECONDARY: Local WebGPU (Micro Edition)
        if (this.inferenceEngine.isModelReady && !options.forceNative) {
            console.log('[KetebeAI] Using Local Inference...');
            return await this._localChat(message, options);
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

// Safe auto-instantiation
if (typeof window !== 'undefined' && !window.KetebeAIInstance) {
    console.log("[KetebeAI] Creating global instance...");
    window.KetebeAIInstance = new KetebeAI();
}
