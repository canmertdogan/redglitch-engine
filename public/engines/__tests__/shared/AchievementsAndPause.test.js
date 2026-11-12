const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_DIR = path.resolve(__dirname, '..', '..', '..');

function loadWindowClass(relPath, extraGlobals = {}) {
    const code = fs.readFileSync(path.join(PUBLIC_DIR, relPath), 'utf8');
    const sandbox = {
        window: {},
        document: {
            body: null,
            head: { appendChild: () => {} },
            createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {} }),
            getElementById: () => null,
            querySelectorAll: () => [],
        },
        localStorage: {
            _data: new Map(),
            getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
            setItem(k, v) { this._data.set(k, String(v)); },
            removeItem(k) { this._data.delete(k); },
        },
        console,
        setTimeout,
        clearTimeout,
        performance,
        CustomEvent: function CustomEvent(type, opts) { this.type = type; this.detail = opts?.detail; },
        ...extraGlobals,
    };
    sandbox.window = sandbox;
    sandbox.dispatchEvent = () => {};
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: relPath });
    return sandbox;
}

test('AchievementSystem filters target-specific triggers, grants rewards, masks secrets, and persists unlocked list', async () => {
    let savedPayload = null;
    const mockFetch = async (url, opts) => {
        if (url.startsWith('/dunyalar/definitions/achievements.json')) {
            return {
                ok: true,
                json: async () => ([
                    { id: 'kill_orc', title: 'Orc Slayer', desc: 'Slay an orc', trigger: 'ENEMY_KILL', target: 'orc', rewardType: 'XP', rewardValue: '25' },
                    { id: 'first_item', title: 'Looter', desc: 'Get an item', trigger: 'ITEM_GET', target: '', secret: true, icon: '💎' },
                    { id: 'secret_chain', title: 'Champion', desc: 'Unlock after Orc Slayer', trigger: 'MANUAL', prereq: 'kill_orc', secret: true }
                ])
            };
        }
        if (url.startsWith('/api/achievements/') && opts?.method === 'POST') {
            savedPayload = JSON.parse(opts.body);
            return { ok: true, json: async () => ({ success: true }) };
        }
        return { ok: true, json: async () => ({ unlocked: [] }) };
    };

    const player = { xp: 0, hp: 100, maxHp: 100 };
    const sandbox = loadWindowClass('shared/AchievementSystem.js', {
        fetch: mockFetch,
        game: { player },
    });
    const sys = new sandbox.AchievementSystem();
    await sys.init('HERO');

    // Non-matching target must NOT unlock kill_orc
    await sys.unlock('ENEMY_KILL', { target: 'slime' });
    assert.deepEqual([...sys.unlocked], []);

    // Before unlock, secret achievement details stay hidden in getDisplayList()
    const beforeList = sys.getDisplayList();
    assert.equal(beforeList.unlockedCount, 0);
    assert.equal(beforeList.totalCount, 3);
    assert.equal(beforeList.items[1].title, '??? (Secret Achievement)');

    // Matching target unlocks kill_orc and grants +25 XP
    await sys.unlock('ENEMY_KILL', { target: 'orc' });
    assert.deepEqual([...sys.unlocked], ['kill_orc']);
    assert.equal(player.xp, 25);
    assert.deepEqual(savedPayload, { unlocked: ['kill_orc'] });

    // Any ITEM_GET unlocks targetless first_item & prerequisite-gated MANUAL unlock now succeeds
    await sys.unlock('ITEM_GET', { target: 'iron_sword' });
    await sys.unlock('secret_chain');
    assert.deepEqual([...sys.unlocked], ['kill_orc', 'first_item', 'secret_chain']);
    assert.deepEqual([...sys.unlockedAchievements], [...sys.unlocked]);

    const afterList = sys.getDisplayList();
    assert.equal(afterList.unlockedCount, 3);
    assert.equal(afterList.items[1].title, 'Looter');
});

