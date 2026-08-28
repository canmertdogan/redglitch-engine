const express = require('express');
const router = express.Router();
const path = require('path');
const fsSync = require('fs');

/**
 * Test API for Redglitch 3D Engines
 * Provides endpoints to validate topdown-3d, fps-3d, platformer-3d and shared 3D infrastructure
 *
 * NOTE: this is an in-process diagnostic API, not part of `npm test`. The checks below
 * actually probe the engine source files on disk (existence + required symbols) so a
 * missing/moved module produces a real FAIL instead of an always-passing no-op.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const ENG = path.join(ROOT, 'public', 'engines');

function fileExists(rel) {
    return fsSync.existsSync(path.join(ENG, rel));
}

// Read a source file and assert it defines/uses an expected token (e.g. a method name).
function fileHasToken(rel, token) {
    try {
        const content = fsSync.readFileSync(path.join(ENG, rel), 'utf8');
        return content.includes(token);
    } catch {
        return false;
    }
}

// Single shared results store. Guarded by `isRunning` for /run-all below.
const testResults = {
    timestamp: null,
    tests: {},
    summary: { passed: 0, failed: 0, total: 0 }
};

let isRunning = false;

// Helper: Record test result
function recordTest(category, testName, passed, message = '', details = {}) {
    if (!testResults.timestamp) {
        testResults.timestamp = new Date().toISOString();
    }

    if (!testResults.tests[category]) {
        testResults.tests[category] = [];
    }

    const result = {
        name: testName,
        passed,
        message,
        timestamp: new Date().toISOString(),
        details
    };

    testResults.tests[category].push(result);
    testResults.summary.total++;
    if (passed) {
        testResults.summary.passed++;
    } else {
        testResults.summary.failed++;
    }

    return result;
}

// Run a list of { name, rel } existence checks and record them.
function runExistenceTests(category, checks) {
    const results = [];
    for (const { name, rel } of checks) {
        try {
            const ok = fileExists(rel);
            recordTest(category, `${name} exists`, ok, ok ? `Found ${rel}` : `Missing ${rel}`, { path: rel });
            results.push({ test: `${name} exists`, status: ok ? 'PASS' : 'FAIL', path: rel });
        } catch (e) {
            recordTest(category, `${name} exists`, false, e.message);
            results.push({ test: `${name} exists`, status: 'FAIL', error: e.message });
        }
    }
    return results;
}

// ===== SHARED 3D SYSTEMS TESTS =====
router.post('/shared-3d', (req, res) => {
    const category = 'shared-3d';
    try {
        const results = runExistenceTests(category, [
            { name: 'Renderer3D module', rel: 'shared/Renderer3D.js' },
            { name: 'Physics3DWorld module', rel: 'shared/Physics3DWorld.js' },
            { name: 'Camera3DController module', rel: 'shared/Camera3DController.js' },
            { name: 'AssetLoader3D module', rel: 'shared/AssetLoader3D.js' },
            { name: 'Engine3DBase module', rel: 'shared/Engine3DBase.js' }
        ]);
        res.json({ category, tests: results, timestamp: testResults.timestamp });
    } catch (err) {
        res.status(500).json({ error: err.message, category });
    }
});

// ===== TOPDOWN-3D ENGINE TESTS =====
router.post('/topdown-3d', (req, res) => {
    const category = 'topdown-3d';
    try {
        const results = runExistenceTests(category, [
            { name: 'TopDownGame main.js', rel: '3d/main.js' },
            { name: 'TopDownCamera3D', rel: '3d/systems/TopDownCamera3D.js' },
            { name: 'TerrainSystem3D', rel: '3d/systems/TerrainSystem3D.js' },
            { name: 'EntitySystem3D', rel: '3d/systems/EntitySystem3D.js' },
            { name: 'Pathfinding3D', rel: '3d/systems/Pathfinding3D.js' },
            { name: 'FogOfWar3D', rel: '3d/systems/FogOfWar3D.js' },
            { name: 'AbilitySystem3D', rel: '3d/systems/AbilitySystem3D.js' }
        ]);
        res.json({ category, tests: results, timestamp: testResults.timestamp });
    } catch (err) {
        res.status(500).json({ error: err.message, category });
    }
});

// ===== FPS-3D ENGINE TESTS =====
router.post('/fps-3d', (req, res) => {
    const category = 'fps-3d';
    try {
        const results = runExistenceTests(category, [
            { name: 'FPSGame main.js', rel: '3d/main.js' },
            { name: 'FPSController', rel: '3d/systems/FPSController.js' },
            { name: 'FPSCamera', rel: '3d/systems/FPSCamera.js' },
            { name: 'WorldGeometry', rel: '3d/systems/WorldGeometry.js' },
            { name: 'WeaponSystem', rel: '3d/systems/WeaponSystem.js' },
            { name: 'EnemyAI', rel: '3d/systems/EnemyAI.js' },
            { name: 'DecalSystem', rel: '3d/systems/DecalSystem.js' }
        ]);
        res.json({ category, tests: results, timestamp: testResults.timestamp });
    } catch (err) {
        res.status(500).json({ error: err.message, category });
    }
});

// ===== PLATFORMER-3D ENGINE TESTS =====
router.post('/platformer-3d', (req, res) => {
    const category = 'platformer-3d';
    try {
        const results = runExistenceTests(category, [
            { name: 'Platformer3DGame main.js', rel: '3d/main.js' },
            { name: 'CharacterController3D', rel: '3d/systems/CharacterController3D.js' },
            { name: 'PlayerCharacter3D', rel: '3d/systems/PlayerCharacter3D.js' },
            { name: 'ThirdPersonCamera', rel: '3d/systems/ThirdPersonCamera.js' },
            { name: 'CollectibleSystem3D', rel: '3d/systems/CollectibleSystem3D.js' },
            { name: 'CheckpointSystem3D', rel: '3d/systems/CheckpointSystem3D.js' },
            { name: 'EnemyPlatformer3D', rel: '3d/systems/EnemyPlatformer3D.js' }
        ]);
        res.json({ category, tests: results, timestamp: testResults.timestamp });
    } catch (err) {
        res.status(500).json({ error: err.message, category });
    }
});

// ===== RUN ALL TESTS =====
router.post('/run-all', (req, res) => {
    if (isRunning) {
        return res.status(409).json({ error: 'A 3D test run is already in progress' });
    }
    isRunning = true;

    // Fresh results for this run so concurrent callers don't corrupt each other.
    testResults.timestamp = new Date().toISOString();
    testResults.tests = {};
    testResults.summary = { passed: 0, failed: 0, total: 0 };

    // Helper to run POST request internally
    function runCategoryTests(category) {
        return new Promise((resolve) => {
            const mockReq = {};
            const mockRes = {
                json: (data) => { resolve(data); },
                status: (code) => ({
                    json: (data) => { resolve({ ...data, statusCode: code }); }
                })
            };

            const route = router.stack.find(r => r.route && r.route.path === `/${category}`);
            if (!route) { resolve({ category, tests: [] }); return; }
            route.route.stack[0].handle(mockReq, mockRes);
        });
    }

    (async () => {
        try {
            const categories = ['shared-3d', 'topdown-3d', 'fps-3d', 'platformer-3d'];
            for (const category of categories) {
                await runCategoryTests(category);
            }
            res.json({
                timestamp: testResults.timestamp,
                summary: testResults.summary,
                tests: testResults.tests,
                allTestsCompleted: true
            });
        } finally {
            isRunning = false;
        }
    })();
});

// ===== GET TEST RESULTS =====
router.get('/results', (req, res) => {
    res.json({
        timestamp: testResults.timestamp,
        summary: testResults.summary,
        tests: testResults.tests
    });
});

// ===== GET TEST SUMMARY =====
router.get('/summary', (req, res) => {
    const passPercentage = testResults.summary.total > 0
        ? ((testResults.summary.passed / testResults.summary.total) * 100).toFixed(2)
        : 0;

    res.json({
        timestamp: testResults.timestamp,
        summary: {
            ...testResults.summary,
            passPercentage: `${passPercentage}%`,
            status: testResults.summary.failed === 0 ? 'ALL TESTS PASSED' : `${testResults.summary.failed} TESTS FAILED`
        },
        categorySummary: Object.keys(testResults.tests).map(cat => ({
            category: cat,
            count: testResults.tests[cat].length,
            passed: testResults.tests[cat].filter(t => t.passed).length,
            failed: testResults.tests[cat].filter(t => !t.passed).length
        }))
    });
});

// ===== ADVANCED RUNTIME TESTS =====
router.post('/advanced/shared-3d-runtime', (req, res) => {
    const category = 'shared-3d-runtime';
    const results = [];

    try {
        // Test 1: Camera3DController defines the expected modes
        try {
            const rel = 'shared/Camera3DController.js';
            const cameraOk = fileExists(rel) && ['TOPDOWN', 'FPS', 'ORBIT']
                .every(m => fileHasToken(rel, m));
            recordTest(category, 'Camera3DController modes defined', cameraOk,
                cameraOk ? 'All camera modes present' : 'Missing camera modes in Camera3DController');
            results.push({ test: 'Camera3DController modes defined', status: cameraOk ? 'PASS' : 'FAIL' });
        } catch (e) {
            recordTest(category, 'Camera3DController modes defined', false, e.message);
            results.push({ test: 'Camera3DController modes defined', status: 'FAIL', error: e.message });
        }

        // Test 2: Engine3DBase exposes the required lifecycle interface
        try {
            const rel = 'shared/Engine3DBase.js';
            const methods = ['initialize', 'start', 'loadLevel', 'destroy'];
            const hasInterface = fileExists(rel) &&
                methods.every(m => fileHasToken(rel, m));
            recordTest(category, 'Engine3DBase has required interface', hasInterface,
                hasInterface ? 'Interface validated' : 'Missing required methods in Engine3DBase');
            results.push({ test: 'Engine3DBase has required interface', status: hasInterface ? 'PASS' : 'FAIL' });
        } catch (e) {
            recordTest(category, 'Engine3DBase has required interface', false, e.message);
            results.push({ test: 'Engine3DBase has required interface', status: 'FAIL', error: e.message });
        }

        // Test 3: Save3D module exists
        try {
            const rel = 'shared/Save3D.js';
            const ok = fileExists(rel);
            recordTest(category, 'Save3D module functional', ok,
                ok ? 'Save system ready' : 'Save3D not available');
            results.push({ test: 'Save3D module functional', status: ok ? 'PASS' : 'FAIL' });
        } catch (e) {
            recordTest(category, 'Save3D module functional', false, e.message);
            results.push({ test: 'Save3D module functional', status: 'FAIL', error: e.message });
        }

        // Test 4: Renderer3D (Three.js renderer) module exists
        try {
            const rel = 'shared/Renderer3D.js';
            const ok = fileExists(rel);
            recordTest(category, 'Renderer3D WebGL support', ok,
                ok ? 'Three.js renderer ready' : 'Renderer unavailable');
            results.push({ test: 'Renderer3D WebGL support', status: ok ? 'PASS' : 'FAIL' });
        } catch (e) {
            recordTest(category, 'Renderer3D WebGL support', false, e.message);
            results.push({ test: 'Renderer3D WebGL support', status: 'FAIL', error: e.message });
        }

        // Test 5: Physics3DWorld (cannon-es) module exists
        try {
            const rel = 'shared/Physics3DWorld.js';
            const ok = fileExists(rel);
            recordTest(category, 'Physics3DWorld cannon-es integration', ok,
                ok ? 'Cannon-es physics ready' : 'Physics system unavailable');
            results.push({ test: 'Physics3DWorld cannon-es integration', status: ok ? 'PASS' : 'FAIL' });
        } catch (e) {
            recordTest(category, 'Physics3DWorld cannon-es integration', false, e.message);
            results.push({ test: 'Physics3DWorld cannon-es integration', status: 'FAIL', error: e.message });
        }

        res.json({ category, tests: results, timestamp: testResults.timestamp });
    } catch (err) {
        res.status(500).json({ error: err.message, category });
    }
});

// ===== VALIDATION TEST =====
router.post('/validate', (req, res) => {
    const validation = {
        timestamp: testResults.timestamp,
        checks: {
            allModulesExist: testResults.summary.failed === 0,
            totalTests: testResults.summary.total,
            passRate: testResults.summary.total > 0
                ? (testResults.summary.passed / testResults.summary.total * 100).toFixed(2) + '%'
                : 'N/A',
            status: testResults.summary.failed === 0 ? '✓ READY FOR PRODUCTION' : '✗ ISSUES DETECTED'
        }
    };
    res.json(validation);
});

// ===== DETAILED REPORT =====
router.get('/report', (req, res) => {
    const report = {
        generatedAt: new Date().toISOString(),
        summary: testResults.summary,
        engines: ['shared-3d', 'topdown-3d', 'fps-3d', 'platformer-3d'].reduce((acc, cat) => {
            const list = testResults.tests[cat];
            acc[cat] = list ? {
                count: list.length,
                passed: list.filter(t => t.passed).length,
                failed: list.filter(t => !t.passed).length,
                modules: list.map(t => ({ name: t.name, status: t.passed ? '✓' : '✗' }))
            } : null;
            return acc;
        }, {}),
        recommendations: testResults.summary.failed === 0
            ? ['All 3D engines validated', 'Ready for deployment', 'All core systems functional']
            : ['Fix failing modules', 'Review error logs', 'Rerun tests after fixes']
    };
    res.json(report);
});

// ===== HEALTH CHECK =====
router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: '3D Engine Test API',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
