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

