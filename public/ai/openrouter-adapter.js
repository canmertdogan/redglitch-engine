/**
 * public/ai/openrouter-adapter.js
 *
 * Universal Multi-Provider AI Adapter for Redglitch Studio (Kai).
 *
 * Provides direct first-class integration with:
 * - OpenRouter (Universal orchestrator & aggregator for 300+ models)
 * - Google AI Studio (Official Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash)
 * - OpenAI Direct (GPT-4o, GPT-4o-mini, o1, o3-mini)
 * - Anthropic Direct (Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku)
 * - Google Gemini Direct (Gemini 2.5 Flash, Gemini 2.5 Pro via OpenAI endpoint)
 * - Groq (Ultra-fast LPU inference: Llama 3.3 70B, DeepSeek R1 Distill)
 * - DeepSeek Direct (DeepSeek-V3 Chat, DeepSeek-R1 Reasoner)
 * - Mistral AI Direct (Codestral, Mistral Large)
 * - Ollama / Local Custom (100% offline, private & free via local endpoint)
 * - Custom OpenAI-compatible gateways (LM Studio, vLLM, etc.)
 */

export const PROVIDER_PRESETS = Object.freeze({
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter (Recommended)',
        tagline: 'Universal AI router with 300+ models (Claude 3.7, GPT-4o, DeepSeek R1, Gemini)',
        baseUrl: 'https://openrouter.ai/api/v1',
        requiresKey: true,
        keyPlaceholder: 'sk-or-v1-...',
        defaultModel: 'anthropic/claude-3.7-sonnet',
        models: [
            { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet (Hybrid Reasoning)', tag: 'Coding & Logic' },
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', tag: 'Top Game Dev' },
            { id: 'openai/gpt-4o', name: 'GPT-4o (Omni)', tag: 'Flagship' },
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', tag: 'Fast & Cheap' },
            { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Full Reasoning)', tag: 'Open Reasoning' },
            { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (Chat)', tag: 'Fast & Accurate' },
            { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Ultra Low Latency' },
            { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: 'Deep Reasoning' },
            { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', tag: 'Open Weights' },
            { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', tag: 'Coding Specialist' },
            { id: 'mistralai/mistral-large-2411', name: 'Mistral Large 2411', tag: 'European Flagship' }
        ]
    },
    'google-ai-studio': {
        id: 'google-ai-studio',
        name: 'Google AI Studio',
        tagline: 'Direct Google AI Studio Gemini API (Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        requiresKey: true,
        keyPlaceholder: 'AIzaSy...',
        defaultModel: 'gemini-2.0-flash',
        keyUrl: 'https://aistudio.google.com/app/apikey',
        models: [
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Fast & Smart' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: 'Deep Reasoning' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', tag: 'Ultra Fast' },
            { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking', tag: 'Reasoning Exp' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', tag: 'Large Context (2M)' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', tag: 'Lightweight' }
        ]
    },
    openai: {
        id: 'openai',
        name: 'OpenAI Direct',
        tagline: 'Official OpenAI API for GPT-4o, o1 and o3 models',
        baseUrl: 'https://api.openai.com/v1',
        requiresKey: true,
        keyPlaceholder: 'sk-proj-...',
        defaultModel: 'gpt-4o-mini',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o', tag: 'Flagship' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tag: 'Fast & Lightweight' },
            { id: 'o3-mini', name: 'o3-mini (Reasoning)', tag: 'Math & Logic' },
            { id: 'o1', name: 'o1 (Deep Reasoning)', tag: 'Complex Reasoning' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', tag: 'Legacy Flagship' }
        ]
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic Claude Direct',
        tagline: 'Direct Anthropic Messages API for Claude 3.7 & 3.5',
        baseUrl: 'https://api.anthropic.com/v1',
        requiresKey: true,
        keyPlaceholder: 'sk-ant-api03-...',
        defaultModel: 'claude-3-7-sonnet-20250219',
        models: [
            { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', tag: 'Latest Hybrid' },
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', tag: 'Coding Standard' },
            { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', tag: 'Speed & Economy' },
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', tag: 'Heavy Reasoning' }
        ]
    },
    gemini: {
        id: 'gemini',
        name: 'Google Gemini Direct',
        tagline: 'Direct Google Gemini API (via official OpenAI-compatible endpoint)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        requiresKey: true,
        keyPlaceholder: 'AIzaSy...',
        defaultModel: 'gemini-2.0-flash',
        keyUrl: 'https://aistudio.google.com/app/apikey',
        models: [
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Fast & Smart' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: 'Deep Reasoning' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', tag: 'Ultra Fast' },
            { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking', tag: 'Reasoning Exp' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', tag: 'Large Context (2M)' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', tag: 'Lightweight' }
        ]
    },
    groq: {
        id: 'groq',
        name: 'Groq (Ultra-Fast LPU)',
        tagline: 'Instant 500+ tokens/sec inference on Groq LPU hardware',
        baseUrl: 'https://api.groq.com/openai/v1',
        requiresKey: true,
        keyPlaceholder: 'gsk_...',
        defaultModel: 'llama-3.3-70b-versatile',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', tag: 'Ultra Fast' },
            { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', tag: 'Fast Reasoning' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (32k)', tag: 'Fast MoE' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT', tag: 'Lightweight' }
        ]
    },
    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek Direct',
        tagline: 'Direct DeepSeek API for V3 and R1 reasoning models',
        baseUrl: 'https://api.deepseek.com/v1',
        requiresKey: true,
        keyPlaceholder: 'sk-...',
        defaultModel: 'deepseek-chat',
        models: [
            { id: 'deepseek-chat', name: 'DeepSeek-V3 (Chat)', tag: 'Top Value' },
            { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (Reasoner)', tag: 'Deep Thinking' }
        ]
    },
    mistral: {
        id: 'mistral',
        name: 'Mistral AI Direct',
        tagline: 'Official Mistral AI API for Codestral and Mistral Large',
        baseUrl: 'https://api.mistral.ai/v1',
        requiresKey: true,
        keyPlaceholder: '...',
        defaultModel: 'codestral-latest',
        models: [
            { id: 'codestral-latest', name: 'Codestral (Latest)', tag: 'Code Specialist' },
            { id: 'mistral-large-latest', name: 'Mistral Large', tag: 'Flagship' },
            { id: 'mistral-small-latest', name: 'Mistral Small', tag: 'Fast' }
        ]
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama / Local (Free & Offline)',
        tagline: 'Run 100% private, offline models via local Ollama instance',
        baseUrl: 'http://127.0.0.1:11434/v1',
        requiresKey: false,
        keyPlaceholder: 'No API key needed (optional)',
        defaultModel: 'llama3.3',
        models: [
            { id: 'llama3.3', name: 'Llama 3.3', tag: 'Local' },
            { id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder 7B', tag: 'Local Coding' },
            { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', tag: 'Local Reasoning' },
            { id: 'mistral', name: 'Mistral 7B', tag: 'Local Fast' },
            { id: 'phi4', name: 'Phi-4', tag: 'Local Logic' }
        ]
    },
    custom: {
        id: 'custom',
        name: 'Custom OpenAI-Compatible Endpoint',
        tagline: 'Connect to LM Studio, vLLM, Text-Gen WebUI, or custom AI gateway',
        baseUrl: 'http://127.0.0.1:1234/v1',
        requiresKey: false,
        keyPlaceholder: 'Optional bearer token',
        defaultModel: 'default',
        models: []
    }
});

function readStoredSettings() {
    const settings = {};
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem('kai_settings');
            if (raw) Object.assign(settings, JSON.parse(raw));
        }
    } catch (_) { /* ignore */ }
    return settings;
}

export class MultiProviderAdapter {
    constructor(options = {}) {
        const settings = options.settings || readStoredSettings();
        this.provider = options.provider || settings.provider || 'openrouter';
        this.preset = PROVIDER_PRESETS[this.provider] || PROVIDER_PRESETS.openrouter;

        // Resolve API Key
        const camelCaseProvider = this.provider.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const providerKeyProp = `${this.provider}Key`;
        const camelKeyProp = `${camelCaseProvider}Key`;
        const isGoogleFamily = this.provider === 'google-ai-studio' || this.provider === 'gemini';
        this.apiKey = options.apiKey !== undefined
            ? options.apiKey
            : (settings[providerKeyProp] ||
               settings[camelKeyProp] ||
               (isGoogleFamily ? (settings.googleAiStudioKey || settings['google-ai-studioKey'] || settings.geminiKey) : '') ||
               settings.providerKey ||
               (this.provider === 'openrouter' ? settings.openrouterKey : '') || '');

        // Resolve Base URL
        const providerBaseProp = `${this.provider}BaseUrl`;
        const camelBaseProp = `${camelCaseProvider}BaseUrl`;
        this.baseUrl = (options.baseUrl ||
                        settings[providerBaseProp] ||
                        settings[camelBaseProp] ||
                        (isGoogleFamily ? (settings.googleAiStudioBaseUrl || settings['google-ai-studioBaseUrl'] || settings.geminiBaseUrl) : '') ||
                        settings.providerBaseUrl ||
                        this.preset.baseUrl).replace(/\/$/, '');

        // Resolve Model
        const providerModelProp = `${this.provider}Model`;
        const camelModelProp = `${camelCaseProvider}Model`;
        this.model = options.model ||
                     settings[providerModelProp] ||
                     settings[camelModelProp] ||
                     (isGoogleFamily ? (settings.googleAiStudioModel || settings['google-ai-studioModel'] || settings.geminiModel) : '') ||
                     settings.providerModel ||
                     (this.provider === 'openrouter' ? settings.openrouterModel : '') ||
                     this.preset.defaultModel;

        // OpenRouter / App Attribution
        this.siteUrl = options.siteUrl || settings.openrouterSiteUrl || (typeof location !== 'undefined' && location.origin) || 'https://redglitch.ai';
        this.appName = options.appName || settings.openrouterAppName || 'Redglitch Studio';

        // Generation Parameters
        this.defaultParams = {
            temperature: options.temperature ?? settings.temp ?? 0.7,
            topP: options.topP ?? settings.topP ?? 0.9,
            maxTokens: options.maxTokens ?? settings.maxTokens ?? 1024,
        };
    }

    static getPreset(providerId) {
        return PROVIDER_PRESETS[providerId] || null;
    }

    static listPresets() {
        return Object.values(PROVIDER_PRESETS);
    }

    _headers(extra = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...extra,
        };

        if (this.provider === 'anthropic') {
            if (this.apiKey) headers['x-api-key'] = this.apiKey;
            headers['anthropic-version'] = '2023-06-01';
            headers['anthropic-dangerous-direct-browser-access'] = 'true';
            return headers;
        }

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        if (this.provider === 'openrouter') {
            if (this.siteUrl) headers['HTTP-Referer'] = this.siteUrl;
            if (this.appName) headers['X-Title'] = this.appName;
        }

        return headers;
    }

    _throw(code, message) {
        const err = new Error(message);
        err.code = code;
        return err;
    }

    /**
     * Unified Chat API: non-streaming and streaming.
     * Supports both OpenAI-compatible providers and direct Anthropic Messages API.
     */
    async chat(messages, options = {}, onToken = null) {
        if (this.preset.requiresKey && !this.apiKey) {
            throw this._throw('PROVIDER_UNAVAILABLE', `${this.preset.name} API key not configured. Set it in KAI settings (Engine tab).`);
        }

        if (this.provider === 'anthropic') {
            return this._chatAnthropic(messages, options, onToken);
        }

        return this._chatOpenAICompatible(messages, options, onToken);
    }

    /**
     * OpenAI-compatible chat (OpenRouter, OpenAI, Gemini, Groq, DeepSeek, Mistral, Ollama, Custom).
     */
    async _chatOpenAICompatible(messages, options = {}, onToken = null) {
        const body = {
            model: options.model || this.model,
            messages,
            max_tokens: options.maxTokens ?? this.defaultParams.maxTokens,
            temperature: options.temperature ?? this.defaultParams.temperature,
            top_p: options.topP ?? this.defaultParams.topP,
            stream: Boolean(onToken),
        };
        if (options.stopSequences) body.stop = options.stopSequences;

        let endpoint = `${this.baseUrl}/chat/completions`;
        if ((this.provider === 'google-ai-studio' || this.provider === 'gemini') && this.apiKey && !endpoint.includes('key=')) {
            const sep = endpoint.includes('?') ? '&' : '?';
            endpoint += `${sep}key=${encodeURIComponent(this.apiKey)}`;
        }
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            let detail = '';
            try {
                const errJson = await response.json();
                detail = errJson?.error?.message || JSON.stringify(errJson);
            } catch (_) {
                detail = await response.text().catch(() => '');
            }
            throw this._throw('PROVIDER_FAILED', `${this.preset.name} error ${response.status}: ${detail}`);
        }

        if (!onToken) {
            const data = await response.json();
            return {
                text: data.choices?.[0]?.message?.content || '',
                model: data.model || body.model,
                source: this.provider,
            };
        }

        // Streaming SSE parsing
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const payload = trimmed.slice(5).trim();
                if (payload === '[DONE]') continue;
                try {
                    const json = JSON.parse(payload);
                    const delta = json.choices?.[0]?.delta?.content || '';
                    if (delta) {
                        full += delta;
                        onToken(delta);
                    }
                } catch (_) { /* ignore */ }
            }
        }
        return { text: full, model: body.model, source: this.provider };
    }

    /**
     * Direct Anthropic Messages API compatibility layer.
     */
    async _chatAnthropic(messages, options = {}, onToken = null) {
        let systemPrompt = '';
        const anthropicMessages = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemPrompt += (systemPrompt ? '\n\n' : '') + (msg.content || '');
            } else {
                const role = msg.role === 'assistant' ? 'assistant' : 'user';
                // Merge consecutive messages with the same role
                if (anthropicMessages.length > 0 && anthropicMessages[anthropicMessages.length - 1].role === role) {
                    anthropicMessages[anthropicMessages.length - 1].content += '\n\n' + (msg.content || '');
                } else {
                    anthropicMessages.push({ role, content: msg.content || '' });
                }
            }
        }

        if (anthropicMessages.length === 0) {
            anthropicMessages.push({ role: 'user', content: 'Hello' });
        }

        const body = {
            model: options.model || this.model,
            messages: anthropicMessages,
            max_tokens: options.maxTokens ?? this.defaultParams.maxTokens,
            temperature: options.temperature ?? this.defaultParams.temperature,
            stream: Boolean(onToken),
        };
        if (systemPrompt) body.system = systemPrompt;

        const endpoint = `${this.baseUrl}/messages`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            let detail = '';
            try {
                const errJson = await response.json();
                detail = errJson?.error?.message || JSON.stringify(errJson);
            } catch (_) {
                detail = await response.text().catch(() => '');
            }
            throw this._throw('PROVIDER_FAILED', `Anthropic error ${response.status}: ${detail}`);
        }

        if (!onToken) {
            const data = await response.json();
            const text = (data.content || [])
                .filter(b => b.type === 'text')
                .map(b => b.text)
                .join('');
            return {
                text,
                model: data.model || body.model,
                source: 'anthropic',
            };
        }

        // Anthropic SSE stream parsing
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const payload = trimmed.slice(5).trim();
                try {
                    const event = JSON.parse(payload);
                    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                        const delta = event.delta.text || '';
                        full += delta;
                        onToken(delta);
                    }
                } catch (_) { /* ignore */ }
            }
        }
        return { text: full, model: body.model, source: 'anthropic' };
    }

    /**
     * Test connection to active provider with a minimal probe ping.
     * Returns { ok: true, latencyMs, model, provider } or throws.
     */
    async testConnection() {
        const start = Date.now();
        const res = await this.chat(
            [{ role: 'user', content: 'Respond with exactly: OK' }],
            { maxTokens: 8, temperature: 0.1 }
        );
        const latencyMs = Date.now() - start;
        return {
            ok: true,
            latencyMs,
            model: res.model,
            provider: this.provider,
            responseSnippet: (res.text || '').trim().slice(0, 30)
        };
    }

    /**
     * Dynamic Model Catalog Fetching.
     * Supports OpenRouter, Ollama, OpenAI, Groq, etc., with fallback to preset catalog.
     */
    async listModels({ onlyChat = true } = {}) {
        // Special case: Ollama models endpoint is /api/tags
        if (this.provider === 'ollama') {
            try {
                const res = await fetch(`${this.baseUrl.replace(/\/v1$/, '')}/api/tags`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data.models)) {
                        return data.models.map(m => ({
                            id: m.name,
                            name: m.name,
                            tag: `${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB`
                        }));
                    }
                }
            } catch (_) { /* fallback below */ }
        }

        // Standard /models endpoint (OpenRouter, OpenAI, Groq, Google AI Studio, LM Studio)
        try {
            let endpoint = `${this.baseUrl}/models`;
            if ((this.provider === 'google-ai-studio' || this.provider === 'gemini') && this.apiKey && !endpoint.includes('key=')) {
                const sep = endpoint.includes('?') ? '&' : '?';
                endpoint += `${sep}key=${encodeURIComponent(this.apiKey)}`;
            }
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: this._headers(),
            });

            if (response.ok) {
                const data = await response.json();
                let rawList = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
                if (rawList.length > 0) {
                    if (onlyChat && this.provider === 'openrouter') {
                        rawList = rawList.filter(m => {
                            const id = (m.id || '').toLowerCase();
                            const arch = (m.architecture?.output_modalities || []).join(',').toLowerCase();
                            return !id.includes('embed') && !arch.includes('embedding');
                        });
                    }
                    return rawList.map(m => ({
                        id: m.id || m.name,
                        name: m.name || m.id,
                        contextLength: m.context_length,
                        pricing: m.pricing,
                        tag: m.pricing?.prompt ? `\$${(parseFloat(m.pricing.prompt) * 1e6).toFixed(2)}/M` : ''
                    }));
                }
            }
        } catch (_) { /* fallback to presets */ }

        // Fallback to built-in presets
        return (this.preset.models || []).map(m => ({
            id: m.id,
            name: m.name,
            tag: m.tag
        }));
    }
}

/**
 * OpenRouterAdapter subclass for full backward-compatibility with existing tests and imports.
 */
export class OpenRouterAdapter extends MultiProviderAdapter {
    constructor(options = {}) {
        super({ ...options, provider: 'openrouter' });
    }
}

// Expose globally for classic scripts
if (typeof window !== 'undefined') {
    window.OpenRouterAdapter = OpenRouterAdapter;
    window.MultiProviderAdapter = MultiProviderAdapter;
    window.PROVIDER_PRESETS = PROVIDER_PRESETS;
}
