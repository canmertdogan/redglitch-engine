/**
 * PlatformerAssetManager.js
 * Dedicated asset management for the 2D Platformer Engine.
 * Handles pre-loading of spritesheets, tilesets, and audio.
 */

class PlatformerAssetManager {
    constructor() {
        this.assets = new Map();
        this.isLoaded = false;
        this.onProgress = null;
        this.onComplete = null;
        
        const v = Date.now();
        this.manifest = {
            images: [
                { id: 'tileset', path: `/sprite-art/platformer_spritesheet.png?v=${v}` },
                { id: 'bg_forest', path: '/sprite-art/forest_background.jpg' }
            ],
            json: [
                { id: 'atlas', path: '/sprite-art/platformer_atlas.json' }
            ],
            audio: [
                // Add jump, coin, etc. here later
            ]
        };
    }

    async load() {
        console.log('[PlatformerAssetManager] Starting pre-load...');
        const total = this.manifest.images.length + this.manifest.json.length + this.manifest.audio.length;
        let loaded = 0;

        const updateProgress = () => {
            loaded++;
            if (this.onProgress) this.onProgress(loaded / total);
        };

        const promises = [
            ...this.manifest.images.map(img => this.loadImage(img.id, img.path).then(updateProgress)),
            ...this.manifest.json.map(js => this.loadJSON(js.id, js.path).then(updateProgress)),
            ...this.manifest.audio.map(aud => this.loadAudio(aud.id, aud.path).then(updateProgress))
        ];

        try {
            await Promise.all(promises);
            this.isLoaded = true;
            console.log('[PlatformerAssetManager] Pre-load complete.');
            if (this.onComplete) this.onComplete();
        } catch (error) {
            console.error('[PlatformerAssetManager] Pre-load failed:', error);
            // We still mark as "loaded" to allow the game to try and run with fallbacks
            this.isLoaded = true;
            if (this.onComplete) this.onComplete();
        }
    }

    async loadImage(id, path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.assets.set(id, img);
                resolve(img);
            };
            img.onerror = () => {
                console.warn(`[PlatformerAssetManager] Failed to load image: ${path}. Using fallback.`);
                // We don't reject so the entire pre-load doesn't fail
                resolve(null);
            };
            img.src = path;
        });
    }

    async loadJSON(id, path) {
        try {
            const response = await fetch(path);
            if (response.ok) {
                const data = await response.json();
                this.assets.set(id, data);
                return data;
            }
            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            console.warn(`[PlatformerAssetManager] Failed to load JSON: ${path}.`);
            return null;
        }
    }

    async loadAudio(id, path) {
        // Implementation for audio pre-loading if needed
        return Promise.resolve();
    }

    get(id) {
        return this.assets.get(id);
    }
}

window.PlatformerAssetManager = new PlatformerAssetManager();
