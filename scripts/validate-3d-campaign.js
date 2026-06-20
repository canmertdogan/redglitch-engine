#!/usr/bin/env node

/**
 * 3D Campaign Integration Validation Test
 * 
 * Validates that all 3D engines are properly integrated with campaign runtime:
 * - Checks file existence
 * - Validates adapter interfaces
 * - Verifies strategy methods
 * - Tests campaign controller support
 */

const fs = require('fs');
const path = require('path');

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

let passed = 0;
let failed = 0;
let warnings = 0;

function log(color, ...args) {
    console.log(color, ...args, RESET);
}

function test(name, fn) {
    try {
        const result = fn();
        if (result === true) {
            log(GREEN, `✓ ${name}`);
            passed++;
        } else if (result === 'warn') {
            log(YELLOW, `⚠ ${name}`);
            warnings++;
        } else {
            log(RED, `✗ ${name}: ${result}`);
            failed++;
        }
    } catch (error) {
        log(RED, `✗ ${name}: ${error.message}`);
        failed++;
    }
}

function fileExists(relativePath) {
    const fullPath = path.join(__dirname, '..', relativePath);
    return fs.existsSync(fullPath);
}

function fileContains(relativePath, searchStr) {
    const fullPath = path.join(__dirname, '..', relativePath);
    if (!fs.existsSync(fullPath)) return false;
    const content = fs.readFileSync(fullPath, 'utf8');
    return content.includes(searchStr);
}

function fileMatches(relativePath, regex) {
    const fullPath = path.join(__dirname, '..', relativePath);
    if (!fs.existsSync(fullPath)) return false;
    const content = fs.readFileSync(fullPath, 'utf8');
    return regex.test(content);
}

function campaignRuntimeUsesModuleThree() {
    const runtimePath = 'public/campaign_runtime.html';
    return fileContains(runtimePath, '<script type="importmap">') &&
        fileContains(runtimePath, '"three": "/lib/three/three.module.js"') &&
        fileContains('public/engines/unified-3d/Game3DCore.js', "from '/lib/three/three.module.js'");
}

function campaignRuntimeHasThreeSupport() {
    const runtimePath = 'public/campaign_runtime.html';
    const hasGlobalThree = fileContains(runtimePath, 'lib/three.min.js');
    return hasGlobalThree || campaignRuntimeUsesModuleThree();
}

log(BLUE, '\n========================================');
log(BLUE, '3D Campaign Integration Validation');
log(BLUE, '========================================\n');

// Test 1: Vendor Libraries
log(BLUE, '\n--- Vendor Libraries ---');
test('Three.js core library exists', () => fileExists('public/lib/three.min.js'));
test('Cannon-es physics library exists', () => fileExists('public/lib/cannon-es/cannon-es.js'));

// Test 2: Shared 3D Systems
log(BLUE, '\n--- Shared 3D Systems ---');
const shared3DSystems = [
    'Engine3DAdapter.js',
    'Renderer3D.js',
    'Physics3DWorld.js',
    'Camera3DController.js',
    'Input3D.js',
    'AudioSpatial3D.js',
    'AssetLoader3D.js',
    'Raycast3D.js',
    'PaletteManager.js'
];

shared3DSystems.forEach(file => {
    test(`Shared: ${file}`, () => fileExists(`public/engines/shared/${file}`));
});

// Test 3: Unified 3D Engine
log(BLUE, '\n--- Unified 3D Engine ---');
test('Unified3D game and adapter exist', () =>
    fileExists('public/engines/unified-3d/Unified3DGame.js') &&
    fileExists('public/engines/unified-3d/Unified3DAdapter.js'));
for (const mode of ['FPSMode.js', 'TopDownMode.js', 'PlatformerMode.js']) {
    test(`Unified mode: ${mode}`, () => fileExists(`public/engines/unified-3d/modes/${mode}`));
}
test('Unified adapter supports campaign lifecycle', () =>
    fileContains('public/engines/unified-3d/Unified3DAdapter.js', 'async initialize()') &&
    fileContains('public/engines/unified-3d/Unified3DAdapter.js', 'async loadLevel(') &&
    fileContains('public/engines/unified-3d/Unified3DAdapter.js', 'async switchMode('));
test('Unified game normalizes umbrella engine mode', () =>
    fileContains('public/engines/unified-3d/Unified3DGame.js', 'normalize3DMode'));

// Test 6: Campaign Runtime Integration
log(BLUE, '\n--- Campaign Runtime Integration ---');
test('campaign_runtime.html exists', () => fileExists('public/campaign_runtime.html'));
test('campaign_runtime has Three.js support (global or module)', () =>
    campaignRuntimeHasThreeSupport());
test('3D runtime resolves cannon-es via module imports', () =>
    fileContains('public/engines/shared/Physics3DWorld.js', "from '/lib/cannon-es/cannon-es.js'") ||
    fileContains('public/engines/shared/Physics3DWorld.js', "from '../../lib/cannon-es/cannon-es.module.js'")
);
test('campaign_runtime publishes CampaignController globally', () =>
    fileContains('public/campaign_runtime.html', 'window.campaignController = campaignController'));
