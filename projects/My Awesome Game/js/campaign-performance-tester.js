/**
 * Campaign Studio Performance Testing Utility
 * Measures and validates performance of Campaign Studio features
 */

class CampaignPerformanceTester {
    constructor() {
        this.results = {
            engineLoading: {},
            transitions: {},
            serialization: {},
            nodeProcessing: {}
        };
        this.thresholds = {
            engineLoad: 2000,      // 2 seconds max
            transition: 3000,      // 3 seconds max
            serialization: 100,    // 100ms max
            nodeProcessing: 50     // 50ms max
        };
    }

    /**
     * Test engine loading performance
     */
    async testEngineLoading(engineType, worldData) {
        console.log(`[PERF] Testing ${engineType} engine load...`);
        const startTime = performance.now();
        
        try {
            // Simulate engine initialization
            const adapter = this._createAdapter(engineType);
            await adapter.initialize(worldData);
            
            const duration = performance.now() - startTime;
            this.results.engineLoading[engineType] = {
                duration: duration,
                passed: duration < this.thresholds.engineLoad,
                timestamp: new Date().toISOString()
            };
            
            console.log(`[PERF] ${engineType} loaded in ${duration.toFixed(2)}ms`);
            return duration;
        } catch (error) {
            console.error(`[PERF] Engine load failed: ${error.message}`);
            this.results.engineLoading[engineType] = {
                duration: -1,
                passed: false,
                error: error.message
            };
            throw error;
        }
    }

