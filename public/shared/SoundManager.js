/**
 * Ketebe Engine - Unified Sound Manager (v3.0)
 * Data-driven audio system powered by AudioMap.json
 */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.buses = new Map(); // name -> GainNode
        this.analysers = new Map(); // name -> AnalyserNode
        this.compressors = new Map(); // name -> DynamicsCompressorNode (Ducking)
        this.reverbNode = null; // Global Convolution Reverb
        
        this.audioMap = { events: {}, buses: {} };
        this.gameState = 'normal';
        this.currentEnvironment = 'dry';
        
        this.buffers = new Map(); // url -> AudioBuffer
        this.activeSources = new Set();
        this.eventCooldowns = new Map(); // eventName -> timestamp
        
        this.is3D = false;
        this._ready = false;
        
        // Auto-resume on interaction
        this._resumeHandler = () => {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => { this._ready = true; });
            }
        };
        ['mousedown', 'touchstart', 'keydown'].forEach(ev =>
            window.addEventListener(ev, this._resumeHandler, { once: true })
        );

        if (typeof window !== 'undefined' && window.KetebeEventBus) {
            window.KetebeEventBus.on('audio:map_updated', (event) => {
                console.log('[Sound] Map updated via EventBus');
                this.applyAudioMap(event.data);
            });
        }
    }

    /**
     * Initialize the audio context and load the map
     */
    async init() {
        if (this.ctx) return;
        
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Setup Reverb Node
        this.reverbNode = this.ctx.createConvolver();
        
        // Load Audio Map
        try {
            const res = await fetch('/api/audio/map');
            if (res.ok) {
                const map = await res.json();
                this.applyAudioMap(map);
            }
        } catch (e) {
            console.warn('[Sound] Failed to load audio map, using internal defaults');
            this.setupDefaultBuses();
        }
        
        console.log('[Sound] System initialized');
        if (this.ctx.state === 'running') this._ready = true;
    }

    setupDefaultBuses() {
        this.createBus('master', null, 1.0);
        this.createBus('music', 'master', 0.8, true); // Ducking enabled
        this.createBus('ambience', 'master', 0.6, true); // Ducking enabled
        this.createBus('sfx', 'master', 0.9);
        this.createBus('voice', 'master', 1.0);
    }

    createBus(name, parentName, defaultGain = 1.0, hasDucking = false) {
        if (!this.ctx) return;
        
        const gain = this.ctx.createGain();
        gain.gain.value = defaultGain;
        
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        
        let lastNode = gain;

        // Add Sidechain Compressor if ducking enabled
        if (hasDucking) {
            const comp = this.ctx.createDynamicsCompressor();
            comp.threshold.value = -10; // Only ducks when triggered manually
            comp.knee.value = 40;
            comp.ratio.value = 12;
            comp.attack.value = 0;
            comp.release.value = 0.25;
            
            lastNode.connect(comp);
            lastNode = comp;
            this.compressors.set(name, comp);
        }

        lastNode.connect(analyser);
        
        if (name === 'master') {
            // Final Master Limiter to prevent clipping
            const limiter = this.ctx.createDynamicsCompressor();
            limiter.threshold.value = -0.5;
            limiter.knee.value = 0;
            limiter.ratio.value = 20;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.1;
            
            analyser.connect(limiter);
            limiter.connect(this.ctx.destination);
        } else if (parentName && this.buses.has(parentName)) {
            analyser.connect(this.buses.get(parentName));
        } else {
            analyser.connect(this.buses.get('master') || this.ctx.destination);
        }
        
        this.buses.set(name, gain);
        this.analysers.set(name, analyser);
    }

    /**
     * Trigger a sidechain ducking effect on music/ambience
     */
    triggerDucking(duration = 1.0) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        
        this.compressors.forEach(comp => {
            comp.threshold.setTargetAtTime(-40, now, 0.05); // Duck down
            comp.threshold.setTargetAtTime(-10, now + duration, 0.1); // Recover
        });
    }

    /**
     * Set the global environmental reverb
     * @param {string} type - 'dry', 'cave', 'hall', 'room'
     */
    async setEnvironment(type) {
        if (!this.ctx) await this.init();
        if (this.currentEnvironment === type) return;
        
        this.currentEnvironment = type;
        if (type === 'dry') {
            this.reverbNode.buffer = null;
            return;
        }

        // In a real build, we'd load an Impulse Response WAV here
        // For now, we'll synthesize a fake one or try to load a known one
        try {
            const buffer = await this.load(`ir_${type}.wav`);
            if (buffer) this.reverbNode.buffer = buffer;
        } catch (e) {
            console.warn(`[Sound] Failed to load reverb for ${type}`);
        }
    }

    /**
     * Global Game State Management (e.g. 'calm' -> 'combat')
     */
    setGameState(state) {
        this.gameState = state;
        console.log(`[Sound] Audio State: ${state}`);
        // This could trigger EventBus signals to dynamic music managers
        if (window.KetebeEventBus) {
            window.KetebeEventBus.emit('audio:state_changed', { state });
        }
    }

    applyAudioMap(map) {
        this.audioMap = map;
        if (!this.ctx) return;

        // Setup Buses
        for (const [name, config] of Object.entries(map.buses || {})) {
            if (!this.buses.has(name)) {
                this.createBus(name, config.parent, config.gain, config.ducking);
            }
            const bus = this.buses.get(name);
            bus.gain.setTargetAtTime(config.gain || 1.0, this.ctx.currentTime, 0.1);
        }
    }

    /**
     * Get real-time volume level for a bus (0.0 to 1.0)
     */
    getBusLevel(name) {
        const analyser = this.analysers.get(name);
        if (!analyser) return 0;
        
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        return sum / (data.length * 255);
    }

    /**
     * Get frequency data for spectrum visualization
     */
    getSpectrumData(name) {
        const analyser = this.analysers.get(name);
        if (!analyser) return null;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        return data;
    }

    /**
     * Load an audio asset
     */
    async load(url) {
        if (!this.ctx) await this.init();
        if (this.buffers.has(url)) return this.buffers.get(url);

        try {
            // Support for relative paths
            const fullUrl = url.startsWith('http') || url.startsWith('/') ? url : `/muzikler/${url}`;
            const response = await fetch(fullUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.buffers.set(url, audioBuffer);
            return audioBuffer;
        } catch (e) {
            console.warn(`[Sound] Asset missing: ${url}. Generating high-quality synthetic placeholder.`);
            
            // Generate synthetic template based on filename or context
            let type = 'click';
            if (url.includes('step') || url.includes('thud')) type = 'thud';
            if (url.includes('music') || url.includes('ambient')) type = 'ambient';
            if (url.includes('success') || url.includes('coin')) type = 'chime';

            const synthetic = this.generateSyntheticBuffer(type);
            this.buffers.set(url, synthetic);
            return synthetic;
        }
    }

    /**
     * Synthesis Engine: Create high-fidelity placeholders via Web Audio API
     */
    generateSyntheticBuffer(type = 'click') {
        if (!this.ctx) return null;
        
        const duration = type === 'ambient' ? 2.0 : 0.2;
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / this.ctx.sampleRate;
            
            if (type === 'click') {
                // Short percussive click
                data[i] = Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-50 * t);
            } else if (type === 'thud') {
                // Low frequency thud (white noise filtered)
                data[i] = (Math.random() * 2 - 1) * Math.exp(-20 * t) * 0.5;
            } else if (type === 'chime') {
                // Sine wave chime with harmonic
                data[i] = (Math.sin(2 * Math.PI * 880 * t) + Math.sin(2 * Math.PI * 1320 * t) * 0.5) * Math.exp(-5 * t);
            } else if (type === 'ambient') {
                // Soft pink-noise loop
                data[i] = (Math.random() * 2 - 1) * 0.1;
            }
        }
        return buffer;
    }

    /**
     * Play a mapped audio event
     */
    async playEvent(eventName, options = {}) {
        if (!this.ctx) await this.init();
        
        const config = this.audioMap.events[eventName];
        if (!config || !config.clips || config.clips.length === 0) {
            // Fallback: try to play as a direct filename if event name looks like one
            if (eventName.includes('.') || options.direct) {
                return this.playBuffer(eventName, options);
            }
            return null;
        }

        // Cooldown check
        const now = Date.now();
        const lastPlay = this.eventCooldowns.get(eventName) || 0;
        if (now - lastPlay < (config.playback.cooldown * 1000 || 0)) return null;
        this.eventCooldowns.set(eventName, now);

        // Pick clip
        let clip = config.clips[0];
        if (config.playback.mode === 'random') {
            clip = config.clips[Math.floor(Math.random() * config.clips.length)];
        }

        const buffer = await this.load(clip);
        if (!buffer) return null;

        // Calculate variation
        const baseVol = config.playback.volume || 1.0;
        const volVar = config.playback.volumeVar || 0;
        const finalVol = baseVol + (Math.random() * 2 - 1) * volVar;

        const pitchVar = config.playback.pitchVar || 0;
        const finalPitch = 1.0 + (Math.random() * 2 - 1) * pitchVar;

        // Play
        const playOptions = {
            ...options,
            volume: finalVol * (options.volume !== undefined ? options.volume : 1.0),
            playbackRate: finalPitch,
            bus: config.group || 'sfx',
            loop: config.playback.mode === 'loop' || options.loop
        };

        // Notify EventBus for visual feedback in studio
        if (window.KetebeEventBus) {
            window.KetebeEventBus.emit('audio:trigger', { name: eventName, clip });
        }

        if (options.x !== undefined && options.y !== undefined) {
            return this.playSpatialBuffer(buffer, options.x, options.y, options.z || 0, playOptions);
        } else {
            return this.playBuffer(buffer, playOptions);
        }
    }

    /**
     * Internal: Play a raw buffer with routing
     */
    playBuffer(bufferOrUrl, options = {}) {
        if (!this.ctx) return null;

        const play = (buffer) => {
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = options.loop || false;
            source.playbackRate.value = options.playbackRate || 1.0;

            const gain = this.ctx.createGain();
            gain.gain.value = options.volume !== undefined ? options.volume : 1.0;

            let lastNode = source;

            // 1. Add Optional Biquad Filter
            if (options.filter) {
                const filter = this.ctx.createBiquadFilter();
                filter.type = options.filterType || 'lowpass';
                filter.frequency.value = options.filterFreq || 2000;
                lastNode.connect(filter);
                lastNode = filter;
            }

            lastNode.connect(gain);
            
            const targetBus = this.buses.get(options.bus || 'sfx') || this.buses.get('master');
            gain.connect(targetBus);

            // 2. Add Reverb Send
            if (options.reverb && this.reverbNode) {
                const sendGain = this.ctx.createGain();
                sendGain.gain.value = options.reverbAmount || 0.3;
                gain.connect(sendGain);
                sendGain.connect(this.reverbNode);
            }

            // 3. Trigger Ducking if Priority
            if (options.priority) {
                this.triggerDucking(buffer.duration);
            }
            
            source.start(0);
            this.activeSources.add(source);
            source.onended = () => {
                this.activeSources.delete(source);
                if (options.onEnded) options.onEnded();
            };
            
            return { source, gain };
        };

        if (typeof bufferOrUrl === 'string') {
            this.load(bufferOrUrl).then(b => { if(b) play(b); });
            return null;
        } else {
            return play(bufferOrUrl);
        }
    }

    playSpatialBuffer(buffer, x, y, z = 0, options = {}) {
        if (!this.ctx) return null;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = options.loop || false;
        source.playbackRate.value = options.playbackRate || 1.0;

        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'exponential';
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;

        const gain = this.ctx.createGain();
        gain.gain.value = options.volume !== undefined ? options.volume : 1.0;

        let lastNode = source;

        // 1. Filter
        if (options.filter) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = options.filterType || 'lowpass';
            filter.frequency.value = options.filterFreq || 2000;
            lastNode.connect(filter);
            lastNode = filter;
        }

        lastNode.connect(panner);
        panner.connect(gain);
        
        const targetBus = this.buses.get(options.bus || 'sfx') || this.buses.get('master');
        gain.connect(targetBus);

        // 2. Reverb Send
        if (options.reverb && this.reverbNode) {
            const sendGain = this.ctx.createGain();
            sendGain.gain.value = options.reverbAmount || 0.3;
            gain.connect(sendGain);
            sendGain.connect(this.reverbNode);
        }

        // 3. Ducking
        if (options.priority) this.triggerDucking(buffer.duration);

        source.start(0);
        this.activeSources.add(source);
        return { source, panner, gain };
    }

    // --- LEGACY COMPATIBILITY ---
    play(name, options = {}) { return this.playEvent(name, options); }
    async playMusic(url, volume = 0.5) { return this.playEvent('music:' + url, { volume, bus: 'music', loop: true, direct: true }); }
    stopAll() {
        this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
        this.activeSources.clear();
    }

    updateListener(x, y, z = 50) {
        if (!this.ctx) return;
        if (!this.ctx.listener) return;
        const listener = this.ctx.listener;
        if (listener.positionX) {
            listener.positionX.setTargetAtTime(x, this.ctx.currentTime, 0.1);
            listener.positionY.setTargetAtTime(y, this.ctx.currentTime, 0.1);
            listener.positionZ.setTargetAtTime(z, this.ctx.currentTime, 0.1);
        } else if (listener.setPosition) {
            listener.setPosition(x, y, z);
        }
    }

    updateSource(id, x, y, z = 0) {
        // Find the active source or panner if needed. 
        // In v3, we aren't tracking panners by ID in activeSources, but we provide a stub to prevent errors.
    }
}

// Make globally available
window.Sound = new SoundManager();
window.AudioSystem = SoundManager; // Legacy Alias
