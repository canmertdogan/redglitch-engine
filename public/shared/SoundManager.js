/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║        KETEBE AUDIO ENGINE (KAE) — v1.0                  ║
 * ║  Unified runtime audio core for all Ketebe game engines   ║
 * ║  Replaces: SoundManager.js + audioEngine.js              ║
 * ╚═══════════════════════════════════════════════════════════╝
 *
 *  Usage:
 *    window.KAE.playEvent('player:jump')
 *    window.KAE.playEvent('ambient:forest', { loop: true })
 *    window.KAE.playSpatial('projectile:fire', x, y)
 *    window.KAE.setGameState('combat')
 *    window.KAE.setEnvironment('cave')
 *
 *  Back-compat aliases:
 *    window.Sound  → window.KAE
 *    window.AudioSystem → KAE constructor
 */

class KAE {

    // ─────────────────────────────────────────────────────────
    // 1. CONSTRUCTOR
    // ─────────────────────────────────────────────────────────

    constructor() {
        // Audio context — created lazily on first user gesture
        this.ctx = null;
        this._ready = false;
        this._initPromise = null;

        // Bus graph: name → GainNode
        this.buses = new Map();
        // Analyser per bus for metering
        this.analysers = new Map();
        // Sidechain compressors on duckable buses
        this.duckCompressors = new Map();

        // Reverb convolver (global send)
        this.reverbNode = null;
        this.reverbGain = null;   // wet/dry blend
        this.dryGain = null;

        // Buffer cache: url → AudioBuffer
        this.buffers = new Map();

        // Active voice tracking
        this.activeVoices = new Set(); // { source, gain, panner?, eventName, startTime }
        this.maxVoices = 48;

        // Event cooldowns: eventName → timestamp (ms)
        this.eventCooldowns = new Map();

        // Audio map (loaded from API or set by editor)
        this.audioMap = {
            events: {},
            buses: {}
        };

        // Game-state machine
        this.gameState = 'normal'; // 'normal' | 'combat' | 'stealth'
        // Environment preset
        this.environment = 'dry';  // 'dry' | 'room' | 'cave' | 'hall'

        // Music system
        this.musicContextMap = {};       // contextKey → filename
        this.activeMusicSource = null;   // HTMLAudioElement for streaming music
        this.musicFadeTimer = null;

        // Sequential playback index per event
        this._seqIndex = new Map();

        // EventBus integration
        this._bindEventBus();

        // Auto-resume on first user interaction
        this._setupAutoResume();
    }

    // ─────────────────────────────────────────────────────────
    // 2. INIT — called lazily or explicitly
    // ─────────────────────────────────────────────────────────

    async init() {
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._doInit();
        return this._initPromise;
    }

    async _doInit() {
        if (this.ctx) return; // Already initialised

        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error('[KAE] Failed to create AudioContext:', e);
            return;
        }

        this._buildMasterChain();
        this._setupDefaultBuses();
        this._buildReverbChain();

        // Load audio map from server
        try {
            const res = await fetch('/api/audio/map');
            if (res.ok) {
                const map = await res.json();
                this.loadMap(map);
            }
        } catch (e) {
            console.warn('[KAE] Could not load audio map, using defaults.');
        }

