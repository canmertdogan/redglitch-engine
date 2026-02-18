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
        
        let ragContext = "";
        if (AI_CONFIG.features.enableRAG && this.ragEngine.isLoaded) {
            try {
                ragContext = await this.ragEngine.retrieveContext(message);
            } catch (e) {
                console.warn('[KetebeAI] RAG Retrieval Failed:', e);
            }
        }

        // Get tools for the prompt
        const toolsPrompt = this.toolRegistry.getToolPrompt();
        const prompt = this.contextManager.buildPrompt(message, ragContext, toolsPrompt);

        try {
            const responseText = await this.inferenceEngine.generate(prompt, options, options.onToken);
            
            // Add to history
            this.contextManager.addHistory('user', message);
            this.contextManager.addHistory('assistant', responseText);
            
            // Phase 8: Workflow Execution
            const toolCalls = this.workflowManager.parseToolCalls(responseText);
            if (toolCalls.length > 0) {
                console.log(`[KetebeAI] Executing ${toolCalls.length} tool calls...`);
                // Note: We don't await here if we want the chat to return immediately,
                // but usually we want to see the result.
                const workflowResult = await this.workflowManager.executeWorkflow(toolCalls);
                
                // Return combined result
                return { 
                    text: responseText, 
                    toolCalls, 
                    workflowResult 
                };
            }
            
            return { text: responseText, toolCalls: [] };
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
