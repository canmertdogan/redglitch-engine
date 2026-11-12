import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EventBus = require('../shared/EventBus.js');

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
    };
}

test('EventBus parent hub relays sibling iframe postMessages without echoing back to sender', () => {
    const prevWindow = globalThis.window;
    const prevDocument = globalThis.document;
    const prevWebSocket = globalThis.WebSocket;

    const messageListeners = [];
    const kaiPosted = [];
    const isoPosted = [];
    const kaiWindow = { postMessage: (msg, origin) => kaiPosted.push({ msg, origin }) };
    const isoWindow = { postMessage: (msg, origin) => isoPosted.push({ msg, origin }) };

    const hubWindow = {
        location: { pathname: '/tools.html', origin: 'http://localhost:3000' },
        addEventListener: (type, fn) => {
            if (type === 'message') messageListeners.push(fn);
        },
    };
    hubWindow.top = hubWindow;
    hubWindow.parent = hubWindow;

    globalThis.WebSocket = undefined;
    globalThis.window = hubWindow;
    globalThis.document = {
        querySelectorAll: (sel) => (sel === 'iframe' ? [{ contentWindow: kaiWindow }, { contentWindow: isoWindow }] : []),
    };

    try {
        const bus = new EventBus();
        const hubReceived = [];
        bus.on('studio:tool:announce', (ev) => hubReceived.push(ev.data));

        // Incoming event from iso editor iframe -> must notify hub, relay to kai iframe, NOT echo to iso iframe
        const announceEvent = {
            type: 'studio:tool:announce',
            data: { name: 'pixel.placePrefab' },
            timestamp: Date.now(),
            source: 'iso_editor_iframe',
        };
        for (const listener of messageListeners) {
            listener({
                origin: 'http://localhost:3000',
                source: isoWindow,
                data: { sourceType: 'redglitch-event', event: announceEvent },
            });
        }

        assert.equal(hubReceived.length, 1);
        assert.equal(hubReceived[0].name, 'pixel.placePrefab');
        assert.equal(kaiPosted.length, 1);
        assert.equal(kaiPosted[0].msg.event.data.name, 'pixel.placePrefab');
        assert.equal(kaiPosted[0].origin, 'http://localhost:3000');
        assert.equal(isoPosted.length, 0);

        // Parent broadcast -> reaches both child iframes
        bus.emit('ai:tool:discover', { ts: 1 });
        assert.equal(kaiPosted.length, 2);
        assert.equal(isoPosted.length, 1);
        assert.equal(kaiPosted[1].msg.event.type, 'ai:tool:discover');
        assert.equal(isoPosted[0].msg.event.type, 'ai:tool:discover');
    } finally {
        globalThis.window = prevWindow;
        globalThis.document = prevDocument;
        globalThis.WebSocket = prevWebSocket;
    }
});

