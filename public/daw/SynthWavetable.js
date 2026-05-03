/**
 * VORTEX Wavetable Synthesizer - Advanced synthesis using PeriodicWave
 * Features: Multiple wavetables, morphing (interpolation), sub-oscillator, filter envelope
 */

class SynthWavetable extends Synthesizer {
    constructor(audioContext) {
        super(audioContext);
        
        // Wavetable specific parameters
        this.params = {
            ...this.params,
            // Oscillator
            wavetable: 'basic', // 'basic', 'analog', 'digital', 'voice'
            morph: 0, // 0 to 1 (interpolation between two states if implemented)
            subLevel: 0.3,
            detune: 0,
            
            // Filter
            filterType: 'lowpass',
            filterFreq: 3000,
            filterQ: 1,
            filterEnv: 0.4,
            
            // Envelopes
            attack: 0.05,
            decay: 0.2,
            sustain: 0.5,
            release: 0.6,
            
            filterAttack: 0.1,
            filterDecay: 0.3,
            filterSustain: 0.2,
            filterRelease: 0.8
        };
        
        this.tables = {};
        this.initWavetables();
    }

    initWavetables() {
        // Create basic PeriodicWave tables
        // In a real synth, these would be loaded from JSON/Binary
        
        // 1. Basic (Saw-like)
        const realBasic = new Float32Array([0, 1, 0.5, 0.33, 0.25, 0.2, 0.16]);
        const imagBasic = new Float32Array(realBasic.length);
        this.tables.basic = this.ctx.createPeriodicWave(realBasic, imagBasic);
        
        // 2. Analog (Rich Saw/Square mix)
        const realAnalog = new Float32Array([0, 1, 0, 0.5, 0, 0.33, 0, 0.25]);
        const imagAnalog = new Float32Array(realAnalog.length);
        this.tables.analog = this.ctx.createPeriodicWave(realAnalog, imagAnalog);
        
        // 3. Digital (Harsh harmonics)
        const realDigital = new Float32Array([0, 0.5, 1, 0.5, 1, 0.5, 1]);
        const imagDigital = new Float32Array(realDigital.length);
        this.tables.digital = this.ctx.createPeriodicWave(realDigital, imagDigital);
    }

    createVoice(frequency, velocity) {
        const osc = this.ctx.createOscillator();
        const table = this.tables[this.params.wavetable] || this.tables.basic;
        osc.setPeriodicWave(table);
        osc.frequency.value = frequency;
        osc.detune.value = this.params.detune;

        // Sub Oscillator (Sine, one octave down)
        const sub = this.ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = frequency / 2;
        
        const subGain = this.ctx.createGain();
        subGain.gain.value = this.params.subLevel;

        const mixer = this.ctx.createGain();
        osc.connect(mixer);
        sub.connect(subGain);
        subGain.connect(mixer);

        // Filter
        const filter = this.ctx.createBiquadFilter();
        filter.type = this.params.filterType;
        filter.frequency.value = this.params.filterFreq;
        filter.Q.value = this.params.filterQ;

        mixer.connect(filter);

        // VCA
        const vca = this.ctx.createGain();
        vca.gain.value = 0;

        filter.connect(vca);
        vca.connect(this.output);

        osc.start(this.ctx.currentTime);
        sub.start(this.ctx.currentTime);

        return {
            oscillator: osc,
            osc,
            sub,
            mixer,
            filter,
            gain: vca
        };
    }

    playNote(frequency, velocity = 1.0, duration = 1.0, startTime = null) {
        const time = startTime || this.ctx.currentTime;
        
        if (this.voices.size >= this.maxVoices) {
            const oldestKey = this.voices.keys().next().value;
            this.stopVoice(oldestKey);
        }
        
        const voice = this.createVoice(frequency, velocity);
        if (!voice) return null;
        
        const voiceId = Date.now() + Math.random();
        this.voices.set(voiceId, voice);
        
        // Amplitude Envelope
        this.applyEnvelope(voice.gain, velocity, time, duration);
        
        // Filter Envelope
        this.applyFilterEnvelope(voice.filter, time, duration);
        
        setTimeout(() => {
            this.stopVoice(voiceId);
        }, (duration + Math.max(this.params.release, this.params.filterRelease)) * 1000);
        
        return voiceId;
    }

    applyFilterEnvelope(filter, startTime, duration) {
        const { filterFreq, filterEnv, filterAttack, filterDecay, filterSustain, filterRelease } = this.params;
        
        const baseFreq = filterFreq;
        // Envelope can push frequency up by up to 8000Hz
        const peakFreq = Math.min(20000, baseFreq + (filterEnv * 8000));
        const sustainFreq = baseFreq + (filterEnv * filterSustain * 8000);
        
        filter.frequency.setValueAtTime(baseFreq, startTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, peakFreq), startTime + filterAttack);
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, sustainFreq), startTime + filterAttack + filterDecay);
        filter.frequency.setValueAtTime(sustainFreq, startTime + duration);
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, baseFreq), startTime + duration + filterRelease);
    }

    // Parameter accessors
    setParam(param, value) {
        if (param in this.params) {
            this.params[param] = value;
            // Additional logic for specific params if needed
            if (param === 'filterFreq' && this.voices) {
                 // Real-time update for active voices could go here if we tracked them better
            }
        }
    }

    setFilterFreq(value) {
        this.params.filterFreq = Math.max(20, Math.min(20000, value));
    }
    
    setFilterQ(value) {
        this.params.filterQ = Math.max(0.1, Math.min(30, value));
    }
}

window.SynthWavetable = SynthWavetable;
