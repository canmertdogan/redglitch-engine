const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_DIR = path.resolve(__dirname, '..', '..', '..');

function createCampaignControllerSandbox() {
    const controllerCode = fs.readFileSync(
        path.join(PUBLIC_DIR, 'engines', 'shared', 'CampaignController.js'),
        'utf8'
    );
    class Noop {}
    const sandbox = {
        InventorySystem: Noop,
        DialogueSystem: Noop,
        QuestSystem: Noop,
        document: {
            createElement: () => ({}),
            getElementById: () => null,
            head: { appendChild: () => {} },
        },
        console,
        setTimeout,
        clearTimeout,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(controllerCode + '; this.CampaignController = CampaignController;', sandbox);
    return { sandbox, controller: new sandbox.CampaignController() };
}

test('CampaignController iso-pixel manifest includes IsoStrategy.js before iso-pixel main.js', () => {
    const { controller } = createCampaignControllerSandbox();
    const manifest = controller.engineManifests['iso-pixel'];
    assert.ok(Array.isArray(manifest), 'iso-pixel manifest must exist');
    const strategyIdx = manifest.indexOf('strategies/IsoStrategy.js');
    const mainIdx = manifest.indexOf('engines/iso-pixel/main.js');
    assert.ok(strategyIdx >= 0, 'iso-pixel manifest must include strategies/IsoStrategy.js');
    assert.ok(mainIdx > strategyIdx, 'IsoStrategy.js must load before engines/iso-pixel/main.js');
});

test('CampaignController._switchEngine serializes overlapping switches instead of dropping them', async () => {
    const { controller } = createCampaignControllerSandbox();
    const order = [];
    controller._performSwitchEngine = async (engineType) => {
        controller.isTransitioning = true;
        order.push(`start:${engineType}`);
        await new Promise((r) => setTimeout(r, engineType === 'rpg-topdown' ? 25 : 5));
        controller.currentEngineType = engineType;
        controller.currentAdapter = { engineType };
        order.push(`end:${engineType}`);
        controller.isTransitioning = false;
    };

    const p1 = controller._switchEngine('rpg-topdown');
    const p2 = controller._switchEngine('iso-pixel');
    await Promise.all([p1, p2]);

    assert.deepEqual(order, [
        'start:rpg-topdown',
        'end:rpg-topdown',
        'start:iso-pixel',
        'end:iso-pixel',
    ]);
    assert.equal(controller.currentEngineType, 'iso-pixel');
    assert.equal(controller.currentAdapter.engineType, 'iso-pixel');
});

test('CampaignController._ensureLegacyAdapter lazily loads IsoPixelAdapter when absent', async () => {
    const { sandbox, controller } = createCampaignControllerSandbox();
    const loadedScripts = [];
    controller._loadClassicScript = async (src) => {
        loadedScripts.push(src);
        if (src.includes('EngineAdapter')) {
            sandbox.EngineAdapter = class MockEngineAdapter {};
        } else if (src.includes('IsoPixelAdapter')) {
            sandbox.IsoPixelAdapter = class MockIsoPixelAdapter {};
        }
    };

    const resolved = await controller._ensureLegacyAdapter('IsoPixelAdapter', 'engines/shared/IsoPixelAdapter.js');
    assert.ok(loadedScripts.includes('engines/shared/EngineAdapter.legacy.js'));
    assert.ok(loadedScripts.includes('engines/shared/IsoPixelAdapter.js'));
    assert.equal(typeof resolved, 'function');
});

test('rpg-topdown Core handles pre-instantiated window.ItemDefinitions singleton', () => {
    const coreCode = fs.readFileSync(
        path.join(PUBLIC_DIR, 'engines', 'rpg-topdown', 'Core.js'),
        'utf8'
    );
    let loadCalled = false;
    const itemDefsSingleton = {
        loaded: false,
        items: {},
        load: async () => { loadCalled = true; },
    };
    const mockCanvas = {
        width: 800,
        height: 600,
        style: {},
        addEventListener: () => {},
        getContext: () => ({
            imageSmoothingEnabled: false,
            fillStyle: '',
            font: '',
            textAlign: '',
            textBaseline: '',
            fillText: () => {},
        }),
    };
    class Noop {}
    class MockHUD { init() {} }
    class MockFX { resize() {} }
    const sandbox = {
        ItemDefinitions: itemDefsSingleton,
        Sprites: { get: () => null },
        InputHandler: Noop,
        MapSystem: Noop,
        DialogueSystem: Noop,
        AchievementSystem: Noop,
        SaveSystem: Noop,
        QuestSystem: Noop,
        CampaignSystem: Noop,
        UISystem: Noop,
        LogicSystem: Noop,
        VisualScriptEngine: Noop,
        GameHUD: MockHUD,
        Fireball: Noop,
        WeatherSystem: Noop,
        FXSystem: MockFX,
        DebugConsole: Noop,
        SpatialHash: Noop,
        Sound: { init() {} },
        createPixelImage: () => ({}),
        fetch: async () => ({ ok: false }),
        localStorage: { getItem: () => null, setItem: () => {} },
        innerWidth: 800,
        innerHeight: 600,
        addEventListener: () => {},
        performance,
        document: {
            body: {},
            createElement: () => mockCanvas,
            getElementById: () => mockCanvas,
        },
        Image: class {},
        console,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(coreCode, sandbox);

    const CoreCtor = sandbox.window.Core;
    assert.equal(typeof CoreCtor, 'function');
    const core = new CoreCtor();
    assert.ok(core instanceof CoreCtor);
    assert.equal(loadCalled, true);
});

test('WorldTilesetLoader computes CSS sprite positions accurately across grid bounds', () => {
    const loader = require(path.join(PUBLIC_DIR, 'shared', 'WorldTilesetLoader.js'));
    const el0 = { style: {} };
    loader.applyTileSpriteStyle(el0, 0, 16, 38, 'sprite-art/worldpixelart_atlas.png');
    assert.equal(el0.style.backgroundSize, '1600% 3800%');
    assert.equal(el0.style.backgroundPosition, '0% 0%');

    const elLastCol = { style: {} };
    loader.applyTileSpriteStyle(elLastCol, 15, 16, 38, 'sprite-art/worldpixelart_atlas.png');
    assert.equal(elLastCol.style.backgroundPosition, '100% 0%');

    const elTile600 = { style: {} };
    loader.applyTileSpriteStyle(elTile600, 599, 16, 38, 'sprite-art/worldpixelart_atlas.png');
    const expectedX = (7 / 15) * 100;
    assert.equal(elTile600.style.backgroundPosition, `${expectedX}% 100%`);
});

test('Legacy runtime-loader scripts include IsoStrategy.js for iso-pixel', () => {
    for (const rel of ['js/runtime-loader.js', '../projects/Default Project/js/runtime-loader.js']) {
        const text = fs.readFileSync(path.join(PUBLIC_DIR, rel), 'utf8');
        assert.ok(text.includes("'strategies/IsoStrategy.js'"), `${rel} must include strategies/IsoStrategy.js`);
    }
});
