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
    const has3DAdapterScripts =
        fileContains(runtimePath, 'topdown-3d/TopDown3DAdapter.js') &&
        fileContains(runtimePath, 'fps-3d/FPS3DAdapter.js') &&
        fileContains(runtimePath, 'platformer-3d/Platformer3DAdapter.js');

    const adaptersUseDynamicImport =
        fileContains('public/engines/topdown-3d/TopDown3DAdapter.js', 'await import') &&
        fileContains('public/engines/fps-3d/FPS3DAdapter.js', 'await import') &&
        fileContains('public/engines/platformer-3d/Platformer3DAdapter.js', 'await import');

    return has3DAdapterScripts && adaptersUseDynamicImport;
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

// Test 3: TopDown-3D Engine
log(BLUE, '\n--- TopDown-3D Engine ---');
test('TopDown-3D main.js exists', () => fileExists('public/engines/topdown-3d/main.js'));
test('TopDown3DAdapter.js exists', () => fileExists('public/engines/topdown-3d/TopDown3DAdapter.js'));
test('TopDown3DStrategy.js exists', () => fileExists('public/engines/topdown-3d/TopDown3DStrategy.js'));
test('TopDown3DAdapter has initialize()', () => 
    fileContains('public/engines/topdown-3d/TopDown3DAdapter.js', 'async initialize()'));
test('TopDown3DAdapter has loadLevel()', () => 
    fileContains('public/engines/topdown-3d/TopDown3DAdapter.js', 'async loadLevel('));
test('TopDown3DAdapter has pause()', () => 
    fileContains('public/engines/topdown-3d/TopDown3DAdapter.js', 'pause()'));
test('TopDown3DAdapter has useAbility()', () => 
    fileContains('public/engines/topdown-3d/TopDown3DAdapter.js', 'useAbility('));
test('TopDown3DStrategy has getState()', () => 
    fileContains('public/engines/topdown-3d/TopDown3DStrategy.js', 'getState()'));

// Test 4: FPS-3D Engine
log(BLUE, '\n--- FPS-3D Engine ---');
test('FPS-3D main.js exists', () => fileExists('public/engines/fps-3d/main.js'));
test('FPS3DAdapter.js exists', () => fileExists('public/engines/fps-3d/FPS3DAdapter.js'));
test('FPS3DStrategy.js exists', () => fileExists('public/engines/fps-3d/FPS3DStrategy.js'));
test('FPS3DAdapter has dynamic import', () => 
    fileContains('public/engines/fps-3d/FPS3DAdapter.js', 'await import'));
test('FPS3DAdapter has pause()', () => 
    fileContains('public/engines/fps-3d/FPS3DAdapter.js', 'pause()'));
test('FPS3DAdapter has resume()', () => 
    fileContains('public/engines/fps-3d/FPS3DAdapter.js', 'resume()'));
test('FPS3DAdapter has useAbility()', () => 
    fileContains('public/engines/fps-3d/FPS3DAdapter.js', 'useAbility('));
test('FPS3DStrategy has useAbility()', () => 
    fileContains('public/engines/fps-3d/FPS3DStrategy.js', 'useAbility('));
test('FPS3DStrategy has getState()', () => 
    fileContains('public/engines/fps-3d/FPS3DStrategy.js', 'getState()'));

// Test 5: Platformer-3D Engine
log(BLUE, '\n--- Platformer-3D Engine ---');
test('Platformer-3D main.js exists', () => fileExists('public/engines/platformer-3d/main.js'));
test('Platformer3DAdapter.js exists', () => fileExists('public/engines/platformer-3d/Platformer3DAdapter.js'));
test('Platformer3DStrategy.js exists', () => fileExists('public/engines/platformer-3d/Platformer3DStrategy.js'));
test('Platformer3DAdapter has dynamic import', () => 
    fileContains('public/engines/platformer-3d/Platformer3DAdapter.js', 'await import'));
test('Platformer3DAdapter has pause()', () => 
    fileContains('public/engines/platformer-3d/Platformer3DAdapter.js', 'pause()'));
test('Platformer3DAdapter has resume()', () => 
    fileContains('public/engines/platformer-3d/Platformer3DAdapter.js', 'resume()'));
test('Platformer3DAdapter has useAbility()', () => 
    fileContains('public/engines/platformer-3d/Platformer3DAdapter.js', 'useAbility('));
test('Platformer3DStrategy has useAbility()', () => 
    fileContains('public/engines/platformer-3d/Platformer3DStrategy.js', 'useAbility('));
test('Platformer3DStrategy has getState()', () => 
    fileContains('public/engines/platformer-3d/Platformer3DStrategy.js', 'getState()'));

