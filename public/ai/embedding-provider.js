/**
 * public/ai/embedding-provider.js
 *
 * Pluggable embeddings. OpenRouter does not serve an embeddings API, so we keep
 * the on-device Transformers.js worker as the default and additionally support
 * ANY OpenAI-compatible embeddings endpoint (OpenAI, Voyage, Mixedbread, a local
 * TEI server, etc.) configured via kai_settings. This makes the RAG backend
 * "fully OpenRouter-compatible" for LLM while leaving embeddings portable.
 */

export class LocalEmbeddingProvider {
    /**
     * @param {(texts: string[]) => Promise<number[][]>} embedFn
     */
    constructor(embedFn) {
        if (typeof embedFn !== 'function') throw new Error('LocalEmbeddingProvider requires an embed(texts) function');
        this.embedFn = embedFn;
        this.kind = 'local';
    }
    async embed(texts) {
        const list = Array.isArray(texts) ? texts : [texts];
        const out = await this.embedFn(list);
        return Array.isArray(texts) ? out : out[0];
    }
    async embedOne(text) {
        const [v] = await this.embedFn([text]);
        return v;
    }
}

export class OpenAIEmbeddingProvider {
    constructor({ baseUrl, apiKey, model }) {
        if (!baseUrl) throw new Error('OpenAIEmbeddingProvider requires baseUrl');
        if (!apiKey) throw new Error('OpenAIEmbeddingProvider requires apiKey');
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.apiKey = apiKey;
        this.model = model || 'text-embedding-3-small';
        this.kind = 'openai';
    }
    async _post(input) {
        const res = await fetch(`${this.baseUrl}/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
            body: JSON.stringify({ model: this.model, input }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `Embeddings API error ${res.status}`);
        }
        const data = await res.json();
        // OpenAI returns data[] in the same order as input.
        return data.data.map(d => d.embedding);
    }
    async embed(texts) {
        const list = Array.isArray(texts) ? texts : [texts];
        const out = await this._post(list);
        return Array.isArray(texts) ? out : out[0];
    }
    async embedOne(text) {
        return this.embed([text]).then(a => a[0]);
    }
}

/**
 * Build the right provider from settings.
 * @param {object} settings - kai_settings
 * @param {{ localEmbedFn: (texts:string[])=>Promise<number[][]> }} deps
 */
export function createEmbeddingProvider(settings = {}, { localEmbedFn } = {}) {
    const mode = settings.embeddingsProvider || 'local';
    if (mode === 'openai') {
        const baseUrl = settings.embeddingsBaseUrl || 'https://api.openai.com/v1';
        const apiKey = settings.embeddingsApiKey || '';
        // Without a key the OpenAI-compatible endpoint can't authenticate; fall
        // back to the on-device provider instead of crashing RAG initialization.
        if (apiKey && baseUrl) {
            return new OpenAIEmbeddingProvider({ baseUrl, apiKey, model: settings.embeddingsModel || 'text-embedding-3-small' });
        }
        console.warn('[embeddings] OpenAI mode selected but missing API key/URL; falling back to local embeddings.');
    }
    return new LocalEmbeddingProvider(localEmbedFn);
}
