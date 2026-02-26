/**
 * Ongonluk Engine - Asset Manager
 * Unified asset management and dependency tracking
 */
class AssetManager {
    constructor() {
        this.assets = new Map();
        this.dependencies = new Map();
        this.cache = new Map();
        this.watchers = new Set();
        this.eventBus = null;
        
        if (typeof window !== 'undefined' && window.KetebeEventBus) {
            this.eventBus = window.KetebeEventBus;
            this.setupEventListeners();
        }
        
        this.init();
    }

    async init() {
        // Load asset registry
        await this.loadAssetRegistry();
        
        // Build initial dependency graph
        this.rebuildDependencyGraph();
        
        // Start watching for file changes if EventBus is available
        if (this.eventBus) {
            this.eventBus.on('file:*', (event) => {
                this.handleFileEvent(event);
            });
        }
    }

    /**
     * Rebuild the entire dependency graph by scanning all assets
     */
    rebuildDependencyGraph() {
        console.log('[AssetManager] Rebuilding dependency graph...');
        for (const [id, asset] of this.assets.entries()) {
            if (asset.type === 'data' || asset.type === 'json') {
                this.scanForDependencies(id);
            }
        }
    }

    /**
     * Scan a specific asset for references to other assets
     */
    async scanForDependencies(id) {
        const asset = this.assets.get(id);
        if (!asset) return;

        try {
            const content = await this.loadAsset(id);
            const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
            const foundDeps = [];

            // Simple heuristic: look for strings that match other asset paths or IDs
            for (const [otherId, otherAsset] of this.assets.entries()) {
                if (otherId === id) continue;
                
                if (contentStr.includes(otherId) || contentStr.includes(otherAsset.path)) {
                    foundDeps.push(otherId);
                }
            }

            if (foundDeps.length > 0) {
                this.updateDependencies(id, foundDeps);
            }
        } catch (e) {
            // Asset might not be loaded yet or not stringifiable
        }
    }

