import { test } from 'node:test';
import assert from 'node:assert/strict';

const captured = {};

function mockFetch(respond) {
    globalThis.fetch = async (url, opts) => {
        captured.url = url;
        captured.opts = opts;
        return respond;
    };
}

function okJson(data) {
    return { ok: true, status: 200, async json() { return data; }, async text() { return JSON.stringify(data); } };
}

function okStream(chunks) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            for (const c of chunks) controller.enqueue(enc.encode(c));
            controller.close();
        }
    });
    return { ok: true, status: 200, body: stream, async json() { return {}; } };
}

function sse(dataObj) {
    return `data: ${JSON.stringify(dataObj)}\n\n`;
}

test('OpenRouterAdapter.listModels returns id+label mapping', async () => {
    mockFetch(okJson({ data: [
        { id: 'openai/gpt-4o', name: 'GPT-4o', architecture: { modality: 'text' } },
        { id: 'anthropic/claude', name: 'Claude', architecture: { modality: 'text+image' } }
    ] }));
    const { OpenRouterAdapter } = await import('./openrouter-adapter.js');
    const adapter = new OpenRouterAdapter({ apiKey: 'sk-or-test' });
    const models = await adapter.listModels();
    assert.equal(models.length, 2);
    assert.equal(models[0].id, 'openai/gpt-4o');
    assert.match(captured.url, /openrouter\.ai\/api\/v1\/models/);
});

test('OpenRouterAdapter.chat returns full text on non-stream', async () => {
    mockFetch(okJson({
        choices: [{ message: { content: 'hello world' } }],
        model: 'openai/gpt-4o'
    }));
    const { OpenRouterAdapter } = await import('./openrouter-adapter.js');
    const adapter = new OpenRouterAdapter({ apiKey: 'sk-or-test', model: 'openai/gpt-4o' });
    const res = await adapter.chat([{ role: 'user', content: 'hi' }]);
    assert.equal(res.text, 'hello world');
    assert.equal(res.source, 'openrouter');
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.model, 'openai/gpt-4o');
    assert.equal(body.stream, false);
    assert.match(captured.opts.headers.Authorization, /Bearer sk-or-test/);
    assert.ok(captured.opts.headers['HTTP-Referer']);
    assert.ok(captured.opts.headers['X-Title']);
});

test('OpenRouterAdapter.chat streams tokens via onToken', async () => {
    mockFetch(okStream([
        sse({ choices: [{ delta: { content: 'foo' } }] }),
        sse({ choices: [{ delta: { content: 'bar' } }] }),
        'data: [DONE]\n\n'
    ]));
    const { OpenRouterAdapter } = await import('./openrouter-adapter.js');
    const adapter = new OpenRouterAdapter({ apiKey: 'sk-or-test' });
    const tokens = [];
    const res = await adapter.chat([{ role: 'user', content: 'hi' }], {}, (t) => tokens.push(t));
    assert.equal(res.text, 'foobar');
    assert.deepEqual(tokens, ['foo', 'bar']);
});

test('OpenRouterAdapter uses custom baseUrl and app meta', async () => {
    mockFetch(okJson({ choices: [{ message: { content: 'x' } }] }));
    const { OpenRouterAdapter } = await import('./openrouter-adapter.js');
    const adapter = new OpenRouterAdapter({
        apiKey: 'k',
        baseUrl: 'https://proxy.example/v1',
        siteUrl: 'https://my.app',
        appName: 'MyApp'
    });
    await adapter.chat([{ role: 'user', content: 'hi' }]);
    assert.match(captured.url, /proxy\.example\/v1\/chat\/completions/);
    assert.equal(captured.opts.headers['HTTP-Referer'], 'https://my.app');
    assert.equal(captured.opts.headers['X-Title'], 'MyApp');
});