        // Resume if suspended
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume().catch(() => {});
        }
        this._ready = true;
        console.log('%c[KAE] Audio Engine online.', 'color:#e53e3e;font-weight:bold;');
    }

    // ─────────────────────────────────────────────────────────
    // 3. MASTER SIGNAL CHAIN
    // ─────────────────────────────────────────────────────────

    _buildMasterChain() {
        // Master compressor (gentle glue)
        this._masterComp = this.ctx.createDynamicsCompressor();
        this._masterComp.threshold.value = -18;
        this._masterComp.knee.value = 30;
        this._masterComp.ratio.value = 3;
        this._masterComp.attack.value = 0.003;
        this._masterComp.release.value = 0.3;

        // True peak limiter
        this._masterLimiter = this.ctx.createDynamicsCompressor();
        this._masterLimiter.threshold.value = -0.5;
        this._masterLimiter.knee.value = 0;
        this._masterLimiter.ratio.value = 20;
        this._masterLimiter.attack.value = 0.001;
        this._masterLimiter.release.value = 0.1;

        // Monitor gain (master fader)
        this._monitorGain = this.ctx.createGain();
        this._monitorGain.gain.value = 1.0;

        // Master analyser for spectrum display
        this._masterAnalyser = this.ctx.createAnalyser();
        this._masterAnalyser.fftSize = 2048;
        this._masterAnalyser.smoothingTimeConstant = 0.8;

        // Chain: buses → comp → limiter → analyser → monitorGain → destination
        this._masterComp.connect(this._masterLimiter);
        this._masterLimiter.connect(this._masterAnalyser);
        this._masterAnalyser.connect(this._monitorGain);
        this._monitorGain.connect(this.ctx.destination);
    }

    _buildReverbChain() {
        // Reverb convolver with wet/dry crossfade
        this.reverbNode = this.ctx.createConvolver();
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0; // start dry

        this.reverbGain.connect(this._masterComp);
        this.reverbNode.connect(this.reverbGain);

        // Generate a simple synthetic IR for room (used until real IRs load)
        this._syntheticIR('room');
    }

    _setupDefaultBuses() {
        this._createBus('master', null, 1.0, false);
        this._createBus('music',   'master', 0.7, true);
        this._createBus('sfx',     'master', 0.9, false);
        this._createBus('ambience','master', 0.6, true);
        this._createBus('voice',   'master', 1.0, false);
        this._createBus('ui',      'master', 0.8, false);
    }

    _createBus(name, parentName, defaultGain = 1.0, duckable = false) {
        if (!this.ctx) return;
        if (this.buses.has(name)) return; // Already exists

        const gain = this.ctx.createGain();
        gain.gain.value = defaultGain;

        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;

        let lastNode = gain;

        // Optional sidechain compressor for ducking
        if (duckable) {
            const comp = this.ctx.createDynamicsCompressor();
            comp.threshold.value = -10;
            comp.knee.value = 40;
            comp.ratio.value = 12;
            comp.attack.value = 0.005;
            comp.release.value = 0.3;
            lastNode.connect(comp);
            lastNode = comp;
            this.duckCompressors.set(name, comp);
        }

        lastNode.connect(analyser);

        // Route analyser to parent or master chain
        if (name === 'master') {
            analyser.connect(this._masterComp);
        } else {
            const parent = this.buses.get(parentName || 'master');
            analyser.connect(parent || this._masterComp);
        }

        this.buses.set(name, gain);
        this.analysers.set(name, analyser);
    }

    // ─────────────────────────────────────────────────────────
    // 4. AUDIO MAP — load config from editor/API
    // ─────────────────────────────────────────────────────────

    loadMap(map) {
        if (!map) return;
        this.audioMap = map;

        if (!this.ctx) return; // Not init yet — will apply after init

        // Sync bus gains from map
        for (const [name, cfg] of Object.entries(map.buses || {})) {
            if (!this.buses.has(name)) {
                this._createBus(name, cfg.parent || 'master', cfg.gain || 1.0, !!cfg.ducking);
            }
            const busGain = this.buses.get(name);
            if (busGain) {
                busGain.gain.setTargetAtTime(cfg.gain ?? 1.0, this.ctx.currentTime, 0.05);
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    // 5. EVENT PLAYBACK (main API)
    // ─────────────────────────────────────────────────────────

    async playEvent(eventName, options = {}) {
        await this._ensureReady();
        if (!this._ready) return null;

        const cfg = this.audioMap.events?.[eventName];

        // Fallback: treat as raw filename if it has an extension or is direct
        if (!cfg || !cfg.clips || cfg.clips.length === 0) {
            if (eventName.includes('.') || options.direct) {
                return this._playUrl(eventName, options);
            }
            return null;
        }

        // Cooldown check
        const now = Date.now();
        const cooldownMs = (cfg.playback?.cooldown ?? 0.05) * 1000;
        const lastPlay = this.eventCooldowns.get(eventName) || 0;
        if (now - lastPlay < cooldownMs) return null;
        this.eventCooldowns.set(eventName, now);

        // Voice stealing
        this._enforceVoiceLimit();

        // Select clip
        const clip = this._pickClip(eventName, cfg);
        if (!clip) return null;

        // Load buffer
        const buffer = await this.loadBuffer(clip);
        if (!buffer) return null;

        // Compute volume & pitch variation
        const baseVol = cfg.playback?.volume ?? 1.0;
        const volVar  = cfg.playback?.volumeVar ?? 0;
        const pitchVar = cfg.playback?.pitchVar ?? 0;
        const finalVol   = Math.max(0, baseVol + (Math.random() * 2 - 1) * volVar);
        const finalPitch = 1.0 + (Math.random() * 2 - 1) * pitchVar;

        const playOpts = {
            ...options,
            volume: finalVol * (options.volume ?? 1.0),
            playbackRate: options.playbackRate ?? finalPitch,
            bus: cfg.group || 'sfx',
            loop: cfg.playback?.mode === 'loop' || options.loop || false,
            fadeIn: cfg.playback?.fadeIn ?? 0,
            fadeOut: cfg.playback?.fadeOut ?? 0,
            reverb: (cfg.reverb ?? 0) > 0 ? cfg.reverb : (options.reverb ?? 0),
            filter: cfg.filter,
            priority: cfg.priority || options.priority || false,
            eventName
        };

        // Trigger ducking on priority events
        if (playOpts.priority) this._triggerDucking(buffer.duration);

        // Emit to EventBus for studio feedback
        this._emit('audio:trigger', { name: eventName, clip });

        // Spatial or standard
        if (options.x !== undefined && options.y !== undefined) {
            return this._playSpatial(buffer, options.x, options.y, options.z ?? 0, playOpts);
        } else {
            return this._playBuffer(buffer, playOpts);
        }
    }

    // ─────────────────────────────────────────────────────────
    // 6. LOW-LEVEL PLAYBACK
    // ─────────────────────────────────────────────────────────

    _playBuffer(buffer, opts = {}) {
        if (!this.ctx || !buffer) return null;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = opts.loop || false;
        source.playbackRate.value = opts.playbackRate || 1.0;

        const gainNode = this.ctx.createGain();

        // Fade in
        if (opts.fadeIn && opts.fadeIn > 0) {
            gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
            gainNode.gain.linearRampToValueAtTime(opts.volume ?? 1.0, this.ctx.currentTime + opts.fadeIn);
        } else {
            gainNode.gain.value = opts.volume ?? 1.0;
        }

        let lastNode = source;

        // Optional per-event filter
        if (opts.filter && opts.filter.type && opts.filter.freq) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = opts.filter.type || 'lowpass';
            filter.frequency.value = opts.filter.freq || 20000;
            lastNode.connect(filter);
            lastNode = filter;
        }

        lastNode.connect(gainNode);

        // Route to target bus
        const busGain = this.buses.get(opts.bus || 'sfx') || this.buses.get('master');
        gainNode.connect(busGain);

        // Reverb send
        if (opts.reverb && opts.reverb > 0 && this.reverbNode) {
            const sendGain = this.ctx.createGain();
            sendGain.gain.value = opts.reverb;
            gainNode.connect(sendGain);
            sendGain.connect(this.reverbNode);
        }

        source.start(0);

        const voice = { source, gainNode, eventName: opts.eventName, startTime: this.ctx.currentTime };
        this.activeVoices.add(voice);
        source.onended = () => {
            this.activeVoices.delete(voice);
            if (opts.onEnded) opts.onEnded();
        };

        return { source, gainNode };
    }

    _playSpatial(buffer, x, y, z = 0, opts = {}) {
        if (!this.ctx || !buffer) return null;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = opts.loop || false;
        source.playbackRate.value = opts.playbackRate || 1.0;

        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'exponential';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 1;
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = opts.volume ?? 1.0;

        let lastNode = source;

        if (opts.filter && opts.filter.type) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = opts.filter.type || 'lowpass';
            filter.frequency.value = opts.filter.freq || 20000;
            lastNode.connect(filter);
            lastNode = filter;
        }

        lastNode.connect(panner);
        panner.connect(gainNode);

        const busGain = this.buses.get(opts.bus || 'sfx') || this.buses.get('master');
        gainNode.connect(busGain);

        if (opts.reverb && opts.reverb > 0 && this.reverbNode) {
            const sendGain = this.ctx.createGain();
            sendGain.gain.value = opts.reverb;
            gainNode.connect(sendGain);
            sendGain.connect(this.reverbNode);
        }

        source.start(0);

        const voice = { source, gainNode, panner, eventName: opts.eventName, startTime: this.ctx.currentTime };
        this.activeVoices.add(voice);
        source.onended = () => this.activeVoices.delete(voice);

        return { source, gainNode, panner };
    }

    async _playUrl(url, opts = {}) {
        const buffer = await this.loadBuffer(url);
        if (buffer) return this._playBuffer(buffer, opts);
        return null;
    }

    // ─────────────────────────────────────────────────────────
    // 7. STREAMING MUSIC (large files via HTMLAudioElement)
    // ─────────────────────────────────────────────────────────

    async playMusic(url, opts = {}) {
        await this._ensureReady();

        const volume    = opts.volume  ?? 0.7;
        const fadeTime  = opts.fadeIn  ?? 1.0;
        const loop      = opts.loop    !== undefined ? opts.loop : true;

        // Crossfade out old music
        if (this.activeMusicSource) {
            this._fadeOutMusic(this.activeMusicSource, opts.fadeOut ?? 0.8);
        }

        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.loop = loop;
        audio.volume = 0;

        // Resolve path
        const fullUrl = url.startsWith('http') || url.startsWith('/') ? url : `/muzikler/${url}`;
        audio.src = fullUrl;

        // Connect via MediaElementSource into the music bus
        try {
            const mediaNode = this.ctx.createMediaElementSource(audio);
            const gainNode = this.ctx.createGain();
            gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + fadeTime);
            mediaNode.connect(gainNode);
            const musicBus = this.buses.get('music') || this.buses.get('master');
            gainNode.connect(musicBus);
            audio._kaeGain = gainNode;
            audio._kaeNode = mediaNode;
        } catch (e) {
            // Fallback: plain volume control
            audio.volume = volume;
        }

        await audio.play().catch(() => {});
        this.activeMusicSource = audio;

        // Emit state
        this._emit('audio:music_changed', { url });
        return audio;
    }

    _fadeOutMusic(audio, fadeTime = 0.8) {
        if (!audio) return;
        if (audio._kaeGain && this.ctx) {
            const now = this.ctx.currentTime;
            audio._kaeGain.gain.setValueAtTime(audio._kaeGain.gain.value, now);
            audio._kaeGain.gain.linearRampToValueAtTime(0, now + fadeTime);
            setTimeout(() => { try { audio.pause(); } catch(e){} }, (fadeTime + 0.1) * 1000);
        } else {
            const step = audio.volume / (fadeTime * 30);
            const t = setInterval(() => {
                audio.volume = Math.max(0, audio.volume - step);
                if (audio.volume <= 0) { clearInterval(t); audio.pause(); }
            }, 33);
        }
    }

    stopMusic(fadeTime = 0.8) {
        if (this.activeMusicSource) {
            this._fadeOutMusic(this.activeMusicSource, fadeTime);
            this.activeMusicSource = null;
        }
    }

    // ─────────────────────────────────────────────────────────
    // 8. BUFFER LOADING & CACHING
    // ─────────────────────────────────────────────────────────

    async loadBuffer(url) {
        await this._ensureReady();
        if (!this.ctx) return null;

        if (this.buffers.has(url)) return this.buffers.get(url);

        const fullUrl = url.startsWith('http') || url.startsWith('/') ? url : `/muzikler/${url}`;
        try {
            const res = await fetch(fullUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const arrayBuf = await res.arrayBuffer();
            const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
            this.buffers.set(url, audioBuf);
            return audioBuf;
        } catch (e) {
            console.warn(`[KAE] Asset missing: ${url} — generating synthetic placeholder.`);
            const synthetic = this._generateSynthetic(this._guessType(url));
            this.buffers.set(url, synthetic);
            return synthetic;
        }
    }

    preloadBuffers(urls = []) {
        return Promise.all(urls.map(u => this.loadBuffer(u)));
    }

    // ─────────────────────────────────────────────────────────
    // 9. SYNTHETIC SOUND GENERATION (placeholder + sfx generator)
    // ─────────────────────────────────────────────────────────

    _guessType(url) {
        const u = url.toLowerCase();
        if (u.includes('step') || u.includes('thud') || u.includes('impact')) return 'thud';
        if (u.includes('music') || u.includes('ambient') || u.includes('loop')) return 'ambient';
        if (u.includes('success') || u.includes('coin') || u.includes('pickup')) return 'chime';
        if (u.includes('error') || u.includes('fail')) return 'buzz';
        if (u.includes('explosion') || u.includes('boom')) return 'explosion';
        return 'click';
    }

    _generateSynthetic(type = 'click', params = {}) {
        if (!this.ctx) return null;

        const sr = this.ctx.sampleRate;
        let duration = 0.15;

        if (type === 'ambient') duration = 2.0;
        else if (type === 'explosion') duration = 0.8;
        else if (type === 'chime') duration = 0.6;
        else if (type === 'buzz') duration = 0.3;

        duration = params.duration ?? duration;

        const buffer = this.ctx.createBuffer(2, Math.ceil(sr * duration), sr);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
                const t = i / sr;
                const env = Math.exp(-t * (params.decay ?? this._typeDecay(type)));
                let sig = 0;

                switch (type) {
                    case 'click':
                        sig = Math.sin(2 * Math.PI * (params.freq ?? 1200) * t) * env;
                        break;
                    case 'thud':
                        sig = (Math.random() * 2 - 1) * env * 0.6 +
                              Math.sin(2 * Math.PI * (params.freq ?? 80) * t) * env * 0.4;
                        break;
                    case 'chime':
                        sig = (Math.sin(2 * Math.PI * 880 * t) * 0.6 +
                               Math.sin(2 * Math.PI * 1320 * t) * 0.3 +
                               Math.sin(2 * Math.PI * 2200 * t) * 0.1) * env;
                        break;
                    case 'buzz':
                        sig = Math.sign(Math.sin(2 * Math.PI * (params.freq ?? 150) * t)) * env * 0.5;
                        break;
                    case 'ambient':
                        sig = (Math.random() * 2 - 1) * 0.08 * (1 - t / duration);
                        break;
                    case 'explosion':
                        sig = ((Math.random() * 2 - 1) * 0.9 +
                               Math.sin(2 * Math.PI * 60 * t) * 0.1) * env;
                        break;
                    default:
                        sig = Math.sin(2 * Math.PI * 440 * t) * env;
                }
                data[i] = Math.max(-1, Math.min(1, sig));
            }
        }

        return buffer;
    }

    _typeDecay(type) {
        const decays = { click: 60, thud: 15, chime: 5, buzz: 20, ambient: 0.5, explosion: 8 };
        return decays[type] ?? 30;
    }

    // ─────────────────────────────────────────────────────────
    // 10. ENVIRONMENT & REVERB
    // ─────────────────────────────────────────────────────────

    async setEnvironment(type) {
        if (!this.ctx) await this.init();
        if (this.environment === type) return;
        this.environment = type;

        if (type === 'dry') {
            this.reverbGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
            return;
        }

        // Try loading a real IR file first
        const irUrl = `/muzikler/ir_${type}.wav`;
        try {
            const res = await fetch(irUrl);
            if (res.ok) {
                const ab = await res.arrayBuffer();
                const buf = await this.ctx.decodeAudioData(ab);
                this.reverbNode.buffer = buf;
            } else {
                throw new Error('No IR file');
            }
        } catch(e) {
            this._syntheticIR(type);
        }

        const wetLevel = { room: 0.15, cave: 0.35, hall: 0.25 }[type] ?? 0.2;
        this.reverbGain.gain.setTargetAtTime(wetLevel, this.ctx.currentTime, 0.3);
    }

    _syntheticIR(type = 'room') {
        if (!this.ctx) return;
        const sr = this.ctx.sampleRate;
        const params = {
            room: { dur: 0.8, decay: 4 },
            cave: { dur: 2.5, decay: 2 },
            hall: { dur: 3.0, decay: 2.5 }
        }[type] || { dur: 1.0, decay: 3 };

        const len = Math.ceil(sr * params.dur);
        const ir = this.ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, params.decay);
            }
        }
        this.reverbNode.buffer = ir;
    }

    // ─────────────────────────────────────────────────────────
    // 11. SIDECHAIN DUCKING
    // ─────────────────────────────────────────────────────────

    _triggerDucking(duration = 0.5) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        this.duckCompressors.forEach(comp => {
            comp.threshold.setTargetAtTime(-40, now, 0.02);
            comp.threshold.setTargetAtTime(-10, now + duration, 0.15);
        });
    }

    duck(duration = 0.5) {
        this._triggerDucking(duration);
    }

    // ─────────────────────────────────────────────────────────
    // 12. GAME STATE MACHINE
    // ─────────────────────────────────────────────────────────

    setGameState(state) {
        if (this.gameState === state) return;
        this.gameState = state;

        // Apply state-based bus adjustments
        const profiles = {
            normal:  { music: 0.7, sfx: 0.9, ambience: 0.6 },
            combat:  { music: 0.5, sfx: 1.0, ambience: 0.3 },
            stealth: { music: 0.4, sfx: 0.7, ambience: 0.8 }
        };
        const profile = profiles[state] || profiles.normal;

        if (this.ctx) {
            const now = this.ctx.currentTime;
            for (const [busName, gain] of Object.entries(profile)) {
                const busGain = this.buses.get(busName);
                if (busGain) {
                    busGain.gain.setTargetAtTime(gain, now, 0.5);
                }
            }
        }

        this._emit('audio:state_changed', { state });
        console.log(`[KAE] Game state: ${state}`);
    }

    // ─────────────────────────────────────────────────────────
    // 13. BUS CONTROL
    // ─────────────────────────────────────────────────────────

    setBusGain(name, value, rampTime = 0.1) {
        const bus = this.buses.get(name);
        if (!bus || !this.ctx) return;
        bus.gain.setTargetAtTime(Math.max(0, Math.min(2, value)), this.ctx.currentTime, rampTime);
    }

    setMasterVolume(value) {
        if (!this.ctx) return;
        this._monitorGain.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), this.ctx.currentTime, 0.05);
    }

    muteBus(name, muted) {
        const bus = this.buses.get(name);
        if (!bus || !this.ctx) return;
        bus.gain.setTargetAtTime(muted ? 0 : (this.audioMap.buses?.[name]?.gain ?? 1.0), this.ctx.currentTime, 0.05);
    }

    // ─────────────────────────────────────────────────────────
    // 14. VOICE MANAGEMENT
    // ─────────────────────────────────────────────────────────

    _enforceVoiceLimit() {
        if (this.activeVoices.size < this.maxVoices) return;
        // Steal oldest non-looping voice
        let oldest = null;
        let oldestTime = Infinity;
        for (const v of this.activeVoices) {
            if (!v.source.loop && v.startTime < oldestTime) {
                oldestTime = v.startTime;
                oldest = v;
            }
        }
        if (oldest) {
            try { oldest.source.stop(); } catch(e) {}
            this.activeVoices.delete(oldest);
        }
    }

    stopAll() {
        for (const v of this.activeVoices) {
            try { v.source.stop(); } catch(e) {}
        }
        this.activeVoices.clear();
        this.stopMusic(0.2);
    }

    stopEvent(eventName) {
        for (const v of this.activeVoices) {
            if (v.eventName === eventName) {
                try { v.source.stop(); } catch(e) {}
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    // 15. SPATIAL LISTENER
    // ─────────────────────────────────────────────────────────

    updateListener(x, y, z = 0) {
        if (!this.ctx?.listener) return;
        const l = this.ctx.listener;
        const t = this.ctx.currentTime;
        if (l.positionX) {
            l.positionX.setTargetAtTime(x, t, 0.05);
            l.positionY.setTargetAtTime(y, t, 0.05);
            l.positionZ.setTargetAtTime(z, t, 0.05);
        } else if (l.setPosition) {
            l.setPosition(x, y, z);
        }
    }

    // ─────────────────────────────────────────────────────────
    // 16. METERING (for studio VU meters)
    // ─────────────────────────────────────────────────────────

    getBusLevel(name) {
        const analyser = name === 'master' ? this._masterAnalyser : this.analysers.get(name);
        if (!analyser) return 0;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        return sum / (data.length * 255);
    }

    getSpectrumData(name) {
        const analyser = name === 'master' ? this._masterAnalyser : this.analysers.get(name);
        if (!analyser) return null;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        return data;
    }

    getWaveformData(name) {
        const analyser = name === 'master' ? this._masterAnalyser : this.analysers.get(name);
        if (!analyser) return null;
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        return data;
    }

    // ─────────────────────────────────────────────────────────
    // 17. CLIP SELECTION STRATEGIES
    // ─────────────────────────────────────────────────────────

    _pickClip(eventName, cfg) {
        const clips = cfg.clips;
        if (!clips || clips.length === 0) return null;
        if (clips.length === 1) return clips[0];

        const mode = cfg.playback?.mode || 'random';

        if (mode === 'sequential') {
            const idx = (this._seqIndex.get(eventName) || 0) % clips.length;
            this._seqIndex.set(eventName, idx + 1);
            return clips[idx];
        }

        if (mode === 'random') {
            // Weighted random using clipMeta
            const meta = cfg.clipMeta || {};
            const weights = clips.map(c => meta[c]?.weight ?? 1);
            const total = weights.reduce((a, b) => a + b, 0);
            let rand = Math.random() * total;
            for (let i = 0; i < clips.length; i++) {
                rand -= weights[i];
                if (rand <= 0) return clips[i];
            }
            return clips[clips.length - 1];
        }

        return clips[0];
    }

    // ─────────────────────────────────────────────────────────
    // 18. AUTO-RESUME & INITIALIZATION HELPERS
    // ─────────────────────────────────────────────────────────

    _setupAutoResume() {
        const handler = () => {
            if (!this.ctx) {
                this.init();
            } else if (this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => { this._ready = true; });
            }
        };
        ['mousedown', 'touchstart', 'keydown'].forEach(ev =>
            document.addEventListener(ev, handler, { once: true, passive: true })
        );
    }

    async _ensureReady() {
        if (!this.ctx) await this.init();
        if (this.ctx?.state === 'suspended') await this.ctx.resume();
        if (this.ctx?.state === 'running') this._ready = true;
    }

    // ─────────────────────────────────────────────────────────
    // 19. EVENTBUS INTEGRATION
    // ─────────────────────────────────────────────────────────

    _bindEventBus() {
        // Listen for map updates from the Audio Studio editor
        if (typeof window !== 'undefined') {
            window.addEventListener('kae:load_map', (e) => {
                this.loadMap(e.detail);
            });
        }
        if (typeof window !== 'undefined' && window.RedGlitchEventBus) {
            window.RedGlitchEventBus.on('audio:map_updated', (event) => {
                this.loadMap(event.data);
            });
            
            // Phase 3: Asset Hot-Swapping Infrastructure
            window.RedGlitchEventBus.on('asset:modified', (event) => {
                const asset = event.data?.asset;
                if (asset && asset.type === 'audio') {
                    if (this.buffers.has(asset.path)) {
                        this.buffers.delete(asset.path);
                        console.log(`[Hot-Swap] Cleared audio cache for: ${asset.path}`);
                    }
                    if (this.buffers.has(asset.id)) {
                        this.buffers.delete(asset.id);
                    }
                }
            });

            // Also listen to raw file changes in case AssetManager hasn't indexed it yet
            window.RedGlitchEventBus.on('file:changed', (event) => {
                const path = event.data?.path || '';
                if (path.includes('audio/') || path.includes('muzikler/')) {
                    // Try to match partial or full path
                    for (const cachedPath of this.buffers.keys()) {
                        if (cachedPath.includes(path) || path.includes(cachedPath)) {
                            this.buffers.delete(cachedPath);
                            console.log(`[Hot-Swap] Cleared audio cache via file:changed for: ${cachedPath}`);
                        }
                    }
                }
            });
        }
    }

    _emit(event, data) {
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.emit(event, data);
        }
        // Also dispatch DOM custom event for editor panels
        window.dispatchEvent(new CustomEvent(event, { detail: data }));
    }

    // ─────────────────────────────────────────────────────────
    // 20. LEGACY COMPATIBILITY
    // ─────────────────────────────────────────────────────────

    /** @deprecated Use playEvent() */
    play(name, options = {}) { return this.playEvent(name, options); }

    /** @deprecated Use loadBuffer() */
    async load(url) { return this.loadBuffer(url); }

    /** @deprecated Use stopAll() */
    stopAll_legacy() { return this.stopAll(); }

    // playBuffer public wrapper (for direct usage)
    playBuffer(bufferOrUrl, options = {}) {
        if (typeof bufferOrUrl === 'string') {
            return this._playUrl(bufferOrUrl, options);
        }
        return this._playBuffer(bufferOrUrl, options);
    }

    playSpatialBuffer(buffer, x, y, z = 0, options = {}) {
        return this._playSpatial(buffer, x, y, z, options);
    }

    // Alias for campaign_runtime compatibility
    playSpatial(eventOrBuffer, x, y, z = 0, options = {}) {
        if (typeof eventOrBuffer === 'string') {
            return this.playEvent(eventOrBuffer, { ...options, x, y, z });
        }
        return this._playSpatial(eventOrBuffer, x, y, z, options);
    }

    // Source update stub (kept for API compat)
    updateSource(id, x, y, z = 0) {}

    // applyAudioMap alias
    applyAudioMap(map) { return this.loadMap(map); }
}

// ─────────────────────────────────────────────────────────────
// GLOBAL SINGLETON & ALIASES
// ─────────────────────────────────────────────────────────────

const _kaeInstance = new KAE();

window.KAE         = _kaeInstance;
window.Sound       = _kaeInstance;  // Back-compat
window.AudioSystem = KAE;           // Back-compat (legacy 'new window.AudioSystem()')
