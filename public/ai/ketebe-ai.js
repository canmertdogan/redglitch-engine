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
        this.config = { ...AI_CONFIG };
        this.loadSavedSettings();
        
        this.modelManager = new ModelManager();
        this.inferenceEngine = new InferenceEngine(this.modelManager);
        this.toolRegistry = new ToolRegistry(EventBus);
        this.workflowManager = new WorkflowManager(this.toolRegistry, EventBus);
        this.coPilot = new CoPilot(this, EventBus);
        this.ragEngine = new RAGEngine();
        this.contextManager = new ContextManager();
        this.isInitialized = false;
    }

    _getKaiSettings() {
        const raw = localStorage.getItem('kai_settings');
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            console.warn('[KetebeAI] Invalid kai_settings JSON, using defaults.');
            return {};
        }
    }

    loadSavedSettings() {
        const s = this._getKaiSettings();
        if (s.temp) this.config.models.llm.temperature = s.temp;
        if (s.topP) this.config.models.llm.topP = s.topP;
        if (s.maxTokens) this.config.models.llm.maxNewTokens = s.maxTokens;
        if (s.contextWindow) this.config.limits.contextWindow = s.contextWindow;
        if (s.historyLimit !== undefined) this.config.limits.maxHistoryMessages = s.historyLimit;
        if (s.ragEnabled !== undefined) this.config.features.enableRAG = s.ragEnabled;
        if (Object.keys(s).length > 0) {
            console.log('[KetebeAI] Saved settings loaded into kernel.');
        }
    }

    async initialize() {
        if (this.isInitialized) return;
        
        console.log('[KetebeAI] Initializing Kernel...');
        
        // Determine Provider
        const savedSettings = this._getKaiSettings();
        const provider = savedSettings.provider || 'native';

        // 1. If Native, we don't need to load local weights (300MB save!)
        if (provider === 'native') {
            console.log('[KetebeAI] Native Cortex detected. Skipping local model load.');
        } else if (this.config.features.enableWebGPU) {
            // Only load WebGPU if specifically requested or native is unavailable
            await this.inferenceEngine.initialize().catch(e => {
                console.warn('[KetebeAI] WebGPU Init Failed, falling back to Native:', e);
            });
        }
        
        if (this.config.features.enableRAG) {
            this.ragEngine.initialize().catch(e => console.error('[KetebeAI] RAG Init Failed:', e));
        }

        this.isInitialized = true;
        if (EventBus.instance) EventBus.emit('ai:status', this.getStatus());
    }

    /**
     * Get low-latency code completions (Ghost-Text).
     * @param {string} prefix - Code before the cursor.
     * @param {string} suffix - Code after the cursor (optional).
     * @returns {Promise<string>} - The completion text.
     */
    async getCompletions(prefix, suffix = "") {
        await this.initialize();
        
        // Fast-path: Native Cortex (if available)
        const irabBridge = window.irab || (window.parent && window.parent.irab);
        const provider = this._getKaiSettings().provider || 'native';

        if (provider === 'native' && irabBridge && irabBridge.isConnected) {
            return new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(""), 2000); // 2s timeout for ghost text
                
                irabBridge.send({
                    type: "COMPLETION",
                    data: { prefix, suffix }
                }, (response) => {
                    clearTimeout(timeout);
                    resolve(response.text || "");
                });
            });
        }

        // Local Fallback: Small model inference
        if (this.inferenceEngine.isModelReady) {
            const prompt = `<|completion_start|>${prefix}<|cursor|>${suffix}<|completion_end|>`;
            const result = await this.inferenceEngine.generate(prompt, {
                maxNewTokens: 32, // Keep completions short for speed
                stopSequences: ["\n", ";", "}"], // Stop at logical breaks
                temperature: 0.2 // Low temperature for high predictability
            });
            return result.text || "";
        }

        return "";
    }

    async chat(message, options = {}) {
        await this.initialize();
        
        // --- Phase 4: Unified Router Logic (FIXED: Prioritize Native Cortex) ---
        
        // 1. PRIMARY: Native Cortex (Python WebSocket)
        const irabBridge = window.irab || (window.parent && window.parent.irab);
        const provider = this._getKaiSettings().provider || 'native';
        
        if (provider === 'native' && irabBridge && irabBridge.isConnected) {
            console.log('[KetebeAI] Routing to Native Cortex...');
            const nativeResult = await new Promise((resolve) => {
                irabBridge.send({
                    type: "CHAT",
                    data: { message, context: options.context || {} }
                }, (response) => {
                    resolve({ text: response.text, source: 'native' });
                });
            });

            // Parse and execute any tool calls in the native response
            const toolCalls = this.workflowManager.parseToolCalls(nativeResult.text);
            if (toolCalls.length > 0) {
                const workflowResult = await this.workflowManager.executeWorkflow(toolCalls);
                return { ...nativeResult, toolCalls, workflowResult };
            }
            return { ...nativeResult, toolCalls: [] };
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
        if (this.config.features.enableRAG && this.ragEngine.isLoaded) {
            try {
                ragContext = await this.ragEngine.retrieveContext(message);
            } catch (e) {
                console.warn('[KetebeAI] RAG Retrieval Failed:', e);
            }
        }

        const toolsPrompt = this.toolRegistry.getToolPrompt();
        const prompt = this.contextManager.buildPrompt(message, ragContext, toolsPrompt);

        // Merge config with options
        const generateOptions = {
            temperature: this.config.models.llm.temperature,
            topP: this.config.models.llm.topP,
            maxNewTokens: this.config.models.llm.maxNewTokens,
            ...options
        };

        try {
            const responseText = await this.inferenceEngine.generate(prompt, generateOptions, options.onToken);
            
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

    async suggest(prefix, suffix, filePath) {
        await this.initialize();
        
        // Don't suggest if user turned it off
        if (!this.config.features.enableGhostText) return null;

        const prompt = `<|im_start|>system
You are a Ghost Text autocomplete provider for Ketebe Code Forge.
Generate a SHORT (1-5 lines) code completion based on the prefix and suffix.
Respond ONLY with the code to be inserted. Do not use markdown blocks.
File: ${filePath}<|im_end|>
<|im_start|>user
Prefix:
${prefix}
Suffix:
${suffix}<|im_end|>
<|im_start|>assistant
`;

        const provider = this._getKaiSettings().provider || 'native';
        
        if (provider === 'native') {
            const irabBridge = window.irab || (window.parent && window.parent.irab);
            if (irabBridge && irabBridge.isConnected) {
                return new Promise((resolve) => {
                    let fullText = "";
                    const originalOnToken = irabBridge.onToken;
                    
                    irabBridge.onToken = (token) => {
                        if (token === null) {
                            irabBridge.onToken = originalOnToken;
                            resolve(fullText.trim());
                            return;
                        }
                        fullText += token;
                        // Max 200 chars for ghost text to keep it snappy
                        if (fullText.length > 200) {
                             irabBridge.abort();
                             irabBridge.onToken = originalOnToken;
                             resolve(fullText.trim());
                        }
                    };
                    
                    irabBridge.prompt(prompt, { max_tokens: 64, temperature: 0.1 });
                });
            }
        }

        if (this.inferenceEngine.isModelReady) {
            const response = await this.inferenceEngine.generate(prompt, { 
                maxNewTokens: 64, 
                temperature: 0.1,
                stop: ["<|im_end|>", "\n\n"] 
            });
            return response.trim();
        }

        return null;
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
