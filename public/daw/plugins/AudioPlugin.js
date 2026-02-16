/**
 * KETEBE AUDIO STUDIO - Audio Plugin Base Class
 * Standard interface for all internal effects.
 */

class AudioPlugin {
    constructor(ctx, name) {
        this.ctx = ctx;
        this.name = name || "Plugin";
        this.active = true;
        
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
        console.warn(`${this.name}: setParam '${key}' not implemented.`);
    }

    getInterface() {
        const div = document.createElement('div');
        div.className = 'plugin-ui';
        div.innerText = this.name;
        return div;
    }
}

window.AudioPlugin = AudioPlugin;
