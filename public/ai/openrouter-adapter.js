/**
 * public/ai/openrouter-adapter.js
 *
 * Full OpenRouter compatibility layer for Redglitch Kai.
 *
 * OpenRouter exposes an OpenAI-compatible REST surface at
 * https://openrouter.ai/api/v1, so we speak the same /chat/completions and
 * /models contracts as OpenAI, with the OpenRouter-specific headers
 * (HTTP-Referer / X-Title) required for analytics + attribution.
 *
 * Designed to be injectable into the RAG pipeline (query rewriting, HyDE, and
 * reranking) as well as a first-class chat provider selected via
 * kai_settings.provider = 'openrouter'.
 */

function readOpenRouterSettings() {
    const settings = {};
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem('kai_settings');
            if (raw) Object.assign(settings, JSON.parse(raw));
        }
    } catch (_) { /* ignore */ }
    return settings;
}

export class OpenRouterAdapter {
    constructor(options = {}) {
        const settings = options.settings || readOpenRouterSettings();
        this.baseUrl = (options.baseUrl || settings.openrouterBaseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
        this.apiKey = options.apiKey !== undefined ? options.apiKey : (settings.openrouterKey || '');
        this.model = options.model || settings.openrouterModel || 'openai/gpt-4o-mini';
        this.siteUrl = options.siteUrl || settings.openrouterSiteUrl || (typeof location !== 'undefined' && location.origin) || 'https://redglitch.ai';
        this.appName = options.appName || settings.openrouterAppName || 'Redglitch Studio';
        this.defaultParams = {
            temperature: options.temperature ?? settings.temp ?? 0.7,
            topP: options.topP ?? settings.topP ?? 0.9,
            maxTokens: options.maxTokens ?? settings.maxTokens ?? 1024,
        };
    }

    _headers(extra = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            ...extra,
        };
        // OpenRouter attribution headers (optional but recommended).
        if (this.siteUrl) headers['HTTP-Referer'] = this.siteUrl;
        if (this.appName) headers['X-Title'] = this.appName;
        return headers;
    }

    _throw(code, message) {
        const err = new Error(message);
        err.code = code;
        return err;
    }

    /**
     * Non-streaming + streaming chat. When onToken is supplied we stream SSE and
     * invoke it per delta; the returned promise still resolves with the full text
     * (matching the CerebrasAdapter shape: { text, model, source }).
     */
    async chat(messages, options = {}, onToken = null) {
        if (!this.apiKey) {
            throw this._throw('PROVIDER_UNAVAILABLE', 'OpenRouter API key not configured. Set openrouterKey in KAI settings (Engine tab).');
        }
        const body = {
            model: options.model || this.model,
            messages,
            max_tokens: options.maxTokens ?? this.defaultParams.maxTokens,
            temperature: options.temperature ?? this.defaultParams.temperature,
            top_p: options.topP ?? this.defaultParams.topP,
            stream: Boolean(onToken),
        };
        if (options.stopSequences) body.stop = options.stopSequences;

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            let detail = '';
            try {
                const errJson = await response.json();
                detail = errJson?.error?.message || JSON.stringify(errJson);
            } catch (_) { detail = await response.text().catch(() => ''); }
            throw this._throw('PROVIDER_FAILED', `OpenRouter API error ${response.status}: ${detail}`);
        }

        if (!onToken) {
            const data = await response.json();
            return {
                text: data.choices?.[0]?.message?.content || '',
                model: data.model || body.model,
                source: 'openrouter',
            };
        }

        // Streaming SSE parse.
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
                } catch (_) { /* ignore malformed keep-alive lines */ }
            }
        }
        return { text: full, model: body.model, source: 'openrouter' };
    }

    /** Fetch the OpenRouter model catalog (id list, optionally filtered to chat). */
    async listModels({ onlyChat = true } = {}) {
        const response = await fetch(`${this.baseUrl}/models`, {
            method: 'GET',
            headers: this._headers(),
        });
        if (!response.ok) {
            throw this._throw('PROVIDER_FAILED', `OpenRouter models error ${response.status}`);
        }
        const data = await response.json();
        let models = Array.isArray(data?.data) ? data.data : [];
        if (onlyChat) {
            models = models.filter(m => {
                const id = (m.id || '').toLowerCase();
                const arch = (m.architecture?.output_modalities || []).join(',').toLowerCase();
                const isEmbedding = id.includes('embed') || arch.includes('embedding');
                return !isEmbedding;
            });
        }
        return models.map(m => ({ id: m.id, name: m.name || m.id, contextLength: m.context_length, pricing: m.pricing }));
    }
}

// Expose globally for parity with cerebras-adapter.js (loaded as a classic script).
if (typeof window !== 'undefined') window.OpenRouterAdapter = OpenRouterAdapter;
