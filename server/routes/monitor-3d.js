/**
 * 3D Monitor API (development diagnostics scaffolding)
 * ----------------------------------------------------
 * This route currently returns synthetic/sample monitoring payloads intended
 * for dashboard integration and API contract testing during development.
 * Treat these endpoints as simulated diagnostics, not authoritative telemetry.
 */

const express = require('express');
const router = express.Router();
const MONITOR_MODE = process.env.MONITOR_MODE || 'simulated';

router.use((req, res, next) => {
  res.setHeader('X-RedGlitch-Monitor-Mode', MONITOR_MODE);
  next();
});

// Performance history storage
class PerformanceMonitor {
  constructor(maxSamples = 300) {
    this.maxSamples = maxSamples;
    this.fps = [];
    this.memory = [];
    this.cpu = [];
    this.physics = [];
    this.rendering = [];
  }

  addSample(metric, value) {
    const array = this[metric];
    if (array) {
      array.push({ timestamp: Date.now(), value });
      if (array.length > this.maxSamples) {
        array.shift();
      }
    }
  }

  getHistory(metric, duration = 60000) {
    const now = Date.now();
    const array = this[metric];
    if (!array) return [];
    
    return array.filter(s => now - s.timestamp <= duration);
  }

  getStats(metric) {
    const samples = this[metric];
    if (!samples || samples.length === 0) {
      return { min: 0, max: 0, avg: 0, current: 0 };
    }

    const values = samples.map(s => s.value);
    const current = values[values.length - 1];
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, avg: Math.round(avg * 100) / 100, current };
  }
}

const monitor = new PerformanceMonitor();

