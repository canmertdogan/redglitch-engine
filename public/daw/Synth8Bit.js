/**
 * REDGLITCH 8-Bit Synthesizer - Classic chiptune sounds
 * Features: Pulse wave (with duty cycle), Triangle wave, Noise
 */

class Synth8Bit extends Synthesizer {
    constructor(audioContext) {
        super(audioContext);
        
        // 8-bit specific parameters
        this.params = {
            ...this.params,
            waveform: 'pulse', // 'pulse', 'triangle', 'noise'
            pulseWidth: 0.5,   // Duty cycle (0.125, 0.25, 0.5)
            noiseType: 'white', // 'white' or 'periodic'
            bitCrush: 4,
            attack: 0.001,
            decay: 0.05,
            sustain: 0.6,
            release: 0.1
        };
        
        // Noise buffer for noise oscillator
        this.noiseBuffer = null;
        this.createNoiseBuffer();
    }
    
    createNoiseBuffer() {
        const bufferSize = this.ctx.sampleRate * 2;
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = this.noiseBuffer.getChannelData(0);
        
        if (this.params.noiseType === 'white') {
            // White noise
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        } else {
            // Periodic noise (metallic NES-style)
            const period = 32;
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
                if (i % period === 0 && i > 0) {
                    for (let j = 0; j < period; j++) {
                        if (i + j < bufferSize) {
                            output[i + j] = output[i - period + j];
                        }
                    }
                }
            }
        }
    }
    
    createVoice(frequency, velocity) {
        const { waveform } = this.params;
        
        switch (waveform) {
            case 'pulse':
                return this.createPulseVoice(frequency, velocity);
            case 'triangle':
                return this.createTriangleVoice(frequency, velocity);
            case 'noise':
                return this.createNoiseVoice(frequency, velocity);
            default:
                return null;
        }
    }
    
    createPulseVoice(frequency, velocity) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = frequency;
        
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        
        osc.connect(gain);
        gain.connect(this.output);
        osc.start(this.ctx.currentTime);
        
        return { oscillator: osc, gain };
    }
    
    createTriangleVoice(frequency, velocity) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = frequency;
        
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        
        osc.connect(gain);
        gain.connect(this.output);
        osc.start(this.ctx.currentTime);
        
        return { oscillator: osc, gain };
    }
    
    createNoiseVoice(frequency, velocity) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        noise.loop = true;
        
        // Bandpass filter to simulate pitch
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.output);
        noise.start(this.ctx.currentTime);
        
        return { oscillator: noise, gain, filter };
    }
    
    setWaveform(waveform) {
        this.params.waveform = waveform;
        if (waveform === 'noise') {
            this.createNoiseBuffer();
        }
    }
    
    setPulseWidth(width) {
        this.params.pulseWidth = Math.max(0.125, Math.min(0.875, width));
    }
    
    setNoiseType(type) {
        this.params.noiseType = type;
        this.createNoiseBuffer();
    }
}

window.Synth8Bit = Synth8Bit;
