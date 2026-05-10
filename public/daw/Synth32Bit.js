/**
 * KETEBE 32-Bit Synthesizer - Modern subtractive synthesis
 * Features: Multi-oscillator, Filter with envelope, LFO, Advanced ADSR
 */

class Synth32Bit extends Synthesizer {
    constructor(audioContext) {
        super(audioContext);
        
        // 32-bit specific parameters
        this.params = {
            ...this.params,
            // Oscillators
            osc1Wave: 'sawtooth',
            osc2Wave: 'square',
            osc2Detune: 7,
            osc2Level: 0.5,
            oscMix: 0.5,
            
            // Filter
            filterType: 'lowpass',
            filterFreq: 2000,
            filterQ: 1,
            filterEnv: 0.5,
            
            // Amplitude ADSR
            attack: 0.01,
            decay: 0.2,
            sustain: 0.6,
            release: 0.4,
            
            // Filter ADSR
            filterAttack: 0.1,
            filterDecay: 0.3,
            filterSustain: 0.4,
            filterRelease: 0.5,
            
            // LFO
            lfoRate: 4,
            lfoAmount: 0,
            lfoTarget: 'pitch' // 'pitch', 'filter', 'amplitude'
        };
        
        // Global LFO (shared across voices)
        this.lfo = this.ctx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = this.params.lfoRate;
        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.value = 0;
        this.lfo.connect(this.lfoGain);
        this.lfo.start();
    }
    
    createVoice(frequency, velocity) {
        // Oscillator 1
        const osc1 = this.ctx.createOscillator();
        osc1.type = this.params.osc1Wave;
        osc1.frequency.value = frequency;
        
        // Oscillator 2
        const osc2 = this.ctx.createOscillator();
        osc2.type = this.params.osc2Wave;
        osc2.frequency.value = frequency;
        osc2.detune.value = this.params.osc2Detune;
        
        // Oscillator gains
        const osc1Gain = this.ctx.createGain();
        const osc2Gain = this.ctx.createGain();
        osc1Gain.gain.value = 1 - this.params.oscMix;
        osc2Gain.gain.value = this.params.oscMix * this.params.osc2Level;
        
        // Mixer
        const mixer = this.ctx.createGain();
        
        osc1.connect(osc1Gain);
        osc2.connect(osc2Gain);
        osc1Gain.connect(mixer);
        osc2Gain.connect(mixer);
        
        // Filter
        const filter = this.ctx.createBiquadFilter();
        filter.type = this.params.filterType;
        filter.frequency.value = this.params.filterFreq;
        filter.Q.value = this.params.filterQ;
        
        mixer.connect(filter);
        
        // VCA (output gain)
        const vca = this.ctx.createGain();
        vca.gain.value = 0;
        
        filter.connect(vca);
        vca.connect(this.output);
        
        // Apply LFO if enabled
        if (this.params.lfoAmount > 0) {
            this.applyLFO(osc1, osc2, filter);
        }
        
        // Start oscillators
        osc1.start(this.ctx.currentTime);
        osc2.start(this.ctx.currentTime);
        
        return {
            oscillator: osc1,
            osc1,
            osc2,
            mixer,
            filter,
            gain: vca
        };
    }
    
    applyLFO(osc1, osc2, filter) {
        const { lfoTarget, lfoAmount } = this.params;
        
        if (lfoTarget === 'pitch') {
            this.lfoGain.gain.value = lfoAmount * 50;
            this.lfoGain.connect(osc1.detune);
            this.lfoGain.connect(osc2.detune);
        } else if (lfoTarget === 'filter') {
            this.lfoGain.gain.value = lfoAmount * 500;
            this.lfoGain.connect(filter.frequency);
        }
    }
    
    // Override to add filter envelope
    playNote(frequency, velocity = 1.0, duration = 1.0, startTime = null) {
        const time = startTime || this.ctx.currentTime;
        
        // Voice stealing
        if (this.voices.size >= this.maxVoices) {
            const oldestKey = this.voices.keys().next().value;
            this.stopVoice(oldestKey);
        }
        
        const voice = this.createVoice(frequency, velocity);
        if (!voice) return null;
        
        const voiceId = Date.now() + Math.random();
        this.voices.set(voiceId, voice);
        
        // Apply amplitude envelope
        this.applyEnvelope(voice.gain, velocity, time, duration);
        
        // Apply filter envelope
        this.applyFilterEnvelope(voice.filter, time, duration);
        
        // Auto-release after duration
        setTimeout(() => {
            this.stopVoice(voiceId);
        }, (duration + Math.max(this.params.release, this.params.filterRelease)) * 1000);
        
        return voiceId;
    }
    
    applyFilterEnvelope(filter, startTime, duration) {
        const { filterFreq, filterEnv, filterAttack, filterDecay, filterSustain, filterRelease } = this.params;
        
        const baseFreq = filterFreq;
        const peakFreq = baseFreq + (filterEnv * 2000);
        const sustainFreq = baseFreq + (filterEnv * filterSustain * 2000);
        
        filter.frequency.setValueAtTime(baseFreq, startTime);
        filter.frequency.linearRampToValueAtTime(peakFreq, startTime + filterAttack);
        filter.frequency.linearRampToValueAtTime(sustainFreq, startTime + filterAttack + filterDecay);
        filter.frequency.setValueAtTime(sustainFreq, startTime + duration);
        filter.frequency.linearRampToValueAtTime(baseFreq, startTime + duration + filterRelease);
    }
    
    stopVoice(voiceId) {
        const voice = this.voices.get(voiceId);
        if (!voice) return;
        
        try {
            const stopTime = this.ctx.currentTime + Math.max(this.params.release, this.params.filterRelease);
            voice.osc1.stop(stopTime);
            voice.osc2.stop(stopTime);
            voice.osc1.disconnect();
            voice.osc2.disconnect();
            voice.mixer.disconnect();
            voice.filter.disconnect();
            voice.gain.disconnect();
        } catch (e) {
            // Already stopped
        }
        
        this.voices.delete(voiceId);
    }
    
    // Parameter setters
    setOscMix(value) {
        this.params.oscMix = Math.max(0, Math.min(1, value));
    }
    
    setFilterFreq(value) {
        this.params.filterFreq = Math.max(20, Math.min(20000, value));
    }
    
    setFilterQ(value) {
        this.params.filterQ = Math.max(0.1, Math.min(30, value));
    }
    
    setLFORate(value) {
        this.params.lfoRate = value;
        this.lfo.frequency.value = value;
    }
    
    setLFOAmount(value) {
        this.params.lfoAmount = Math.max(0, Math.min(1, value));
    }
    
    dispose() {
        this.lfo.stop();
        this.lfo.disconnect();
        this.lfoGain.disconnect();
        super.dispose();
    }
}

window.Synth32Bit = Synth32Bit;