// ===== PERFORMANCE HISTORY =====
router.get('/history/:metric', (req, res) => {
  try {
    const { metric } = req.params;
    const { duration = 60000 } = req.query;
    const history = monitor.getHistory(metric, parseInt(duration));

    res.json({
      metric,
      duration: parseInt(duration),
      samples: history.length,
      data: history,
      stats: monitor.getStats(metric)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ENGINE STATE SNAPSHOT =====
router.get('/snapshot', (req, res) => {
  try {
    const snapshot = {
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      performance: {
        fps: {
          current: Math.round(Math.random() * 60 + 30),
          stats: monitor.getStats('fps')
        },
        memory: {
          heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          stats: monitor.getStats('memory')
        },
        cpu: {
          percent: Math.round(Math.random() * 40 + 10),
          stats: monitor.getStats('cpu')
        }
      },
      engines: {
        'topdown-3d': { loaded: true, instances: 2, health: 'green' },
        'fps-3d': { loaded: true, instances: 1, health: 'green' },
        'platformer-3d': { loaded: true, instances: 1, health: 'green' }
      },
      scenes: {
        active: 3,
        loading: 0,
        total: 5
      },
      entities: {
        total: 85,
        active: 82,
        sleeping: 3
      },
      physics: {
        bodies: 127,
        constraints: 12,
        collisions: 28
      },
      assets: {
        loaded: 234,
        loading: 0,
        failed: 0
      }
    };

    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== FRAME ANALYZER =====
router.post('/analyze-frame', (req, res) => {
  try {
    const { frameData } = req.body;
    
    const analysis = {
      timestamp: new Date().toISOString(),
      frameId: frameData?.id || 0,
      analysis: {
        bottlenecks: [
          {
            system: 'Rendering',
            duration: 7.5,
            percent: 44.9,
            severity: 'high',
            suggestion: 'Consider LOD implementation or shader optimization'
          },
          {
            system: 'Physics',
            duration: 3.2,
            percent: 19.2,
            severity: 'medium',
            suggestion: 'Review collision layer setup'
          }
        ],
        recommendations: [
          'Physics simulation is consuming significant frame time',
          'Rendering system is the primary bottleneck',
          'Consider spatial partitioning for better performance'
        ],
        optimizationScore: 72, // Out of 100
        targets: {
          fps: 60,
          frameTime: 16.67,
          actualFPS: 58,
          actualFrameTime: 17.24
        }
      }
    };

    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== SYSTEM WARNINGS =====
router.get('/warnings', (req, res) => {
  try {
    const warnings = {
      timestamp: new Date().toISOString(),
      critical: [],
      warnings: [
        {
          id: 'PERF_001',
          level: 'warning',
          title: 'High Rendering Time',
          message: 'Rendering is consuming 44.9% of frame time',
          source: 'Rendering System',
          suggestedAction: 'Implement LOD system or optimize shaders'
        },
        {
          id: 'MEM_001',
          level: 'warning',
          title: 'Memory Usage Growing',
          message: 'Heap usage increased by 15% in last minute',
          source: 'Memory System',
          suggestedAction: 'Check for memory leaks in asset loading'
        }
      ],
      info: [
        {
          id: 'INFO_001',
          level: 'info',
          title: 'Physics Simulation Stable',
          message: 'Physics simulation running at consistent 3.2ms per frame',
          source: 'Physics System'
        }
      ]
    };

    res.json(warnings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== DETAILED ENGINE STATS =====
router.get('/engine-stats/:engineName', (req, res) => {
  try {
    const { engineName } = req.params;

    const engineStats = {
      timestamp: new Date().toISOString(),
      engine: engineName,
      status: 'operational',
      uptime: '02:15:47',
      performance: {
        fps: 58,
        frameTime: '17.2ms',
        avgFrameTime: '16.8ms'
      },
      systems: {
        'Rendering': {
          active: true,
          timeMs: 7.5,
          calls: 342,
          health: 'good'
        },
        'Physics': {
          active: true,
          timeMs: 3.2,
          bodies: 127,
          collisions: 28,
          health: 'good'
        },
        'Audio': {
          active: true,
          timeMs: 1.1,
          activeSources: 5,
          health: 'excellent'
        },
        'AI': {
          active: true,
          timeMs: 2.1,
          agents: 12,
          health: 'good'
        }
      },
      memory: {
        engine: '245 MB',
        assets: '128 MB',
        physics: '32 MB',
        audio: '45 MB'
      },
      issues: []
    };

    res.json(engineStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== PROFILING START/STOP =====
router.post('/profile/start', (req, res) => {
  try {
    const profileId = 'profile_' + Date.now();
    
    res.json({
      success: true,
      profileId,
      message: 'Profiling started',
      startTime: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/profile/stop/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;
    
    const profile = {
      profileId,
      duration: 15234, // ms
      samples: 256,
      data: {
        'Rendering': { totalTime: 120500, callCount: 5432, avgTime: 22.2 },
        'Physics': { totalTime: 48200, callCount: 256, avgTime: 188.3 },
        'Audio': { totalTime: 16500, callCount: 1024, avgTime: 16.1 },
        'AI': { totalTime: 31800, callCount: 512, avgTime: 62.1 }
      }
    };

    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== MEMORY LEAK DETECTION =====
router.get('/memory-leak-check', (req, res) => {
  try {
    const memBefore = process.memoryUsage();
    const memAfter = process.memoryUsage();

    const leakAnalysis = {
      timestamp: new Date().toISOString(),
      status: 'HEALTHY',
      analysis: {
        heapGrowth: {
          lastMinute: '2.3%',
          last5Minutes: '5.8%',
          trend: 'stable',
          warning: false
        },
        estimatedLeakRate: {
          bytesPerSecond: 0,
          megabytesPerHour: 0,
          status: 'no leaks detected'
        },
        topGrowers: [
          { object: 'Texture', instances: 234, growth: '0.5%' },
          { object: 'Material', instances: 89, growth: '0.2%' },
          { object: 'Mesh', instances: 456, growth: '0.1%' }
        ]
      }
    };

    res.json(leakAnalysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== BENCHMARK SUITE =====
router.post('/benchmark/:testName', (req, res) => {
  try {
    const { testName } = req.params;

    const benchmarks = {
      'physics-simulation': {
        name: 'Physics Simulation',
        iterations: 1000,
        results: {
          timePerIterationMs: 3.2,
          totalTimeMs: 3200,
          opsPerSecond: 312.5,
          performance: 'excellent'
        }
      },
      'asset-loading': {
        name: 'Asset Loading',
        iterations: 100,
        results: {
          averageLoadTimeMs: 45.2,
          totalTimeMs: 4520,
          loadsPerSecond: 22.1,
          performance: 'good'
        }
      },
      'rendering': {
        name: 'Rendering',
        iterations: 300,
        results: {
          averageFrameTimeMs: 16.8,
          totalTimeMs: 5040,
          fps: 59.5,
          performance: 'good'
        }
      }
    };

    const result = benchmarks[testName] || {
      error: 'Unknown benchmark test',
      available: Object.keys(benchmarks)
    };

    res.json({
      timestamp: new Date().toISOString(),
      benchmark: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== CRASH DUMP / ERROR REPORT =====
router.post('/report-error', (req, res) => {
  try {
    const { errorMessage, stack, context } = req.body;

    const errorReport = {
      reportId: 'err_' + Date.now(),
      timestamp: new Date().toISOString(),
      error: {
        message: errorMessage || 'Unknown error',
        stack: stack || '',
        context: context || {}
      },
      systemState: {
        fps: 58,
        memory: { heap: 245, rss: 456 },
        uptime: 2000
      },
      status: 'reported',
      nextSteps: [
        'Error logged for analysis',
        'Check system resources',
        'Review recent changes'
      ]
    };

    res.json(errorReport);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
