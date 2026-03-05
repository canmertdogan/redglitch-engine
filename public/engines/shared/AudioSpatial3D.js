/**
 * AudioSpatial3D.js — Full 3D spatial audio system for all 3D engines.
 *
 * Extends and integrates with the existing 2D AudioSystem pattern.
 *
 * Features:
 *  - Web Audio API PannerNode (HRTF) for true 3D positional audio
 *  - AudioEmitter3D: attaches to any THREE.Object3D, auto-tracks position
 *  - Reverb zones: ConvolverNode (interior) vs bypass (exterior)
 *  - Doppler effect: pitch shift based on emitter velocity relative to listener
 *  - Music integration: wraps existing muzikler/ playback pattern
 *  - Master/music/sfx/ambient gain buses
 *  - Context resume on first user interaction (browser autoplay policy)
 *
 * Usage (ES module):
 *
 *   import AudioSpatial3D from '/engines/shared/AudioSpatial3D.js';
 *
 *   const audio = new AudioSpatial3D();
 *   await audio.init();
 *
 *   // Load sounds
 *   await audio.load('footstep', '/muzikler/footstep.mp3');
 *
 *   // Create emitter attached to a mesh
 *   const emitter = audio.createEmitter(playerMesh, {
 *     sound:      'footstep',
 *     loop:       true,
 *     volume:     0.8,
 *     refDist:    2,
 *     maxDist:    30,
 *     doppler:    true,
 *   });
 *   emitter.play();
 *
 *   // Per-frame update (after physics/movement):
 *   audio.update(camera, delta);
 *
 *   // Music (integrates with muzikler/ pattern)
 *   await audio.playMusic('muzikler/dungeon_theme.mp3');
 *
 *   // Reverb zones
 *   const zone = audio.createReverbZone({ impulseUrl: '/muzikler/reverb_cave.mp3', radius: 15, center: new THREE.Vector3(0,0,0) });
 */

import * as THREE from '/lib/three/three.module.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SPEED_OF_SOUND = 343;    // m/s (for Doppler)
const DOPPLER_FACTOR = 1.0;    // scale Doppler effect (0 = off, 1 = realistic)
const SMOOTH_TIME    = 0.05;   // seconds for setTargetAtTime smoothing

// ── AudioSpatial3D ────────────────────────────────────────────────────────────

