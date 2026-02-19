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
            
            // Hooks for UI
            this.onToken = null;
            this.onStateChange = null;
            this.onCommand = null;
            this.onReady = null;
            this.onLoadProgress = null;
            
            this.connect();
        }

        connect() {
            console.log("[IrabBridge] Connecting to Native Cortex...");
            if (this.onStateChange) this.onStateChange('CONNECTING');
            
            try {
                this.socket = new WebSocket(this.url);

                this.socket.onopen = () => {
                    this.isConnected = true;
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
                    this.isConnected = false;
                    if (this.onStateChange) this.onStateChange('OFFLINE');
                    console.warn("[IrabBridge] Connection closed. Retrying in 3s...");
                    setTimeout(() => {
                        if (!this.isConnected) this.connect();
                    }, 3000);
                };

                this.socket.onerror = (err) => {
                    this.isConnected = false;
                    // No need to log full error here as it triggers onclose
                };

                // Forward sync events from EventBus to WebSocket
                if (window.KetebeEventBus) {
                    window.KetebeEventBus.on('ai:command:sync', (event) => {
                        const msg = event.data || event;
                        this.send(msg);
                    });
                }
            } catch (e) {
                console.error("[IrabBridge] Connection attempt failed:", e);
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
                    if (window.KetebeEventBus) {
                        window.KetebeEventBus.emit('ai:command:request', {
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
    }

    window.IrabBridge = IrabBridge;
    window.irab = new IrabBridge();
}
