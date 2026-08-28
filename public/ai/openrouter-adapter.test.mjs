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