class AudioSpatial3D {
    /**
     * @param {object} [options]
     * @param {number} [options.masterVolume=1.0]
     * @param {number} [options.musicVolume=0.5]
     * @param {number} [options.sfxVolume=1.0]
     * @param {number} [options.ambientVolume=0.6]
     */
    constructor(options = {}) {
        /** @type {AudioContext|null} */
        this.ctx = null;

        // ── Gain buses ────────────────────────────────────────────────────────
        this._masterGain  = null;
        this._musicGain   = null;
        this._sfxGain     = null;
        this._ambientGain = null;

        this._masterVol  = options.masterVolume  ?? 1.0;
        this._musicVol   = options.musicVolume   ?? 0.5;
        this._sfxVol     = options.sfxVolume     ?? 1.0;
        this._ambientVol = options.ambientVolume ?? 0.6;

        // ── Asset cache ───────────────────────────────────────────────────────
        /** @type {Map<string, AudioBuffer>} */
        this._buffers = new Map();

        // ── Active emitters ───────────────────────────────────────────────────
        /** @type {AudioEmitter3D[]} */
        this._emitters = [];

        // ── Reverb zones ──────────────────────────────────────────────────────
        /** @type {ReverbZone[]} */
        this._reverbZones = [];

        // ── Reverb convolver nodes (cached per impulse URL) ───────────────────
        /** @type {Map<string, ConvolverNode>} */
        this._convolvers = new Map();

        // ── Current reverb send gain (smoothly transitioned) ─────────────────
        this._reverbSend  = null;   // GainNode: sfx → convolver
        this._reverbReturn = null;  // GainNode: convolver → master
        this._activeConvolver = null;
        this._inReverb    = false;

        // ── Music ─────────────────────────────────────────────────────────────
        this._musicSource = null;
        this._currentMusicUrl = null;

        // ── Listener tracking ─────────────────────────────────────────────────
        this._listenerPos  = new THREE.Vector3();
        this._listenerPrev = new THREE.Vector3();
        this._listenerVel  = new THREE.Vector3();

        // ── Context ready ─────────────────────────────────────────────────────
        this._ready = false;

        // Resume context on first user interaction (browser autoplay policy)
        this._resumeHandler = () => {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => { this._ready = true; });
            }
        };
        ['mousedown', 'touchstart', 'keydown'].forEach(ev =>
            window.addEventListener(ev, this._resumeHandler, { once: true })
        );
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    /**
     * Create AudioContext and gain buses. Call once before anything else.
     */
    async init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // ── Bus graph: sfxGain → reverbSend ──┐
        //              sfxGain ───────────────→ masterGain → destination
        //              reverbReturn ──────────→ masterGain
        //              musicGain ─────────────→ masterGain
        //              ambientGain ───────────→ masterGain

        this._masterGain  = this._gain(this._masterVol);
        this._musicGain   = this._gain(this._musicVol);
        this._sfxGain     = this._gain(this._sfxVol);
        this._ambientGain = this._gain(this._ambientVol);

        // Reverb send/return (start silent)
        this._reverbSend   = this._gain(0);
        this._reverbReturn = this._gain(0);

        // Wire buses
        this._musicGain.connect(this._masterGain);
        this._sfxGain.connect(this._masterGain);
        this._ambientGain.connect(this._masterGain);
        this._sfxGain.connect(this._reverbSend);
        this._reverbReturn.connect(this._masterGain);
        this._masterGain.connect(this.ctx.destination);

        if (this.ctx.state === 'running') this._ready = true;

        console.log('[AudioSpatial3D] init() — AudioContext state:', this.ctx.state);
        return this;
    }

    // ── Asset loading ─────────────────────────────────────────────────────────

    /**
     * Fetch and decode an audio file into a cached AudioBuffer.
     * @param {string} name  Cache key
     * @param {string} url   Fetch URL (e.g. '/muzikler/boom.mp3')
     */
    async load(name, url) {
        if (this._buffers.has(name)) return;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.arrayBuffer();
            this._buffers.set(name, await this.ctx.decodeAudioData(raw));
            console.log(`[AudioSpatial3D] loaded "${name}"`);
        } catch (err) {
            console.warn(`[AudioSpatial3D] failed to load "${name}" (${url}):`, err.message);
        }
    }

    /**
     * Load multiple sounds in parallel.
     * @param {Record<string, string>} map  { name: url, ... }
     */
    async loadAll(map) {
        await Promise.all(Object.entries(map).map(([n, u]) => this.load(n, u)));
    }

    // ── AudioEmitter3D factory ────────────────────────────────────────────────

    /**
     * Create a spatial emitter attached to a THREE.Object3D.
     * The emitter auto-tracks the object's world position each frame.
     *
     * @param {THREE.Object3D|null} object3D  Attach target (null = fixed position)
     * @param {object}              config
     * @param {string}              [config.sound]        Pre-loaded sound name
     * @param {boolean}             [config.loop=false]
     * @param {number}              [config.volume=1.0]
     * @param {number}              [config.refDist=3]    Full-volume distance (metres)
     * @param {number}              [config.maxDist=50]   Silence distance
     * @param {number}              [config.rolloff=1.5]
     * @param {boolean}             [config.doppler=false] Enable Doppler pitch shift
     * @param {string}              [config.bus='sfx']    'sfx' | 'ambient'
     * @param {THREE.Vector3}       [config.position]     Fixed world position (if no object3D)
     * @returns {AudioEmitter3D}
     */
    createEmitter(object3D, config = {}) {
        const emitter = new AudioEmitter3D(this, object3D, config);
        this._emitters.push(emitter);
        return emitter;
    }

    /**
     * Remove and stop an emitter.
     * @param {AudioEmitter3D} emitter
     */
    destroyEmitter(emitter) {
        emitter._stop(true);
        const idx = this._emitters.indexOf(emitter);
        if (idx !== -1) this._emitters.splice(idx, 1);
    }

    // ── Music ─────────────────────────────────────────────────────────────────

    /**
     * Play a music file from the muzikler/ system.
     * Mirrors the existing AudioSystem.playMusic() signature.
     * @param {string}  url
     * @param {number}  [volume]  Override music bus volume for this track
     * @param {boolean} [loop=true]
     */
    async playMusic(url, volume, loop = true) {
        // Stop current music
        if (this._musicSource) {
            try { this._musicSource.stop(); } catch (_) {}
            this._musicSource = null;
        }
        if (this._currentMusicUrl === url) return; // already playing

        if (!this._buffers.has(url)) await this.load(url, url);
        if (!this._buffers.has(url)) return;

        const src = this.ctx.createBufferSource();
        src.buffer = this._buffers.get(url);
        src.loop   = loop;

        if (volume !== undefined) {
            this._musicGain.gain.setTargetAtTime(volume, this.ctx.currentTime, SMOOTH_TIME);
        }

        src.connect(this._musicGain);
        src.start(0);

        this._musicSource    = src;
        this._currentMusicUrl = url;
        src.onended = () => { if (this._musicSource === src) { this._musicSource = null; this._currentMusicUrl = null; } };

        console.log('[AudioSpatial3D] music:', url);
    }

    stopMusic() {
        if (this._musicSource) {
            try { this._musicSource.stop(); } catch (_) {}
            this._musicSource    = null;
            this._currentMusicUrl = null;
        }
    }

    // ── Reverb zones ──────────────────────────────────────────────────────────

    /**
     * Define a reverb zone in world space.
     * When the listener enters the zone, reverb cross-fades in.
     *
     * @param {object}         config
     * @param {string}         config.impulseUrl   URL of impulse response audio file
     * @param {THREE.Vector3}  config.center        Zone center
     * @param {number}         config.radius        Trigger radius (metres)
     * @param {number}         [config.wet=0.4]     Reverb wet mix (0–1)
     * @param {number}         [config.fadeTime=1.5] Cross-fade duration in seconds
     * @returns {ReverbZone}
     */
    createReverbZone(config) {
        const zone = new ReverbZone(config);
        this._reverbZones.push(zone);
        // Pre-load impulse response
        this._loadConvolver(config.impulseUrl);
        return zone;
    }

    /**
     * Remove a reverb zone.
     * @param {ReverbZone} zone
     */
    destroyReverbZone(zone) {
        const idx = this._reverbZones.indexOf(zone);
        if (idx !== -1) this._reverbZones.splice(idx, 1);
    }

    // ── Volume controls ───────────────────────────────────────────────────────

    setMasterVolume(v) { this._setGain(this._masterGain,  v); this._masterVol  = v; }
    setMusicVolume(v)  { this._setGain(this._musicGain,   v); this._musicVol   = v; }
    setSfxVolume(v)    { this._setGain(this._sfxGain,     v); this._sfxVol     = v; }
    setAmbientVolume(v){ this._setGain(this._ambientGain, v); this._ambientVol = v; }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /**
     * Update listener position/orientation, emitter positions, Doppler, reverb zones.
     * Call once per frame after camera/player movement.
     *
     * @param {THREE.Camera} camera  Active scene camera
     * @param {number}       delta   Elapsed seconds
     */
    update(camera, delta) {
        if (!this.ctx || !this._ready) return;

        // ── Update listener ───────────────────────────────────────────────────
        const lp  = this._listenerPos;
        const lpr = this._listenerPrev;

        camera.getWorldPosition(lp);

        // Listener velocity (for Doppler)
        if (delta > 0) {
            this._listenerVel.subVectors(lp, lpr).divideScalar(delta);
        }
        lpr.copy(lp);

        const t   = this.ctx.currentTime;
        const lis = this.ctx.listener;

        _setAudioParam(lis.positionX, lp.x, t);
        _setAudioParam(lis.positionY, lp.y, t);
        _setAudioParam(lis.positionZ, lp.z, t);

        // Listener forward/up from camera
        const fwd = _getWorldDir(camera);
        const up  = _getWorldUp(camera);

        _setAudioParam(lis.forwardX, fwd.x, t);
        _setAudioParam(lis.forwardY, fwd.y, t);
        _setAudioParam(lis.forwardZ, fwd.z, t);
        _setAudioParam(lis.upX, up.x, t);
        _setAudioParam(lis.upY, up.y, t);
        _setAudioParam(lis.upZ, up.z, t);

        // ── Update emitters ───────────────────────────────────────────────────
        for (const em of this._emitters) {
            em._update(lp, this._listenerVel, delta, t);
        }

        // ── Check reverb zones ────────────────────────────────────────────────
        this._updateReverbZones(lp, t);
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose() {
        this.stopMusic();
        for (const em of this._emitters) em._stop(true);
        this._emitters = [];
        if (this.ctx) { this.ctx.close(); this.ctx = null; }
        ['mousedown','touchstart','keydown'].forEach(ev =>
            window.removeEventListener(ev, this._resumeHandler)
        );
        console.log('[AudioSpatial3D] disposed');
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    _gain(value) {
        const g = this.ctx.createGain();
        g.gain.value = value;
        return g;
    }

    _setGain(node, value) {
        if (node) node.gain.setTargetAtTime(value, this.ctx.currentTime, SMOOTH_TIME);
    }

    _getBus(busName) {
        if (busName === 'ambient') return this._ambientGain;
        return this._sfxGain;
    }

    async _loadConvolver(url) {
        if (this._convolvers.has(url)) return;
        await this.load('__ir__' + url, url);
        const buf = this._buffers.get('__ir__' + url);
        if (!buf) return;
        const conv = this.ctx.createConvolver();
        conv.buffer = buf;
        conv.connect(this._reverbReturn);
        this._convolvers.set(url, conv);
    }

    _updateReverbZones(listenerPos, t) {
        let bestZone = null;
        let bestDist = Infinity;

        for (const zone of this._reverbZones) {
            const d = listenerPos.distanceTo(zone.center);
            if (d < zone.radius && d < bestDist) {
                bestDist = d;
                bestZone = zone;
            }
        }

        if (bestZone && bestZone.impulseUrl) {
            const conv = this._convolvers.get(bestZone.impulseUrl);
            if (conv && conv !== this._activeConvolver) {
                // Wire new convolver
                this._reverbSend.disconnect();
                this._reverbSend.connect(conv);
                this._activeConvolver = conv;
            }
            if (!this._inReverb) {
                const wet = bestZone.wet ?? 0.4;
                this._reverbSend.gain.setTargetAtTime(wet, t, bestZone.fadeTime ?? 1.5);
                this._reverbReturn.gain.setTargetAtTime(1, t, bestZone.fadeTime ?? 1.5);
                this._inReverb = true;
            }
        } else if (this._inReverb) {
            const fade = 1.5;
            this._reverbSend.gain.setTargetAtTime(0, t, fade);
            this._reverbReturn.gain.setTargetAtTime(0, t, fade);
            this._inReverb = false;
        }
    }
}

// ── AudioEmitter3D ────────────────────────────────────────────────────────────

class AudioEmitter3D {
    /**
     * @param {AudioSpatial3D}    system
     * @param {THREE.Object3D|null} object3D
     * @param {object}            config
     */
    constructor(system, object3D, config = {}) {
        this._sys      = system;
        this._object3D = object3D;
        this._config   = config;

        this._source  = null;  // AudioBufferSourceNode
        this._panner  = null;  // PannerNode
        this._gain    = null;  // GainNode (per-emitter volume)
        this._playing = false;

        // Position tracking for Doppler
        this._pos     = object3D
            ? object3D.getWorldPosition(new THREE.Vector3())
            : (config.position?.clone() ?? new THREE.Vector3());
        this._prevPos = this._pos.clone();
        this._vel     = new THREE.Vector3();

        // Build audio graph immediately (position set per-frame)
        this._buildGraph();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Start playing the emitter's sound. */
    play(soundName) {
        const name = soundName ?? this._config.sound;
        if (!name) { console.warn('[AudioEmitter3D] no sound name'); return; }

        const buf = this._sys._buffers.get(name);
        if (!buf)  { console.warn('[AudioEmitter3D] sound not loaded:', name); return; }

        this._stop(false);

        const ctx  = this._sys.ctx;
        this._source = ctx.createBufferSource();
        this._source.buffer = buf;
        this._source.loop   = this._config.loop ?? false;

        this._source.connect(this._gain);
        this._source.start(0);
        this._playing = true;

        this._source.onended = () => {
            if (!this._config.loop) this._playing = false;
        };
    }

    /** Stop the emitter. */
    stop() { this._stop(false); }

    /** Is audio currently playing? */
    get playing() { return this._playing; }

    /** Update volume at runtime. */
    setVolume(v) {
        this._config.volume = v;
        if (this._gain) {
            this._gain.gain.setTargetAtTime(v, this._sys.ctx.currentTime, SMOOTH_TIME);
        }
    }

    /** Move to a fixed world position (when not attached to an Object3D). */
    setPosition(pos) {
        if (!this._object3D) this._pos.copy(pos);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _buildGraph() {
        const ctx = this._sys.ctx;
        if (!ctx) return;

        this._panner = ctx.createPanner();
        this._panner.panningModel  = 'HRTF';
        this._panner.distanceModel = 'exponential';
        this._panner.refDistance   = this._config.refDist  ?? 3;
        this._panner.maxDistance   = this._config.maxDist  ?? 50;
        this._panner.rolloffFactor = this._config.rolloff  ?? 1.5;
        this._panner.coneInnerAngle = 360;
        this._panner.coneOuterAngle = 0;
        this._panner.coneOuterGain  = 0;

        this._gain = ctx.createGain();
        this._gain.gain.value = this._config.volume ?? 1.0;

        const bus = this._sys._getBus(this._config.bus ?? 'sfx');

        this._gain.connect(this._panner);
        this._panner.connect(bus);

        // Set initial position
        this._applyPosition(this._pos, ctx.currentTime);
    }

    _update(listenerPos, listenerVel, delta, t) {
        if (!this._panner) return;

        // Sync position from attached Object3D
        if (this._object3D) {
            this._object3D.getWorldPosition(this._pos);
        }

        // Emitter velocity
        if (delta > 0) {
            this._vel.subVectors(this._pos, this._prevPos).divideScalar(delta);
        }
        this._prevPos.copy(this._pos);

        this._applyPosition(this._pos, t);

        // ── Doppler pitch shift ───────────────────────────────────────────────
        if (this._config.doppler && this._source) {
            const relVel = _tmp.subVectors(this._vel, listenerVel);
            const toListener = _tmp2.subVectors(listenerPos, this._pos);
            const dist = toListener.length();

            if (dist > 0.01) {
                toListener.divideScalar(dist);
                const vRel = relVel.dot(toListener); // radial velocity component
                // Doppler: f' = f * c / (c + v_source_toward_listener)
                const ratio = SPEED_OF_SOUND / Math.max(1, SPEED_OF_SOUND + vRel * DOPPLER_FACTOR);
                const clamped = Math.max(0.5, Math.min(2.0, ratio));
                if (this._source.playbackRate) {
                    this._source.playbackRate.setTargetAtTime(clamped, t, 0.05);
                }
            }
        }
    }

    _applyPosition(pos, t) {
        _setAudioParam(this._panner.positionX, pos.x, t);
        _setAudioParam(this._panner.positionY, pos.y, t);
        _setAudioParam(this._panner.positionZ, pos.z, t);
    }

    _stop(disconnect) {
        if (this._source) {
            try { this._source.stop(); } catch (_) {}
            this._source = null;
        }
        this._playing = false;
        if (disconnect && this._gain) {
            this._gain.disconnect();
            this._panner?.disconnect();
        }
    }
}

// ── ReverbZone ────────────────────────────────────────────────────────────────

class ReverbZone {
    /**
     * @param {object}        config
     * @param {string}        config.impulseUrl
     * @param {THREE.Vector3} config.center
     * @param {number}        config.radius
     * @param {number}        [config.wet=0.4]
     * @param {number}        [config.fadeTime=1.5]
     */
    constructor(config) {
        this.impulseUrl = config.impulseUrl;
        this.center     = config.center?.clone() ?? new THREE.Vector3();
        this.radius     = config.radius   ?? 10;
        this.wet        = config.wet      ?? 0.4;
        this.fadeTime   = config.fadeTime ?? 1.5;
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

// Reusable vectors (avoid GC in update loop)
const _tmp  = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _fwd  = new THREE.Vector3();
const _up   = new THREE.Vector3();

function _getWorldDir(camera) {
    camera.getWorldDirection(_fwd);
    return _fwd;
}

function _getWorldUp(camera) {
    camera.matrixWorld.extractBasis(_tmp, _up, _tmp2);
    return _up;
}

/**
 * Set an AudioParam with setTargetAtTime if available, else direct value.
 * @param {AudioParam|undefined} param
 * @param {number} value
 * @param {number} t  AudioContext.currentTime
 */
function _setAudioParam(param, value, t) {
    if (!param) return;
    if (param.setTargetAtTime) {
        param.setTargetAtTime(value, t, SMOOTH_TIME);
    } else {
        param.value = value;
    }
}

// ── Export ────────────────────────────────────────────────────────────────────

export { AudioEmitter3D, ReverbZone };
export default AudioSpatial3D;
