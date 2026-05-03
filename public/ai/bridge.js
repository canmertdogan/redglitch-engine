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
            
            // Hooks for UI
            this.onToken = null;
            this.onStateChange = null;
            this.onCommand = null;
            this.onReady = null;
            this.onLoadProgress = null;
            
            this.connect();
        }

        async connect() {
            if (this._connecting || this.isConnected) return;
            this._connecting = true;

            console.log("[IrabBridge] Connecting to Native Cortex...");
            if (this.onStateChange) this.onStateChange('CONNECTING');

            const backendReady = await this._probeBackend();
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
                    if (this.onStateChange) this.onStateChange('OFFLINE');
                    console.warn("[IrabBridge] Connection closed. Retrying...");
                    this._scheduleReconnect();
                };

                this.socket.onerror = () => {
                    this.isConnected = false;
                    // No need to log full error here as it triggers onclose
                };

                // Forward sync events from EventBus to WebSocket (attach once)
                if (window.VortexEventBus && !this._syncListenerAttached) {
                    this._syncListenerAttached = true;
                    window.VortexEventBus.on('ai:command:sync', (event) => {
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
                    if (window.VortexEventBus) {
                        window.VortexEventBus.emit('ai:command:request', {
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

        send(data) {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
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
    window.irab = new IrabBridge();
}