test('MultiProviderAdapter supports Groq, OpenAI, Gemini, Google AI Studio, DeepSeek and Ollama', async () => {
    mockFetch(okJson({ choices: [{ message: { content: 'fast response' } }], model: 'llama-3.3-70b-versatile' }));
    const { MultiProviderAdapter, PROVIDER_PRESETS } = await import('./openrouter-adapter.js');
    assert.ok(PROVIDER_PRESETS.openrouter);
    assert.ok(PROVIDER_PRESETS.openai);
    assert.ok(PROVIDER_PRESETS.anthropic);
    assert.ok(PROVIDER_PRESETS.gemini);
    assert.ok(PROVIDER_PRESETS['google-ai-studio']);
    assert.equal(PROVIDER_PRESETS['google-ai-studio'].name, 'Google AI Studio');
    assert.equal(PROVIDER_PRESETS['google-ai-studio'].defaultModel, 'gemini-2.0-flash');
    assert.ok(PROVIDER_PRESETS.groq);
    assert.ok(PROVIDER_PRESETS.deepseek);
    assert.ok(PROVIDER_PRESETS.mistral);
    assert.ok(PROVIDER_PRESETS.ollama);

    const groqAdapter = new MultiProviderAdapter({ provider: 'groq', apiKey: 'gsk-test' });
    const groqRes = await groqAdapter.chat([{ role: 'user', content: 'test groq' }]);
    assert.equal(groqRes.text, 'fast response');
    assert.equal(groqRes.source, 'groq');
    assert.match(captured.url, /api\.groq\.com\/openai\/v1\/chat\/completions/);

    // Google AI Studio chat endpoint appends ?key= and uses gemini models
    mockFetch(okJson({ choices: [{ message: { content: 'gemini reply' } }], model: 'gemini-2.5-flash' }));
    const studioAdapter = new MultiProviderAdapter({
        provider: 'google-ai-studio',
        apiKey: 'AIzaSy1234567890',
        model: 'gemini-2.5-flash'
    });
    const studioRes = await studioAdapter.chat([{ role: 'user', content: 'hello gemini' }]);
    assert.equal(studioRes.text, 'gemini reply');
    assert.equal(studioRes.source, 'google-ai-studio');
    assert.match(captured.url, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions\?key=AIzaSy1234567890/);
    assert.match(captured.opts.headers.Authorization, /Bearer AIzaSy1234567890/);

    // Ollama does not require API key
    mockFetch(okJson({ choices: [{ message: { content: 'local ollama response' } }], model: 'llama3.3' }));
    const ollamaAdapter = new MultiProviderAdapter({ provider: 'ollama' });
    const ollamaRes = await ollamaAdapter.chat([{ role: 'user', content: 'hello local' }]);
    assert.equal(ollamaRes.text, 'local ollama response');
    assert.equal(ollamaRes.source, 'ollama');
    assert.match(captured.url, /127\.0\.0\.1:11434\/v1\/chat\/completions/);
});

test('MultiProviderAdapter supports Anthropic direct messages API and streaming', async () => {
    mockFetch(okJson({
        content: [{ type: 'text', text: 'Anthropic direct reply' }],
        model: 'claude-3-7-sonnet-20250219'
    }));
    const { MultiProviderAdapter } = await import('./openrouter-adapter.js');
    const adapter = new MultiProviderAdapter({ provider: 'anthropic', apiKey: 'sk-ant-test' });
    const res = await adapter.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi Claude' }
    ]);
    assert.equal(res.text, 'Anthropic direct reply');
    assert.equal(res.source, 'anthropic');
    assert.match(captured.url, /api\.anthropic\.com\/v1\/messages/);
    assert.equal(captured.opts.headers['x-api-key'], 'sk-ant-test');
    assert.equal(captured.opts.headers['anthropic-version'], '2023-06-01');

    const body = JSON.parse(captured.opts.body);
    assert.equal(body.system, 'You are helpful');
    assert.equal(body.messages[0].role, 'user');
    assert.equal(body.messages[0].content, 'Hi Claude');
});

test('MultiProviderAdapter testConnection measures latency and verifies connectivity', async () => {
    mockFetch(okJson({ choices: [{ message: { content: 'OK' } }], model: 'gpt-4o' }));
    const { MultiProviderAdapter } = await import('./openrouter-adapter.js');
    const adapter = new MultiProviderAdapter({ provider: 'openai', apiKey: 'sk-test' });
    const probe = await adapter.testConnection();
    assert.equal(probe.ok, true);
    assert.equal(probe.provider, 'openai');
    assert.equal(probe.model, 'gpt-4o');
    assert.equal(probe.responseSnippet, 'OK');
    assert.equal(typeof probe.latencyMs, 'number');
});