    /**
     * Test engine transition performance
     */
    async testEngineTransition(fromEngine, toEngine, playerState) {
        console.log(`[PERF] Testing ${fromEngine} → ${toEngine} transition...`);
        const startTime = performance.now();
        
        try {
            // Serialize state from source engine
            const serializeStart = performance.now();
            const serializedState = CrossEngineSerializer.serializePlayerState(playerState);
            const serializeDuration = performance.now() - serializeStart;
            
            // Unload source engine (simulated)
            const unloadStart = performance.now();
            await this._simulateEngineUnload(fromEngine);
            const unloadDuration = performance.now() - unloadStart;
            
            // Load target engine (simulated)
            const loadStart = performance.now();
            await this._simulateEngineLoad(toEngine);
            const loadDuration = performance.now() - loadStart;
            
            // Deserialize state into target engine
            const deserializeStart = performance.now();
            CrossEngineSerializer.deserializePlayerState(serializedState, {});
            const deserializeDuration = performance.now() - deserializeStart;
            
            const totalDuration = performance.now() - startTime;
            
            this.results.transitions[`${fromEngine}_to_${toEngine}`] = {
                totalDuration: totalDuration,
                serializeDuration: serializeDuration,
                unloadDuration: unloadDuration,
                loadDuration: loadDuration,
                deserializeDuration: deserializeDuration,
                passed: totalDuration < this.thresholds.transition,
                timestamp: new Date().toISOString()
            };
            
            console.log(`[PERF] Transition completed in ${totalDuration.toFixed(2)}ms`);
            console.log(`  - Serialize: ${serializeDuration.toFixed(2)}ms`);
            console.log(`  - Unload: ${unloadDuration.toFixed(2)}ms`);
            console.log(`  - Load: ${loadDuration.toFixed(2)}ms`);
            console.log(`  - Deserialize: ${deserializeDuration.toFixed(2)}ms`);
            
            return totalDuration;
        } catch (error) {
            console.error(`[PERF] Transition failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Test serialization performance
     */
    testSerializationPerformance(playerState, iterations = 100) {
        console.log(`[PERF] Testing serialization performance (${iterations} iterations)...`);
        
        const serializeTimes = [];
        const deserializeTimes = [];
        
        for (let i = 0; i < iterations; i++) {
            // Test serialization
            const serializeStart = performance.now();
            const serialized = CrossEngineSerializer.serializePlayerState(playerState);
            serializeTimes.push(performance.now() - serializeStart);
            
            // Test deserialization
            const deserializeStart = performance.now();
            CrossEngineSerializer.deserializePlayerState(serialized, {});
            deserializeTimes.push(performance.now() - deserializeStart);
        }
        
        const avgSerialize = serializeTimes.reduce((a, b) => a + b, 0) / iterations;
        const avgDeserialize = deserializeTimes.reduce((a, b) => a + b, 0) / iterations;
        const maxSerialize = Math.max(...serializeTimes);
        const maxDeserialize = Math.max(...deserializeTimes);
        
        this.results.serialization = {
            avgSerialize: avgSerialize,
            avgDeserialize: avgDeserialize,
            maxSerialize: maxSerialize,
            maxDeserialize: maxDeserialize,
            passed: avgSerialize < this.thresholds.serialization && 
                   avgDeserialize < this.thresholds.serialization,
            timestamp: new Date().toISOString()
        };
        
        console.log(`[PERF] Serialization avg: ${avgSerialize.toFixed(2)}ms (max: ${maxSerialize.toFixed(2)}ms)`);
        console.log(`[PERF] Deserialization avg: ${avgDeserialize.toFixed(2)}ms (max: ${maxDeserialize.toFixed(2)}ms)`);
        
        return { avgSerialize, avgDeserialize };
    }

    /**
     * Test node processing performance
     */
    async testNodeProcessing(controller, nodeTypes) {
        console.log(`[PERF] Testing node processing performance...`);
        
        for (const nodeType of nodeTypes) {
            const node = this._createTestNode(nodeType);
            const startTime = performance.now();
            
            try {
                await controller.processNode(node);
                const duration = performance.now() - startTime;
                
                this.results.nodeProcessing[nodeType] = {
                    duration: duration,
                    passed: duration < this.thresholds.nodeProcessing,
                    timestamp: new Date().toISOString()
                };
                
                console.log(`[PERF] ${nodeType} node processed in ${duration.toFixed(2)}ms`);
            } catch (error) {
                this.results.nodeProcessing[nodeType] = {
                    duration: -1,
                    passed: false,
                    error: error.message
                };
                console.error(`[PERF] ${nodeType} processing failed: ${error.message}`);
            }
        }
    }

    /**
     * Test memory usage during campaign
     */
    testMemoryUsage() {
        if (performance.memory) {
            const usage = {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                usagePercent: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit * 100).toFixed(2)
            };
            
            console.log(`[PERF] Memory Usage: ${(usage.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB / ${(usage.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB (${usage.usagePercent}%)`);
            
            this.results.memory = usage;
            return usage;
        } else {
            console.warn('[PERF] Memory API not available');
            return null;
        }
    }

    /**
     * Generate performance report
     */
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests: 0,
                passed: 0,
                failed: 0
            },
            details: this.results,
            recommendations: []
        };

        // Count results
        const allResults = [
            ...Object.values(this.results.engineLoading),
            ...Object.values(this.results.transitions),
            ...Object.values(this.results.nodeProcessing)
        ];
        
        if (this.results.serialization.passed !== undefined) {
            allResults.push(this.results.serialization);
        }
        
        report.summary.totalTests = allResults.length;
        report.summary.passed = allResults.filter(r => r.passed).length;
        report.summary.failed = allResults.filter(r => !r.passed).length;

        // Generate recommendations
        if (this.results.engineLoading) {
            Object.entries(this.results.engineLoading).forEach(([engine, result]) => {
                if (!result.passed) {
                    report.recommendations.push(
                        `⚠️ ${engine} engine loading exceeds ${this.thresholds.engineLoad}ms threshold (${result.duration.toFixed(2)}ms). Consider optimizing asset loading.`
                    );
                }
            });
        }

        if (this.results.transitions) {
            Object.entries(this.results.transitions).forEach(([transition, result]) => {
                if (!result.passed) {
                    report.recommendations.push(
                        `⚠️ ${transition} transition exceeds ${this.thresholds.transition}ms threshold (${result.totalDuration.toFixed(2)}ms). Consider caching or preloading.`
                    );
                }
            });
        }

        if (this.results.serialization && !this.results.serialization.passed) {
            report.recommendations.push(
                `⚠️ Serialization performance issue detected. Avg: ${this.results.serialization.avgSerialize.toFixed(2)}ms. Consider reducing state complexity.`
            );
        }

        if (report.recommendations.length === 0) {
            report.recommendations.push('✅ All performance tests passed! Campaign Studio is running efficiently.');
        }

        return report;
    }

    /**
     * Export results to JSON
     */
    exportResults() {
        const report = this.generateReport();
        const json = JSON.stringify(report, null, 2);
        
        // Create downloadable file
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `campaign_performance_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log('[PERF] Results exported');
    }

    // Helper methods
    _createAdapter(engineType) {
        // Return mock adapter for testing
        return {
            initialize: async (worldData) => {
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
            }
        };
    }

    _simulateEngineUnload(engineType) {
        return new Promise(resolve => setTimeout(resolve, Math.random() * 500));
    }

    _simulateEngineLoad(engineType) {
        return new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
    }

    _createTestNode(nodeType) {
        const baseNode = {
            id: `test_${nodeType}`,
            type: nodeType,
            x: 0,
            y: 0
        };

        switch (nodeType) {
            case 'level':
                return { ...baseNode, engineType: 'rpg-topdown', world: 'test_world', spawnPoint: { x: 0, y: 0 } };
            case 'mini-game':
                return { ...baseNode, engineType: 'platformer-2d', world: 'mini_game', gameType: 'challenge', timeLimit: 60 };
            case 'hub':
                return { ...baseNode, engineType: 'rpg-topdown', world: 'hub', healPlayer: true, exits: [] };
            case 'boss-rush':
                return { ...baseNode, engineType: 'rpg-topdown', bosses: [{ world: 'boss1', bossName: 'Test Boss' }] };
            case 'challenge-mode':
                return { ...baseNode, engineType: 'platformer-2d', world: 'challenge', challengeType: 'time_trial', timeLimit: 120 };
            case 'exploration':
                return { ...baseNode, engineType: 'iso-pixel', world: 'exploration', objectives: ['Find item'] };
            default:
                return baseNode;
        }
    }
}

// Auto-run tests if in test environment
if (typeof window !== 'undefined' && window.location.pathname.includes('campaign_test')) {
    window.CampaignPerformanceTester = CampaignPerformanceTester;
    console.log('[PERF] Performance Tester loaded and ready');
}

// Export for Node.js if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CampaignPerformanceTester;
}
