/**
 * REDGLITCH Synthesizer - Base class for all synthesizer instruments
 */

class Synthesizer {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.output = this.ctx.createGain();
        this.output.gain.value = 0.7;
        
        // Voice management
        this.voices = new Map();
        this.maxVoices = 8;
        
        // Common parameters
        this.params = {
            volume: 0.7,
            attack: 0.01,
            decay: 0.1,
            sustain: 0.7,
            release: 0.3
        };
    }
    
    // Override in subclasses
    createVoice(frequency, velocity) {
        throw new Error('createVoice must be implemented by subclass');
    }
    
    // Play a note
    playNote(frequency, velocity = 1.0, duration = 1.0, startTime = null) {
        const time = startTime || this.ctx.currentTime;
        
        // Voice stealing if at max polyphony
        if (this.voices.size >= this.maxVoices) {
            const oldestKey = this.voices.keys().next().value;
            this.stopVoice(oldestKey);
        }
        
        const voice = this.createVoice(frequency, velocity);
        if (!voice) return null;
        
        const voiceId = Date.now() + Math.random();
        this.voices.set(voiceId, voice);
        
        // Apply ADSR envelope
        this.applyEnvelope(voice.gain, velocity, time, duration);
        
        // Auto-release after duration
        setTimeout(() => {
            this.stopVoice(voiceId);
        }, (duration + this.params.release) * 1000);
        
        return voiceId;
    }
    
    // Apply ADSR envelope to gain node
    applyEnvelope(gainNode, velocity, startTime, duration) {
        const { attack, decay, sustain, release } = this.params;
        const peakLevel = velocity * this.params.volume;
        const sustainLevel = peakLevel * sustain;
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(peakLevel, startTime + attack);
        gainNode.gain.linearRampToValueAtTime(sustainLevel, startTime + attack + decay);
        gainNode.gain.setValueAtTime(sustainLevel, startTime + duration);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration + release);
    }
    
    // Stop a specific voice
    stopVoice(voiceId) {
        const voice = this.voices.get(voiceId);
        if (!voice) return;
        
        try {
            voice.oscillator.stop(this.ctx.currentTime + this.params.release);
            voice.oscillator.disconnect();
            voice.gain.disconnect();
        } catch (e) {
            // Voice already stopped
        }
        
        this.voices.delete(voiceId);
    }
    
    // Stop all voices
    stopAll() {
        this.voices.forEach((voice, id) => {
            this.stopVoice(id);
        });
    }
    
    // Parameter accessors
    setParam(param, value) {
        if (param in this.params) {
            this.params[param] = value;
        }
    }
    
    getParam(param) {
        return this.params[param];
    }
    
    // Cleanup
    dispose() {
        this.stopAll();
        this.output.disconnect();
    }
}

window.Synthesizer = Synthesizer;
