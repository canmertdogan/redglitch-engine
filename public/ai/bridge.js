/**
 * irab-bridge.js
 * Client-side bridge to the Native AI Cortex
 */

if (typeof window.IrabBridge === 'undefined') {
    class IrabBridge {
        constructor() {
            this.socket = null;
            this.url = "ws://localhost:8000/ws";
            this.isConnected = false;
            this._syncListenerAttached = false;
            this._retryTimer = null;
            this._connecting = false;
            this._retryDelay = 3000;
            this._maxRetryDelay = 30000;
            this._callbacks = new Map();
            this._destroyed = false;
            
            // Hooks for UI
            this.onToken = null;
            this.onStateChange = null;
            this.onCommand = null;
            this.onReady = null;
            this.onLoadProgress = null;
            
            this.connect();
        }

        async connect() {
            if (this._destroyed || this._connecting || this.isConnected) return;
            this._connecting = true;

            console.log("[IrabBridge] Connecting to Native Cortex...");
            if (this.onStateChange) this.onStateChange('CONNECTING');

            const backendReady = await this._probeBackend();
            if (this._destroyed) { this._connecting = false; return; }
            if (!backendReady) {
                this._connecting = false;
                this.isConnected = false;
                if (this.onStateChange) this.onStateChange('OFFLINE');
                this._scheduleReconnect(10000);
                return;
            }

            try {
                this.socket = new WebSocket(this.url);

                this.socket.onopen = () => {
                    if (this._destroyed) { try { this.socket.close(); } catch (_) {} return; }
                    this.isConnected = true;
                    this._connecting = false;
                    this._retryDelay = 3000;
                    console.log("[IrabBridge] Connected to Native Cortex.");
                    if (this.onStateChange) this.onStateChange('ONLINE');
                    this.send({ type: "PING" });
                    if (this.onReady) this.onReady();
                };

                this.socket.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        this.handleMessage(msg);
                    } catch (e) {
                        console.error("[IrabBridge] Failed to parse message:", e);
                    }
                };

                this.socket.onclose = () => {
                    this._connecting = false;
                    this.isConnected = false;
                    if (this._destroyed) return;
                    if (this.onStateChange) this.onStateChange('OFFLINE');
                    console.warn("[IrabBridge] Connection closed. Retrying...");
                    this._scheduleReconnect();
                };

                this.socket.onerror = () => {
                    this.isConnected = false;
                    // No need to log full error here as it triggers onclose
                };

                // Forward sync events from EventBus to WebSocket (attach once)
                if (window.RedGlitchEventBus && !this._syncListenerAttached) {
                    this._syncListenerAttached = true;
                    window.RedGlitchEventBus.on('ai:command:sync', (event) => {
                        const msg = event.data || event;
                        this.send(msg);
                    });
                }
            } catch (e) {
                this._connecting = false;
                console.error("[IrabBridge] Connection attempt failed:", e);
                this._scheduleReconnect();
            }
        }

        _scheduleReconnect(delay = this._retryDelay) {
            if (this._destroyed) return;
            if (this._retryTimer) clearTimeout(this._retryTimer);
            this._retryTimer = setTimeout(() => {
                this._retryTimer = null;
                this.connect();
            }, delay);
            this._retryDelay = Math.min(this._retryDelay * 2, this._maxRetryDelay);
        }

        async _probeBackend() {
            try {
                const res = await fetch('/api/ai/metrics', { cache: 'no-store' });
                if (!res.ok) return false;
                const metrics = await res.json().catch(() => null);
                if (!metrics) return true;
                if (metrics.offline) return false;
                const status = String(metrics.status || '').toLowerCase();
                return status !== 'offline';
            } catch (_) {
                return false;
            }
        }

        handleMessage(msg) {
            // Check for callback
            if (msg.id && this._callbacks.has(msg.id)) {
                const cb = this._callbacks.get(msg.id);
                cb(msg.data);
                this._callbacks.delete(msg.id);
                // We might still want to process other fields if it's a multi-purpose message
            }

            switch(msg.type) {
                case "TOKEN":
                    if (this.onToken) this.onToken(msg.data);
                    break;
                case "SET_STATE":
                    if (this.onStateChange) this.onStateChange(msg.data);
                    break;
                case "COMMAND":
                    console.log("[IrabBridge] Received command:", msg.data);
                    if (this.onCommand) this.onCommand(msg.data);
                    
                    // Phase 10: Emit to Universal Tool Registry
                    if (window.RedGlitchEventBus) {
                        window.RedGlitchEventBus.emit('ai:command:request', {
                            id: 'native_' + Date.now(),
                            method: msg.data.action,
                            params: msg.data.params
                        });
                    }
                    break;
                case "LOAD_PROGRESS":
                    if (this.onLoadProgress) this.onLoadProgress(msg.data);
                    break;
                case "PONG":
                    break;
            }
        }

        send(data, callback) {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                if (callback) {
                    const id = Math.random().toString(36).substr(2, 9);
                    this._callbacks.set(id, callback);
                    data.id = id;
                }
                this.socket.send(JSON.stringify(data));
            }
        }

        prompt(text, context = {}) {
            if (!this.isConnected) {
                console.warn("[IrabBridge] Not connected to Cortex.");
                return false;
            }

            // --- Phase 2: Active Focus ---
            if (window.IrabStudioAPI && window.IrabStudioAPI.getActiveCode) {
                const focusedCode = window.IrabStudioAPI.getActiveCode();
                if (focusedCode) {
                    context.focused_code = focusedCode;
                }
            }

            this.send({
                type: "PROMPT",
                data: text,
                context: context
            });
            return true;
        }

        abort() {
            if (this.isConnected) {
                this.send({ type: "ABORT" });
                return true;
            }
            return false;
        }
    }

    window.IrabBridge = IrabBridge;

    // Only auto-connect the native Cortex bridge when AI mode is enabled
    if (isKaiModeEnabled()) {
        window.irab = new IrabBridge();
    }
}

function isKaiModeEnabled() {
    const v = localStorage.getItem('kai_ai_enabled');
    return v === 'true';
}

window.ensureIrabBridge = function ensureIrabBridge() {
    if (window.electronAPI && window.electronAPI.cortexStart) {
        window.electronAPI.cortexStart().catch(console.error);
    }
    if (!window.irab) {
        window.irab = new IrabBridge();
    }
    return window.irab;
};

window.destroyIrabBridge = function destroyIrabBridge() {
    if (window.electronAPI && window.electronAPI.cortexStop) {
        window.electronAPI.cortexStop().catch(console.error);
    }
    if (window.irab) {
        window.irab._destroyed = true;
        try { window.irab.socket?.close(); } catch (_) {}
        window.irab.isConnected = false;
        window.irab._connecting = false;
        if (window.irab._retryTimer) clearTimeout(window.irab._retryTimer);
        window.irab = null;
    }
};