test('RedglitchAI works in easy mode, includes tool-fence format prompt, and planGoal passes full [system, ...messages] to active provider', async () => {
    const prevWindow = globalThis.window;
    const prevDocument = globalThis.document;
    const prevStorage = globalThis.localStorage;
    const prevFetch = globalThis.fetch;

    const storage = memoryStorage({
        kai_ai_enabled: 'easy',
        kai_settings: JSON.stringify({
            provider: 'openai',
            openaiKey: 'sk-test',
            openaiModel: 'gpt-4o-mini',
            ragEnabled: false,
        }),
    });

    globalThis.localStorage = storage;
    globalThis.window = {
        location: { pathname: '/tools.html', origin: 'http://localhost:3000' },
        localStorage: storage,
    };
    globalThis.document = {
        createElement: () => ({}),
        head: { appendChild: () => {} },
    };

    const fetchCalls = [];
    globalThis.fetch = async (url, opts = {}) => {
        fetchCalls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
        if (String(url).includes('/api/projects/current')) {
            return { ok: true, json: async () => ({ name: 'Demo' }) };
        }
        if (String(url).includes('/api/ide/tree')) {
            return { ok: true, json: async () => [] };
        }
        if (String(url).includes('api.openai.com/v1/chat/completions')) {
            const sysMsg = opts.body ? JSON.parse(opts.body).messages[0]?.content : '';
            if (sysMsg.includes('Agentic Planner')) {
                return {
                    ok: true,
                    json: async () => ({
                        model: 'gpt-4o-mini',
                        choices: [{
                            message: {
                                content: JSON.stringify({
                                    title: 'Plan',
                                    summary: 'Ok',
                                    steps: [{ id: 1, title: 'Inspect', tool: 'fs.list', args: { dir: '.' } }],
                                }),
                            },
                        }],
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    model: 'gpt-4o-mini',
                    choices: [{ message: { content: 'Here is how to build it.' } }],
                }),
            };
        }
        return { ok: false, json: async () => ({}) };
    };

    let ai = null;
    try {
        const { RedglitchAI } = await import('./redglitch-ai.js');
        ai = new RedglitchAI();
        await new Promise((r) => setTimeout(r, 0));

        // 1. chat() succeeds in 'easy' mode and includes explicit ```tool example in system prompt
        const chatRes = await ai.chat('Help me build an iso map');
        assert.equal(chatRes.text, 'Here is how to build it.');
        const chatCall = fetchCalls.find((c) => c.url.includes('api.openai.com'));
        assert.ok(chatCall);
        assert.match(chatCall.body.messages[0].content, /```tool\n\{"name": "toolName", "args": \{\.\.\.\}\}\n```/);

        // 2. planGoal() passes full [system, ...messages] to active configured provider ('openai'),
        // without dropping messages[0], entering _runAgentLoop, or adding chatter to chat history
        fetchCalls.length = 0;
        const historyBefore = ai.contextManager.history.length;
        const plan = await ai.planGoal('Inspect workspace');
        const planCall = fetchCalls.find((c) => c.url.includes('api.openai.com'));
        assert.ok(planCall);
        assert.equal(planCall.body.messages[0].role, 'system');
        assert.match(planCall.body.messages[0].content, /Redglitch Studio Agentic Planner/);
        assert.equal(planCall.body.messages[1].role, 'user');
        assert.match(planCall.body.messages[1].content, /Inspect workspace/);
        assert.equal(plan.steps[0].tool, 'fs.list');
        assert.equal(ai.contextManager.history.length, historyBefore);
    } finally {
        globalThis.window?.RedglitchAIInstance?.coPilot?.stopIdleMonitor?.();
        globalThis.window?.RedglitchAIInstance?.toolRegistry?.destroy?.();
        ai?.coPilot?.stopIdleMonitor?.();
        ai?.toolRegistry?.destroy?.();
        globalThis.window = prevWindow;
        globalThis.document = prevDocument;
        globalThis.localStorage = prevStorage;
        globalThis.fetch = prevFetch;
    }
});

test('IRABAssistantSimple waitForCore resolves parent RedglitchAIInstance during polling', async () => {
    const prevWindow = globalThis.window;
    const code = fs.readFileSync(path.join(__dirname, 'redglitch-ai-assistant.js'), 'utf8');
    const win = {
        parent: {},
        dispatchEvent() {},
    };
    const ctx = vm.createContext({
        window: win,
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        console: { log() {}, warn() {}, error() {} },
        setTimeout,
    });
    vm.runInContext(code, ctx);

    const assistant = new win.IRABAssistantSimple();
    const fakeAI = { toolRegistry: { ok: true } };
    setTimeout(() => { win.parent.RedglitchAIInstance = fakeAI; }, 30);

    try {
        const resolved = await assistant.waitForCore(500);
        assert.equal(resolved, fakeAI);
    } finally {
        globalThis.window = prevWindow;
    }
});

test('assistant-panel.js uses AISettings.settings.provider, parent clearHistory, openFile, code.insert, code.open/navigateTo, and unified RedglitchAIInstance', async () => {
    const panelCode = fs.readFileSync(path.join(__dirname, 'ui/assistant-panel.js'), 'utf8');
    const storage = memoryStorage({
        kai_ai_enabled: 'easy',
        kai_settings: JSON.stringify({ provider: 'native' }),
    });
    const emitted = [];
    const openedFiles = [];
    let historyCleared = false;
    let bootLogsCount = 0;

    const fakeParentAI = {
        config: { models: { llm: {} }, limits: {}, features: {} },
        clearHistory() { historyCleared = true; },
        setEnabled: async () => {},
    };

    const fakeElement = () => ({
        style: {},
        classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
        children: [],
        appendChild(child) { this.children.push(child); },
        removeChild(child) { this.children = this.children.filter((c) => c !== child); },
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        focus() {},
        getBoundingClientRect: () => ({ top: 0, left: 0, bottom: 0, right: 0 }),
    });

    const parentWin = {
        RedglitchAIInstance: fakeParentAI,
        RedglitchEventBus: {
            on() {},
            off() {},
            emit(type, data) { emitted.push({ type, data }); },
        },
        irab: {
            isConnected: false,
            onLoadProgress: null,
        },
        openFile(p) {
            openedFiles.push(p);
            return { success: true };
        },
        destroyIrabBridge() {},
        ensureIrabBridge() {},
    };

    const panelWin = {
        parent: parentWin,
        frameElement: { style: {} },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        getComputedStyle: () => ({ display: 'none', visibility: 'hidden', opacity: '0' }),
        RedglitchEventBus: parentWin.RedglitchEventBus,
        KAIMode: {
            getAIMode: () => 'easy',
            storeAIMode: (m) => storage.setItem('kai_ai_enabled', String(m)),
            isAIEnabled: () => storage.getItem('kai_ai_enabled') === 'true' || storage.getItem('kai_ai_enabled') === 'easy',
        },
    };
    panelWin.window = panelWin;

    const createdElements = [];
    const doc = {
        readyState: 'loading',
        body: { setAttribute() {} },
        addEventListener() {},
        removeEventListener() {},
        getElementById: (id) => (id === 'boot-logs' ? { appendChild() { bootLogsCount++; }, scrollTop: 0, scrollHeight: 0 } : fakeElement()),
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: (tag) => {
            const el = fakeElement();
            el.tagName = tag;
            createdElements.push(el);
            return el;
        },
        createTextNode: (t) => ({ textContent: t }),
    };

    const ctx = vm.createContext({
        window: panelWin,
        document: doc,
        localStorage: storage,
        confirm: () => true,
        Audio: class { addEventListener() {} play() { return Promise.resolve(); } },
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        console: { log() {}, warn() {}, error() {} },
        setTimeout: () => 0,
        clearTimeout() {},
        setInterval: () => 0,
        clearInterval() {},
        fetch: async () => ({ ok: true, json: async () => ({ status: 'READY' }) }),
        navigator: { clipboard: { writeText: async () => {} } },
    });

    // Provide IRABAssistantSimple class in context
    const assistantCode = fs.readFileSync(path.join(__dirname, 'redglitch-ai-assistant.js'), 'utf8');
    vm.runInContext(assistantCode, ctx);
    vm.runInContext(panelCode, ctx);

    // 1. initialize() reads window.AISettings.settings.provider ('native') instead of this.settings?.provider
    await panelWin.AIChatUI.initialize();
    assert.equal(typeof parentWin.irab.onLoadProgress, 'function');

    // 2. clearHistory() delegates to window.parent.RedglitchAIInstance
    panelWin.AIChatUI.clearHistory();
    assert.equal(historyCleared, true);

    // 3. /open omni command invokes editorTools.openFile cleanly
    await panelWin.AIChatUI.processOmniCommand('/open scripts/player.js');
    assert.deepEqual(openedFiles, ['scripts/player.js']);

    // 4. [APPLY TO EDITOR] emits method: 'code.insert'
    createdElements.length = 0;
    const bubble = fakeElement();
    panelWin.AIChatUI.renderMarkdownToBubble('```js\nconst x = 1;\n```', bubble);
    const applyBtn = createdElements.find((el) => el.textContent === '[APPLY TO EDITOR]');
    assert.ok(applyBtn);
    applyBtn.onclick({ stopPropagation() {} });
    const insertEvt = emitted.find((e) => e.type === 'ai:command:request' && e.data.method === 'code.insert');
    assert.ok(insertEvt);
    assert.equal(insertEvt.data.params.content.trim(), 'const x = 1;');

    // 5. OPEN buttons emit code.open for code paths and navigateTo for non-code paths
    createdElements.length = 0;
    emitted.length = 0;
    panelWin.AIChatUI.addMessage(
        'assistant',
        '--- FILE: scripts/hero.js (Relevance: 90%) ---\n--- FILE: assets/world_map.png (Relevance: 80%) ---\n--- FILE: assets/hero.png (Relevance: 70%) ---\nCheck these.'
    );
    const openBtns = createdElements.filter((el) => String(el.textContent || '').includes('OPEN '));
    assert.equal(openBtns.length, 3);
    openBtns[0].onclick();
    openBtns[1].onclick();
    openBtns[2].onclick();
    assert.equal(emitted[0].data.method, 'code.open');
    assert.equal(emitted[0].data.params.path, 'scripts/hero.js');
    assert.equal(emitted[1].data.method, 'navigateTo');
    assert.equal(emitted[1].data.params.target, 'editor');
    assert.equal(emitted[2].data.method, 'navigateTo');
    assert.equal(emitted[2].data.params.target, 'asset_manager');

    // 6. setKaiMode('off') clears both window.RedglitchAIInstance and parent's unified reference
    panelWin.RedglitchAIInstance = fakeParentAI;
    await panelWin.setKaiMode('off');
    assert.equal(panelWin.RedglitchAIInstance, null);
    assert.equal(parentWin.RedglitchAIInstance, null);
});