    /**
     * Generate a thumbnail for an image asset
     */
    async generateThumbnail(id) {
        const asset = this.assets.get(id);
        if (!asset || asset.type !== 'image') return null;

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Thumbnail size 64x64
                canvas.width = 64;
                canvas.height = 64;
                
                const scale = Math.min(64 / img.width, 64 / img.height);
                const x = (64 - img.width * scale) / 2;
                const y = (64 - img.height * scale) / 2;
                
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                
                const thumbnailData = canvas.toDataURL('image/png');
                asset.metadata.thumbnail = thumbnailData;
                
                if (this.eventBus) {
                    this.eventBus.emit('asset:thumbnail:generated', { id, thumbnail: thumbnailData });
                }
                
                resolve(thumbnailData);
            };
            img.onerror = () => resolve(null);
            img.src = asset.path;
        });
    }

    /**
     * Import an asset from a file object (e.g. from an <input type="file">)
     */
    async importAsset(file, targetPath) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', targetPath);

        try {
            const response = await fetch('/api/assets/import', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                this.registerAsset(result.asset);
                
                if (result.asset.type === 'image') {
                    await this.generateThumbnail(result.asset.id);
                }
                
                return result.asset;
            }
        } catch (error) {
            console.error('[AssetManager] Import failed:', error);
            throw error;
        }
    }

    /**
     * Export project assets as a ZIP or bundle (Integration with build system)
     */
    async exportAssets(options = {}) {
        // Implementation would call a backend endpoint to bundle assets
        const response = await fetch('/api/assets/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        
        if (response.ok) {
            return await response.blob();
        }
        throw new Error('Export failed');
    }

    setupEventListeners() {
        // Listen for asset-related events
        this.eventBus.on('asset:request', (event) => {
            this.handleAssetRequest(event);
        });
        
        this.eventBus.on('asset:register', (event) => {
            this.registerAsset(event.data);
        });
        
        this.eventBus.on('project:*', (event) => {
            if (event.type === 'project:loaded' || event.type === 'project:switch') {
                this.loadAssetRegistry();
            }
        });
    }

    /**
     * Register an asset in the system
     */
    registerAsset(assetData) {
        const {
            id,
            name,
            path: rawPath,
            type,
            metadata = {},
            dependencies = []
        } = assetData;

        // Fix path: strip 'projects/Name/' prefix to use virtual server routes
        let assetPath = rawPath;
        if (assetPath && assetPath.startsWith('projects/')) {
            const parts = assetPath.split('/');
            // Expected: projects/ProjectName/folder/...
            if (parts.length > 2) {
                const folder = parts[2];
                if (['dunyalar', 'muzikler', 'assets'].includes(folder)) {
                    assetPath = parts.slice(2).join('/');
                }
            }
        }

        const asset = {
            id,
            name,
            path: assetPath,
            type,
            metadata: {
                ...metadata,
                registered: Date.now(),
                lastAccessed: null
            },
            dependencies,
            status: 'registered'
        };

        this.assets.set(id, asset);
        
        // Update dependency graph
        this.updateDependencies(id, dependencies);
        
        // Emit registration event
        if (this.eventBus) {
            this.eventBus.emit('asset:registered', {
                asset,
                timestamp: Date.now()
            });
        }
        
        console.log(`[AssetManager] Registered asset: ${id}`);
        return asset;
    }

    /**
     * Load an asset (with caching)
     */
    async loadAsset(id, options = {}) {
        const asset = this.assets.get(id);
        if (!asset) {
            throw new Error(`Asset not found: ${id}`);
        }

        // Check cache first
        if (!options.force && this.cache.has(id)) {
            const cached = this.cache.get(id);
            if (Date.now() - cached.timestamp < (options.maxAge || 300000)) { // 5 min default
                asset.metadata.lastAccessed = Date.now();
                return cached.data;
            }
        }

        try {
            asset.status = 'loading';
            
            let data;
            switch (asset.type) {
                case 'image':
                    data = await this.loadImage(asset.path);
                    break;
                case 'audio':
                    data = await this.loadAudio(asset.path);
                    break;
                case 'json':
                    data = await this.loadJSON(asset.path);
                    break;
                case 'text':
                case 'js':
                    data = await this.loadText(asset.path);
                    break;
                default:
                    data = await this.loadGeneric(asset.path);
            }

            // Cache the result
            this.cache.set(id, {
                data,
                timestamp: Date.now()
            });

            asset.status = 'loaded';
            asset.metadata.lastAccessed = Date.now();
            asset.metadata.loadCount = (asset.metadata.loadCount || 0) + 1;

            // Emit load event
            if (this.eventBus) {
                this.eventBus.emit('asset:loaded', {
                    asset,
                    data,
                    timestamp: Date.now()
                });
            }

            return data;
        } catch (error) {
            asset.status = 'error';
            asset.metadata.lastError = error.message;
            
            if (this.eventBus) {
                this.eventBus.emit('asset:error', {
                    asset,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
            
            throw error;
        }
    }

    /**
     * Preload assets and their dependencies
     */
    async preloadAsset(id, options = {}) {
        const asset = this.assets.get(id);
        if (!asset) {
            throw new Error(`Asset not found: ${id}`);
        }

        const loaded = [];
        const errors = [];

        // Load the main asset
        try {
            await this.loadAsset(id, options);
            loaded.push(id);
        } catch (error) {
            errors.push({ id, error: error.message });
        }

        // Load dependencies if requested
        if (options.includeDependencies && asset.dependencies.length > 0) {
            for (const depId of asset.dependencies) {
                try {
                    await this.loadAsset(depId, options);
                    loaded.push(depId);
                } catch (error) {
                    errors.push({ id: depId, error: error.message });
                }
            }
        }

        return { loaded, errors };
    }

    /**
     * Get asset information
     */
    getAssetInfo(id) {
        return this.assets.get(id);
    }

    /**
     * Get all assets of a specific type
     */
    getAssetsByType(type) {
        return Array.from(this.assets.values()).filter(asset => asset.type === type);
    }

    /**
     * Get asset dependencies
     */
    getDependencies(id, recursive = false) {
        const asset = this.assets.get(id);
        if (!asset) return [];

        if (!recursive) {
            return asset.dependencies.slice();
        }

        // Get recursive dependencies
        const allDeps = new Set();
        const visited = new Set();

        const collectDeps = (assetId) => {
            if (visited.has(assetId)) return;
            visited.add(assetId);

            const assetData = this.assets.get(assetId);
            if (assetData) {
                for (const depId of assetData.dependencies) {
                    allDeps.add(depId);
                    collectDeps(depId);
                }
            }
        };

        collectDeps(id);
        return Array.from(allDeps);
    }

    /**
     * Get assets that depend on this asset
     */
    getDependents(id) {
        const dependents = [];
        for (const [assetId, asset] of this.assets.entries()) {
            if (asset.dependencies.includes(id)) {
                dependents.push(assetId);
            }
        }
        return dependents;
    }

    /**
     * Update asset dependencies
     */
    updateDependencies(id, dependencies) {
        const asset = this.assets.get(id);
        if (asset) {
            asset.dependencies = dependencies.slice();
            
            // Update reverse dependency map
            this.dependencies.set(id, new Set(dependencies));
            
            if (this.eventBus) {
                this.eventBus.emit('asset:dependencies:updated', {
                    assetId: id,
                    dependencies,
                    timestamp: Date.now()
                });
            }
        }
    }

    /**
     * Remove asset from registry
     */
    removeAsset(id) {
        const asset = this.assets.get(id);
        if (!asset) return false;

        // Remove from cache
        this.cache.delete(id);
        
        // Remove from registry
        this.assets.delete(id);
        
        // Remove from dependencies
        this.dependencies.delete(id);
        
        // Remove this asset from other assets' dependencies
        for (const [, otherAsset] of this.assets.entries()) {
            const index = otherAsset.dependencies.indexOf(id);
            if (index !== -1) {
                otherAsset.dependencies.splice(index, 1);
            }
        }

        if (this.eventBus) {
            this.eventBus.emit('asset:removed', {
                asset,
                timestamp: Date.now()
            });
        }

        console.log(`[AssetManager] Removed asset: ${id}`);
        return true;
    }

    /**
     * Clear cache
     */
    clearCache(filter = null) {
        if (!filter) {
            this.cache.clear();
            console.log('[AssetManager] Cache cleared');
            return;
        }

        for (const [id, cached] of this.cache.entries()) {
            if (filter(id, cached)) {
                this.cache.delete(id);
            }
        }
        
        console.log('[AssetManager] Cache partially cleared');
    }

    /**
     * Load asset registry from server
     */
    async loadAssetRegistry() {
        try {
            const response = await fetch(`/api/assets?t=${Date.now()}`);
            if (response.ok) {
                const data = await response.json();
                
                // Clear existing assets
                this.assets.clear();
                
                // Register all assets
                const assetList = (data && data.assets) ? data.assets : (Array.isArray(data) ? data : null);
                
                if (assetList && Array.isArray(assetList)) {
                    for (const assetData of assetList) {
                        this.registerAsset(assetData);
                    }
                    console.log(`[AssetManager] Loaded ${assetList.length} assets from registry`);
                } else {
                    console.warn('[AssetManager] Received invalid or empty asset data from server:', data);
                }
            }
        } catch (error) {
            console.error('[AssetManager] Critical failure loading asset registry:', error);
        }
    }

    /**
     * Handle file system events
     */
    handleFileEvent(event) {
        const { type, data } = event;
        const { path: filePath } = data;
        
        // Find assets that match this file path
        const affectedAssets = Array.from(this.assets.values())
            .filter(asset => asset.path.includes(filePath));
        
        switch (type) {
            case 'file:changed':
                affectedAssets.forEach(asset => {
                    // Invalidate cache
                    this.cache.delete(asset.id);
                    asset.status = 'modified';
                    
                    if (this.eventBus) {
                        this.eventBus.emit('asset:modified', {
                            asset,
                            timestamp: Date.now()
                        });
                    }
                });
                break;
                
            case 'file:deleted':
                affectedAssets.forEach(asset => {
                    asset.status = 'missing';
                    this.cache.delete(asset.id);
                    
                    if (this.eventBus) {
                        this.eventBus.emit('asset:missing', {
                            asset,
                            timestamp: Date.now()
                        });
                    }
                });
                break;
        }
    }

    /**
     * Handle asset requests from other components
     */
    async handleAssetRequest(event) {
        const { data } = event;
        const { id, options = {}, callback } = data;
        
        try {
            const assetData = await this.loadAsset(id, options);
            
            if (callback && this.eventBus) {
                this.eventBus.emit(callback, {
                    success: true,
                    id,
                    data: assetData,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            if (callback && this.eventBus) {
                this.eventBus.emit(callback, {
                    success: false,
                    id,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
    }

    // Asset loaders for different types
    async loadImage(path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
            img.src = path;
        });
    }

    async loadAudio(path) {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.oncanplaythrough = () => resolve(audio);
            audio.onerror = () => reject(new Error(`Failed to load audio: ${path}`));
            audio.src = path;
        });
    }

    async loadJSON(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load JSON: ${path}`);
        }
        return await response.json();
    }

    async loadText(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load text: ${path}`);
        }
        return await response.text();
    }

    async loadGeneric(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load asset: ${path}`);
        }
        return response;
    }

    /**
     * Get manager statistics
     */
    getStats() {
        return {
            totalAssets: this.assets.size,
            cachedAssets: this.cache.size,
            assetsByType: this.getAssetsByType(),
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    getAssetsByType() {
        const types = {};
        for (const asset of this.assets.values()) {
            types[asset.type] = (types[asset.type] || 0) + 1;
        }
        return types;
    }

    estimateMemoryUsage() {
        // Simple estimation based on cache size
        return this.cache.size * 1024; // Very rough estimate
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.KetebeAssetManager = window.KetebeAssetManager || new AssetManager();
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AssetManager;
}