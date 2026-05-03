/**
 * VORTEX AUDIO STUDIO - Mixer Channel
 * Handles the audio signal chain for a single track:
 * Input -> Inserts (FX) -> Fader (Volume) -> Pan -> Output (Master/Bus)
 */

class MixerChannel {
    constructor(ctx, engine, id) {
        this.ctx = ctx;
        this.engine = engine;
        this.id = id; // 'master' or number

        // 1. Input Node (Where the instrument connects)
        this.input = this.ctx.createGain();
        
        // 2. Insert Chain (Effects)
        // We maintain an array of connected nodes. 
        // Start with Input -> [Pre-Fader FX] -> Fader
        this.inserts = []; 
        
        // 3. Fader & Pan Section
        this.faderNode = this.ctx.createGain();
        this.panNode = this.ctx.createStereoPanner();
        
        // 4. Output Node
        this.output = this.ctx.createGain();

        // Metering (Pre-fader or Post-fader? Usually post-fader for mix)
        this.analyzer = this.ctx.createAnalyser();
        this.analyzer.fftSize = 512;
        this.analyzer.smoothingTimeConstant = 0.3;

        // --- INTERNAL ROUTING ---
        // Initial Chain: Input -> Fader -> Pan -> Analyzer -> Output
        this.input.connect(this.faderNode);
        this.faderNode.connect(this.panNode);
        this.panNode.connect(this.analyzer);
        this.analyzer.connect(this.output);

        // Default state
        this.volume = 0.8;
        this.pan = 0;
        this.muted = false;
        this.soloed = false;
        
        this.setVolume(this.volume);
    }

    // Connect this channel to a destination (usually Master)
    connect(destination) {
        this.output.connect(destination);
    }

    disconnect() {
        this.output.disconnect();
    }

    // --- Volume & Pan ---

    setVolume(val) {
        this.volume = Math.max(0, Math.min(1, val));
        // Use exponential ramp for natural volume feel? Or simple linear for now.
        // For faders, x^2 often feels better than linear.
        // Let's stick to simple linear gain for the node, but the UI fader might be logarithmic.
        if (this.muted) {
            this.faderNode.gain.value = 0;
        } else {
            this.faderNode.gain.value = this.volume;
        }
    }

    setPan(val) {
        this.pan = Math.max(-1, Math.min(1, val));
        this.panNode.pan.value = this.pan;
    }

    setMute(muted) {
        this.muted = muted;
        if (this.muted) {
            this.faderNode.gain.value = 0;
        } else {
            this.faderNode.gain.value = this.volume;
        }
    }

    // --- Effects (Inserts) ---

    addInsert(effectPlugin, index = -1) {
        // Disconnect everything
        this.input.disconnect();
        
        // Remove existing connections between inserts
        if (this.inserts.length > 0) {
            this.input.disconnect();
            for (let i = 0; i < this.inserts.length; i++) {
                this.inserts[i].disconnect();
            }
            // Last insert was connected to fader
        } else {
             this.input.disconnect(this.faderNode);
        }

        // Add to array
        if (index === -1) {
            this.inserts.push(effectPlugin);
        } else {
            this.inserts.splice(index, 0, effectPlugin);
        }

        // Rebuild Chain
        this.rebuildChain();
    }
    
    removeInsert(index) {
        if (index < 0 || index >= this.inserts.length) return;
        
        // Disconnect everything
        if (this.inserts.length > 0) {
            this.input.disconnect();
            for (let i = 0; i < this.inserts.length; i++) {
                this.inserts[i].disconnect();
            }
        } else {
             this.input.disconnect(this.faderNode);
        }

        this.inserts.splice(index, 1);
        this.rebuildChain();
    }

    rebuildChain() {
        let currentNode = this.input;
        
        for (let i = 0; i < this.inserts.length; i++) {
            const plugin = this.inserts[i];
            if (plugin.active) {
                // If the plugin has its own input property (which our AudioPlugin does)
                // we connect to that.
                if (plugin.input) {
                    currentNode.connect(plugin.input);
                    currentNode = plugin; // The plugin instance becomes the source for next
                } else {
                    // Fallback for raw nodes
                    currentNode.connect(plugin);
                    currentNode = plugin;
                }
            }
        }
        
        // Finally connect to fader
        if (currentNode instanceof AudioPlugin) {
            currentNode.connect(this.faderNode);
        } else {
            currentNode.connect(this.faderNode);
        }
    }

    // --- Metering ---

    getPeakLevel() {
        const array = new Float32Array(this.analyzer.frequencyBinCount);
        this.analyzer.getFloatTimeDomainData(array);
        
        let max = 0;
        for(let i = 0; i < array.length; i++) {
            const v = Math.abs(array[i]);
            if (v > max) max = v;
        }
        
        // Instant attack, slow release for Peak
        if (typeof this._lastPeak === 'undefined') this._lastPeak = 0;
        
        if (max > this._lastPeak) {
            this._lastPeak = max;
        } else {
            this._lastPeak *= 0.95; // Release
        }
        
        return this._lastPeak;
    }

    getRMSLevel() {
        const array = new Float32Array(this.analyzer.frequencyBinCount);
        this.analyzer.getFloatTimeDomainData(array);
        
        let sum = 0;
        for (let i = 0; i < array.length; i++) {
            sum += array[i] * array[i];
        }
        const rms = Math.sqrt(sum / array.length);
        
        // Smoother averaging for RMS
        if (typeof this._lastRMS === 'undefined') this._lastRMS = 0;
        
        // Fast attack, slow release
        const attack = 0.8; 
        const release = 0.95;
        
        if (rms > this._lastRMS) {
            this._lastRMS = (rms * (1 - attack)) + (this._lastRMS * attack);
        } else {
            this._lastRMS = this._lastRMS * release;
        }
        
        return this._lastRMS;
    }
}

// Export
window.MixerChannel = MixerChannel;
