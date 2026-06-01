/**
 * RedGlitch Engine - Shared Project State Management
 * Provides centralized state management across all editors
 */
class SharedProjectState {
    constructor(projectName = null) {
        this.projectName = projectName;
        this.state = {};
        this.metadata = {};
        this.listeners = new Map();
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;
        this.autoSaveInterval = null;
        this.isDirty = false;
        
        // Subscribe to EventBus if available
        if (typeof window !== 'undefined' && window.RedGlitchEventBus) {
            this.eventBus = window.RedGlitchEventBus;
            this.setupEventListeners();
        }
        
        this.ready = this.init();
    }

    async init() {
        if (this.projectName) {
            await this.loadProject();
        }
        
        // Start auto-save
        this.startAutoSave();
        
        // Listen for window unload to save safely
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                if (this.isDirty && this.projectName) {
                    // Save to local storage synchronously as fallback
                    const localData = {
                        state: this.state,
                        metadata: {
                            ...this.metadata,
                            lastModified: Date.now(),
                            version: (this.metadata.version || 0) + 1
                        }
                    };
                    localStorage.setItem(`redglitch_project_${this.projectName}_backup`, JSON.stringify(localData));
                    
                    // Attempt network save via sendBeacon (fire-and-forget, non-blocking)
                    if (navigator.sendBeacon) {
                        const url = `/api/project/${encodeURIComponent(this.projectName)}/state`;
                        navigator.sendBeacon(url, JSON.stringify(localData));
                    }
                }
            });
        }
    }

    setupEventListeners() {
        // Listen for project-related events
        this.eventBus.on('project:*', (event) => {
            this.handleProjectEvent(event);
        });
        
        // Listen for editor state changes
        this.eventBus.on('editor:state:*', (event) => {
            this.handleEditorStateChange(event);
        });
        
        // Listen for asset changes
        this.eventBus.on('asset:*', (event) => {
            this.handleAssetEvent(event);
        });

        // Listen for activity logs (sync across windows)
        this.eventBus.on('activity:logged', (event) => {
            this.handleActivityEvent(event);
        });
    }

    handleActivityEvent(event) {
        // The event data IS the activity object
        const activity = event.data;
        if (!activity) return;

        const activities = this.get('activities', []);
        
        // Check if this is the very latest activity we already know about
        // (to prevent loops if we emitted it)
        if (activities.length > 0) {
            const last = activities[0];
            if (last.timestamp === activity.timestamp && last.name === activity.name) {
                return;
            }
        }

        // Logic matches logActivity but strictly for state update
        const idx = activities.findIndex(a => a.type === activity.type && a.name === activity.name);
        if (idx !== -1) activities.splice(idx, 1);
        
        activities.unshift(activity);
        if (activities.length > 50) activities.pop();
        
        // Update state silently to avoid re-triggering listeners that might emit
        this.set('activities', activities, { silent: true });
    }

    /**
     * Set a value in the project state
     */
    set(path, value, options = {}) {
        const oldValue = this.get(path);
        
        // Create undo point if value actually changed
        if (JSON.stringify(oldValue) !== JSON.stringify(value) && !options.skipUndo) {
            this.createUndoPoint();
        }
        
        // Set the value
        this.setNested(this.state, path, value);
        
        // Mark as dirty
        this.isDirty = true;
        
        // Notify listeners
        this.notifyChange(path, value, oldValue);
        
        // Broadcast change event
        if (this.eventBus && !options.silent) {
            this.eventBus.emit('state:changed', {
                path,
                value,
                oldValue,
                project: this.projectName
            });
        }
        
        return this;
    }

    /**
     * Get a value from the project state
     */
    get(path, defaultValue = null) {
        return this.getNested(this.state, path, defaultValue);
    }

    /**
     * Watch for changes to a specific path
     */
    watch(path, callback, options = {}) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }
        
        const listener = {
            callback,
            immediate: options.immediate || false,
            deep: options.deep || false,
            id: Math.random().toString(36).substr(2, 9)
        };
        
        this.listeners.get(path).push(listener);
        
        // Call immediately if requested
        if (listener.immediate) {
            callback(this.get(path), null, path);
        }
        
        return listener.id;
    }

    /**
     * Stop watching a path
     */
    unwatch(path, callbackOrId) {
        const listeners = this.listeners.get(path);
        if (!listeners) return false;
        
        let index = -1;
        if (typeof callbackOrId === 'string') {
            index = listeners.findIndex(l => l.id === callbackOrId);
        } else {
            index = listeners.findIndex(l => l.callback === callbackOrId);
        }
        
        if (index !== -1) {
            listeners.splice(index, 1);
            return true;
        }
        
        return false;
    }

    /**
     * Load project from server
     */
    async loadProject() {
        if (!this.projectName) return;
        
        try {
            const response = await fetch(`/api/project/${encodeURIComponent(this.projectName)}/state`);
            if (response.ok) {
                const data = await response.json();
                this.state = data.state || {};
                this.metadata = data.metadata || {};
                this.isDirty = false;
                
                if (this.eventBus) {
                    this.eventBus.emit('project:loaded', {
                        project: this.projectName,
                        state: this.state,
                        metadata: this.metadata
                    });
                }
                
                console.log(`[SharedProjectState] Loaded project: ${this.projectName}`);
            } else {
                console.warn(`[SharedProjectState] Failed to load project: ${this.projectName}`);
                // Initialize with empty state
                this.state = {};
                this.metadata = {};
            }
        } catch (error) {
            console.error('[SharedProjectState] Error loading project:', error);
            this.state = {};
            this.metadata = {};
        }
    }

    /**
     * Save project to server
     */
    async saveProject() {
        if (!this.projectName || !this.isDirty) return;
        
        try {
            const response = await fetch(`/api/project/${encodeURIComponent(this.projectName)}/state`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    state: this.state,
                    metadata: {
                        ...this.metadata,
                        lastModified: Date.now(),
                        version: (this.metadata.version || 0) + 1
                    }
                })
            });
            
            if (response.ok) {
                this.isDirty = false;
                
                if (this.eventBus) {
                    this.eventBus.emit('project:saved', {
                        project: this.projectName,
                        timestamp: Date.now()
                    });
                }
                
                console.log(`[SharedProjectState] Saved project: ${this.projectName}`);
            } else {
                console.error('[SharedProjectState] Failed to save project');
            }
        } catch (error) {
            console.error('[SharedProjectState] Error saving project:', error);
        }
    }

    /**
     * Create undo point
     */
    createUndoPoint() {
        this.undoStack.push({
            state: JSON.parse(JSON.stringify(this.state)),
            timestamp: Date.now()
        });
        
        // Clear redo stack
        this.redoStack = [];
        
        // Limit undo stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
    }

    /**
     * Undo last change
     */
    undo() {
        if (this.undoStack.length === 0) return false;
        
        // Save current state to redo stack
        this.redoStack.push({
            state: JSON.parse(JSON.stringify(this.state)),
            timestamp: Date.now()
        });
        
        // Restore previous state
        const previousState = this.undoStack.pop();
        this.state = previousState.state;
        this.isDirty = true;
        
        // Notify all listeners
        this.notifyAllListeners();
        
        if (this.eventBus) {
            this.eventBus.emit('state:undo', {
                project: this.projectName,
                timestamp: previousState.timestamp
            });
        }
        
        return true;
    }

    /**
     * Redo last undone change
     */
    redo() {
        if (this.redoStack.length === 0) return false;
        
        // Save current state to undo stack
        this.undoStack.push({
            state: JSON.parse(JSON.stringify(this.state)),
            timestamp: Date.now()
        });
        
        // Restore next state
        const nextState = this.redoStack.pop();
        this.state = nextState.state;
        this.isDirty = true;
        
        // Notify all listeners
        this.notifyAllListeners();
        
        if (this.eventBus) {
            this.eventBus.emit('state:redo', {
                project: this.projectName,
                timestamp: nextState.timestamp
            });
        }
        
        return true;
    }

    /**
     * Start auto-save timer
     */
    startAutoSave(intervalMs = 30000) {
        this.stopAutoSave();
        this.autoSaveInterval = setInterval(() => {
            if (this.isDirty) {
                this.saveProject();
            }
        }, intervalMs);
    }

    /**
     * Stop auto-save timer
     */
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    /**
     * Handle project events from EventBus
     */
    handleProjectEvent(event) {
        const { type, data } = event;
        
        switch (type) {
            case 'project:switch':
                this.switchProject(data.projectName);
                break;
            case 'project:reload':
                this.loadProject();
                break;
            case 'project:save':
                this.saveProject();
                break;
        }
    }

    /**
     * Handle editor state changes
     */
    handleEditorStateChange(event) {
        const { type, data } = event;
        
        // Merge editor-specific state changes
        if (data.editorId && data.state) {
            this.set(`editors.${data.editorId}`, data.state, { skipUndo: true });
        }
    }

    /**
     * Handle asset events
     */
    handleAssetEvent(event) {
        const { type, data } = event;
        
        switch (type) {
            case 'asset:created':
            case 'asset:updated':
            case 'asset:deleted':
                // Update asset registry
                const assets = this.get('assets', {});
                if (type === 'asset:deleted') {
                    delete assets[data.id];
                } else {
                    assets[data.id] = data.asset;
                }
                this.set('assets', assets);
                break;
        }
    }

    /**
     * Switch to different project
     */
    async switchProject(projectName) {
        // Save current project if dirty
        if (this.isDirty) {
            await this.saveProject();
        }
        
        this.projectName = projectName;
        await this.loadProject();
    }

    /**
     * Notify listeners of changes
     */
    notifyChange(path, newValue, oldValue) {
        // Check for exact path matches
        const exactListeners = this.listeners.get(path) || [];
        exactListeners.forEach(listener => {
            try {
                listener.callback(newValue, oldValue, path);
            } catch (err) {
                console.error('[SharedProjectState] Listener error:', err);
            }
        });
        
        // Check for parent path matches (if deep watching is enabled)
        for (const [watchPath, listeners] of this.listeners.entries()) {
            if (watchPath !== path && path.startsWith(watchPath + '.')) {
                listeners.filter(l => l.deep).forEach(listener => {
                    try {
                        listener.callback(this.get(watchPath), null, watchPath);
                    } catch (err) {
                        console.error('[SharedProjectState] Deep listener error:', err);
                    }
                });
            }
        }
    }

    /**
     * Notify all listeners (used by undo/redo)
     */
    notifyAllListeners() {
        for (const [path, listeners] of this.listeners.entries()) {
            const currentValue = this.get(path);
            listeners.forEach(listener => {
                try {
                    listener.callback(currentValue, null, path);
                } catch (err) {
                    console.error('[SharedProjectState] Listener error:', err);
                }
            });
        }
    }

    /**
     * Helper: Set nested object property
     */
    setNested(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        
        let current = obj;
        for (const key of keys) {
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
    }

    /**
     * Helper: Get nested object property
     */
    getNested(obj, path, defaultValue = null) {
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current == null || !(key in current)) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    }

    /**
     * Get current project info
     */
    getProjectInfo() {
        return {
            name: this.projectName,
            isDirty: this.isDirty,
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            metadata: this.metadata
        };
    }

    /**
     * Export project state
     */
    export() {
        return {
            state: JSON.parse(JSON.stringify(this.state)),
            metadata: JSON.parse(JSON.stringify(this.metadata)),
            timestamp: Date.now()
        };
    }

    /**
     * Import project state
     */
    import(data) {
        this.createUndoPoint();
        this.state = data.state || {};
        this.metadata = data.metadata || {};
        this.isDirty = true;
        this.notifyAllListeners();
        
        if (this.eventBus) {
            this.eventBus.emit('project:imported', {
                project: this.projectName,
                timestamp: data.timestamp
            });
        }
    }

    /**
     * Log a user activity (opened file, tool, etc.)
     */
    logActivity(type, name, data = {}) {
        const activities = this.get('activities', []);
        
        // Remove duplicate recent activity of same type/name to bump it to top
        const idx = activities.findIndex(a => a.type === type && a.name === name);
        if (idx !== -1) activities.splice(idx, 1);
        
        const activity = {
            type,
            name,
            data,
            timestamp: Date.now()
        };
        
        activities.unshift(activity);
        
        // Limit history
        if (activities.length > 50) activities.pop();
        
        this.set('activities', activities, { silent: true }); // Silent set to avoid massive event spam if watching root
        
        if (this.eventBus) {
            this.eventBus.emit('activity:logged', activity);
        }
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.RedGlitchProjectState = window.RedGlitchProjectState || new SharedProjectState();
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SharedProjectState;
}