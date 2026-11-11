/**
 * REDGLITCH AUDIO STUDIO - Audio Plugin Base Class
 * Standard interface for all internal effects.
 */

class AudioPlugin {
    constructor(ctx, name) {
        this.ctx = ctx;
        this.name = name || "Plugin";
        this.active = true;
        this.params = {};
        
        // Input and Output nodes are essential for the chain
        this.input = this.ctx.createGain();
        this.output = this.ctx.createGain();
        
        // The internal effect node(s) should be connected between input and output
        // When bypassed, input connects directly to output
    }

    // Connect this plugin to the next node in the chain
    connect(destination) {
        this.output.connect(destination);
    }

    // Disconnect from the chain
    disconnect() {
        this.output.disconnect();
    }

    // Connect the internal processing chain
    // Subclasses should implement their specific routing here
    // e.g. input -> effectNode -> output
    buildChain() {
        this.input.connect(this.output); // Default pass-through
    }

    // Toggle bypass
    setBypass(bypassed) {
        this.active = !bypassed;
        // Logic to route input->output directly vs input->effect->output
        // This is usually handled by toggling gain nodes or reconnecting
        // For simplicity, let's assume subclasses implement specific bypass logic
        // or we use a wet/dry architecture.
        
        // Simple bypass implementation:
        // Note: This is a bit tricky to do glitch-free without crossfading.
    }

    setParam(key, value) {
        // Store param so serialization (ProjectManager) and subclasses can read it.
        // Subclasses that override setParam handle their own AudioParam wiring; base keeps the value.
        this.params[key] = value;
        // Common AudioParams: forward to internal nodes if present
        const node = this.effect || this.node || this.gainNode || this.filter || null;
        if (node && node[key] && node[key].value !== undefined) {
            try { node[key].value = Number(value); } catch {}
        }
        if (value !== undefined && typeof this.onParam === 'function') { try { this.onParam(key, value); } catch {} }
    }
    getParam(key) { return this.params[key]; }

    getInterface() {
        const div = document.createElement('div');
        div.className = 'plugin-ui';
        div.innerText = this.name;
        return div;
    }
}

window.AudioPlugin = AudioPlugin;
