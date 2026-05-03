/**
 * Vortex Engine - Central Event Bus
 * Provides unified communication across all editors and tools
 */
class EventBus {
    constructor() {
        this.listeners = new Map();
        this.history = [];
        this.maxHistory = 100;
        this.websocket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.sourceId = this.generateSourceId();
        
        this.init();
    }

    generateSourceId() {
        if (typeof window !== 'undefined') {
            return `${window.location.pathname}_${Math.random().toString(36).substr(2, 5)}`;
        }
        return 'server';
    }

    init() {
        // Connect to WebSocket server for real-time updates
        this.connectWebSocket();
        
        // Listen for window messages (for Electron IPC compatibility)
        if (typeof window !== 'undefined') {
            window.addEventListener('message', (event) => {
                if (event.data && event.data.sourceType === 'ketebe-event') {
                    this.handleRemoteEvent(event.data.event);
                }
            });
        }
    }

    connectWebSocket() {
        if (typeof WebSocket === 'undefined') return;
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
        
        try {
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                console.log('[EventBus] WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.emit('system:websocket:connected');
            };
            
            this.websocket.onmessage = async (event) => {
                try {
                    let textData;
                    if (event.data instanceof Blob) {
                        textData = await event.data.text();
                    } else {
                        textData = event.data;
                    }
                    const data = JSON.parse(textData);
                    this.handleRemoteEvent(data);
                } catch (err) {
                    console.error('[EventBus] Failed to parse WebSocket message:', err);
                }
            };
            
            this.websocket.onclose = () => {
                console.log('[EventBus] WebSocket disconnected');
                this.isConnected = false;
                this.emit('system:websocket:disconnected');
                this.attemptReconnect();
            };
            
            this.websocket.onerror = (error) => {
                console.error('[EventBus] WebSocket error:', error);
                this.emit('system:websocket:error', { error });
            };
        } catch (err) {
            console.warn('[EventBus] WebSocket connection failed:', err);
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn('[EventBus] Max reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
        
        console.log(`[EventBus] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name (supports wildcards with *)
     * @param {Function} callback - Event handler
     * @param {Object} options - Options like priority, once
     */
    on(event, callback, options = {}) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        
        const listener = {
            callback,
            priority: options.priority || 0,
            once: options.once || false,
            id: Math.random().toString(36).substr(2, 9)
        };
        
        this.listeners.get(event).push(listener);
        
        // Sort by priority (higher priority first)
        this.listeners.get(event).sort((a, b) => b.priority - a.priority);
        
        return listener.id;
    }

    /**
     * Subscribe to an event once
     */
    once(event, callback, options = {}) {
        return this.on(event, callback, { ...options, once: true });
    }

    /**
     * Unsubscribe from an event
     */
    off(event, callbackOrId) {
        const listeners = this.listeners.get(event);
        if (!listeners) return false;
        
        let index = -1;
        if (typeof callbackOrId === 'string') {
            // Remove by ID
            index = listeners.findIndex(l => l.id === callbackOrId);
        } else {
            // Remove by callback function
            index = listeners.findIndex(l => l.callback === callbackOrId);
        }
        
        if (index !== -1) {
            listeners.splice(index, 1);
            return true;
        }
        
        return false;
    }

    /**
     * Emit an event
     */
    emit(event, data = null) {
        const eventData = {
            type: event,
            data: data,
            timestamp: Date.now(),
            source: this.getSource()
        };
        
        // Add to history
        this.addToHistory(eventData);
        
        // Handle local listeners
        this.handleLocalEvent(eventData);
        
        // Broadcast to other windows/WS
        this.broadcastEvent(eventData);
        
        return eventData;
    }

    /**
     * Handle events from remote sources
     */
    handleRemoteEvent(eventData) {
        if (!eventData || eventData.source === this.getSource()) {
            // Ignore our own events
            return;
        }
        
        this.addToHistory(eventData);
        this.handleLocalEvent(eventData);
    }

    /**
     * Handle local event processing
     */
    handleLocalEvent(eventData) {
        const { type } = eventData;
        
        // Find matching listeners (including wildcards)
        const matchingListeners = [];
        
        for (const [pattern, listeners] of this.listeners.entries()) {
            if (this.matchesPattern(type, pattern)) {
                matchingListeners.push(...listeners);
            }
        }
        
        // Execute listeners
        matchingListeners.forEach(listener => {
            try {
                listener.callback(eventData);
                
                // Remove if 'once' listener
                if (listener.once) {
                    this.off(type, listener.id);
                }
            } catch (err) {
                console.error(`[EventBus] Error in listener for ${type}:`, err);
            }
        });
    }

    /**
     * Broadcast event via WebSocket and postMessage
     */
    broadcastEvent(eventData) {
        // 1. WebSocket Broadcast
        if (this.websocket && this.isConnected) {
            try {
                this.websocket.send(JSON.stringify(eventData));
            } catch (err) {
                console.error('[EventBus] Failed to broadcast event via WS:', err);
            }
        }

        // 2. Cross-Window postMessage Broadcast
        const message = {
            sourceType: 'ketebe-event',
            event: eventData
        };

        // Broadcast to parent window (if we are in an iframe)
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage(message, '*');
            } catch (e) {}
        }
        
        // Broadcast to all child iframes
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage(message, '*');
                }
            } catch (e) {}
        });
        
        // Broadcast to opener (if we were opened as a popup)
        if (window.opener && window.opener !== window) {
            try {
                window.opener.postMessage(message, '*');
            } catch (err) {}
        }
    }

    /**
     * Add event to history
     */
    addToHistory(eventData) {
        this.history.push(eventData);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }

    /**
     * Check if event matches pattern (supports wildcards)
     */
    matchesPattern(event, pattern) {
        if (pattern === '*') return true;
        if (pattern === event) return true;
        
        // Simple wildcard matching
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(event);
        }
        
        return false;
    }

    /**
     * Get source identifier for this EventBus instance
     */
    getSource() {
        return this.sourceId;
    }

    /**
     * Get event history
     */
    getHistory(filter = null) {
        if (!filter) return this.history;
        
        return this.history.filter(event => {
            if (typeof filter === 'string') {
                return this.matchesPattern(event.type, filter);
            }
            if (typeof filter === 'function') {
                return filter(event);
            }
            return true;
        });
    }

    /**
     * Clear event history
     */
    clearHistory() {
        this.history = [];
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            listeners: Array.from(this.listeners.keys()),
            historySize: this.history.length
        };
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.VortexEventBus = window.VortexEventBus || new EventBus();
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventBus;
}