// Test 6: Campaign Runtime Integration
log(BLUE, '\n--- Campaign Runtime Integration ---');
test('campaign_runtime.html exists', () => fileExists('public/campaign_runtime.html'));
test('campaign_runtime has Three.js support (global or module)', () =>
    campaignRuntimeHasThreeSupport());
test('3D runtime resolves cannon-es via module imports', () =>
    fileContains('public/engines/shared/Physics3DWorld.js', "from '/lib/cannon-es/cannon-es.js'") ||
    fileContains('public/engines/shared/Physics3DWorld.js', "from '../../lib/cannon-es/cannon-es.module.js'")
);
test('campaign_runtime loads TopDown3DAdapter', () => 
    fileContains('public/campaign_runtime.html', 'topdown-3d/TopDown3DAdapter.js'));
test('campaign_runtime loads FPS3DAdapter', () => 
    fileContains('public/campaign_runtime.html', 'fps-3d/FPS3DAdapter.js'));
test('campaign_runtime loads Platformer3DAdapter', () => 
    fileContains('public/campaign_runtime.html', 'platformer-3d/Platformer3DAdapter.js'));

// Test 7: CampaignController Support
log(BLUE, '\n--- CampaignController Support ---');
test('CampaignController.js exists', () => fileExists('public/engines/shared/CampaignController.js'));
test('CampaignController supports topdown-3d', () => 
    fileContains('public/engines/shared/CampaignController.js', "case 'topdown-3d':"));
test('CampaignController supports fps-3d', () => 
    fileContains('public/engines/shared/CampaignController.js', "case 'fps-3d':"));
test('CampaignController supports platformer-3d', () => 
    fileContains('public/engines/shared/CampaignController.js', "case 'platformer-3d':"));
test('CampaignController creates TopDown3DAdapter', () => 
    fileContains('public/engines/shared/CampaignController.js', 'new TopDown3DAdapter()'));
test('CampaignController creates FPS3DAdapter', () => 
    fileContains('public/engines/shared/CampaignController.js', 'new FPS3DAdapter()'));
test('CampaignController creates Platformer3DAdapter', () => 
    fileContains('public/engines/shared/CampaignController.js', 'new Platformer3DAdapter()'));

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

test('TopDown adapter wires runtime completion event', () =>
    fileMatches(
        'public/engines/topdown-3d/TopDown3DAdapter.js',
        /engine\.on\('levelComplete',\s*this\._onLevelComplete\)/
    )
);
test('TopDown adapter supports levelPath and project load paths', () =>
    fileContains('public/engines/topdown-3d/TopDown3DAdapter.js', 'loadLevelFromData(levelData)') &&
    fileContains('public/engines/topdown-3d/TopDown3DAdapter.js', 'loadProject(projectName, levelId)')
);
test('TopDown runtime emits levelComplete', () =>
    fileContains('public/engines/topdown-3d/main.js', "this.emit('levelComplete'")
);

test('FPS adapter wires runtime completion event', () =>
    fileMatches(
        'public/engines/fps-3d/FPS3DAdapter.js',
        /game\.on\?\.\('levelComplete',\s*this\._onLevelComplete\)/
    )
);
test('FPS adapter supports levelPath and project load paths', () =>
    fileContains('public/engines/fps-3d/FPS3DAdapter.js', 'loadLevelFromData(levelData)') &&
    fileContains('public/engines/fps-3d/FPS3DAdapter.js', 'loadProject(project, levelId)')
);
test('FPS runtime emits levelComplete', () =>
    fileContains('public/engines/fps-3d/main.js', "this.emit('levelComplete'")
);

test('Platformer adapter forwards onLevelComplete callback', () =>
    fileContains('public/engines/platformer-3d/Platformer3DAdapter.js', 'this.game.onLevelComplete = this._onLevelComplete')
);
test('Platformer adapter supports levelPath and project load paths', () =>
    fileContains('public/engines/platformer-3d/Platformer3DAdapter.js', 'loadLevelFromData(levelData)') &&
    fileContains('public/engines/platformer-3d/Platformer3DAdapter.js', 'loadProject(project, levelId)')
);
test('Platformer runtime completion stops loop and dispatches callback', () =>
    fileContains('public/engines/platformer-3d/main.js', 'this._stopLoop();') &&
    fileContains('public/engines/platformer-3d/main.js', 'this.onLevelComplete?.({')
);

test('CampaignController advances node from adapter completion callback', () =>
    fileContains('public/engines/shared/CampaignController.js', 'this.currentAdapter.onLevelComplete((data) => {') &&
    (fileContains('public/engines/shared/CampaignController.js', 'this.advance();') ||
        fileContains('public/engines/shared/CampaignController.js', 'this._advanceToNextNode();'))
);
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
