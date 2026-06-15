/**
 * EngineAdapter (legacy script build)
 * Classic-script compatible adapter base for pages that load adapters via <script src>.
 */
class EngineAdapter {
    constructor(engineType) {
        if (new.target === EngineAdapter) {
            throw new TypeError('Cannot construct EngineAdapter instances directly');
        }

        this.engineType = engineType;
        this.engine = null;
        this.isInitialized = false;
        this.isLoaded = false;
        this.levelCompleteCallback = null;
        this.stateChangeCallback = null;
        this.campaignController = null;
    }

    setCampaignController(controller) {
        this.campaignController = controller;
    }

    /**
     * Setup the Live Memory Bridge to receive component patches
     */
    setupLiveBridge() {
        if (typeof window !== 'undefined' && window.RedGlitchEventBus) {
            // Remove existing listener if any to avoid duplicates
            if (this._entityPatchListener) {
                window.RedGlitchEventBus.off('system:entity:patch', this._entityPatchListener);
            }
            
            this._entityPatchListener = (event) => {
                const { entityId, components } = event.data || {};
                if (entityId && components) {
                    const entity = this.findEntityById(entityId);
                    if (entity) {
                        if (window.CrossEngineSerializer) {
                            window.CrossEngineSerializer.deserializeEntityComponents(entity, components, this.engineType);
                            console.log(`[EngineAdapter] Applied live patch to entity ${entityId}`);
                        }
                    }
                }
            };
            
            window.RedGlitchEventBus.on('system:entity:patch', this._entityPatchListener);

            // Phase 6: Dynamic Script Injection
            if (this._scriptUpdateListener) {
                window.RedGlitchEventBus.off('system:script:update', this._scriptUpdateListener);
            }
            this._scriptUpdateListener = async (event) => {
                const { scriptId } = event.data || {};
                if (scriptId) {
                    if (this.engine && this.engine.logicSystem && typeof this.engine.logicSystem.reloadAlgorithm === 'function') {
                        await this.engine.logicSystem.reloadAlgorithm(scriptId);
                    }
                }
            };
            window.RedGlitchEventBus.on('system:script:update', this._scriptUpdateListener);

            // Phase 18: Hot-Reload Dependency Resolution (Prefab Updates)
            if (this._prefabUpdateListener) {
                window.RedGlitchEventBus.off('system:prefab:update', this._prefabUpdateListener);
            }
            this._prefabUpdateListener = async (event) => {
                const { prefabId } = event.data || {};
                if (prefabId) {
                    try {
                        const res = await fetch(`/api/ide/read?file=dunyalar/definitions/${prefabId}.json`);
                        if (res.ok) {
                            const prefabText = await res.text();
                            const prefabData = JSON.parse(prefabText);
                            const entities = this.findEntitiesByPrefabId(prefabId);
                            
                            if (entities && entities.length > 0 && window.CrossEngineSerializer) {
                                for (const entity of entities) {
                                    window.CrossEngineSerializer.deserializeEntityComponents(entity, prefabData.components, this.engineType);
                                    
                                    // Update sprite if changed
                                    if (prefabData.sprite && typeof entity.setSprite === 'function') {
                                        entity.setSprite(prefabData.sprite);
                                    } else if (prefabData.sprite && entity.def && entity.def.animations) {
                                        if (entity.def.animations.idle) entity.def.animations.idle.sprite = prefabData.sprite;
                                        if (entity.sprites && entity.sprites.idle) {
                                            entity.sprites.idle = window.createPixelImage(prefabData.sprite);
                                        }
                                    }
                                }
                                console.log(`[EngineAdapter] Applied live patch to ${entities.length} entities of prefab: ${prefabId}`);
                            }
                        }
                    } catch (err) {
                        console.error(`[EngineAdapter] Failed to hot-reload prefab ${prefabId}:`, err);
                    }
                }
            };
            window.RedGlitchEventBus.on('system:prefab:update', this._prefabUpdateListener);

            // Phase 1: Sprite Hot-Reloading via AssetManager
            if (this._assetModifiedListener) {
                window.RedGlitchEventBus.off('asset:modified', this._assetModifiedListener);
            }
            this._assetModifiedListener = async (event) => {
                const { asset } = event.data || {};
                if (asset && asset.path && asset.path.includes('sprites/')) {
                    const spriteName = asset.name.split('.')[0];
                    try {
                        const res = await fetch(`/api/ide/read?file=${asset.path}&isBase64=true`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.content) {
                                if (!window.SPRITES) window.SPRITES = {};
                                const dataUrl = `data:image/png;base64,${data.content}`;
                                window.SPRITES[spriteName] = dataUrl;
                                
                                if (this.engine && this.engine.entities) {
                                    this.engine.entities.forEach(entity => {
                                        if (entity.spriteName === spriteName && typeof entity.setSprite === 'function') {
                                            entity.setSprite(spriteName);
                                        } else if (entity.def && entity.def.animations) {
                                            if (entity.sprites) {
                                                Object.keys(entity.def.animations).forEach(anim => {
                                                    if (entity.def.animations[anim].sprite === spriteName) {
                                                        if (typeof window.createPixelImage === 'function') {
                                                            entity.sprites[anim] = window.createPixelImage(spriteName);
                                                        }
                                                    }
                                                });
                                            }
                                        }
                                    });
                                }
                                console.log(`[EngineAdapter] Hot-reloaded sprite: ${spriteName}`);
                            }
                        }
                    } catch (err) {
                        console.error(`[EngineAdapter] Failed to hot-reload sprite ${spriteName}:`, err);
                    }
                }
            };
            window.RedGlitchEventBus.on('asset:modified', this._assetModifiedListener);

            // Phase 13 & 14: Live Engine Inspection & Metrics
            if (this._engineInspectListener) {
                window.RedGlitchEventBus.off('system:engine:inspect', this._engineInspectListener);
            }
            this._engineInspectListener = () => {
                if (!this.engine) return;
                
                const metrics = {
                    engineType: this.engineType,
                    fps: this.engine.fps || 0,
                    drawCalls: this.engine.drawCalls || 0,
                    entityCount: this.engine.entities ? this.engine.entities.length : 0,
                    logicNodesFired: this.engine.logicSystem ? this.engine.logicSystem.nodesFired : 0,
                    activeChunks: this.engine.chunks ? this.engine.chunks.size : 0,
                    timestamp: Date.now()
                };
                
                window.RedGlitchEventBus.emit('system:engine:inspect:response', { metrics });
            };
            window.RedGlitchEventBus.on('system:engine:inspect', this._engineInspectListener);

            if (this._metricsInterval) clearInterval(this._metricsInterval);
            this._metricsInterval = setInterval(() => {
                if (this.engine) {
                    const metrics = {
                        engineType: this.engineType,
                        fps: this.engine.fps || 0,
                        drawCalls: this.engine.drawCalls || 0,
                        entityCount: this.engine.entities ? this.engine.entities.length : 0,
                        memoryMB: window.performance && window.performance.memory ? Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024)) : 0
                    };
                    window.RedGlitchEventBus.emit('system:engine:metrics', { metrics });
                }
            }, 1000);
            
            // Phase 15: Ghost Mode Observer Camera
            if (this._cameraModeListener) {
                window.RedGlitchEventBus.off('system:camera:mode', this._cameraModeListener);
            }
            this._cameraModeListener = (event) => {
                const { mode } = event.data || {};
                if (this.engine) {
                    this.engine.ghostMode = (mode === 'ghost');
                    console.log(`[EngineAdapter] Ghost mode set to: ${this.engine.ghostMode}`);
                }
            };
            window.RedGlitchEventBus.on('system:camera:mode', this._cameraModeListener);

            // Phase 16: Time Dilation & Frame Stepping
            if (this._timeScaleListener) {
                window.RedGlitchEventBus.off('system:engine:timeScale', this._timeScaleListener);
            }
            this._timeScaleListener = (event) => {
                const { scale } = event.data || {};
                if (this.engine && scale !== undefined) {
                    this.engine.timeScale = scale;
                    console.log(`[EngineAdapter] Time scale set to: ${scale}`);
                }
            };
            window.RedGlitchEventBus.on('system:engine:timeScale', this._timeScaleListener);

            if (this._stepFrameListener) {
                window.RedGlitchEventBus.off('system:engine:stepFrame', this._stepFrameListener);
            }
            this._stepFrameListener = () => {
                if (this.engine && typeof this.engine.stepFrame === 'function') {
                    this.engine.stepFrame();
                } else if (this.engine && typeof this.engine.update === 'function') {
                    this.engine.update(16);
                }
            };
            window.RedGlitchEventBus.on('system:engine:stepFrame', this._stepFrameListener);

            // Phase 20: QA Stress Test
            if (this._stressTestListener) {
                window.RedGlitchEventBus.off('debug:spawn_stress_test', this._stressTestListener);
            }
            this._stressTestListener = (event) => {
                const { amount = 500 } = event.data || {};
                if (this.engine && typeof this.engine.spawnEntity === 'function') {
                    for (let i = 0; i < amount; i++) {
                        const x = Math.random() * 800;
                        const y = Math.random() * 600;
                        if (this.engineType === 'iso-pixel') {
                            this.engine.spawnEntity({ type: 'prop', x, y, width: 32, height: 32, name: `Stress_${i}` });
                        } else if (this.engineType === 'top-down') {
                            this.engine.spawnEntity({ type: 'prop', position: { x, y }, width: 32, height: 32, name: `Stress_${i}` });
                        } else {
                            this.engine.spawnEntity({ id: `stress_${i}`, x, y });
                        }
                    }
                    console.warn(`[EngineAdapter] Spawned ${amount} stress test entities!`);
                }
            };
            window.RedGlitchEventBus.on('debug:spawn_stress_test', this._stressTestListener);
        }
    }

    setVariable(key, value) {
        if (this.campaignController) {
            this.campaignController.setVariable(key, value);
        } else {
            console.warn('[EngineAdapter] No CampaignController linked, variable not saved:', key);
        }
    }

    getVariable(key) {
        if (this.campaignController) {
            return this.campaignController.getVariable(key);
        }
        return 0;
    }

    async initialize() {
        throw new Error('initialize() must be implemented by subclass');
    }

    async loadLevel(levelId, levelPath = null) { // eslint-disable-line no-unused-vars
        throw new Error('loadLevel() must be implemented by subclass');
    }

    async unloadLevel() {
        throw new Error('unloadLevel() must be implemented by subclass');
    }

    getState() {
        throw new Error('getState() must be implemented by subclass');
    }

    async setState(state) { // eslint-disable-line no-unused-vars
        throw new Error('setState() must be implemented by subclass');
    }

    start() {
        throw new Error('start() must be implemented by subclass');
    }

    stop() {
        throw new Error('stop() must be implemented by subclass');
    }

    pause() {
        throw new Error('pause() must be implemented by subclass');
    }

    resume() {
        throw new Error('resume() must be implemented by subclass');
    }

    destroy() {
        if (this._metricsInterval) {
            clearInterval(this._metricsInterval);
            this._metricsInterval = null;
        }

        if (window.RedGlitchEventBus) {
            if (this._entityPatchListener) window.RedGlitchEventBus.off('system:entity:patch', this._entityPatchListener);
            if (this._scriptUpdateListener) window.RedGlitchEventBus.off('system:script:update', this._scriptUpdateListener);
            if (this._prefabUpdateListener) window.RedGlitchEventBus.off('system:prefab:update', this._prefabUpdateListener);
            if (this._engineInspectListener) window.RedGlitchEventBus.off('system:engine:inspect', this._engineInspectListener);
            if (this._cameraModeListener) window.RedGlitchEventBus.off('system:camera:mode', this._cameraModeListener);
            if (this._timeScaleListener) window.RedGlitchEventBus.off('system:engine:timeScale', this._timeScaleListener);
            if (this._stepFrameListener) window.RedGlitchEventBus.off('system:engine:stepFrame', this._stepFrameListener);
            if (this._stressTestListener) window.RedGlitchEventBus.off('debug:spawn_stress_test', this._stressTestListener);
        }

        if (window.RedGlitchAssetManager && typeof window.RedGlitchAssetManager.purgeCache === 'function') {
            window.RedGlitchAssetManager.purgeCache();
        }

        if (this.engine) {
            this.stop();
            this.engine = null;
        }
        this.isInitialized = false;
        this.isLoaded = false;
        this.levelCompleteCallback = null;
        this.stateChangeCallback = null;
    }

    onLevelComplete(callback) {
        this.levelCompleteCallback = callback;
    }

    onStateChange(callback) {
        this.stateChangeCallback = callback;
    }

    getPlayerData() {
        throw new Error('getPlayerData() must be implemented by subclass');
    }

    setPlayerData(playerData) { // eslint-disable-line no-unused-vars
        throw new Error('setPlayerData() must be implemented by subclass');
    }

    getMetadata() {
        return {
            engineType: this.engineType,
            isInitialized: this.isInitialized,
            isLoaded: this.isLoaded,
        };
    }

    resize() {
        if (this.engine && this.engine.resize) {
            this.engine.resize();
        }
    }

    _triggerLevelComplete(completionData = {}) {
        console.log(`[EngineAdapter:${this.engineType}] Triggering level complete. Callback exists: ${!!this.levelCompleteCallback}`);
        if (this.levelCompleteCallback) {
            try {
                this.levelCompleteCallback({
                    engineType: this.engineType,
                    ...completionData,
                });
                console.log(`[EngineAdapter:${this.engineType}] Callback executed successfully.`);
            } catch (e) {
                console.error(`[EngineAdapter:${this.engineType}] Error in level complete callback:`, e);
            }
        } else {
            console.warn(`[EngineAdapter:${this.engineType}] No level complete callback registered!`);
        }
    }

    _triggerStateChange(stateData = {}) {
        if (this.stateChangeCallback) {
            this.stateChangeCallback({
                engineType: this.engineType,
                ...stateData,
            });
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EngineAdapter;
}

if (typeof window !== 'undefined') {
    window.EngineAdapter = EngineAdapter;
}

