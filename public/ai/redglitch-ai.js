/**
 * public/ai/redglitch-ai.js
 * Main orchestrator for RedGlitch AI Micro Edition.
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
import { EventBus } from './shim.js';
import { ProjectContextRetriever } from './project-context-retriever.mjs';
import { stripToolBlocks } from './tool-call-parser.mjs';
import { runAgentLoop } from './agent-loop.mjs';
import { getAIMode } from './ai-mode.mjs';

export class RedGlitchAI {
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
        this.projectContextRetriever = new ProjectContextRetriever();
        this.isInitialized = false;
        this.enabled = true;
    }

    _getKaiSettings() {
        const raw = localStorage.getItem('kai_settings');
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            console.warn('[RedGlitchAI] Invalid kai_settings JSON, using defaults.');
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
            console.log('[RedGlitchAI] Saved settings loaded into kernel.');
        }
    }

    async initialize() {
        if (getAIMode() !== true) {
            const error = new Error('AI features are disabled. Enable AI mode to initialize Kai and Copilot.');
            error.code = 'AI_DISABLED';
            throw error;
        }
        this.enabled = true;
        if (this.isInitialized) return;
        
        console.log('[RedGlitchAI] Initializing Kernel...');
        
        // Determine Provider
        const savedSettings = this._getKaiSettings();
        const provider = savedSettings.provider || 'native';

        // 1. If Native, we don't need to load local weights (300MB save!)
        if (provider === 'native' || provider === 'opencode-zen' || provider === 'cerebras') {
            console.log(`[RedGlitchAI] ${provider} provider detected. Skipping local model load.`);
        } else if (this.config.features.enableWebGPU) {
            // Only load WebGPU if specifically requested or native is unavailable
            await this.inferenceEngine.initialize().catch(e => {
                console.warn('[RedGlitchAI] WebGPU initialization failed. Provider will remain unavailable:', e);
            });
        }
        
        if (this.config.features.enableRAG) {
            this.ragEngine.initialize().catch(e => console.error('[RedGlitchAI] RAG Init Failed:', e));
        }

        this.isInitialized = true;
        const eBus = EventBus.instance;
        if (eBus) eBus.emit('ai:status', this.getStatus());
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
        if (provider === 'local' && this.inferenceEngine.isModelReady) {
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
        if (!this.enabled || getAIMode() !== true) throw Object.assign(new Error('AI features are disabled.'), { code: 'AI_DISABLED' });
        await this.initialize();
        const automationContext = await this._buildAutomationContext(message, options.context || {});
        
        // --- Phase 4: Unified Router Logic (FIXED: Prioritize Native Cortex) ---
        
        // 1. PRIMARY: Native Cortex (Python WebSocket)
        const irabBridge = window.irab || (window.parent && window.parent.irab);
        const provider = this._getKaiSettings().provider || 'native';

        if (provider === 'opencode-zen') {
            return this._chatWithOpenCodeZen(message, options, automationContext);
        }

        if (provider === 'cerebras') {
            return this._chatWithCerebras(message, options, automationContext);
        }
        
        if (provider === 'native' && irabBridge && irabBridge.isConnected) {
            console.log('[RedGlitchAI] Routing to Native Cortex...');
            const inferNative = (prompt, context) => new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(Object.assign(new Error('Native Cortex timed out.'), { code: 'PROVIDER_TIMEOUT' })), 60000);
                irabBridge.send({
                    type: "CHAT",
                    data: { message: prompt, context }
                }, (response) => {
                    clearTimeout(timeout);
                    resolve({ text: response.text, source: 'native' });
                });
            });
            const nativeResult = await inferNative(message, automationContext);
            return this._runAgentLoop(nativeResult, async (turn) => inferNative(turn.feedback, {
                ...automationContext,
                previousAssistantResponse: turn.assistantText
            }));
        }

        if (provider === 'native') {
            const error = new Error('Native Cortex is selected but disconnected. Provider fallback is disabled.');
            error.code = 'PROVIDER_UNAVAILABLE';
            throw error;
        }

        // 2. SECONDARY: Local WebGPU (Micro Edition)
        if (provider === 'local' && this.inferenceEngine.isModelReady && !options.forceNative) {
            console.log('[RedGlitchAI] Using Local Inference...');
            return await this._localChat(message, options, automationContext);
        }

        const error = new Error(`${provider} is selected but unavailable. Provider fallback is disabled.`);
        error.code = 'PROVIDER_UNAVAILABLE';
        throw error;
    }

    async _buildAutomationContext(message, editorContext = {}) {
        const [projectContext, ragContext] = await Promise.all([
            this.projectContextRetriever.retrieve(message).catch((error) => {
                console.warn('[RedGlitchAI] Project context retrieval failed:', error);
                return '';
            }),
            this.config.features.enableRAG && this.ragEngine.isLoaded
                ? this.ragEngine.retrieveContext(message, this.config.limits.maxRAGChunks).catch((error) => {
                    console.warn('[RedGlitchAI] Documentation RAG retrieval failed:', error);
                    return '';
                })
                : Promise.resolve('')
        ]);
        return {
            ...editorContext,
            projectContext,
            ragContext,
            tools: this.toolRegistry.getToolPrompt(),
            automationProtocol: 'Use only advertised tools. Tool mutations require approval. After receiving tool results, continue until the requested outcome is complete or explain the exact blocker. Navigation is an intermediate step, never completion. For broad requests such as "build a game", inspect the project, choose reasonable defaults, establish a concise vision, then create playable content with the available editor tools. Never claim a tool succeeded before receiving its result.'
        };
    }

    _safeToolResult(value, key = '') {
        if (/undo|previousContent|token|secret|password|api.?key/i.test(key)) return '[REDACTED]';
        if (typeof value === 'string') return value.length > 1500 ? `${value.slice(0, 1500)}…` : value;
        if (Array.isArray(value)) return value.slice(0, 30).map((item) => this._safeToolResult(item));
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, this._safeToolResult(child, childKey)]));
        }
        return value;
    }

    async _runAgentLoop(initialResponse, inferNext, maxTurns = 8) {
        return runAgentLoop({
            initialResponse,
            inferNext,
            maxTurns,
            parseToolCalls: (text) => this.workflowManager.parseToolCalls(text),
            executeWorkflow: (calls, workflowId) => this.workflowManager.executeWorkflow(calls, workflowId),
            getToolPrompt: () => this.toolRegistry.getToolPrompt(),
            sanitize: (value) => this._safeToolResult(value),
            stripToolBlocks
        });
    }

    async _chatWithOpenCodeZen(message, options = {}, automationContext = null) {
        const settings = this._getKaiSettings();
        const context = automationContext || await this._buildAutomationContext(message, options.context || {});
        const ragContext = [context.projectContext, context.ragContext].filter(Boolean).join('\n\n');
        const toolsPrompt = context.tools;
        let system = 'You are Kai, the expert AI assistant built into RedGlitch Studio. Be concise, technically rigorous, and help the user build games.';
        if (ragContext) system += `\n\nRELEVANT PROJECT CONTEXT:\n${ragContext}`;
        if (toolsPrompt) {
            system += `\n\nAUTOMATION CONTRACT:\n${context.automationProtocol}\nEmit each call as a JSON object in a tool fence. Multiple objects or a JSON array are accepted. Arguments must match the schema.\n\nAVAILABLE STUDIO TOOLS:\n${toolsPrompt}`;
        }

        const historyLimit = Math.max(0, Number(settings.historyLimit) || 6) * 2;
        const messages = [
            { role: 'system', content: system },
            ...this.contextManager.history.slice(-historyLimit),
            { role: 'user', content: message },
        ];
        const headers = { 'Content-Type': 'application/json' };
        if (settings.openCodeZenKey) headers['x-opencode-zen-key'] = settings.openCodeZenKey;
        const infer = async () => {
            const response = await fetch('/api/opencode-zen/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: settings.openCodeZenModel || 'kimi-k2.5', messages,
                    maxTokens: settings.maxTokens, temperature: settings.temp, topP: settings.topP
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'OpenCode Zen request failed.');
            return { text: payload.response, source: 'opencode-zen', model: payload.model };
        };
        const initial = await infer();
        const result = await this._runAgentLoop(initial, async (turn) => {
            messages.push({ role: 'assistant', content: turn.assistantText });
            messages.push({ role: 'user', content: turn.feedback });
            return infer();
        });
        this.contextManager.addHistory('user', message);
        this.contextManager.addHistory('assistant', result.text);
        return result;
    }

    async _chatWithCerebras(message, options = {}, automationContext = null) {
        const CerebrasAdapterClass = window.CerebrasAdapter;
        if (!CerebrasAdapterClass) {
            const error = new Error('Cerebras adapter not loaded. Include cerebras-adapter.js.');
            error.code = 'PROVIDER_UNAVAILABLE';
            throw error;
        }
        const adapter = new CerebrasAdapterClass();
        const settings = this._getKaiSettings();
        const context = automationContext || await this._buildAutomationContext(message, options.context || {});
        const ragContext = [context.projectContext, context.ragContext].filter(Boolean).join('\n\n');
        const toolsPrompt = context.tools;
        let system = 'You are Kai, the expert AI assistant built into RedGlitch Studio. Be concise, technically rigorous, and help the user build games.';
        if (ragContext) system += `\n\nRELEVANT PROJECT CONTEXT:\n${ragContext}`;
        if (toolsPrompt) {
            system += `\n\nAUTOMATION CONTRACT:\n${context.automationProtocol}\nEmit each call as a JSON object in a tool fence. Multiple objects or a JSON array are accepted. Arguments must match the schema.\n\nAVAILABLE STUDIO TOOLS:\n${toolsPrompt}`;
        }

        const historyLimit = Math.max(0, Number(settings.historyLimit) || 6) * 2;
        const messages = [
            { role: 'system', content: system },
            ...this.contextManager.history.slice(-historyLimit),
            { role: 'user', content: message },
        ];
        const infer = async () => adapter.chat(messages, {
            maxTokens: settings.maxTokens,
            temperature: settings.temp,
            topP: settings.topP
        });
        const initial = await infer();
        const result = await this._runAgentLoop(initial, async (turn) => {
            messages.push({ role: 'assistant', content: turn.assistantText });
            messages.push({ role: 'user', content: turn.feedback });
            return infer();
        });
        this.contextManager.addHistory('user', message);
        this.contextManager.addHistory('assistant', result.text);
        return result;
    }

    async _localChat(message, options, automationContext = null) {
        const context = automationContext || await this._buildAutomationContext(message, options.context || {});
        const ragContext = [context.projectContext, context.ragContext].filter(Boolean).join('\n\n');
        const toolsPrompt = context.tools;
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
            const result = await this._runAgentLoop({ text: responseText, source: 'local' }, async (turn) => {
                const nextPrompt = this.contextManager.buildPrompt(`PREVIOUS_ASSISTANT_RESPONSE:\n${turn.assistantText}\n\n${turn.feedback}`, ragContext, this.toolRegistry.getToolPrompt());
                const text = await this.inferenceEngine.generate(nextPrompt, generateOptions, options.onToken);
                return { text, source: 'local' };
            });
            this.contextManager.addHistory('user', message);
            this.contextManager.addHistory('assistant', result.text);
            return result;
        } catch (error) {
            console.error('[RedGlitchAI] Local Chat Failed:', error);
            error.code = error.code || 'PROVIDER_FAILED';
            throw error;
        }
    }

    async suggest(prefix, suffix, filePath) {
        await this.initialize();
        
        // Don't suggest if user turned it off
        if (!this.config.features.enableGhostText) return null;

        const prompt = `<|im_start|>system
You are a Ghost Text autocomplete provider for RedGlitch Code Forge.
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

        if (provider === 'local' && this.inferenceEngine.isModelReady) {
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
        console.log('[RedGlitchAI] Falling back to server API...');
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
        const provider = this._getKaiSettings().provider || 'native';
        const irabBridge = window.irab || (window.parent && window.parent.irab);
        const available = provider === 'native'
            ? Boolean(irabBridge?.isConnected)
            : provider === 'local'
                ? this.inferenceEngine.isModelReady
                : provider === 'opencode-zen';
        return {
            provider,
            providerAvailable: available,
            fallbackEnabled: false,
            modelState: this.inferenceEngine.isModelReady ? 'ready' : 'idle',
            backend: this.modelManager.backend || 'unknown',
            isGenerating: this.inferenceEngine.isGenerating,
            ragReady: this.ragEngine.isLoaded
        };
    }

    clearHistory() {
        this.contextManager.clearHistory();
    }

    async rebuildContextIndex() {
        if (!this.enabled || getAIMode() !== true) throw Object.assign(new Error('AI features are disabled.'), { code: 'AI_DISABLED' });
        await this.ragEngine.rebuild();
        return { success: true };
    }

    async setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        this.coPilot.enabled = this.enabled;
        if (!this.enabled) {
            this.isInitialized = false;
            this.workflowManager.cancel();
            this.coPilot.stopChaosMode();
            this.inferenceEngine.dispose();
            this.ragEngine.shutdown();
            return;
        }
        await this.initialize();
    }
}

// Safe auto-instantiation
if (typeof window !== 'undefined' && getAIMode() === true && !window.RedGlitchAIInstance) {
    console.log("[RedGlitchAI] Creating global instance...");
    window.RedGlitchAIInstance = new RedGlitchAI();
}

if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key !== 'kai_ai_enabled' || !window.RedGlitchAIInstance?.setEnabled) return;
        window.RedGlitchAIInstance.setEnabled(event.newValue === 'true').catch((error) => {
            console.error('[RedGlitchAI] Failed to apply AI mode change:', error);
        });
    });
}
