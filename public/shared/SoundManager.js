/**
 * Ketebe Engine - Unified Sound Manager
 * Standardized audio API for both 2D and 3D engines.
 * Handles spatial positioning, gain buses, and automatic AudioContext resuming.
 */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        
        this.buffers = new Map();
        this.activeSources = new Set();
        this.musicSource = null;
        
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
    }

    /**
     * Initialize the audio context and gain buses
     */
    async init() {
        if (this.ctx) return;
        
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        
        this.musicGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        
        console.log('[Sound] System initialized');
        if (this.ctx.state === 'running') this._ready = true;
    }

    /**
     * Set context mode (2D vs 3D)
     * @param {boolean} enabled 
     */
    set3D(enabled) {
        this.is3D = enabled;
        if (this.ctx && this.ctx.listener) {
            // Set distance model defaults
            this.ctx.listener.panningModel = enabled ? 'HRTF' : 'equalpower';
        }
    }

    /**
     * Load an audio asset
     */
    async load(name, url) {
        if (!this.ctx) await this.init();
        if (this.buffers.has(name)) return;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.buffers.set(name, audioBuffer);
            console.log(`[Sound] Loaded: ${name}`);
        } catch (e) {
            console.warn(`[Sound] Failed to load ${name}:`, e.message);
        }
    }

    /**
     * Play a standard sound effect
     */
    play(name, options = {}) {
        if (!this.ctx || !this.buffers.has(name)) return null;

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers.get(name);
        source.loop = options.loop || false;

        const gain = this.ctx.createGain();
        gain.gain.value = options.volume !== undefined ? options.volume : 1.0;

        source.connect(gain);
        gain.connect(this.sfxGain);
        
        source.start(0);
        this.activeSources.add(source);
        source.onended = () => this.activeSources.delete(source);
        
        return { source, gain };
    }

    /**
     * Play a spatialized sound effect
     */
    playSpatial(name, x, y, z = 0, options = {}) {
        if (!this.ctx || !this.buffers.has(name)) return null;

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers.get(name);
        source.loop = options.loop || false;

        const panner = this.ctx.createPanner();
        panner.panningModel = this.is3D ? 'HRTF' : 'equalpower';
        panner.distanceModel = 'exponential';
        panner.refDistance = options.refDistance || 1;
        panner.maxDistance = options.maxDistance || 1000;
        panner.rolloffFactor = options.rolloff || 1.5;

        // Position
        if (panner.positionX) {
            panner.positionX.value = x;
            panner.positionY.value = y;
            panner.positionZ.value = z;
        } else {
            panner.setPosition(x, y, z);
        }

        const gain = this.ctx.createGain();
        gain.gain.value = options.volume !== undefined ? options.volume : 1.0;

        source.connect(panner);
        panner.connect(gain);
        gain.connect(this.sfxGain);
        
        source.start(0);
        this.activeSources.add(source);
        source.onended = () => this.activeSources.delete(source);

        return { source, panner, gain };
    }

    /**
     * Play background music
     */
    async playMusic(url, volume = 0.5) {
        if (this.musicSource) {
            try { this.musicSource.stop(); } catch(e) {}
        }

        if (!this.buffers.has(url)) {
            await this.load(url, url);
        }

        if (!this.buffers.has(url)) return;

        this.musicSource = this.ctx.createBufferSource();
        this.musicSource.buffer = this.buffers.get(url);
        this.musicSource.loop = true;

        this.musicGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
        this.musicSource.connect(this.musicGain);
        this.musicSource.start(0);
        
        console.log(`[Sound] Music playing: ${url}`);
    }

    /**
     * Update the listener transform (call every frame)
     */
    updateListener(x, y, z = 0, fwd = {x:0, y:0, z:-1}, up = {x:0, y:1, z:0}) {
        if (!this.ctx || !this.ctx.listener) return;
        
        const l = this.ctx.listener;
        const t = this.ctx.currentTime;

        if (l.positionX) {
            l.positionX.setTargetAtTime(x, t, 0.05);
            l.positionY.setTargetAtTime(y, t, 0.05);
            l.positionZ.setTargetAtTime(z, t, 0.05);
            l.forwardX.setTargetAtTime(fwd.x, t, 0.05);
            l.forwardY.setTargetAtTime(fwd.y, t, 0.05);
            l.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
            l.upX.setTargetAtTime(up.x, t, 0.05);
            l.upY.setTargetAtTime(up.y, t, 0.05);
            l.upZ.setTargetAtTime(up.z, t, 0.05);
        } else {
            l.setPosition(x, y, z);
            l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
        }
    }

    setMasterVolume(v) { if (this.masterGain) this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
    setMusicVolume(v) { if (this.musicGain) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
    setSfxVolume(v) { if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

    stopAll() {
        this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
        this.activeSources.clear();
        if (this.musicSource) { try { this.musicSource.stop(); } catch(e) {} this.musicSource = null; }
    }
}

// Make globally available
window.Sound = new SoundManager();
window.AudioSystem = SoundManager; // Legacy Alias
