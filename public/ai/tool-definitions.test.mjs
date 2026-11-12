import test from 'node:test';
import assert from 'node:assert/strict';
import { registerDefaultTools } from './tool-definitions.js';
import { ToolRegistry } from './tool-registry.js';
import { WorkflowManager } from './workflow-manager.js';

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

function installBrowserGlobals(extraWindow = {}) {
    const storageValues = new Map([['kai_ai_enabled', 'true']]);
    const storage = {
        getItem: (k) => (storageValues.has(k) ? storageValues.get(k) : null),
        setItem: (k, v) => storageValues.set(k, String(v)),
        removeItem: (k) => storageValues.delete(k),
    };
    globalThis.localStorage = storage;
    globalThis.window = {
        AssetSynth: {
            generate: async () => 'data:image/png;base64,abc',
        },
        RedglitchAIInstance: null,
        top: { location: { href: '' } },
        location: { pathname: '/dashboard.html', href: '', origin: 'http://localhost' },
        localStorage: storage,
        ...extraWindow,
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

    // data.update now does a GET backup before each POST (rollback) — assert POST endpoints in order
    const postUrls = calls.filter(c => c.body !== undefined).map(c => c.url);
    const allUrls = calls.map(c => c.url);
    assert.deepEqual(postUrls, [
        '/api/npcs',
        '/api/items',
        '/api/skills',
    ]);
    // Also ensure each POST was preceded by a GET to the same endpoint
    assert.deepEqual(allUrls, [
        '/api/npcs', '/api/npcs',
        '/api/items', '/api/items',
        '/api/skills', '/api/skills',
    ]);
});

test('navigateTo normalizes aliases before schema validation and opens Studio hub tools without redirecting top', async () => {
    const opened = [];
    const hubTools = [
        { id: 'iso_studio', title: 'IsoPixel Studio', src: 'iso_editor.html' },
        { id: 'assets', title: 'File Manager', src: 'studio-dist/asset_manager.html' },
        { id: 'quests', title: 'Quest Designer', src: 'studio-dist/quest_editor.html' },
        { id: 'daw', title: 'Audio Studio', src: 'studio-dist/daw_editor.html' },
    ];
    installBrowserGlobals({
        parent: {
            tools: hubTools,
            openWindow(tool) { opened.push(tool.id); },
        },
    });
    const bus = { on() {}, off() {}, emit() {}, getSource: () => 'test' };
    const registry = new ToolRegistry(bus);
    await new Promise((r) => setTimeout(r, 0));

    const r1 = await registry.execute('navigateTo', { target: 'iso' });
    const r2 = await registry.execute('navigateTo', { editor: 'asset_manager' });
    const r3 = await registry.execute('navigateTo', { target: 'quests' });
    const r4 = await registry.execute('navigateTo', { target: 'audio' });

    assert.equal(r1.success, true);
    assert.equal(r1.result.target, 'iso_studio');
    assert.equal(r2.success, true);
    assert.equal(r2.result.studioToolId, 'assets');
    assert.equal(r3.success, true);
    assert.equal(r3.result.studioToolId, 'quests');
    assert.equal(r4.success, true);
    assert.equal(r4.result.studioToolId, 'daw');
    assert.deepEqual(opened, ['iso_studio', 'assets', 'quests', 'daw']);
    assert.equal(window.top.location.href, '');
});

test('git.stage and git.commit throw when API returns success: false', async () => {
    installBrowserGlobals();
    const registry = buildRegistry();
    registerDefaultTools(registry);
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ success: false, error: 'nothing to commit' }),
    });

    await assert.rejects(
        () => registry.tools.get('git.stage').execute({ file: '.' }),
        /nothing to commit/
    );
    await assert.rejects(
        () => registry.tools.get('git.commit').execute({ message: 'test' }),
        /nothing to commit/
    );
});

test('iso.spawn_prefab throws instead of returning truthy failure when pixel.placePrefab fails', async () => {
    installBrowserGlobals();
    const registry = buildRegistry();
    registry.execute = async () => ({
        success: false,
        error: { code: 'EDITOR_TIMEOUT', message: 'IsoPixel unavailable' },
    });
    registerDefaultTools(registry);

    await assert.rejects(
        () => registry.tools.get('iso.spawn_prefab').execute({ name: 'tree', x: 2, y: 3 }),
        /IsoPixel unavailable/
    );
});

test('workflow.run executes nested steps via parent RedglitchAIInstance and throws on failed sub-workflow', async () => {
    const bus = { on() {}, off() {}, emit() {}, getSource: () => 'test' };
    installBrowserGlobals();
    const registry = new ToolRegistry(bus);
    await new Promise((r) => setTimeout(r, 0));
    registry.register({
        name: 'fixture.ok',
        description: 'ok',
        securityLevel: 'safe',
        parameters: { type: 'object', properties: {} },
        execute: async () => ({ ran: true }),
    });
    registry.register({
        name: 'fixture.fail',
        description: 'fail',
        securityLevel: 'safe',
        parameters: { type: 'object', properties: {} },
        execute: async () => { throw new Error('boom'); },
    });
    const wm = new WorkflowManager(registry, bus);
    window.parent = { RedglitchAIInstance: { workflowManager: wm, toolRegistry: registry } };

    // Bypass approval modal by checking auto-approved or permitting workflow.run directly in test
    registry.permissionGate.requestPermission = async () => true;

    const okOuter = await wm.executeWorkflow([
        { name: 'workflow.run', args: { steps: [{ name: 'fixture.ok', args: {} }] } },
    ]);
    assert.equal(okOuter.success, true);

    const failOuter = await wm.executeWorkflow([
        { name: 'workflow.run', args: { steps: [{ name: 'fixture.fail', args: {} }] } },
    ]);
    assert.equal(failOuter.success, false);
    assert.match(failOuter.error, /boom/);
});