test('Campaign editor exposes Unified3D modes', () =>
    fileContains('public/campaign_editor.js', "{ val: 'unified-3d', label: 'Unified 3D' }") &&
    fileContains('public/campaign_editor.js', "createInput('3D Mode', 'mode'"));

// Test 7: CampaignController Support
log(BLUE, '\n--- CampaignController Support ---');
test('CampaignController.js exists', () => fileExists('public/engines/shared/CampaignController.js'));
test('CampaignController supports topdown-3d', () => 
    fileContains('public/engines/shared/CampaignController.js', "case 'topdown-3d':"));
test('CampaignController supports fps-3d', () => 
    fileContains('public/engines/shared/CampaignController.js', "case 'fps-3d':"));
test('CampaignController supports platformer-3d', () => 
    fileContains('public/engines/shared/CampaignController.js', "case 'platformer-3d':"));
test('CampaignController loads the active Unified3D adapter', () =>
    fileContains('public/engines/shared/CampaignController.js', 'engines/unified-3d/Unified3DAdapter.js'));
test('CampaignController resolves unified-3d campaign nodes', () =>
    fileContains('public/engines/shared/CampaignController.js', "engineType !== 'unified-3d'"));

// Test 8: Test Campaign
log(BLUE, '\n--- Test Campaign ---');
test('Test 3D campaign exists', () => fileExists('public/dunyalar/definitions/test_3d_campaign.json'));
test('Test campaign has topdown-3d node', () => 
    fileContains('public/dunyalar/definitions/test_3d_campaign.json', '"topdown-3d"'));
test('Test campaign has fps-3d node', () => 
    fileContains('public/dunyalar/definitions/test_3d_campaign.json', '"fps-3d"'));
test('Test campaign has platformer-3d node', () => 
    fileContains('public/dunyalar/definitions/test_3d_campaign.json', '"platformer-3d"'));

// Test 9: Documentation
log(BLUE, '\n--- Documentation ---');
test('3D campaign integration guide exists', () => 
    fileExists('docs/3D_CAMPAIGN_INTEGRATION.md'));

// Test 10: Runtime smoke contracts (behavior-oriented static checks)
log(BLUE, '\n--- Runtime Smoke Contracts ---');

test('Unified adapter forwards runtime completion', () =>
    fileContains('public/engines/unified-3d/Unified3DAdapter.js', "this.game.on?.('levelComplete'") &&
    fileContains('public/engines/unified-3d/Unified3DAdapter.js', 'this._triggerLevelComplete('));
test('Unified core emits one-shot level completion', () =>
    fileContains('public/engines/unified-3d/Game3DCore.js', "this.emit('levelComplete'") &&
    fileContains('public/engines/unified-3d/Game3DCore.js', 'if (this._levelComplete) return false'));
test('All Unified3D modes signal completion', () =>
    ['FPSMode.js', 'TopDownMode.js', 'PlatformerMode.js'].every(mode =>
        fileContains(`public/engines/unified-3d/modes/${mode}`, 'completeLevel(')));

test('CampaignController advances node from adapter completion callback', () =>
    fileMatches('public/engines/shared/CampaignController.js',
        /onLevelComplete\(async \(data\) => \{[\s\S]*?await this\.advance\(\)/));
test('CampaignController passes levelPath through to adapter load', () =>
    fileContains('public/engines/shared/CampaignController.js', 'await this.currentAdapter.loadLevel(levelId, levelPath);')
);

test('3D test campaign uses explicit project + level mapping', () =>
    fileContains('public/dunyalar/definitions/test_3d_campaign.json', '"project": "Topdown3D Demo"') &&
    fileContains('public/dunyalar/definitions/test_3d_campaign.json', '"levelId": "battle_plains"') &&
    fileContains('public/dunyalar/definitions/test_3d_campaign.json', '"project": "FPS3D Demo"') &&
    fileContains('public/dunyalar/definitions/test_3d_campaign.json', '"levelId": "tutorial_arena"') &&
    fileContains('public/dunyalar/definitions/test_3d_campaign.json', '"project": "Platformer3D Demo"') &&
    fileContains('public/dunyalar/definitions/test_3d_campaign.json', '"levelId": "sky_gardens"')
);

// Summary
log(BLUE, '\n========================================');
log(BLUE, 'Test Summary');
log(BLUE, '========================================');
log(GREEN, `Passed: ${passed}`);
if (warnings > 0) log(YELLOW, `Warnings: ${warnings}`);
if (failed > 0) log(RED, `Failed: ${failed}`);

if (failed === 0) {
    log(GREEN, '\n✓ All critical tests passed!');
    log(GREEN, '3D engines are ready for campaign runtime.');
    process.exit(0);
} else {
    log(RED, '\n✗ Some tests failed.');
    log(RED, 'Please fix the issues above before using 3D engines in campaigns.');
    process.exit(1);
}
