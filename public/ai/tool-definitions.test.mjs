import test from 'node:test';
import assert from 'node:assert/strict';
import { registerDefaultTools } from './tool-definitions.js';

function buildRegistry() {
    const tools = new Map();
    const events = [];
    return {
        tools,
        events,
        eventBus: {
            emit(type, data) {
                events.push({ type, data });
            },
        },
        _debug() {},
        register(tool) {
            tools.set(tool.name, tool);
        },
    };
}

function installBrowserGlobals() {
    globalThis.window = {
        AssetSynth: {
            generate: async () => 'data:image/png;base64,abc',
        },
        RedGlitchAIInstance: null,
        top: { location: { href: '' } },
        location: { pathname: '/dashboard.html', href: '' },
    };
    globalThis.document = {
        createElement() {
            return {};
        },
        head: {
            appendChild() {},
        },
    };
}

test('data.list uses the real plural skills endpoint', async () => {
    installBrowserGlobals();
    const registry = buildRegistry();
    registerDefaultTools(registry);
    const calls = [];
    globalThis.fetch = async (url) => {
        calls.push(url);
        return { ok: true, json: async () => [] };
    };

    await registry.tools.get('data.list').execute({ type: 'skills' });

    assert.deepEqual(calls, ['/api/skills']);
});

test('data.update posts to plural definition endpoints', async () => {
    installBrowserGlobals();
    const registry = buildRegistry();
    registerDefaultTools(registry);
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url, body: options.body });
        return { ok: true, json: async () => ({ success: true }) };
    };

    await registry.tools.get('data.update').execute({ type: 'npcs', data: [{ id: 'npc1' }] });
    await registry.tools.get('data.update').execute({ type: 'items', data: [{ id: 'item1' }] });
    await registry.tools.get('data.update').execute({ type: 'skills', data: [{ id: 'skill1' }] });

    assert.deepEqual(calls.map((call) => call.url), [
        '/api/npcs-defs',
        '/api/items-defs',
        '/api/skills-defs',
    ]);
});

