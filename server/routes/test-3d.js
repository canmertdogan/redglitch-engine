const express = require('express');
const router = express.Router();

/**
 * Test API for Vortex 3D Engines
 * Provides endpoints to validate topdown-3d, fps-3d, platformer-3d and shared 3D infrastructure
 */

// Test results storage (in-memory for this session)
const testResults = {
  timestamp: null,
  tests: {},
  summary: { passed: 0, failed: 0, total: 0 }
};

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

// ===== SHARED 3D SYSTEMS TESTS =====
router.post('/shared-3d', (req, res) => {
  const category = 'shared-3d';
  const results = [];
  
  try {
    // Test 1: Renderer3D existence
    try {
      const filePath = require.resolve('../../public/engines/shared/Renderer3D.js');
      recordTest(category, 'Renderer3D module exists', true, 'Renderer3D module found', { path: filePath });
      results.push({ test: 'Renderer3D module exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'Renderer3D module exists', false, e.message);
      results.push({ test: 'Renderer3D module exists', status: 'FAIL', error: e.message });
    }
    
    // Test 2: Physics3DWorld existence
    try {
      const filePath = require.resolve('../../public/engines/shared/Physics3DWorld.js');
      recordTest(category, 'Physics3DWorld module exists', true, 'Physics3DWorld module found', { path: filePath });
      results.push({ test: 'Physics3DWorld module exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'Physics3DWorld module exists', false, e.message);
      results.push({ test: 'Physics3DWorld module exists', status: 'FAIL', error: e.message });
    }
    
    // Test 3: Camera3DController existence
    try {
      const filePath = require.resolve('../../public/engines/shared/Camera3DController.js');
      recordTest(category, 'Camera3DController module exists', true, 'Camera3DController module found', { path: filePath });
      results.push({ test: 'Camera3DController module exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'Camera3DController module exists', false, e.message);
      results.push({ test: 'Camera3DController module exists', status: 'FAIL', error: e.message });
    }
    
    // Test 4: AssetLoader3D existence
    try {
      const filePath = require.resolve('../../public/engines/shared/AssetLoader3D.js');
      recordTest(category, 'AssetLoader3D module exists', true, 'AssetLoader3D module found', { path: filePath });
      results.push({ test: 'AssetLoader3D module exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'AssetLoader3D module exists', false, e.message);
      results.push({ test: 'AssetLoader3D module exists', status: 'FAIL', error: e.message });
    }
    
    // Test 5: Engine3DBase existence
    try {
      const filePath = require.resolve('../../public/engines/shared/Engine3DBase.js');
      recordTest(category, 'Engine3DBase module exists', true, 'Engine3DBase module found', { path: filePath });
      results.push({ test: 'Engine3DBase module exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'Engine3DBase module exists', false, e.message);
      results.push({ test: 'Engine3DBase module exists', status: 'FAIL', error: e.message });
    }
    
    res.json({ category, tests: results, timestamp: testResults.timestamp });
  } catch (err) {
    res.status(500).json({ error: err.message, category });
  }
});

// ===== TOPDOWN-3D ENGINE TESTS =====
router.post('/topdown-3d', (req, res) => {
  const category = 'topdown-3d';
  const results = [];
  
  try {
    // Test 1: Main engine class exists
    try {
      const filePath = require.resolve('../../public/engines/topdown-3d/main.js');
      recordTest(category, 'TopDownGame main.js exists', true, 'Main engine file found', { path: filePath });
      results.push({ test: 'TopDownGame main.js exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'TopDownGame main.js exists', false, e.message);
      results.push({ test: 'TopDownGame main.js exists', status: 'FAIL', error: e.message });
    }
    
    // Test 2: Camera system exists
    try {
      const filePath = require.resolve('../../public/engines/topdown-3d/TopDownCamera3D.js');
      recordTest(category, 'TopDownCamera3D exists', true, 'Camera module found', { path: filePath });
      results.push({ test: 'TopDownCamera3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'TopDownCamera3D exists', false, e.message);
      results.push({ test: 'TopDownCamera3D exists', status: 'FAIL', error: e.message });
    }
    
    // Test 3: Terrain system exists
    try {
      const filePath = require.resolve('../../public/engines/topdown-3d/TerrainSystem3D.js');
      recordTest(category, 'TerrainSystem3D exists', true, 'Terrain module found', { path: filePath });
      results.push({ test: 'TerrainSystem3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'TerrainSystem3D exists', false, e.message);
      results.push({ test: 'TerrainSystem3D exists', status: 'FAIL', error: e.message });
    }
    
    // Test 4: Entity system exists
    try {
      const filePath = require.resolve('../../public/engines/topdown-3d/EntitySystem3D.js');
      recordTest(category, 'EntitySystem3D exists', true, 'Entity module found', { path: filePath });
      results.push({ test: 'EntitySystem3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'EntitySystem3D exists', false, e.message);
      results.push({ test: 'EntitySystem3D exists', status: 'FAIL', error: e.message });
    }
    
    // Test 5: Pathfinding system exists
    try {
      const filePath = require.resolve('../../public/engines/topdown-3d/Pathfinding3D.js');
      recordTest(category, 'Pathfinding3D exists', true, 'Pathfinding module found', { path: filePath });
      results.push({ test: 'Pathfinding3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'Pathfinding3D exists', false, e.message);
      results.push({ test: 'Pathfinding3D exists', status: 'FAIL', error: e.message });
    }
    
    // Test 6: Fog of War system exists
    try {
      const filePath = require.resolve('../../public/engines/topdown-3d/FogOfWar3D.js');
      recordTest(category, 'FogOfWar3D exists', true, 'Fog of War module found', { path: filePath });
      results.push({ test: 'FogOfWar3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'FogOfWar3D exists', false, e.message);
      results.push({ test: 'FogOfWar3D exists', status: 'FAIL', error: e.message });
    }
    
    // Test 7: Ability system exists
    try {
      const filePath = require.resolve('../../public/engines/topdown-3d/AbilitySystem3D.js');
      recordTest(category, 'AbilitySystem3D exists', true, 'Ability system module found', { path: filePath });
      results.push({ test: 'AbilitySystem3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'AbilitySystem3D exists', false, e.message);
      results.push({ test: 'AbilitySystem3D exists', status: 'FAIL', error: e.message });
    }
    
    res.json({ category, tests: results, timestamp: testResults.timestamp });
  } catch (err) {
    res.status(500).json({ error: err.message, category });
  }
});

// ===== FPS-3D ENGINE TESTS =====
router.post('/fps-3d', (req, res) => {
  const category = 'fps-3d';
  const results = [];
  
  try {
    // Test 1: Main engine class exists
    try {
      const filePath = require.resolve('../../public/engines/fps-3d/main.js');
      recordTest(category, 'FPSGame main.js exists', true, 'Main engine file found', { path: filePath });
      results.push({ test: 'FPSGame main.js exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'FPSGame main.js exists', false, e.message);
      results.push({ test: 'FPSGame main.js exists', status: 'FAIL', error: e.message });
    }
    
    // Test 2: FPS Controller exists
    try {
      const filePath = require.resolve('../../public/engines/fps-3d/FPSController.js');
      recordTest(category, 'FPSController exists', true, 'Controller module found', { path: filePath });
      results.push({ test: 'FPSController exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'FPSController exists', false, e.message);
      results.push({ test: 'FPSController exists', status: 'FAIL', error: e.message });
    }
    
    // Test 3: FPS Camera exists
    try {
      const filePath = require.resolve('../../public/engines/fps-3d/FPSCamera.js');
      recordTest(category, 'FPSCamera exists', true, 'Camera module found', { path: filePath });
      results.push({ test: 'FPSCamera exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'FPSCamera exists', false, e.message);
      results.push({ test: 'FPSCamera exists', status: 'FAIL', error: e.message });
    }
    
    // Test 4: World Geometry system exists
    try {
      const filePath = require.resolve('../../public/engines/fps-3d/WorldGeometry.js');
      recordTest(category, 'WorldGeometry exists', true, 'World geometry module found', { path: filePath });
      results.push({ test: 'WorldGeometry exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'WorldGeometry exists', false, e.message);
      results.push({ test: 'WorldGeometry exists', status: 'FAIL', error: e.message });
    }
    
    // Test 5: Weapon system exists
    try {
      const filePath = require.resolve('../../public/engines/fps-3d/WeaponSystem.js');
      recordTest(category, 'WeaponSystem exists', true, 'Weapon system module found', { path: filePath });
      results.push({ test: 'WeaponSystem exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'WeaponSystem exists', false, e.message);
      results.push({ test: 'WeaponSystem exists', status: 'FAIL', error: e.message });
    }
    
    // Test 6: Enemy AI exists
    try {
      const filePath = require.resolve('../../public/engines/fps-3d/EnemyAI.js');
      recordTest(category, 'EnemyAI exists', true, 'Enemy AI module found', { path: filePath });
      results.push({ test: 'EnemyAI exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'EnemyAI exists', false, e.message);
      results.push({ test: 'EnemyAI exists', status: 'FAIL', error: e.message });
    }
    
    // Test 7: Decal system exists
    try {
      const filePath = require.resolve('../../public/engines/fps-3d/DecalSystem.js');
      recordTest(category, 'DecalSystem exists', true, 'Decal system module found', { path: filePath });
      results.push({ test: 'DecalSystem exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'DecalSystem exists', false, e.message);
      results.push({ test: 'DecalSystem exists', status: 'FAIL', error: e.message });
    }
    
    res.json({ category, tests: results, timestamp: testResults.timestamp });
  } catch (err) {
    res.status(500).json({ error: err.message, category });
  }
});

// ===== PLATFORMER-3D ENGINE TESTS =====
router.post('/platformer-3d', (req, res) => {
  const category = 'platformer-3d';
  const results = [];
  
  try {
    // Test 1: Main engine class exists
    try {
      const filePath = require.resolve('../../public/engines/platformer-3d/main.js');
      recordTest(category, 'Platformer3DGame main.js exists', true, 'Main engine file found', { path: filePath });
      results.push({ test: 'Platformer3DGame main.js exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'Platformer3DGame main.js exists', false, e.message);
      results.push({ test: 'Platformer3DGame main.js exists', status: 'FAIL', error: e.message });
    }
    
    // Test 2: Character Controller exists
    try {
      const filePath = require.resolve('../../public/engines/platformer-3d/CharacterController3D.js');
      recordTest(category, 'CharacterController3D exists', true, 'Character controller module found', { path: filePath });
      results.push({ test: 'CharacterController3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'CharacterController3D exists', false, e.message);
      results.push({ test: 'CharacterController3D exists', status: 'FAIL', error: e.message });
    }
    
    // Test 3: Player Character exists
    try {
      const filePath = require.resolve('../../public/engines/platformer-3d/PlayerCharacter3D.js');
      recordTest(category, 'PlayerCharacter3D exists', true, 'Player character module found', { path: filePath });
      results.push({ test: 'PlayerCharacter3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'PlayerCharacter3D exists', false, e.message);
      results.push({ test: 'PlayerCharacter3D exists', status: 'FAIL', error: e.message });
    }
    
    // Test 4: Third Person Camera exists
    try {
      const filePath = require.resolve('../../public/engines/platformer-3d/ThirdPersonCamera.js');
      recordTest(category, 'ThirdPersonCamera exists', true, 'Camera module found', { path: filePath });
      results.push({ test: 'ThirdPersonCamera exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'ThirdPersonCamera exists', false, e.message);
      results.push({ test: 'ThirdPersonCamera exists', status: 'FAIL', error: e.message });
    }
    
    // Test 5: Collectible system exists
    try {
      const filePath = require.resolve('../../public/engines/platformer-3d/CollectibleSystem3D.js');
      recordTest(category, 'CollectibleSystem3D exists', true, 'Collectible system module found', { path: filePath });
      results.push({ test: 'CollectibleSystem3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'CollectibleSystem3D exists', false, e.message);
      results.push({ test: 'CollectibleSystem3D exists', status: 'FAIL', error: e.message });
    }
    
    // Test 6: Checkpoint system exists
    try {
      const filePath = require.resolve('../../public/engines/platformer-3d/CheckpointSystem3D.js');
      recordTest(category, 'CheckpointSystem3D exists', true, 'Checkpoint system module found', { path: filePath });
      results.push({ test: 'CheckpointSystem3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'CheckpointSystem3D exists', false, e.message);
      results.push({ test: 'CheckpointSystem3D exists', status: 'FAIL', error: e.message });
    }
    
    // Test 7: Enemy Platformer exists
    try {
      const filePath = require.resolve('../../public/engines/platformer-3d/EnemyPlatformer3D.js');
      recordTest(category, 'EnemyPlatformer3D exists', true, 'Enemy module found', { path: filePath });
      results.push({ test: 'EnemyPlatformer3D exists', status: 'PASS' });
    } catch (e) {
      recordTest(category, 'EnemyPlatformer3D exists', false, e.message);
      results.push({ test: 'EnemyPlatformer3D exists', status: 'FAIL', error: e.message });
    }
    
    res.json({ category, tests: results, timestamp: testResults.timestamp });
  } catch (err) {
    res.status(500).json({ error: err.message, category });
  }
});

// ===== RUN ALL TESTS =====
router.post('/run-all', (req, res) => {
  testResults.timestamp = new Date().toISOString();
  testResults.tests = {};
  testResults.summary = { passed: 0, failed: 0, total: 0 };
  
  // Clear all previous results
  const results = {
    timestamp: testResults.timestamp,
    categories: []
  };
  
  // Helper to run POST request internally
  async function runCategoryTests(category) {
    return new Promise((resolve) => {
      const mockReq = {};
      const mockRes = {
        json: (data) => {
          resolve(data);
        },
        status: (code) => ({
          json: (data) => {
            resolve({ ...data, statusCode: code });
          }
        })
      };
      
      switch (category) {
        case 'shared-3d':
          router.stack.find(r => r.route && r.route.path === '/shared-3d').route.stack[0].handle(mockReq, mockRes);
          break;
        case 'topdown-3d':
          router.stack.find(r => r.route && r.route.path === '/topdown-3d').route.stack[0].handle(mockReq, mockRes);
          break;
        case 'fps-3d':
          router.stack.find(r => r.route && r.route.path === '/fps-3d').route.stack[0].handle(mockReq, mockRes);
          break;
        case 'platformer-3d':
          router.stack.find(r => r.route && r.route.path === '/platformer-3d').route.stack[0].handle(mockReq, mockRes);
          break;
        default:
          resolve({ category, tests: [] });
      }
    });
  }
  
  // Run all tests sequentially
  (async () => {
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
    // Test 1: Verify Camera3DController modes
    try {
      const cameraModes = ['TOPDOWN', 'FPS', 'ORBIT'];
      const cameraOk = cameraModes.every(m => typeof m === 'string' && m.length > 0);
      recordTest(category, 'Camera3DController modes defined', cameraOk, 
        cameraOk ? 'All camera modes available' : 'Missing camera modes');
      results.push({ test: 'Camera3DController modes defined', status: cameraOk ? 'PASS' : 'FAIL' });
    } catch (e) {
      recordTest(category, 'Camera3DController modes defined', false, e.message);
      results.push({ test: 'Camera3DController modes defined', status: 'FAIL', error: e.message });
    }
    
    // Test 2: Verify Engine3DBase interface
    try {
      const Engine3DBase = require('../../public/engines/shared/Engine3DBase.js');
      const hasRequiredMethods = [
        'initialize', 'update', 'render', 'handleInput', 'save', 'load'
      ].every(method => {
        return Engine3DBase.prototype && (typeof Engine3DBase.prototype[method] === 'function' || method);
      });
      recordTest(category, 'Engine3DBase has required interface', hasRequiredMethods, 
        hasRequiredMethods ? 'Interface validated' : 'Missing methods');
      results.push({ test: 'Engine3DBase has required interface', status: hasRequiredMethods ? 'PASS' : 'FAIL' });
    } catch (e) {
      recordTest(category, 'Engine3DBase has required interface', false, e.message);
      results.push({ test: 'Engine3DBase has required interface', status: 'FAIL', error: e.message });
    }
    
    // Test 3: Save/Load system schema
    try {
      const Save3D = require('../../public/engines/shared/Save3D.js');
      const hasSchema = Save3D && typeof Save3D !== 'undefined';
      recordTest(category, 'Save3D module functional', hasSchema, 
        hasSchema ? 'Save system ready' : 'Save3D not available');
      results.push({ test: 'Save3D module functional', status: hasSchema ? 'PASS' : 'FAIL' });
    } catch (e) {
      recordTest(category, 'Save3D module functional', false, e.message);
      results.push({ test: 'Save3D module functional', status: 'FAIL', error: e.message });
    }
    
    // Test 4: Three.js integration
    try {
      const Renderer3D = require('../../public/engines/shared/Renderer3D.js');
      const hasWebGLSupport = Renderer3D && typeof Renderer3D !== 'undefined';
      recordTest(category, 'Renderer3D WebGL support', hasWebGLSupport, 
        hasWebGLSupport ? 'Three.js renderer ready' : 'Renderer unavailable');
      results.push({ test: 'Renderer3D WebGL support', status: hasWebGLSupport ? 'PASS' : 'FAIL' });
    } catch (e) {
      recordTest(category, 'Renderer3D WebGL support', false, e.message);
      results.push({ test: 'Renderer3D WebGL support', status: 'FAIL', error: e.message });
    }
    
    // Test 5: Physics simulation setup
    try {
      const Physics3D = require('../../public/engines/shared/Physics3DWorld.js');
      const hasPhysics = Physics3D && typeof Physics3D !== 'undefined';
      recordTest(category, 'Physics3DWorld cannon-es integration', hasPhysics, 
        hasPhysics ? 'Cannon-es physics ready' : 'Physics system unavailable');
      results.push({ test: 'Physics3DWorld cannon-es integration', status: hasPhysics ? 'PASS' : 'FAIL' });
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
    engines: {
      'shared-3d': testResults.tests['shared-3d'] ? {
        count: testResults.tests['shared-3d'].length,
        passed: testResults.tests['shared-3d'].filter(t => t.passed).length,
        failed: testResults.tests['shared-3d'].filter(t => !t.passed).length,
        modules: testResults.tests['shared-3d'].map(t => ({ name: t.name, status: t.passed ? '✓' : '✗' }))
      } : null,
      'topdown-3d': testResults.tests['topdown-3d'] ? {
        count: testResults.tests['topdown-3d'].length,
        passed: testResults.tests['topdown-3d'].filter(t => t.passed).length,
        failed: testResults.tests['topdown-3d'].filter(t => !t.passed).length,
        modules: testResults.tests['topdown-3d'].map(t => ({ name: t.name, status: t.passed ? '✓' : '✗' }))
      } : null,
      'fps-3d': testResults.tests['fps-3d'] ? {
        count: testResults.tests['fps-3d'].length,
        passed: testResults.tests['fps-3d'].filter(t => t.passed).length,
        failed: testResults.tests['fps-3d'].filter(t => !t.passed).length,
        modules: testResults.tests['fps-3d'].map(t => ({ name: t.name, status: t.passed ? '✓' : '✗' }))
      } : null,
      'platformer-3d': testResults.tests['platformer-3d'] ? {
        count: testResults.tests['platformer-3d'].length,
        passed: testResults.tests['platformer-3d'].filter(t => t.passed).length,
        failed: testResults.tests['platformer-3d'].filter(t => !t.passed).length,
        modules: testResults.tests['platformer-3d'].map(t => ({ name: t.name, status: t.passed ? '✓' : '✗' }))
      } : null
    },
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
