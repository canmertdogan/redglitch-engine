import { test } from 'node:test';
import assert from 'node:assert/strict';

let lastFetch;
function mockFetch(respond) {
    globalThis.fetch = async (url, opts) => {
        lastFetch = { url, opts };
        return respond;
    };
}
function okJson(data) {
    return { ok: true, status: 200, async json() { return data; }, async text() { return JSON.stringify(data); } };
}

test('OpenAIEmbeddingProvider posts to the configured endpoint with auth', async () => {
    mockFetch(okJson({ data: [{ embedding: [0.1, 0.2, 0.3] }], model: 'text-embedding-3-small' }));
    const { OpenAIEmbeddingProvider } = await import('./embedding-provider.js');
    const p = new OpenAIEmbeddingProvider({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x', model: 'text-embedding-3-small' });
    const out = await p.embed('hello');
    assert.deepEqual(out, [0.1, 0.2, 0.3]);
    assert.match(lastFetch.url, /api\.openai\.com\/v1\/embeddings/);
    assert.match(lastFetch.opts.headers.Authorization, /Bearer sk-x/);
    const body = JSON.parse(lastFetch.opts.body);
    assert.deepEqual(body.input, ['hello']);
    assert.equal(body.model, 'text-embedding-3-small');
});

test('OpenAIEmbeddingProvider batches multiple texts preserving order', async () => {
    mockFetch(okJson({ data: [{ embedding: [1] }, { embedding: [2] }] }));
    const { OpenAIEmbeddingProvider } = await import('./embedding-provider.js');
    const p = new OpenAIEmbeddingProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' });
    const out = await p.embed(['a', 'b']);
    assert.deepEqual(out, [[1], [2]]);
});

test('OpenAIEmbeddingProvider.embedOne returns a single vector', async () => {
    mockFetch(okJson({ data: [{ embedding: [7, 8] }] }));
    const { OpenAIEmbeddingProvider } = await import('./embedding-provider.js');
    const p = new OpenAIEmbeddingProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' });
    assert.deepEqual(await p.embedOne('q'), [7, 8]);
});

test('createEmbeddingProvider returns OpenAI provider when mode is openai', async () => {
    mockFetch(okJson({ data: [{ embedding: [9] }] }));
    const { createEmbeddingProvider } = await import('./embedding-provider.js');
    const p = createEmbeddingProvider({ embeddingsProvider: 'openai', embeddingsBaseUrl: 'https://x/v1', embeddingsApiKey: 'k', embeddingsModel: 'm' });
    assert.deepEqual(await p.embed('q'), [9]);
});

test('LocalEmbeddingProvider uses the supplied embed function', async () => {
    const { LocalEmbeddingProvider } = await import('./embedding-provider.js');
    const local = new LocalEmbeddingProvider(async (texts) => texts.map(t => [t.length, 2]));
    assert.deepEqual(await local.embed('abc'), [3, 2]);
    assert.deepEqual(await local.embed(['ab', 'cde']), [[2, 2], [3, 2]]);
});

test('createEmbeddingProvider returns Local provider by default', async () => {
    const { createEmbeddingProvider } = await import('./embedding-provider.js');
    const p = createEmbeddingProvider({ embeddingsProvider: 'local' }, { localEmbedFn: async (texts) => texts.map(() => [1]) });
    assert.equal(p.kind, 'local');
    assert.deepEqual(await p.embed(['x']), [[1]]);
});
