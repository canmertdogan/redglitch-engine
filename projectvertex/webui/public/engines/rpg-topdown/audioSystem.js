// audioSystem.js - Professional Spatial Audio System

window.AudioSystem = class AudioSystem {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterBus = this.ctx.createGain();
        this.masterBus.connect(this.ctx.destination);
        
        this.buffers = {};
        this.sources = new Map(); // Track active spatial sources
        this.listener = this.ctx.listener;
        
        this.isEnabled = false;
        // Resume context on first interaction
        window.addEventListener('mousedown', () => { if(!this.isEnabled) { this.ctx.resume(); this.isEnabled = true; } }, { once: true });
    }

    async load(name, url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.buffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
            console.log(`Audio Loaded: ${name}`);
        } catch(e) { console.error(`Audio Error (${name}):`, e); }
    }

    // Streaming/Music Playback
    async playMusic(url, volume = 0.5) {
        if (this.currentMusicSource) {
            try { this.currentMusicSource.stop(); } catch(e) {}
            this.currentMusicSource = null;
        }

        if (!this.buffers[url]) {
            await this.load(url, url);
        }

        if (!this.buffers[url]) return;

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[url];
        source.loop = true;

        const gain = this.ctx.createGain();
        gain.gain.value = volume;

        source.connect(gain);
        gain.connect(this.masterBus);
        
        source.start(0);
        this.currentMusicSource = source;
        console.log("Music playing:", url);
    }

    // Standard non-spatial play (UI, Music)
    play(name, volume = 1.0, loop = false) {
        if (!this.buffers[name]) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        source.loop = loop;
        
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        
        source.connect(gain);
        gain.connect(this.masterBus);
        source.start(0);
        return source;
    }

    // 3D Spatial Play (World objects, enemies)
    playSpatial(name, x, y, options = {}) {
        if (!this.buffers[name]) return;
        
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        source.loop = options.loop || false;

        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'exponential';
        panner.refDistance = options.refDistance || 50;
        panner.maxDistance = options.maxDistance || 1000;
        panner.rolloffFactor = options.rolloff || 1.5;
        
        // Initial Position
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = 0;

        const gain = this.ctx.createGain();
        gain.gain.value = options.volume || 1.0;

        source.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterBus);
        
        source.start(0);
        
        const id = options.id || Math.random().toString(36).substr(2, 9);
        this.sources.set(id, { source, panner, gain });
        
        source.onended = () => this.sources.delete(id);
        return id;
    }

    updateListener(x, y) {
        // Update the Web Audio listener to match the player's position
        if (this.listener.positionX) {
            this.listener.positionX.setTargetAtTime(x, this.ctx.currentTime, 0.1);
            this.listener.positionY.setTargetAtTime(y, this.ctx.currentTime, 0.1);
            this.listener.positionZ.setTargetAtTime(50, this.ctx.currentTime, 0.1); // Listener slightly "above" 2D plane
        } else {
            // Legacy support
            this.listener.setPosition(x, y, 50);
        }
    }

    updateSource(id, x, y) {
        const data = this.sources.get(id);
        if (data && data.panner) {
            data.panner.positionX.setTargetAtTime(x, this.ctx.currentTime, 0.1);
            data.panner.positionY.setTargetAtTime(y, this.ctx.currentTime, 0.1);
        }
    }

    stopAll() {
        this.sources.forEach(s => s.source.stop());
        this.sources.clear();
    }
};