import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry } from './tool-registry.js';
import { ACTION_STATUS, ERROR_CODE } from './automation-contract.mjs';

class MemoryStorage {
    constructor(initial = {}) {
        this.values = new Map(Object.entries(initial));
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }
}

class FakeEventBus {
    constructor() {
        this.handlers = new Map();
        this.events = [];
        this.source = 'test-registry';
    }

    getSource() {
        return this.source;
    }

    on(type, handler) {
        if (!this.handlers.has(type)) this.handlers.set(type, new Set());
        this.handlers.get(type).add(handler);
    }

    off(type, handler) {
        this.handlers.get(type)?.delete(handler);
    }

    emit(type, data) {
        const event = { type, data, source: 'external' };
        this.events.push({ type, data });
        for (const handler of this.handlers.get(type) || []) handler(event);
    }
}

function installBrowserGlobals() {
    const storage = new MemoryStorage({
        kai_ai_enabled: 'true',
        kai_automation_flags: JSON.stringify({
            explicitCapabilityRouting: false,
        }),
    });
    globalThis.localStorage = storage;
    globalThis.window = {
        location: { pathname: '/dashboard.html', origin: 'http://localhost' },
        localStorage: storage,
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

function buildRegistry() {
    installBrowserGlobals();
    const eventBus = new FakeEventBus();
    window.RedGlitchEventBus = eventBus;
    const registerDefaults = ToolRegistry.prototype._registerDefaults;
    ToolRegistry.prototype._registerDefaults = async function noopRegisterDefaults() {};
    const registry = new ToolRegistry(eventBus);
    ToolRegistry.prototype._registerDefaults = registerDefaults;
    registry.tools.clear();
    eventBus.events.length = 0;
    return { registry, eventBus };
}

test('local tool execution respects the tool timeout contract', async () => {
    const { registry } = buildRegistry();
    registry.register({
        name: 'fixture.slow',
        description: 'Slow fixture tool',
        securityLevel: 'safe',
        mutates: false,
        timeout: 5,
        parameters: { type: 'object', properties: {} },
        execute: () => new Promise((resolve) => setTimeout(() => resolve({ late: true }), 50)),
    });

    const response = await registry.execute('fixture.slow', {}, 'slow-timeout');

    assert.equal(response.success, false);
    assert.equal(response.tool, 'fixture.slow');
    assert.equal(response.status, ACTION_STATUS.FAILED);
    assert.equal(typeof response.durationMs, 'number');
    assert.equal(response.error.code, ERROR_CODE.TOOL_TIMEOUT);
    assert.match(response.error.message, /fixture\.slow/);
});

test('successful tool responses include stable metadata and normalize undefined result', async () => {
    const { registry, eventBus } = buildRegistry();
    registry.register({
        name: 'fixture.empty',
        description: 'Empty fixture tool',
        securityLevel: 'safe',
        mutates: false,
        parameters: { type: 'object', properties: {} },
        execute: async () => undefined,
    });

    const response = await registry.execute('fixture.empty', {}, 'empty-success');

    assert.equal(response.id, 'empty-success');
    assert.equal(response.tool, 'fixture.empty');
    assert.equal(response.success, true);
    assert.equal(response.status, ACTION_STATUS.SUCCEEDED);
    assert.equal(response.result, null);
    assert.equal(typeof response.durationMs, 'number');

    const resultEvent = eventBus.events.find((event) => event.type === 'studio:action:result');
    assert.equal(resultEvent.data.result, null);
    assert.equal(resultEvent.data.tool, 'fixture.empty');
});

test('remote editor failures preserve their error code', async () => {
    const { registry, eventBus } = buildRegistry();
    registry.register({
        name: 'fixture.remote',
        description: 'Remote fixture tool',
        securityLevel: 'safe',
        mutates: false,
        timeout: 50,
        parameters: { type: 'object', properties: {} },
    });

    eventBus.on('studio:action:execute', (event) => {
        setTimeout(() => {
            eventBus.emit('studio:action:result', {
                id: event.data.id,
                success: false,
                error: { code: ERROR_CODE.EDITOR_UNAVAILABLE, message: 'Editor panel closed' },
            });
        }, 0);
    });

    const response = await registry.execute('fixture.remote', {}, 'remote-failure');

    assert.equal(response.success, false);
    assert.equal(response.tool, 'fixture.remote');
    assert.equal(typeof response.durationMs, 'number');
    assert.equal(response.error.code, ERROR_CODE.EDITOR_UNAVAILABLE);
    assert.equal(response.error.message, 'Editor panel closed');
});

test('remote command requests always receive a command result on unexpected failure', async () => {
    const { registry, eventBus } = buildRegistry();
    registry.execute = async () => {
        const error = new Error('Unexpected registry failure');
        error.code = 'BROKEN_REGISTRY';
        throw error;
    };

    eventBus.emit('ai:command:request', {
        id: 'remote-request',
        method: 'fixture.any',
        params: {},
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const resultEvent = eventBus.events.find((event) => event.type === 'ai:command:result');

    assert.ok(resultEvent);
    assert.equal(resultEvent.data.id, 'remote-request');
    assert.equal(resultEvent.data.success, false);
    assert.equal(resultEvent.data.error.code, 'BROKEN_REGISTRY');
});