test('GameHUD.dispatchEngineCommand handles pause, resume, achievements, save, and quit uniformly', () => {
    const hudExports = require(path.join(PUBLIC_DIR, 'engines', 'shared', 'GameHUD.js'));
    const calls = [];
    const engine = { isPaused: false };
    const hooks = {
        pause: () => { engine.isPaused = true; calls.push('pause'); },
        resume: () => { engine.isPaused = false; calls.push('resume'); },
        retry: () => calls.push('retry'),
        quit: () => calls.push('quit'),
    };

    assert.equal(hudExports.GameHUD.dispatchEngineCommand(engine, 'togglePause', hooks), true);
    assert.equal(engine.isPaused, true);
    assert.equal(hudExports.GameHUD.dispatchEngineCommand(engine, 'RESUME_GAME', hooks), true);
    assert.equal(engine.isPaused, false);
    assert.equal(hudExports.GameHUD.dispatchEngineCommand(engine, 'pause_game', hooks), true);
    assert.equal(engine.isPaused, true);
    assert.equal(hudExports.GameHUD.dispatchEngineCommand(engine, 'CLOSE_MENU', hooks), true);
    assert.equal(engine.isPaused, false);
    assert.equal(hudExports.GameHUD.dispatchEngineCommand(engine, 'QUIT', hooks), true);
    assert.equal(hudExports.GameHUD.dispatchEngineCommand(engine, 'retryLevel', hooks), true);
    assert.deepEqual(calls, ['pause', 'resume', 'pause', 'resume', 'quit', 'retry']);
});

test('TopDownAdapter and IsoPixelAdapter implement pause() and resume() cleanly', () => {
    const legacyCode = fs.readFileSync(path.join(PUBLIC_DIR, 'engines', 'shared', 'EngineAdapter.legacy.js'), 'utf8');
    const tdCode = fs.readFileSync(path.join(PUBLIC_DIR, 'engines', 'shared', 'TopDownAdapter.js'), 'utf8');
    const isoCode = fs.readFileSync(path.join(PUBLIC_DIR, 'engines', 'shared', 'IsoPixelAdapter.js'), 'utf8');

    const sandbox = { window: {}, console, performance };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(legacyCode + '\n' + tdCode + '\n' + isoCode, sandbox);

    let tdPaused = false;
    const td = new sandbox.TopDownAdapter();
    td.engine = { pause: () => { tdPaused = true; }, resume: () => { tdPaused = false; } };
    td.pause();
    assert.equal(tdPaused, true);
    td.resume();
    assert.equal(tdPaused, false);

    let isoPaused = false;
    const iso = new sandbox.IsoPixelAdapter();
    iso.engine = { pause: () => { isoPaused = true; }, resume: () => { isoPaused = false; } };
    iso.pause();
    assert.equal(isoPaused, true);
    iso.resume();
    assert.equal(isoPaused, false);
});

test('CampaignController handles stale currentNodeId, ignores editor group/comment nodes in progress, keeps 3D manifests ESM-safe, and prefers victory screen over gameover', async () => {
    let victoryCalls = 0;
    let gameOverCalls = 0;
    const sandbox = loadWindowClass('engines/shared/CampaignController.js', {
        InventorySystem: function InventorySystem() { this.addItem = () => {}; this.hasItem = () => false; },
        showCampaignComplete: () => { victoryCalls++; },
        showGameOver: () => { gameOverCalls++; },
    });

    const cc = new sandbox.CampaignController();

    // 3D manifests should never load Game3DCore.js or modes/*Mode.js via classic script tags
    for (const m of ['fps-3d', 'topdown-3d', 'platformer-3d', 'unified-3d']) {
        assert.ok(cc.engineManifests[m].includes('engines/unified-3d/Unified3DAdapter.js'));
        assert.equal(cc.engineManifests[m].includes('engines/unified-3d/Game3DCore.js'), false);
    }

    // Stale currentNodeId ('start') should fall back to actual start_node instead of no-oping
    cc.campaignData = [
        { id: 'start_node', type: 'start', next: 'lvl_1' },
        { id: 'group_1', type: 'group', name: 'Visual Group' },
        { id: 'note_1', type: 'note', text: 'Note' },
        { id: 'lvl_1', type: 'variable', flag: 'done', value: true }
    ];
    cc.currentNodeId = 'start';
    await cc.start();
    assert.equal(cc.globalFlags.done, true);
    assert.equal(cc.getProgress().percentComplete, 100);
    assert.equal(victoryCalls, 1);
    assert.equal(gameOverCalls, 0);
});
