/**
 * cerebras-adapter.js
 * Cerebras Cloud API adapter for KAI.
 */

class CerebrasAdapter {
    constructor() {
        this.baseUrl = (window.CEREBRAS_API_URL || 'https://api.cerebras.ai/v1');
    }

    getSettings() {
        try {
            const raw = localStorage.getItem('kai_settings');
            if (!raw) return {};
            return JSON.parse(raw);
        } catch (e) {
            return {};
        }
    }

    async chat(messages, options = {}) {
        const settings = this.getSettings();
        const apiKey = settings.cerebrasKey || '';
        const model = settings.cerebrasModel || 'llama3.1-8b';

        if (!apiKey) {
            throw Object.assign(new Error('Cerebras API key not configured. Set it in KAI settings (Engine tab).'), { code: 'PROVIDER_UNAVAILABLE' });
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: options.maxTokens || 512,
                temperature: options.temperature ?? 0.7,
                top_p: options.topP ?? 0.9,
                stream: false
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `Cerebras API error: ${response.status}`);
        }

        const data = await response.json();
        return {
            text: data.choices?.[0]?.message?.content || '',
            model: data.model || model,
            source: 'cerebras'
        };
    }
}

window.CerebrasAdapter = CerebrasAdapter;
